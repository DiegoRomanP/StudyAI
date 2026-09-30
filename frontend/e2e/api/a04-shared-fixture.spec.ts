import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const fixturePath = fileURLToPath(new URL("../../qa/fixtures/studyai-a04-smoke.md", import.meta.url));

test("Playwright reads the canonical Markdown fixture shared with Bruno", async () => {
  const markdown = await readFile(fixturePath, "utf8");

  expect(markdown).toContain("# A04 — Documento sintético de QA");
  expect(markdown).toContain("## Redes urbanas de polinizadores");
  expect(markdown.length).toBeGreaterThan(300);
});
