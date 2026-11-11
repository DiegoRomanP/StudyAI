import { describe, expect, it } from "vitest";

import { planRequestFingerprint } from "../lib/idempotency";

describe("planRequestFingerprint", () => {
  it("matches the server's view of the payload: document order and duplicates do not matter", () => {
    expect(planRequestFingerprint(7, [34, 12, 34])).toBe(planRequestFingerprint(7, [12, 34]));
    expect(planRequestFingerprint(7, [12, 34])).not.toBe(planRequestFingerprint(8, [12, 34]));
    expect(planRequestFingerprint(7, [12])).not.toBe(planRequestFingerprint(7, [12, 34]));
  });

  it("keeps the v1 fingerprint stable and includes all adaptive plan choices in v2", () => {
    const v1 = planRequestFingerprint(7, [34, 12, 34]);
    expect(v1).toBe("7:12,34");
    expect(planRequestFingerprint(7, [12, 34])).toBe(v1);

    const options = {
      pedagogy: { content_version: 2 as const, profile_hint: "logical_deductive" as const },
      goalType: "EXAM" as const,
    };
    const v2 = planRequestFingerprint(7, [34, 12, 34], options);

    expect(v2).toBe(planRequestFingerprint(7, [12, 34], options));
    expect(v2).not.toBe(
      planRequestFingerprint(7, [12, 34], {
        ...options,
        pedagogy: { content_version: 2, profile_hint: "auto" },
      }),
    );
    expect(v2).not.toBe(
      planRequestFingerprint(7, [12, 34], { ...options, goalType: "LEARNING" }),
    );
  });
});
