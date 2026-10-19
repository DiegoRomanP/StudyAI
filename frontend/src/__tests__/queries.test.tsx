import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  generatePlan: vi.fn(),
  uploadDocument: vi.fn(),
  listDocuments: vi.fn(),
  deletePlan: vi.fn(),
  deleteGoal: vi.fn(),
  submitQuiz: vi.fn(),
  getPlan: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("../api/endpoints", () => ({ api }));

import type { DocumentDTO } from "../api/types";
import { REINFORCE_ALWAYS_FLAG, useReinforceAlways } from "../lib/reinforcePreference";
import {
  DOCUMENTS_QUERY_KEY,
  getDocumentsListSnapshot,
  useDeleteGoal,
  useDeletePlan,
  useDocuments,
  useGeneratePlan,
  usePlan,
  useSession,
  useSubmitQuiz,
  useUploadDocument,
} from "../hooks/queries";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

describe("useGeneratePlan", () => {
  it("forwards the goal and selected document IDs in order without mutating them", async () => {
    api.generatePlan.mockResolvedValue({ id: 37, status: "PROCESSING" });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useGeneratePlan(), { wrapper });
    const documentIds = Object.freeze([91, 4, 208]) as unknown as number[];
    const originalDocumentIds = [...documentIds];

    await act(async () => {
      await result.current.mutateAsync({ goalId: 73, documentIds, idempotencyKey: "attempt-1" });
    });

    expect(api.generatePlan).toHaveBeenCalledTimes(1);
    expect(api.generatePlan.mock.calls[0]).toEqual([73, [91, 4, 208], "attempt-1"]);
    expect(documentIds).toEqual(originalDocumentIds);
  });
});

