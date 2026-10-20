import { describe, expect, it } from "vitest";

import { formatTimeAgo } from "./timeAgo";

const now = new Date("2026-10-19T12:00:00Z");
const ago = (ms: number) => formatTimeAgo(new Date(now.getTime() - ms), now);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatTimeAgo", () => {
  it("uses minutes below an hour, from 0", () => {
    expect(ago(0)).toBe("hace 0 min");
    expect(ago(59 * MIN + 59_000)).toBe("hace 59 min");
  });

  it("uses hours from 1 hour up to a day", () => {
    expect(ago(HOUR)).toBe("hace 1 hora");
    expect(ago(23 * HOUR + 59 * MIN)).toBe("hace 23 horas");
  });

  it("uses days from 24 hours up to 30 days", () => {
    expect(ago(DAY)).toBe("hace 1 día");
    expect(ago(29 * DAY + 23 * HOUR)).toBe("hace 29 días");
  });

  it("caps at more than 30 days", () => {
    expect(ago(30 * DAY)).toBe("hace más de 30 días");
    expect(ago(400 * DAY)).toBe("hace más de 30 días");
  });

  it("reads a future date as now", () => {
    expect(ago(-5 * MIN)).toBe("hace 0 min");
  });
});
