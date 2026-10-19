import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/endpoints";
import type { DocumentDTO, PlanDTO } from "../api/types";
import { DOCUMENTS_QUERY_KEY } from "../hooks/queries";
import { STUDY_START_STORAGE_KEY, useStudyStart, type StudyStartInput } from "../hooks/useStudyStart";
import { makeSessionSummary } from "../test/fixtures";

const indexed: DocumentDTO = {
  id: 4,
  filename: "apuntes.md",
  file_type: "md",
  file_size: 100,
  status: "INDEXED",
  error_message: "",
  created_at: "2026-10-01T00:00:00Z",
};

const readyPlan: PlanDTO = {
  id: 51,
  title: "Plan listo",
  status: "READY",
  goal_id: 9,
  document_ids: [4],
  created_at: "2026-10-16T09:00:00Z",
  error_message: "",
  topics: [],
  sessions: [
    makeSessionSummary({
      id: 70,
      order_index: 0,
      topic_name: "Grafos",
      review_offset_days: 0,
    }),
  ],
};

const templateInput: StudyStartInput = {
  goal: { kind: "template", payload: { goal_type: "EXAM", title: "Aprobar el examen", description: "" } },
  documentIds: [4],
};

function setup({ strict = false, documents = [indexed] }: { strict?: boolean; documents?: DocumentDTO[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(DOCUMENTS_QUERY_KEY, { documents, source: "GET", revision: 0 });
  const wrapper = ({ children }: { children: ReactNode }) => {
    const tree = <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  return { queryClient, ...renderHook(() => useStudyStart(), { wrapper }) };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStudyStart", () => {
  it("saves a template goal, requests the plan once and waits for a ready plan with sessions", async () => {
    const createGoal = vi.spyOn(api, "createGoal").mockResolvedValue({
      id: 9,
      goal_type: "EXAM",
      title: "Aprobar el examen",
      description: "",
      created_at: "2026-10-16T09:00:00Z",
    });
    const generatePlan = vi
      .spyOn(api, "generatePlan")
      .mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();

    await act(async () => {
      await result.current.start(templateInput);
    });

    expect(createGoal).toHaveBeenCalledOnce();
    expect(generatePlan).toHaveBeenCalledWith(9, [4], expect.any(String));
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(result.current.plan?.id).toBe(51);
    expect(result.current.nextSession?.id).toBe(70);
    // Only a minimal versioned reference survives a reload.
    expect(JSON.parse(window.sessionStorage.getItem(STUDY_START_STORAGE_KEY)!)).toEqual({ v: 1, planId: 51 });
  });

  it("reuses an existing goal without creating one", async () => {
    const createGoal = vi.spyOn(api, "createGoal");
    vi.spyOn(api, "generatePlan").mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();

    await act(async () => {
      await result.current.start({ goal: { kind: "existing", goalId: 3 }, documentIds: [4] });
    });

    expect(createGoal).not.toHaveBeenCalled();
    expect(api.generatePlan).toHaveBeenCalledWith(3, [4], expect.any(String));
  });

  it("runs a single sequence when started twice in the same tick", async () => {
    vi.spyOn(api, "createGoal").mockResolvedValue({
      id: 9,
      goal_type: "EXAM",
      title: "Aprobar el examen",
      description: "",
      created_at: "2026-10-16T09:00:00Z",
    });
    vi.spyOn(api, "generatePlan").mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup({ strict: true });

    await act(async () => {
      await Promise.all([result.current.start(templateInput), result.current.start(templateInput)]);
    });

    expect(api.createGoal).toHaveBeenCalledOnce();
    expect(api.generatePlan).toHaveBeenCalledOnce();
  });

  it("never writes on mount, including under StrictMode", async () => {
    const createGoal = vi.spyOn(api, "createGoal");
    const generatePlan = vi.spyOn(api, "generatePlan");
    const { result } = setup({ strict: true });

    await waitFor(() => expect(result.current.phase).toBe("idle"));
    expect(createGoal).not.toHaveBeenCalled();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("keeps the saved goal and the same request key when plan generation fails and is retried", async () => {
    const createGoal = vi.spyOn(api, "createGoal").mockResolvedValue({
      id: 9,
      goal_type: "EXAM",
      title: "Aprobar el examen",
      description: "",
      created_at: "2026-10-16T09:00:00Z",
    });
    const generatePlan = vi
      .spyOn(api, "generatePlan")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
      .mockResolvedValueOnce({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();

    await act(async () => {
      await result.current.start(templateInput);
    });
    expect(result.current.phase).toBe("error");
    expect(result.current.goalId).toBe(9);

    await act(async () => {
      await result.current.start(templateInput);
    });

    expect(createGoal).toHaveBeenCalledOnce();
    expect(generatePlan).toHaveBeenCalledTimes(2);
    expect(generatePlan.mock.calls[1][2]).toBe(generatePlan.mock.calls[0][2]);
    await waitFor(() => expect(result.current.phase).toBe("ready"));
  });

  it("marks a lost plan response as uncertain and retries it safely with the same key", async () => {
    vi.spyOn(api, "createGoal");
    const generatePlan = vi
      .spyOn(api, "generatePlan")
      .mockRejectedValueOnce({ isAxiosError: true, request: {}, message: "Network Error" })
      .mockResolvedValueOnce({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();
    const input: StudyStartInput = { goal: { kind: "existing", goalId: 3 }, documentIds: [4] };

    await act(async () => {
      await result.current.start(input);
    });
    expect(result.current.phase).toBe("uncertain");
    expect(result.current.uncertainStage).toBe("plan");
    expect(generatePlan).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.start(input);
    });
    expect(generatePlan.mock.calls[1][2]).toBe(generatePlan.mock.calls[0][2]);
    await waitFor(() => expect(result.current.phase).toBe("ready"));
  });

  it("reports a failed generation with the server's message", async () => {
    vi.spyOn(api, "generatePlan").mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue({
      ...readyPlan,
      status: "FAILED",
      sessions: [],
      error_message: "LLM_RATE_LIMITED: límite de solicitudes",
    });
    const { result } = setup();

    await act(async () => {
      await result.current.start({ goal: { kind: "existing", goalId: 3 }, documentIds: [4] });
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.error).toContain("límite de solicitudes");
  });

  describe("continuing a failed plan", () => {
    const failedPlan: PlanDTO = { ...readyPlan, status: "FAILED", error_message: "Se cortó." };

    function followFailedPlan() {
      window.sessionStorage.setItem(STUDY_START_STORAGE_KEY, JSON.stringify({ v: 1, planId: 51 }));
      return setup();
    }

    it("resumes it and follows the generation again", async () => {
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      const resumePlan = vi
        .spyOn(api, "resumePlan")
        .mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
      const { result } = followFailedPlan();
      await waitFor(() => expect(result.current.canResume).toBe(true));

      await act(async () => {
        await result.current.resume();
      });

      expect(resumePlan).toHaveBeenCalledWith(51);
      expect(result.current.phase).toBe("processing");
      expect(result.current.canResume).toBe(false);
    });

    it("shows the server's refusal", async () => {
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      vi.spyOn(api, "resumePlan").mockRejectedValue({
        isAxiosError: true,
        response: { status: 429, data: { detail: "Ya usaste tus 3 usos gratis de hoy.", code: "FREE_AI_DAILY_LIMIT" } },
      });
      const { result } = followFailedPlan();
      await waitFor(() => expect(result.current.canResume).toBe(true));

      await act(async () => {
        await result.current.resume();
      });

      expect(result.current.phase).toBe("error");
      expect(result.current.error).toBe("Ya usaste tus 3 usos gratis de hoy.");
      expect(result.current.canResume).toBe(true);
    });

    it("sends a single request when resumed twice in the same tick", async () => {
      vi.spyOn(api, "getPlan").mockResolvedValue(failedPlan);
      const resumePlan = vi
        .spyOn(api, "resumePlan")
        .mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
      const { result } = followFailedPlan();
      await waitFor(() => expect(result.current.canResume).toBe(true));

      await act(async () => {
        await Promise.all([result.current.resume(), result.current.resume()]);
      });

      expect(resumePlan).toHaveBeenCalledOnce();
    });
  });

  it("does not offer a ready plan without sessions", async () => {
    vi.spyOn(api, "generatePlan").mockResolvedValue({ id: 51, status: "PROCESSING", error_message: "" });
    vi.spyOn(api, "getPlan").mockResolvedValue({ ...readyPlan, sessions: [] });
    const { result } = setup();

    await act(async () => {
      await result.current.start({ goal: { kind: "existing", goalId: 3 }, documentIds: [4] });
    });

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.nextSession).toBeNull();
  });

  it("recovers a confirmed plan after a reload without repeating any write", async () => {
    window.sessionStorage.setItem(STUDY_START_STORAGE_KEY, JSON.stringify({ v: 1, planId: 51 }));
    const generatePlan = vi.spyOn(api, "generatePlan");
    const getPlan = vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(getPlan).toHaveBeenCalledWith(51);
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("reports an unreachable plan instead of generating forever, and recovers on retry", async () => {
    window.sessionStorage.setItem(STUDY_START_STORAGE_KEY, JSON.stringify({ v: 1, planId: 51 }));
    const getPlan = vi
      .spyOn(api, "getPlan")
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503, data: {} } })
      .mockResolvedValue(readyPlan);
    const { result } = setup();

    await waitFor(() => expect(result.current.phase).toBe("error"));
    expect(result.current.planLoadFailed).toBe(true);
    expect(result.current.error).toMatch(/estado de tu plan/);
    // The plan is not forgotten: only a 404 clears it.
    expect(window.sessionStorage.getItem(STUDY_START_STORAGE_KEY)).not.toBeNull();

    act(() => result.current.retryPlan());
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    expect(getPlan).toHaveBeenCalledTimes(2);
  });

  it("refuses to start with documents that are not confirmed as indexed", async () => {
    const generatePlan = vi.spyOn(api, "generatePlan");
    const createGoal = vi.spyOn(api, "createGoal");
    const { result } = setup({ documents: [{ ...indexed, status: "PENDING" }] });

    await act(async () => {
      await result.current.start(templateInput);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).toMatch(/documento indexado/);
    expect(createGoal).not.toHaveBeenCalled();
    expect(generatePlan).not.toHaveBeenCalled();
  });

  it("starts over without touching server data", async () => {
    window.sessionStorage.setItem(STUDY_START_STORAGE_KEY, JSON.stringify({ v: 1, planId: 51 }));
    vi.spyOn(api, "getPlan").mockResolvedValue(readyPlan);
    const { result } = setup();
    await waitFor(() => expect(result.current.phase).toBe("ready"));

    act(() => result.current.reset());

    expect(result.current.phase).toBe("idle");
    expect(window.sessionStorage.getItem(STUDY_START_STORAGE_KEY)).toBeNull();
  });

  it("does not treat a lost goal creation as safe to retry", async () => {
    vi.spyOn(api, "createGoal").mockRejectedValue({ isAxiosError: true, request: {}, message: "Network Error" });
    const generatePlan = vi.spyOn(api, "generatePlan");
    const { result } = setup();

    await act(async () => {
      await result.current.start(templateInput);
    });

    expect(result.current.phase).toBe("uncertain");
    expect(result.current.uncertainStage).toBe("goal");
    expect(generatePlan).not.toHaveBeenCalled();
  });
});
