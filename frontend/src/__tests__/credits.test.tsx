import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreditBalanceDTO, SessionDetailDTO } from "../api/types";

const api = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  getCredits: vi.fn(),
  getCreditHistory: vi.fn(),
  getLlmRuntime: vi.fn(),
  startReinforcement: vi.fn(),
  cancelReinforcement: vi.fn(),
  listPlans: vi.fn(),
  listDocuments: vi.fn(),
  listGoals: vi.fn(),
  listProviderCatalog: vi.fn(),
  listLlmCredentials: vi.fn(),
  getDashboard: vi.fn(),
  archiveGoal: vi.fn(),
  unarchiveGoal: vi.fn(),
}));

vi.mock("../api/endpoints", () => ({ api }));

import App from "../App";
import { CreditChip } from "../components/credits/CreditChip";
import { CreditNotice } from "../components/credits/CreditNotice";
import { ReviewPanel } from "../components/session/ReviewPanel";
import { GoalsPage } from "../pages/GoalsPage";
import { getApiErrorMessage, isInsufficientCreditsError } from "../api/errors";

const flags = { v7_startTransition: true, v7_relativeSplatPath: true };

function balance(overrides: Partial<CreditBalanceDTO> = {}): CreditBalanceDTO {
  return {
    purchased: 0,
    pass_credits: 0,
    pass_expires_at: null,
    total: 0,
    tier: "free",
    max_documents: 3,
    max_active_goals: 1,
    documents_used: 0,
    active_goals_used: 0,
    ...overrides,
  };
}

function wrap(node: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter future={flags}>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

function axiosError(status: number, data: object) {
  return { isAxiosError: true, response: { status, data } };
}

const session = (status: SessionDetailDTO["reinforcement_status"] = "NONE") =>
  ({ id: 7, reinforcement_status: status, reinforcement_error: "" }) as SessionDetailDTO;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.getAppConfig.mockResolvedValue({ deployment_mode: "saas", auth_mode: "demo" });
  api.getCredits.mockResolvedValue(balance({ purchased: 14, total: 14, tier: "credits" }));
  api.getCreditHistory.mockResolvedValue([]);
  api.getLlmRuntime.mockResolvedValue({ source: "UNAVAILABLE", provider: null, models: {}, fallback_reason: "" });
  api.listPlans.mockResolvedValue([]);
  api.listDocuments.mockResolvedValue([]);
  api.listGoals.mockResolvedValue([]);
  api.listProviderCatalog.mockResolvedValue([]);
  api.listLlmCredentials.mockResolvedValue([]);
});