describe("cache consistency after writes", () => {
  it("drops a deleted plan's detail and refreshes the dashboard", async () => {
    api.deletePlan.mockResolvedValue(undefined);
    const queryClient = createClient();
    queryClient.setQueryData(["plan", 9], { id: 9, sessions: [{ id: 5 }] });
    queryClient.setQueryData(["plans"], [{ id: 9, sessions: [{ id: 5 }, { id: 6 }] }]);
    queryClient.setQueryData(["session", 5], { id: 5 });
    queryClient.setQueryData(["quiz", 6], { id: 60 });
    queryClient.setQueryData(["session", 7], { id: 7 });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeletePlan(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync(9);
    });

    expect(queryClient.getQueryData(["plan", 9])).toBeUndefined();
    expect(queryClient.getQueryData(["session", 5])).toBeUndefined();
    expect(queryClient.getQueryData(["quiz", 6])).toBeUndefined();
    expect(queryClient.getQueryData(["session", 7])).toEqual({ id: 7 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plans"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("refreshes plan details and the dashboard after a goal (and its plans) is deleted", async () => {
    api.deleteGoal.mockResolvedValue(undefined);
    const queryClient = createClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteGoal(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync(3);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plan"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("refreshes the submitted session's status after a quiz", async () => {
    api.submitQuiz.mockResolvedValue({ score: 100, correct: 1, total: 1, detail: {} });
    const queryClient = createClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSubmitQuiz(), { wrapper: createWrapper(queryClient) });

    await act(async () => {
      await result.current.mutateAsync({ quizId: 77, sessionId: 5, answers: [] });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["session", 5] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["plans"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("stops polling a processing plan once the server reports it no longer exists", async () => {
    vi.useFakeTimers();
    try {
      api.getPlan
        .mockResolvedValueOnce({ id: 9, status: "PROCESSING" })
        .mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } });
      const queryClient = createClient();
      // Read the fields during render: TanStack only re-renders for tracked properties.
      const { result } = renderHook(
        () => {
          const { data, isError } = usePlan(9);
          return { data, isError };
        },
        { wrapper: createWrapper(queryClient) },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.status).toBe("PROCESSING");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
        // Let the rejected refetch settle and TanStack flush its batched notification.
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(result.current.isError).toBe(true);
      const callsAfterNotFound = api.getPlan.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(api.getPlan).toHaveBeenCalledTimes(callsAfterNotFound);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useUploadDocument cache", () => {
  it("keeps cached documents and replaces an uploaded ID instead of duplicating it", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const previousDocument: DocumentDTO = {
      id: 31,
      filename: "material-anterior.pdf",
      file_type: "pdf",
      file_size: 128,
      status: "INDEXED",
      error_message: "",
      created_at: "2026-09-30T00:00:00Z",
    };
    const cachedUpload: DocumentDTO = {
      ...previousDocument,
      id: 32,
      filename: "material-nuevo.md",
      file_type: "md",
      status: "INDEXED",
    };
    const pendingUpload: DocumentDTO = { ...cachedUpload, status: "PENDING" };
    queryClient.setQueryData(DOCUMENTS_QUERY_KEY, {
      documents: [previousDocument, cachedUpload],
      source: "GET",
      revision: 4,
    });
    api.uploadDocument.mockResolvedValue(pendingUpload);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadDocument(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(new File(["notes"], "material-nuevo.md"));
    });

    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual({
      documents: [previousDocument, pendingUpload],
      source: "POST",
      revision: 5,
    });
    expect(getDocumentsListSnapshot(queryClient)).toEqual({
      documents: [previousDocument, pendingUpload],
      isConfirmedByGet: false,
    });
  });

  it("keeps other documents from an in-flight GET without letting it confirm a POST seed", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const previousDocument: DocumentDTO = {
      id: 31,
      filename: "material-anterior.pdf",
      file_type: "pdf",
      file_size: 128,
      status: "INDEXED",
      error_message: "",
      created_at: "2026-09-30T00:00:00Z",
    };
    const pendingUpload: DocumentDTO = {
      ...previousDocument,
      id: 32,
      filename: "material-nuevo.md",
      file_type: "md",
      status: "PENDING",
    };
    let resolveInitialGet: ((documents: DocumentDTO[]) => void) | undefined;
    api.listDocuments.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitialGet = resolve;
        }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const documentsHook = renderHook(() => useDocuments(), { wrapper });

    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledOnce());
    act(() => {
      queryClient.setQueryData(DOCUMENTS_QUERY_KEY, {
        documents: [pendingUpload],
        source: "POST",
        revision: 1,
      });
    });

    await act(async () => {
      resolveInitialGet?.([previousDocument]);
    });

    expect(queryClient.getQueryData(DOCUMENTS_QUERY_KEY)).toEqual({
      documents: [previousDocument, pendingUpload],
      source: "POST",
      revision: 1,
    });
    expect(getDocumentsListSnapshot(queryClient)).toEqual({
      documents: [previousDocument, pendingUpload],
      isConfirmedByGet: false,
    });
    await waitFor(() => {
      expect(documentsHook.result.current.data).toEqual([previousDocument, pendingUpload]);
    });
    documentsHook.unmount();
  });
});


describe("session reinforcement", () => {
  it("session polling stops when reinforcement is READY and refreshes the quiz", async () => {
    vi.useFakeTimers();
    try {
      api.getSession
        .mockResolvedValueOnce({ id: 5, reinforcement_status: "PROCESSING" })
        .mockResolvedValue({ id: 5, reinforcement_status: "READY" });
      const queryClient = createClient();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(
        () => {
          const { data } = useSession(5);
          return { data };
        },
        { wrapper: createWrapper(queryClient) },
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.reinforcement_status).toBe("PROCESSING");
      expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["quiz", 5] });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3010);
      });
      expect(result.current.data?.reinforcement_status).toBe("READY");
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["quiz", 5] });
      const calls = api.getSession.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(api.getSession).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("preference survives a throwing localStorage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      const { result } = renderHook(() => useReinforceAlways());
      expect(result.current.always).toBe(false);
      expect(() => act(() => result.current.setAlways(true))).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it("remembers the preference in localStorage", () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useReinforceAlways());

    act(() => result.current.setAlways(true));
    expect(result.current.always).toBe(true);
    expect(window.localStorage.getItem(`studyai.onboarding.${REINFORCE_ALWAYS_FLAG}`)).toBe("1");

    act(() => result.current.setAlways(false));
    expect(result.current.always).toBe(false);
  });
});
