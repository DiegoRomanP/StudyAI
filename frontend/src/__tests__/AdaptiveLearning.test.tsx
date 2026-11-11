import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { api } from "../api/endpoints";
import { adaptiveLearningApi } from "../api/adaptiveLearning";
import type { LearningModeResponse, LearningResponseV2 } from "../api/adaptiveLearning";
import { useSession } from "../hooks/queries";
import { adaptiveLearningKeys, useAdaptiveLearning } from "../hooks/useAdaptiveLearning";
import { makeSessionDetail } from "../test/fixtures";

const lesson: LearningResponseV2 = {
  session_id: 5,
  content_version: 2,
  snapshot: {
    snapshot_schema_version: 2,
    profile_id: "logical_deductive",
    profile_version: 1,
    name: "Lógico-Deductivo",
    discipline_examples: ["Matemáticas"],
    rules: ["Explica cada paso."],
    bloom_levels: ["remember", "apply"],
    allowed_question_types: ["multiple_choice"],
    primary_evaluation_criterion: "procedure",
    estimated_minutes_per_question: { min: 3, max: 5 },
    question_time_overrides: {},
    feedback_modes: ["formula"],
    procedure_rubric_weights: { result: 0.4, procedure: 0.6 },
    objectives: [
      {
        id: "objective-1",
        skill: "Resolver recurrencias",
        description: "Descompone el problema y justifica sus pasos.",
        bloom_target: "apply",
      },
    ],
  },
  lesson_blocks: [],
  content_markdown: "Lección adaptativa.",
  stimuli: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("adaptive learning API", () => {
  it("reads the session mode and v2 lesson from their versioned routes", async () => {
    const get = vi.spyOn(apiClient, "get");
    get.mockResolvedValueOnce({ data: { content_version: 2 } } as never);
    get.mockResolvedValueOnce({ data: lesson } as never);

    await expect(adaptiveLearningApi.getLearningMode(5)).resolves.toEqual({ content_version: 2 });
    await expect(adaptiveLearningApi.getLearningV2(5)).resolves.toEqual(lesson);

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "/sessions/5/learning-mode",
      "/sessions/5/learning-v2",
    ]);
  });
});

describe("useAdaptiveLearning", () => {
  it("does not request v2 content until the mode endpoint confirms version 2", async () => {
    const mode = deferred<LearningModeResponse>();
    const getMode = vi.spyOn(adaptiveLearningApi, "getLearningMode").mockReturnValue(mode.promise);
    const getLesson = vi.spyOn(adaptiveLearningApi, "getLearningV2").mockResolvedValue(lesson);
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useAdaptiveLearning(5), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(getMode).toHaveBeenCalledWith(5));
    expect(getLesson).not.toHaveBeenCalled();

    await act(async () => mode.resolve({ content_version: 2 }));
    await waitFor(() => expect(result.current.lesson.data).toEqual(lesson));
    expect(getLesson).toHaveBeenCalledOnce();
  });

  it("keeps the lesson route disabled for v1", async () => {
    const getLesson = vi.spyOn(adaptiveLearningApi, "getLearningV2").mockResolvedValue(lesson);
    vi.spyOn(adaptiveLearningApi, "getLearningMode").mockResolvedValue({ content_version: 1 });
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useAdaptiveLearning(5), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => expect(result.current.mode.data?.content_version).toBe(1));
    expect(getLesson).not.toHaveBeenCalled();
  });

  it("does not request lesson content when the mode lookup fails", async () => {
    const getLesson = vi.spyOn(adaptiveLearningApi, "getLearningV2").mockResolvedValue(lesson);
    const failure = new Error("network unavailable");
    vi.spyOn(adaptiveLearningApi, "getLearningMode").mockRejectedValue(failure);
    const failedClient = makeQueryClient();
    const failed = renderHook(() => useAdaptiveLearning(6), { wrapper: wrapperFor(failedClient) });
    await waitFor(() => expect(failed.result.current.mode.isError).toBe(true));
    expect(getLesson).not.toHaveBeenCalled();
  });
});

describe("adaptive reinforcement cache", () => {
  it("invalidates session lesson, assessment, and result after published reinforcement", async () => {
    const processing = makeSessionDetail({ id: 5, plan_id: 1, topic_name: "Grafos", reinforcement_status: "PROCESSING" });
    const ready = { ...processing, reinforcement_status: "READY" as const };
    const getSession = vi
      .spyOn(api, "getSession")
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(ready);
    const queryClient = makeQueryClient();
    const adaptiveKeys = [
      adaptiveLearningKeys.lesson(5),
      adaptiveLearningKeys.assessment(5),
      adaptiveLearningKeys.result(5),
    ];
    for (const key of adaptiveKeys) queryClient.setQueryData(key, { cached: true });

    const { result } = renderHook(() => useSession(5), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.data?.reinforcement_status).toBe("PROCESSING"));
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.data?.reinforcement_status).toBe("READY"));
    await waitFor(() => {
      for (const key of adaptiveKeys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    });
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
