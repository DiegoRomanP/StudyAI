import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ generatePlan: vi.fn(), uploadDocument: vi.fn() }));

vi.mock("../api/endpoints", () => ({ api }));

import type { DocumentDTO } from "../api/types";
import { useGeneratePlan, useUploadDocument } from "../hooks/queries";

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
      await result.current.mutateAsync({ goalId: 73, documentIds });
    });

    expect(api.generatePlan).toHaveBeenCalledTimes(1);
    expect(api.generatePlan.mock.calls[0]).toEqual([73, [91, 4, 208]]);
    expect(documentIds).toEqual(originalDocumentIds);
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
    queryClient.setQueryData(["documents"], [previousDocument, cachedUpload]);
    api.uploadDocument.mockResolvedValue(pendingUpload);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadDocument(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(new File(["notes"], "material-nuevo.md"));
    });

    expect(queryClient.getQueryData<DocumentDTO[]>(["documents"])).toEqual([
      previousDocument,
      pendingUpload,
    ]);
    expect(queryClient.getQueryData<DocumentDTO[]>(["documents"])).toHaveLength(2);
  });
});
