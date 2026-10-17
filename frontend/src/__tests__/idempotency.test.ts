import { describe, expect, it } from "vitest";

import { planRequestFingerprint } from "../lib/idempotency";

describe("planRequestFingerprint", () => {
  it("matches the server's view of the payload: document order and duplicates do not matter", () => {
    expect(planRequestFingerprint(7, [34, 12, 34])).toBe(planRequestFingerprint(7, [12, 34]));
    expect(planRequestFingerprint(7, [12, 34])).not.toBe(planRequestFingerprint(8, [12, 34]));
    expect(planRequestFingerprint(7, [12])).not.toBe(planRequestFingerprint(7, [12, 34]));
  });
});
