import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAppConfig: vi.fn(),
  listProviderCatalog: vi.fn(),
  listLlmCredentials: vi.fn(),
  getLlmRuntime: vi.fn(),
  listPlans: vi.fn(),
  getDashboard: vi.fn(),
  listDocuments: vi.fn(),
  listGoals: vi.fn(),
}));

vi.mock("../api/endpoints", () => ({ api }));

import App from "../App";

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const config = (deployment_mode: "self_hosted" | "saas") => ({ deployment_mode, auth_mode: "demo" });

beforeEach(() => {
  vi.clearAllMocks();
  api.listProviderCatalog.mockResolvedValue([]);
  api.listLlmCredentials.mockResolvedValue([]);
  api.listPlans.mockResolvedValue([]);
  api.listDocuments.mockResolvedValue([]);
  api.listGoals.mockResolvedValue([]);
  api.getDashboard.mockResolvedValue({
    scores: [],
    weak_topics: [],
    upcoming_reviews: [],
    sessions_completed: 0,
    average_score: 0,
  });
  api.getLlmRuntime.mockResolvedValue({
    source: "UNAVAILABLE",
    provider: null,
    models: { topic_analysis: "no disponible", session_plan: "no disponible", session_content: "no disponible" },
    fallback_reason: "El servicio de IA no está disponible en este momento.",
  });
});

describe("deployment mode", () => {
  it("hides «Conectar IA» and answers not-found at /settings in saas", async () => {
    api.getAppConfig.mockResolvedValue(config("saas"));
    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: /no encontramos esa página/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Conectar IA" })).not.toBeInTheDocument();
  });

  it("skips the AI step of the setup wizard in saas", async () => {
    api.getAppConfig.mockResolvedValue(config("saas"));
    renderApp("/inicio");

    expect(await screen.findByText("Paso 1 de 3")).toBeInTheDocument();
  });

  it("keeps «Conectar IA», its page and the AI step when self-hosted", async () => {
    api.getAppConfig.mockResolvedValue(config("self_hosted"));
    renderApp("/inicio");

    expect(await screen.findByText("Paso 1 de 4")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Conectar IA" }).length).toBeGreaterThan(0);
  });
});
