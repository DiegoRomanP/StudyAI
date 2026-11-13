import { describe, expect, it } from "vitest";
import { seededShuffle } from "./shuffle";

describe("seededShuffle", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);

  it("returns the same order for the same seed", () => {
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
  });

  it("is a permutation that actually mixes", () => {
    const mixed = seededShuffle(items, "7:rev-1");
    expect([...mixed].sort((a, b) => a - b)).toEqual(items);
    expect(mixed).not.toEqual(items);
  });
});
