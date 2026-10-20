import { afterEach, describe, expect, it, vi } from "vitest";

import { clearQuizDraft, readQuizDraft, writeQuizDraft } from "./quizDraft";

afterEach(() => vi.restoreAllMocks());

describe("quiz drafts", () => {
  it("round-trips the answers and order, and clears them", () => {
    writeQuizDraft(4, { quizId: 9, answers: { 1: { question_id: 1, quality: 3 } }, order: [2, 1] });
    expect(readQuizDraft(4)).toEqual({ quizId: 9, answers: { 1: { question_id: 1, quality: 3 } }, order: [2, 1] });
    clearQuizDraft(4);
    expect(readQuizDraft(4)).toBeNull();
  });

  it("reads corrupt or malformed data as no draft", () => {
    window.localStorage.setItem("studyai.quizDraft.4", "{not json");
    expect(readQuizDraft(4)).toBeNull();
    window.localStorage.setItem("studyai.quizDraft.4", JSON.stringify({ answers: {} }));
    expect(readQuizDraft(4)).toBeNull();
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeQuizDraft(4, { quizId: 9, answers: {}, order: null })).not.toThrow();
    expect(readQuizDraft(4)).toBeNull();
  });
});
