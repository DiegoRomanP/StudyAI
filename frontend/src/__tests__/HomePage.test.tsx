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
import { makeTopic, makeSessionSummary } from "../test/fixtures";

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

const nvidia: ProviderCatalogEntry = {
  ...openAi,
  provider: "NVIDIA",
  label: "NVIDIA NIM",
  default_model: "nvidia/nemotron-3-super-120b-a12b",
  default_base_url: "https://integrate.api.nvidia.com/v1",
  common_models: [{ id: "nvidia/nemotron-3-super-120b-a12b", free: true }],
  key_placeholder: "nvapi-...",
  supports_custom_base_url: false,
  allows_custom_model: false,
};

const bundledRuntime: LLMRuntimeDTO = {
  source: "ENV",
  provider: "NVIDIA",
  models: {
    topic_analysis: "nvidia/nemotron-3-super-120b-a12b",
    session_plan: "nvidia/nemotron-3-super-120b-a12b",
    session_content: "nvidia/nemotron-3-super-120b-a12b",
  },
  fallback_reason: null,
  bundled: true,
  free_ai: { limit: 3, used: 1, remaining: 2 },
};

const mockRuntime: LLMRuntimeDTO = {
  source: "MOCK",
  provider: null,
  models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
  fallback_reason: null,
};