describe("CreditNotice", () => {
  it("free tier: shows the free credits left, the failure refund and the pricing link", () => {
    render(
      <MemoryRouter future={flags}>
        <CreditNotice balance={balance({ purchased: 2, total: 2 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Te quedan/)).toHaveTextContent("Te quedan 2 de 3 gratis");
    expect(screen.getByText(/Si la generación falla, te devolvemos el crédito/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver precios" })).toHaveAttribute("href", "/precios");
  });

  it("with purchased credits: shows the balance", () => {
    render(
      <MemoryRouter future={flags}>
        <CreditNotice balance={balance({ tier: "credits", purchased: 14, total: 14 })} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Tienes/)).toHaveTextContent("Tienes 14 créditos");
  });

  it("with a pass: shows expiry and the monthly credits", () => {
    render(
      <MemoryRouter future={flags}>
        <CreditNotice
          balance={balance({ tier: "pass", pass_credits: 120, total: 120, pass_expires_at: "2026-12-05T12:00:00Z" })}
        />
      </MemoryRouter>,
    );
    const text = screen.getByText(/Tu pase vence/);
    expect(text).toHaveTextContent(/Tu pase vence el 5 dic/);
    expect(text).toHaveTextContent("Te quedan 120 de 150 créditos este mes");
  });
});

describe("CreditChip", () => {
  it("shows the balance and opens the history dialog", async () => {
    api.getCreditHistory.mockResolvedValue([
      {
        id: 1,
        delta: -1,
        reason: "plan",
        source: "purchased",
        reference_type: "plan",
        reference_id: 3,
        balance_after: 13,
        created_at: "2026-11-02T10:00:00",
      },
    ]);
    render(wrap(<CreditChip />));

    const chip = await screen.findByRole("button", { name: /14 créditos/ });
    fireEvent.click(chip);

    const dialog = await screen.findByRole("dialog", { name: "Tus créditos" });
    expect(await within(dialog).findByText("Plan de estudio")).toBeInTheDocument();
    expect(within(dialog).getByText("-1")).toBeInTheDocument();
  });

  it("flags the empty state when no credits are left", async () => {
    api.getCredits.mockResolvedValue(balance());
    render(wrap(<CreditChip />));
    expect(await screen.findByRole("button", { name: /Sin créditos/ })).toBeInTheDocument();
  });
});

describe("ReviewPanel with credits", () => {
  it("disables the AI button with its reason when there are no credits", async () => {
    api.getCredits.mockResolvedValue(balance());
    render(wrap(<ReviewPanel session={session()} />));

    const button = await screen.findByRole("button", { name: "Reforzar con IA" });
    await waitFor(() => expect(button).toBeDisabled());
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason).toHaveTextContent(/Sin créditos/);
  });

  it("warns before spending a credit", async () => {
    render(wrap(<ReviewPanel session={session()} />));
    expect(await screen.findByText(/usa 1 crédito/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reforzar con IA" })).toBeEnabled();
  });

  it("opens the out-of-credits dialog on a 402 and closes it", async () => {
    api.startReinforcement.mockRejectedValue(axiosError(402, { detail: "Sin créditos.", code: "INSUFFICIENT_CREDITS" }));
    render(wrap(<ReviewPanel session={session()} />));

    fireEvent.click(await screen.findByRole("button", { name: "Reforzar con IA" }));
    fireEvent.click(await screen.findByRole("button", { name: "Solo esta sesión" }));

    const dialog = await screen.findByRole("dialog", { name: "Te quedaste sin créditos" });
    expect(within(dialog).getByRole("link", { name: /Ver precios/ })).toHaveAttribute("href", "/precios");
    fireEvent.click(within(dialog).getByRole("button", { name: "Ahora no" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("saas-only wiring", () => {
  it("self_hosted: no chip and /account/credits is never called", async () => {
    api.getAppConfig.mockResolvedValue({ deployment_mode: "self_hosted", auth_mode: "demo" });
    api.getDashboard.mockResolvedValue({ scores: [], weak_topics: [], upcoming_reviews: [], sessions_completed: 0, average_score: 0 });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/inicio"]} future={flags}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Paso 1 de 4")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /créditos/ })).not.toBeInTheDocument();
    expect(api.getCredits).not.toHaveBeenCalled();
  });

  it("saas: the chip is in the shell", async () => {
    api.getDashboard.mockResolvedValue({ scores: [], weak_topics: [], upcoming_reviews: [], sessions_completed: 0, average_score: 0 });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/inicio"]} future={flags}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((await screen.findAllByRole("button", { name: /14 créditos/ })).length).toBeGreaterThan(0);
  });
});

describe("errors", () => {
  it("recognises 402 INSUFFICIENT_CREDITS only", () => {
    expect(isInsufficientCreditsError(axiosError(402, { code: "INSUFFICIENT_CREDITS" }))).toBe(true);
    expect(isInsufficientCreditsError(axiosError(402, { code: "OTHER" }))).toBe(false);
    expect(isInsufficientCreditsError(axiosError(403, { code: "PLAN_LIMIT_REACHED" }))).toBe(false);
  });

  it("shows the server message of a PLAN_LIMIT_REACHED 403", () => {
    const error = axiosError(403, { detail: "Llegaste al límite de 3 documentos.", code: "PLAN_LIMIT_REACHED" });
    expect(getApiErrorMessage(error, "x")).toBe("Llegaste al límite de 3 documentos.");
  });
});

describe("GoalsPage archive (saas)", () => {
  const goal = (id: number, title: string, archived_at: string | null = null) => ({
    id,
    title,
    description: "",
    goal_type: "LEARNING",
    exam_date: null,
    archived_at,
    created_at: "2026-11-01T00:00:00Z",
  });

  it("archives an active goal and folds archived ones apart", async () => {
    api.listGoals.mockResolvedValue([goal(1, "Cálculo"), goal(2, "Historia", "2026-11-02T00:00:00Z")]);
    api.archiveGoal.mockResolvedValue(goal(1, "Cálculo", "2026-11-03T00:00:00Z"));
    render(wrap(<GoalsPage />));

    expect(await screen.findByText("Archivadas · 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desarchivar «Historia»" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archivar «Cálculo»" }));
    await waitFor(() => expect(api.archiveGoal).toHaveBeenCalledWith(1));
  });

  it("shows the server message when unarchiving hits the plan limit", async () => {
    api.listGoals.mockResolvedValue([goal(2, "Historia", "2026-11-02T00:00:00Z")]);
    api.unarchiveGoal.mockRejectedValue(axiosError(403, { detail: "Solo puedes tener 1 meta activa.", code: "PLAN_LIMIT_REACHED" }));
    render(wrap(<GoalsPage />));

    fireEvent.click(await screen.findByRole("button", { name: "Desarchivar «Historia»" }));
    expect(await screen.findByText("Solo puedes tener 1 meta activa.")).toBeInTheDocument();
  });
});
