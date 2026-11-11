import { afterEach, describe, expect, it, vi } from "vitest";

const apiClient = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../api/client", () => ({ apiClient }));

import { api } from "../api/endpoints";

afterEach(() => {
  vi.clearAllMocks();
});

describe("plan generation API", () => {
  it("keeps the legacy request body unchanged when adaptive options are absent", async () => {
    apiClient.post.mockResolvedValue({ data: { id: 9, status: "PROCESSING", error_message: "" } });

    await api.generatePlan(3, [4], "request-v1");

    expect(apiClient.post).toHaveBeenCalledWith(
      "/plans/generate",
      { goal_id: 3, document_ids: [4] },
      { headers: { "Idempotency-Key": "request-v1" } },
    );
  });

  it("sends the v2 marker and profile hint only when adaptation is enabled", async () => {
    apiClient.post.mockResolvedValue({ data: { id: 9, status: "PROCESSING", error_message: "" } });

    await api.generatePlan(3, [4], "request-v2", {
      content_version: 2,
      profile_hint: "logical_deductive",
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/plans/generate",
      {
        goal_id: 3,
        document_ids: [4],
        content_version: 2,
        profile_hint: "logical_deductive",
      },
      { headers: { "Idempotency-Key": "request-v2" } },
    );
  });
});