const userRuntime: LLMRuntimeDTO = {
  source: "USER",
  provider: "OPENAI",
  models: { topic_analysis: "gpt-4o-mini", session_plan: "gpt-4o-mini", session_content: "gpt-4o-mini" },
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
    makeTopic({ id: 1, name: "Grafos", subtopics: [], difficulty: 4, relevance: 0.95, selected: true }),
    makeTopic({ id: 2, name: "Árboles", subtopics: [], difficulty: 3, relevance: 0.72, selected: true }),
    makeTopic({ id: 3, name: "Historia", subtopics: [], difficulty: 1, relevance: 0.1, selected: false }),
  ],
  sessions: [
    makeSessionSummary({ id: 70, order_index: 0, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 0, status: "COMPLETED" }),
    makeSessionSummary({ id: 71, order_index: 1, topic_name: "Árboles", duration_minutes: 25, review_offset_days: 1, status: "PENDING" }),
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function mockApi({
  plans = [],
  documents = [],
  runtime = userRuntime,
  dashboard = emptyDashboard,
  catalog = [openAi],
}: {
  catalog?: ProviderCatalogEntry[];
  plans?: PlanDTO[];
  documents?: DocumentDTO[];
  runtime?: LLMRuntimeDTO | Error;
  dashboard?: DashboardDTO;
} = {}) {
  vi.spyOn(api, "listPlans").mockResolvedValue(plans);
  vi.spyOn(api, "getDashboard").mockResolvedValue(dashboard);
  vi.spyOn(api, "listDocuments").mockResolvedValue(documents);
  vi.spyOn(api, "listGoals").mockResolvedValue([]);
  vi.spyOn(api, "listProviderCatalog").mockResolvedValue(catalog);
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

async function chooseDocument() {
  fireEvent.click(await screen.findByRole("checkbox", { name: indexedDocument.filename }));
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

async function reachGoalStep() {
  await chooseDocument();
  next();
  await screen.findByRole("heading", { name: "Paso 2 de 4: Elige tu meta" });
}

async function reachAiStep() {
  await reachGoalStep();
  fireEvent.click(screen.getByRole("button", { name: /Universidad/ }));
  next();
  await screen.findByRole("heading", { name: "Paso 3 de 4: Elige tu IA" });
}

async function reachLastStep() {
  await reachAiStep();
  await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
  next();
  await screen.findByRole("heading", { name: "Paso 4 de 4: Todo listo" });
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("shows a first visit only the first step, with no way to start yet", async () => {
    mockApi();
    renderHome();

    expect(screen.getByRole("heading", { name: "Tu camino de estudio de hoy" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Prepara tu plan de estudio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paso 1 de 4: Sube tu material" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Pasos para preparar tu plan" });
    expect(within(steps).getByText("Material").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(steps).queryAllByRole("button")).toHaveLength(0);

    // Nothing from the later steps is on screen, and "Estudiar" does not exist yet.
    expect(screen.queryByRole("button", { name: /Universidad/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Usando OpenAI")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Estudiar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sesión de hoy" })).not.toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Continuar" });
    expect(next).toBeDisabled();
    const reason = await screen.findByText("Falta subir un documento.");
    expect(next).toHaveAttribute("aria-describedby", reason.id);
    expect(document.getElementById("preparar-plan")).toBeInTheDocument();
  });

  it("unlocks each step only when the previous one is done, and Estudiar only at the end", async () => {
    mockApi({ documents: [indexedDocument] });
    renderHome();

    expect(await screen.findByRole("button", { name: "Continuar" })).toBeDisabled();
    await chooseDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    next();

    expect(await screen.findByRole("heading", { name: "Paso 2 de 4: Elige tu meta" })).toHaveFocus();
    expect(screen.queryByRole("checkbox", { name: indexedDocument.filename })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText("Falta tu meta.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Universidad/ }));
    expect(screen.getByRole("textbox", { name: "Tu meta" })).toHaveValue("Aprobar el examen del curso");
    next();

    expect(await screen.findByText("Usando OpenAI")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Estudiar" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled());
    next();

    expect(await screen.findByRole("heading", { name: "Paso 4 de 4: Todo listo" })).toBeInTheDocument();
    expect(screen.getByText(indexedDocument.filename)).toBeInTheDocument();
    expect(screen.getByText(/Aprobar el examen del curso · Examen/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled();

    // Going back keeps the choices.
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(await screen.findByText("Usando OpenAI")).toBeInTheDocument();
  });

  it("only lets the learner jump back to steps that are already reachable", async () => {
    mockApi({ documents: [indexedDocument] });
    renderHome();
    await reachGoalStep();

    const steps = screen.getByRole("list", { name: "Pasos para preparar tu plan" });
    const buttons = within(steps).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Material");
    fireEvent.click(buttons[0]);
    expect(await screen.findByRole("checkbox", { name: indexedDocument.filename })).toBeChecked();
  });

  it("offers the free AI first, with today's uses left, next to the key and Ollama options", async () => {
    mockApi({ documents: [indexedDocument], runtime: bundledRuntime, catalog: [nvidia, openAi] });
    renderHome();
    await reachAiStep();

    const options = screen.getByRole("group", { name: "Cómo usar la IA" });
    const labels = within(options).getAllByRole("button").map((button) => button.textContent);
    expect(labels).toEqual(["Gratis · 3 al día (en uso)", "Mi API key", "En local (Ollama)"]);
    expect(screen.getByText("Cada plan gasta 1 uso. Te quedan 2 de 3 hoy.")).toBeInTheDocument();
    expect(screen.getByText("En uso")).toBeInTheDocument();
    expect(screen.queryByText(/deepseek|nemotron/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seguir en modo demo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();

    next();
    await screen.findByRole("heading", { name: "Paso 4 de 4: Todo listo" });
    expect(screen.getByText(/IA gratuita\. Te quedan 2 de 3 usos hoy\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled();
  });

  it("blocks Continuar once today's free uses are spent and points to the other options", async () => {
    mockApi({
      documents: [indexedDocument],
      runtime: { ...bundledRuntime, free_ai: { limit: 3, used: 3, remaining: 0 } },
      catalog: [nvidia, openAi],
    });
    renderHome();
    await reachAiStep();

    expect(screen.getByText("Hoy ya usaste tus 3 usos. Vuelve mañana o usa tu API key.")).toBeInTheDocument();
    expect(screen.queryByText("En uso")).not.toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "Continuar" });
    expect(nextButton).toBeDisabled();
    const reason = screen.getByText("Hoy usaste tus 3 usos gratis. Conecta tu IA.");
    expect(nextButton).toHaveAttribute("aria-describedby", reason.id);
  });

  it("switches back to the free AI by deactivating the learner's own key", async () => {
    mockApi({
      documents: [indexedDocument],
      runtime: { ...userRuntime, free_ai: { limit: 3, used: 0, remaining: 3 } },
      catalog: [nvidia, openAi],
    });
    const deactivate = vi.spyOn(api, "deactivateAllLlmCredentials").mockResolvedValue(undefined as never);
    renderHome();
    await reachAiStep();

    const options = screen.getByRole("group", { name: "Cómo usar la IA" });
    expect(within(options).getByRole("button", { name: "Mi API key (en uso)" })).toBeInTheDocument();
    fireEvent.click(within(options).getByRole("button", { name: "Gratis · 3 al día" }));
    fireEvent.click(screen.getByRole("button", { name: "Usar la IA gratuita" }));

    await waitFor(() => expect(deactivate).toHaveBeenCalledTimes(1));
  });

  it("keeps Continuar blocked and explains why while the AI step has nothing connected", async () => {
    mockApi({ documents: [indexedDocument], runtime: mockRuntime });
    renderHome();
    await reachAiStep();

    expect(await screen.findByRole("button", { name: "Mi API key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "En local (Ollama)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gratis/ })).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Continuar" });
    expect(next).toBeDisabled();
    const reason = screen.getByText("Falta elegir una IA.");
    expect(next).toHaveAttribute("aria-describedby", reason.id);
    expect(screen.queryByText("Modo demo")).not.toBeInTheDocument();
  });

  it("lets the learner continue in demo mode only by choosing it explicitly", async () => {
    mockApi({ documents: [indexedDocument], runtime: mockRuntime });
    renderHome();
    await reachAiStep();

    fireEvent.click(await screen.findByRole("button", { name: "Seguir en modo demo" }));
    expect(await screen.findByText("Modo demo")).toBeInTheDocument();
    expect(screen.getByText(/contenido de ejemplo, sin IA real/i)).toBeInTheDocument();
    expect(window.localStorage.getItem("studyai.onboarding.demo-ok")).toBe("1");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    next();
    expect(await screen.findByRole("button", { name: "Estudiar" })).toBeEnabled();
  });

  it("shows how to get an API key, with links that open safely in another tab", async () => {
    mockApi({ documents: [indexedDocument], runtime: mockRuntime });
    renderHome();
    await reachAiStep();

    fireEvent.click(await screen.findByText("¿Cómo conseguir una API key?"));
    const sources = screen.getByRole("list", { name: "Dónde conseguir una API key" });
    const anthropic = within(sources).getByRole("link", { name: /OpenAI/ });
    expect(anthropic).toHaveAttribute("href", "https://platform.openai.com/api-keys");
    expect(anthropic).toHaveAttribute("target", "_blank");
    expect(anthropic).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/Crea una clave y cópiala/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Proveedores disponibles" })).toBeInTheDocument();
  });

  it("shows the Ollama commands and copies one to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockApi({ documents: [indexedDocument], runtime: mockRuntime });
    renderHome();
    await reachAiStep();

    fireEvent.click(await screen.findByRole("button", { name: "En local (Ollama)" }));
    expect(screen.getByText("curl -fsSL https://ollama.com/install.sh | sh")).toBeInTheDocument();
    expect(screen.getByText("ollama pull llama3.1")).toBeInTheDocument();
    expect(screen.getByText("ollama list")).toBeInTheDocument();
    expect(screen.getByText(/ollama serve/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copiar comando: ollama pull llama3.1" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ollama pull llama3.1"));
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
    // Commands alone do not complete the step: a connected model does.
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("offers the secure provider setup for the learner's own key", async () => {
    mockApi({ documents: [indexedDocument], runtime: mockRuntime });
    renderHome();
    await reachAiStep();

    expect(screen.queryByLabelText("Clave de API")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));
    const setup = screen.getByRole("region", { name: "Configuración de OpenAI" });
    expect(setup).toHaveAttribute("data-variant", "compact");
    expect(within(setup).getByLabelText("Clave de API")).toHaveAttribute("type", "password");
  });

  it("blocks the AI step while the effective provider is unknown", async () => {
    mockApi({ documents: [indexedDocument], runtime: new Error("runtime down") });
    renderHome();
    await reachAiStep();

    expect(
      await screen.findByText("No pudimos comprobar tu IA."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText("Pulsa «Reintentar».")).toBeInTheDocument();
  });

  it("shows the effective user provider confirmed by the server", async () => {
    mockApi({ documents: [indexedDocument] });
    renderHome();
    await reachAiStep();

    expect(await screen.findByText("Usando OpenAI")).toBeInTheDocument();
    expect(screen.getByText(/Modelo: gpt-4o-mini/)).toBeInTheDocument();
  });

  it("keeps the 'Otro' template selected while the learner types a custom goal", async () => {
    mockApi({ documents: [indexedDocument] });
    renderHome();
    await reachGoalStep();

    fireEvent.click(await screen.findByRole("button", { name: /Otro/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tu meta" }), { target: { value: "M" } });
    expect(screen.getByRole("button", { name: /Otro/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("hands over to the getting-started checklist once there is a ready plan", async () => {
    // No session completed yet: otherwise the checklist has nothing left to guide.
    mockApi({ plans: [{ ...readyPlan, sessions: [readyPlan.sessions[1]] }], documents: [indexedDocument] });
    renderHome();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("de 5 completados");
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

    await reachLastStep();
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
    // A ready plan is a finished request: the wizard steps away until "Preparar otro plan".
    expect(screen.queryByRole("button", { name: "Estudiar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preparar otro plan" }));
    expect(screen.queryByText("¡Tu plan está listo!")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled();
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

    await reachLastStep();
    await waitFor(() => expect(screen.getByRole("button", { name: "Estudiar" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Estudiar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elegir una meta guardada" }));

    expect(await screen.findByText(/Aún no tienes metas guardadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Nueva meta" }));
    expect(screen.getByRole("textbox", { name: "Tu meta" })).toBeInTheDocument();
  });

  it("today card marks review sessions", async () => {
    mockApi({
      plans: [
        {
          ...readyPlan,
          sessions: [
            makeSessionSummary({
              id: 90,
              order_index: 5,
              topic_name: "Grafos",
              kind: "REVIEW",
              topic_id: 1,
              scheduled_date: "2000-01-01",
            }),
          ],
        },
      ],
    });
    renderHome();

    const today = await screen.findByRole("region", { name: "Sesión de hoy" });
    expect(within(today).getByText("Repaso")).toBeInTheDocument();
    expect(within(today).getByRole("link", { name: "Comenzar sesión" })).toHaveAttribute("href", "/session/90");
  });
});
