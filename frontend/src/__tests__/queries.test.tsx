import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ generatePlan: vi.fn() }));

vi.mock("../api/endpoints", () => ({ api }));

import { useGeneratePlan } from "../hooks/queries";

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
