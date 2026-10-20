import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no layout engine; Recharts' ResponsiveContainer only needs the API to exist.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(cleanup);

// A test's unfinished quiz answers must not resume in the next test.
afterEach(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith("studyai.quizDraft.")) window.localStorage.removeItem(key);
  }
});
