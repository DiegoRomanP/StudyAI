import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getPlan: vi.fn(),
  getSession: vi.fn(),
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

const plan = {
  id: 27,
  title: "Plan de enlace directo",
  status: "READY" as const,
  goal_id: 4,
  document_ids: [8],
  created_at: "2026-09-29T12:00:00Z",
  error_message: "",
  topics: [],
  sessions: [],
};

const session = {
  id: 54,
  plan_id: 27,
  order_index: 0,
  topic_name: "Sesión de enlace directo",
  duration_minutes: 25,
  review_offset_days: 1,
  status: "PENDING",
  completed_at: null,
  material: { content_markdown: "Contenido de prueba", youtube_keywords: [] },
};

function renderApp(
  initialPath: string,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialPath]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getPlan.mockResolvedValue(plan);
  api.getSession.mockResolvedValue(session);
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
    source: "MOCK",
    provider: null,
    models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
    fallback_reason: null,
  });
});

describe("App routes", () => {
  it("serves the public landing at / without the app navigation", () => {
    renderApp("/");

    // The highlighted word is a nested span; compare the visible text exactly (S2 copy).
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Estudia de forma más inteligente, no más difícil\.$/,
    );
    expect(
      screen.getByText(
        "Tu aprendizaje tiene un camino. StudyAI te ayuda a descubrirlo, enfocarte en lo esencial y dominar lo que realmente importa.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Find your flow. Master what matters.")).toBeInTheDocument();
    for (const cta of screen.getAllByRole("link", { name: /Comenzar/ })) {
      expect(cta).toHaveAttribute("href", "/inicio");
    }
    expect(screen.queryByRole("navigation", { name: "Navegación principal" })).not.toBeInTheDocument();
  });

  it("renders the app home at /inicio inside the shell", async () => {
    renderApp("/inicio");

    expect(screen.getByRole("heading", { name: "Tu camino de estudio de hoy" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Prepara tu plan de estudio" })).toBeInTheDocument();
  });

  it("shows a useful not-found page with a link back to Inicio", () => {
    renderApp("/ruta-que-no-existe");

    expect(screen.getByRole("heading", { name: /no encontramos esa página/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/inicio");
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "1e3",
    "+7",
    "9007199254740992",
    "999999999999999999999999999999999999",
  ])("rejects invalid plan IDs before querying (%s)", async (id) => {
    renderApp(`/plan/${id}`);

    expect(await screen.findByRole("heading", { name: "Enlace al plan no válido" })).toBeInTheDocument();
    expect(api.getPlan).not.toHaveBeenCalled();
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "1e3",
    "+7",
    "9007199254740992",
    "999999999999999999999999999999999999",
  ])("rejects invalid session IDs before querying (%s)", async (id) => {
    renderApp(`/session/${id}`);

    expect(await screen.findByRole("heading", { name: "Enlace a la sesión no válido" })).toBeInTheDocument();
    expect(api.getSession).not.toHaveBeenCalled();
  });

  it("loads a directly opened plan with a positive safe decimal ID and keeps its navigation active", async () => {
    renderApp("/plan/27");

    expect(await screen.findByRole("heading", { name: "Plan de enlace directo" })).toBeInTheDocument();
    expect(api.getPlan).toHaveBeenCalledOnce();
    expect(api.getPlan).toHaveBeenCalledWith(27);
    const planLinks = screen.getAllByRole("link", { name: /^Plan( de estudio)?$/ });
    expect(planLinks).toHaveLength(2);
    for (const planLink of planLinks) {
      expect(planLink).toHaveAttribute("aria-current", "page");
    }
  });

  it("accepts the largest positive safe integer for a direct plan link", async () => {
    const maxSafeId = Number.MAX_SAFE_INTEGER;
    api.getPlan.mockResolvedValue({ ...plan, id: maxSafeId });
    renderApp(`/plan/${maxSafeId}`);

    expect(await screen.findByRole("heading", { name: "Plan de enlace directo" })).toBeInTheDocument();
    expect(api.getPlan).toHaveBeenCalledWith(maxSafeId);
  });

  it("parses a decimal plan ID with leading zeroes without changing its value", async () => {
    renderApp("/plan/00027");

    expect(await screen.findByRole("heading", { name: "Plan de enlace directo" })).toBeInTheDocument();
    expect(api.getPlan).toHaveBeenCalledWith(27);
  });

  it("loads a directly opened session with a positive safe decimal ID", async () => {
    renderApp("/session/54");

    expect(await screen.findByRole("heading", { name: "Sesión de enlace directo" })).toBeInTheDocument();
    expect(api.getSession).toHaveBeenCalledOnce();
    expect(api.getSession).toHaveBeenCalledWith(54);
  });

  it("keeps a cached plan visible if refreshing its route fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["plan", 27], plan);
    api.getPlan.mockRejectedValue(new Error("offline"));
    renderApp("/plan/27", queryClient);

    expect(await screen.findByRole("heading", { name: "Plan de enlace directo" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo actualizar el plan/i);
    expect(screen.getByRole("heading", { name: "Plan de enlace directo" })).toBeInTheDocument();
  });

  it("keeps a cached session visible if refreshing its route fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["session", 54], session);
    api.getSession.mockRejectedValue(new Error("offline"));
    renderApp("/session/54", queryClient);

    expect(await screen.findByRole("heading", { name: "Sesión de enlace directo" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo actualizar la sesión/i);
    expect(screen.getByRole("heading", { name: "Sesión de enlace directo" })).toBeInTheDocument();
  });

  it("opens API Keys from Más and focuses the deep-linked page after navigation", async () => {
    renderApp("/inicio");

    fireEvent.click(screen.getByRole("button", { name: "Más" }));
    const overflowNavigation = screen.getByRole("navigation", { name: "Más destinos" });
    fireEvent.click(within(overflowNavigation).getByRole("link", { name: "API Keys" }));

    expect(await screen.findByRole("heading", { name: "API Keys" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("API Keys | StudyAI"));
    expect(screen.getByRole("main")).toHaveFocus();
    expect(screen.queryByRole("navigation", { name: "Más destinos" })).not.toBeInTheDocument();
  });

  it("updates the page title and moves focus to main after an in-app route change", async () => {
    renderApp("/ruta-que-no-existe");

    await waitFor(() => expect(document.title).toBe("Página no encontrada | StudyAI"));
    fireEvent.click(screen.getByRole("link", { name: /volver al inicio/i }));

    expect(await screen.findByRole("heading", { name: "Tu camino de estudio de hoy" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Inicio | StudyAI"));
    expect(screen.getByRole("main")).toHaveFocus();
  });
});
