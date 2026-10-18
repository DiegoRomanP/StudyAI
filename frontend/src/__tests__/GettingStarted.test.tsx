import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DashboardDTO, DocumentDTO, GoalDTO, LLMRuntimeDTO, PlanDTO } from "../api/types";
import { GettingStarted } from "../components/home/GettingStarted";

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
  filename: "apuntes.md",
  file_type: "md",
  file_size: 900,
  status: "INDEXED",
  error_message: "",
  created_at: "2026-10-15T09:00:00Z",
};

const goal: GoalDTO = {
  id: 3,
  goal_type: "EXAM",
  title: "Aprobar",
  description: "",
  created_at: "2026-10-15T09:00:00Z",
};

const readyPlan: PlanDTO = {
  id: 9,
  title: "Plan",
  status: "READY",
  goal_id: 3,
  document_ids: [4],
  created_at: "2026-10-15T09:00:00Z",
  error_message: "",
  topics: [],
  sessions: [
    { id: 71, order_index: 0, topic_name: "Grafos", duration_minutes: 25, review_offset_days: 0, status: "PENDING" },
  ],
};

function mockApi({
  documents = [],
  goals = [],
  plans = [],
  runtime = mockRuntime,
}: {
  documents?: DocumentDTO[];
  goals?: GoalDTO[];
  plans?: PlanDTO[];
  runtime?: LLMRuntimeDTO;
} = {}) {
  vi.spyOn(api, "listDocuments").mockResolvedValue(documents);
  vi.spyOn(api, "listGoals").mockResolvedValue(goals);
  vi.spyOn(api, "listPlans").mockResolvedValue(plans);
  vi.spyOn(api, "getDashboard").mockResolvedValue(emptyDashboard);
  vi.spyOn(api, "getLlmRuntime").mockResolvedValue(runtime);
}

function renderChecklist() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GettingStarted />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GettingStarted", () => {
  it("starts at 0 of 5 with only the first step open and marked as next", async () => {
    mockApi();
    renderChecklist();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("0 de 5 completados");
    const first = within(checklist).getByRole("link", { name: /Sube tu material/ });
    expect(first).toHaveTextContent("Siguiente");
    expect(first).toHaveAttribute("href", "/inicio#preparar-plan");
    expect(within(checklist).getAllByRole("link")).toHaveLength(1);
    expect(within(checklist).getByText("Define tu meta")).toHaveTextContent("(bloqueado hasta completar el paso anterior)");
    expect(within(checklist).queryByRole("button", { name: "Seguir con el modo demo" })).not.toBeInTheDocument();
  });

  it("unlocks each step when the one before it is done", async () => {
    mockApi({ documents: [indexedDocument] });
    renderChecklist();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("1 de 5 completados");
    expect(within(checklist).getByText("Sube tu material")).toHaveTextContent("(hecho)");
    const meta = within(checklist).getByRole("link", { name: /Define tu meta/ });
    expect(meta).toHaveTextContent("Siguiente");
    expect(within(checklist).getByText("Conecta tu IA (opcional)")).toHaveTextContent("(bloqueado");
    expect(within(checklist).getByText("Genera tu plan")).toHaveTextContent("(bloqueado");
  });

  it("does not let the optional AI step hold back the plan", async () => {
    mockApi({ documents: [indexedDocument], goals: [goal] });
    renderChecklist();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(within(checklist).getByRole("link", { name: /Genera tu plan/ })).toHaveTextContent("Siguiente");
    const ia = within(checklist).getByRole("link", { name: "Conecta tu IA (opcional)" });
    expect(ia).toHaveAttribute("href", "/settings");
    expect(ia).not.toHaveTextContent("Siguiente");
    expect(within(checklist).getByText("Completa tu primera sesión")).toHaveTextContent("(bloqueado");
  });

  it("checks the steps that real data already covers", async () => {
    mockApi({ documents: [indexedDocument], goals: [goal], plans: [readyPlan] });
    renderChecklist();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("3 de 5 completados");
    expect(within(checklist).getByText("Sube tu material")).toHaveTextContent("(hecho)");
    expect(within(checklist).getByText("Genera tu plan")).toHaveTextContent("(hecho)");
    const session = within(checklist).getByRole("link", { name: /Completa tu primera sesión/ });
    expect(session).toHaveTextContent("Siguiente");
    expect(session).toHaveAttribute("href", "/session/71");
  });

  it("keeps a later step open when real progress already proves the earlier ones", async () => {
    mockApi({ plans: [readyPlan] });
    renderChecklist();

    const checklist = await screen.findByRole("region", { name: "Primeros pasos" });
    expect(within(checklist).getByRole("link", { name: /Completa tu primera sesión/ })).toBeInTheDocument();
  });

  it("marks the AI step when the learner keeps the demo mode", async () => {
    mockApi({ documents: [indexedDocument], goals: [goal] });
    renderChecklist();

    fireEvent.click(await screen.findByRole("button", { name: "Seguir con el modo demo" }));
    const checklist = screen.getByRole("region", { name: "Primeros pasos" });
    expect(checklist).toHaveTextContent("3 de 5 completados");
    expect(within(checklist).getByText("Conecta tu IA (opcional)")).toHaveTextContent("(hecho)");
    expect(window.localStorage.getItem("studyai.onboarding.demo-ok")).toBe("1");
  });

  it("disappears after the first completed session", async () => {
    mockApi({
      documents: [indexedDocument],
      goals: [goal],
      plans: [{ ...readyPlan, sessions: [{ ...readyPlan.sessions[0], status: "COMPLETED" }] }],
    });
    const { container, queryClient } = renderChecklist();

    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden after the learner dismisses it", async () => {
    mockApi();
    const { unmount } = renderChecklist();

    fireEvent.click(await screen.findByRole("button", { name: "Ocultar" }));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    unmount();

    const { queryClient } = renderChecklist();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });
});
