import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type {
  DashboardDTO,
  DocumentDTO,
  LLMRuntimeDTO,
  PlanDTO,
  ProviderCatalogEntry,
} from "../api/types";
import { HomePage } from "../pages/HomePage";

const openAi: ProviderCatalogEntry = {
  provider: "OPENAI",
  label: "OpenAI",
  requires_model_selection: true,
  default_model: "gpt-4o-mini",
  default_base_url: "https://api.openai.com/v1",
  common_models: [{ id: "gpt-4o-mini", free: false }],
  key_placeholder: "sk-...",
  requires_api_key: true,
  supports_model_discovery: false,
  supports_custom_base_url: true,
  allows_custom_model: true,
};

const mockRuntime: LLMRuntimeDTO = {
  source: "MOCK",
  provider: null,
  models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
  fallback_reason: null,
};

const emptyDashboard: DashboardDTO = {
  scores: [],
  weak_topics: [],
  upcoming_reviews: [],
  sessions_completed: 0,
  average_score: 0,
};

const indexedDocument: DocumentDTO = {
  id: 4,
  filename: "apuntes-algoritmos.md",
  file_type: "md",
  file_size: 900,
  status: "INDEXED",
  error_message: "",
  created_at: "2026-10-15T09:00:00Z",
};

const readyPlan: PlanDTO = {
  id: 9,
  title: "Plan de algoritmos",
  status: "READY",
  goal_id: 3,
  document_ids: [4],
  created_at: "2026-10-15T09:00:00Z",
  error_message: "",
  topics: [
    { id: 1, name: "Grafos", subtopics: [], difficulty: 4, relevance: 0.95, selected: true },
    { id: 2, name: "Árboles", subtopics: [], difficulty: 3, relevance: 0.72, selected: true },
    { id: 3, name: "Historia", subtopics: [], difficulty: 1, relevance: 0.1, selected: false },
  ],
  sessions: [
    { id: 70, order_index: 0, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 0, status: "COMPLETED" },
    { id: 71, order_index: 1, topic_name: "Árboles", duration_minutes: 25, review_offset_days: 1, status: "PENDING" },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function mockApi({
  plans = [],
  documents = [],
  runtime = mockRuntime,
  dashboard = emptyDashboard,
}: {
  plans?: PlanDTO[];
  documents?: DocumentDTO[];
  runtime?: LLMRuntimeDTO | Error;
  dashboard?: DashboardDTO;
} = {}) {
  vi.spyOn(api, "listPlans").mockResolvedValue(plans);
  vi.spyOn(api, "getDashboard").mockResolvedValue(dashboard);
  vi.spyOn(api, "listDocuments").mockResolvedValue(documents);
  vi.spyOn(api, "listGoals").mockResolvedValue([]);
  vi.spyOn(api, "listProviderCatalog").mockResolvedValue([openAi]);
  vi.spyOn(api, "listLlmCredentials").mockResolvedValue([]);
  if (runtime instanceof Error) vi.spyOn(api, "getLlmRuntime").mockRejectedValue(runtime);
  else vi.spyOn(api, "getLlmRuntime").mockResolvedValue(runtime);
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/inicio"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/inicio" element={<HomePage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("guides a first visit through material, goal and provider before studying", async () => {
    mockApi();
    renderHome();

    expect(screen.getByRole("heading", { name: "Tu camino de estudio de hoy" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Prepara tu plan de estudio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Paso 1: Tu material/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Paso 2: Elige tu meta/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Paso 3: Conecta tu IA/ })).toBeInTheDocument();
    expect(await screen.findByText("Modo demo activo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estudiar" })).toBeDisabled();
    expect(
      await screen.findByText("Sube un PDF o Markdown; en unos segundos estará listo para usar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sesión de hoy" })).not.toBeInTheDocument();
  });

  it("lists every missing requirement and links it to the disabled Estudiar button", async () => {
    mockApi({ runtime: new Error("runtime down") });
    renderHome();

    const estudiar = screen.getByRole("button", { name: "Estudiar" });
    const requirements = await screen.findByText("Para empezar te falta:");
    const list = requirements.parentElement!;
    await waitFor(() =>
      expect(within(list).getByText("No pudimos comprobar tu IA: pulsa «Reintentar» en el paso 3.")).toBeInTheDocument(),
    );
    expect(within(list).getByText("Sube un PDF o Markdown; en unos segundos estará listo para usar.")).toBeInTheDocument();
    expect(within(list).getByText("Elige una plantilla o escribe tu meta.")).toBeInTheDocument();
    expect(estudiar).toBeDisabled();
    expect(estudiar).toHaveAttribute("aria-describedby", list.id);
  });

  it("shows the getting-started checklist first for a new learner", async () => {
    mockApi();
    renderHome();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("0 de 5 completados");
    expect(document.getElementById("preparar-plan")).toBeInTheDocument();
  });

  it("puts the next real session first for a returning learner, without redirecting", async () => {
    mockApi({
      plans: [readyPlan],
      dashboard: {
        ...emptyDashboard,
        upcoming_reviews: [{ next_review_date: "2000-01-01", count: 3 }],
      },
    });
    renderHome();

    const today = await screen.findByRole("region", { name: "Sesión de hoy" });
    expect(within(today).getByText(/Árboles/)).toBeInTheDocument();
    expect(within(today).getByRole("link", { name: "Comenzar sesión" })).toHaveAttribute("href", "/session/71");
    expect(within(today).getByRole("list", { name: "Pasos de la sesión" })).toHaveTextContent(
      /Estudio.*25 min.*Receso.*5 min.*Test.*Resultado/,
    );

    expect(screen.getByRole("img", { name: "Sesiones completadas: 50%" })).toBeInTheDocument();
    const progress = screen.getByRole("region", { name: "Progreso general" });
    expect(within(progress).getByText("Tarjetas por repasar hoy").closest("div")?.parentElement).toHaveTextContent("3");

    const pareto = screen.getByRole("region", { name: "Enfoque Pareto (80/20)" });
    expect(pareto).toHaveTextContent(/Grafos.*95%.*Árboles.*72%/);
    expect(pareto).not.toHaveTextContent("Historia");
    expect(pareto).toHaveTextContent(/heurística/);

    expect(screen.getByTestId("location")).toHaveTextContent("/inicio");
  });

  it("shows the effective user provider confirmed by the server", async () => {
    mockApi({
      runtime: {
        source: "USER",
        provider: "OPENAI",
        models: { topic_analysis: "gpt-4o-mini", session_plan: "gpt-4o-mini", session_content: "gpt-4o-mini" },
        fallback_reason: null,
      },
    });
    renderHome();

    expect(await screen.findByText("Usando OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Modelo: gpt-4o-mini")).toBeInTheDocument();
  });

  it("blocks studying while the effective provider is unknown", async () => {
    mockApi({ documents: [indexedDocument], runtime: new Error("runtime down") });
    renderHome();

    expect(
      await screen.findByText("No pudimos confirmar qué proveedor de IA usará el servidor."),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: indexedDocument.filename }));
    fireEvent.click(screen.getByRole("button", { name: /Universidad/ }));

    expect(screen.getByRole("button", { name: "Estudiar" })).toBeDisabled();
    expect(screen.getByText("No pudimos comprobar tu IA: pulsa «Reintentar» en el paso 3.")).toBeInTheDocument();
  });

  it("goes from material to a ready plan from Inicio with a single goal and plan request", async () => {
    mockApi({ documents: [indexedDocument] });
    const createGoal = vi.spyOn(api, "createGoal").mockResolvedValue({
      id: 3,
      goal_type: "EXAM",
      title: "Aprobar el examen del curso",
      description: "",
      created_at: "2026-10-16T09:00:00Z",
    });
    const generatePlan = vi
      .spyOn(api, "generatePlan")
      .mockResolvedValue({ id: 9, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    renderHome();

    fireEvent.click(await screen.findByRole("checkbox", { name: indexedDocument.filename }));
    fireEvent.click(screen.getByRole("button", { name: /Universidad/ }));
    expect(screen.getByRole("textbox", { name: "Tu meta" })).toHaveValue("Aprobar el examen del curso");
    await waitFor(() => expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Estudiar" }));

    expect(await screen.findByText("¡Tu plan está listo!")).toBeInTheDocument();
    expect(createGoal).toHaveBeenCalledOnce();
    expect(createGoal).toHaveBeenCalledWith({
      goal_type: "EXAM",
      title: "Aprobar el examen del curso",
      description: "",
    });
    expect(generatePlan).toHaveBeenCalledOnce();
    expect(generatePlan).toHaveBeenCalledWith(3, [4], expect.any(String));
    expect(screen.getByRole("link", { name: "Comenzar la siguiente sesión" })).toHaveAttribute(
      "href",
      "/session/71",
    );
    expect(screen.getByRole("link", { name: "Ver todas las sesiones" })).toHaveAttribute("href", "/plan/9");
    expect(screen.getByTestId("location")).toHaveTextContent("/inicio");
    // A ready plan is a finished request: another plan needs an explicit "Preparar otro plan".
    expect(screen.getByRole("button", { name: "Estudiar" })).toBeDisabled();
    expect(screen.getByText(/pulsa «Preparar otro plan»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preparar otro plan" }));
    expect(screen.queryByText("¡Tu plan está listo!")).not.toBeInTheDocument();
    expect(generatePlan).toHaveBeenCalledOnce();
  });

  it("does not show an endless generation when the followed plan cannot be read", async () => {
    window.sessionStorage.setItem("studyai.study-start", JSON.stringify({ v: 1, planId: 9 }));
    mockApi();
    const getPlan = vi
      .spyOn(api, "getPlan")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: {} } })
      .mockResolvedValue({ ...readyPlan, status: "PROCESSING", sessions: [] });
    renderHome();

    expect(await screen.findByText(/No pudimos consultar el estado de tu plan/)).toBeInTheDocument();
    expect(screen.queryByText("Generando tu plan…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Generando tu plan…")).toBeInTheDocument();
    expect(getPlan).toHaveBeenCalledTimes(2);

    // Generation is a background task: the learner can always stop following it.
    fireEvent.click(screen.getByRole("button", { name: "Dejar de seguir este plan" }));
    expect(screen.queryByText("Generando tu plan…")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("studyai.study-start")).toBeNull();
  });

  it("explains an empty saved-goal list after a lost goal creation instead of a dead form", async () => {
    mockApi({ documents: [indexedDocument] });
    vi.spyOn(api, "createGoal").mockRejectedValue({ isAxiosError: true, message: "Network Error" });
    renderHome();

    fireEvent.click(await screen.findByRole("checkbox", { name: indexedDocument.filename }));
    fireEvent.click(screen.getByRole("button", { name: /Universidad/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Estudiar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elegir una meta guardada" }));

    expect(await screen.findByText(/Aún no tienes metas guardadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nueva meta" }));
    expect(screen.getByRole("textbox", { name: "Tu meta" })).toBeInTheDocument();
  });

  it("keeps the 'Otro' template selected while the learner types a custom goal", async () => {
    mockApi();
    renderHome();

    const other = await screen.findByRole("button", { name: /Otro/ });
    fireEvent.click(other);
    fireEvent.change(screen.getByRole("textbox", { name: "Tu meta" }), { target: { value: "M" } });
    expect(screen.getByRole("button", { name: /Otro/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the secure provider setup inside Inicio only when asked", async () => {
    mockApi();
    renderHome();

    const own = await screen.findByRole("button", { name: "Usar mi propia API key" });
    expect(screen.queryByLabelText("Clave de API")).not.toBeInTheDocument();
    await waitFor(() => expect(own).toBeEnabled());
    fireEvent.click(own);
    fireEvent.click(screen.getByRole("button", { name: /OpenAI/ }));

    const setup = screen.getByRole("region", { name: "Configuración de OpenAI" });
    expect(setup).toHaveAttribute("data-variant", "compact");
    expect(within(setup).getByLabelText("Clave de API")).toHaveAttribute("type", "password");
  });
});
