import { expect, test } from "@playwright/test";

const apiUrl = process.env.STUDYAI_QA_API_URL ?? "http://127.0.0.1:8002";

test("GET /health reports a ready backend", async ({ request }) => {
  const response = await request.get(new URL("/health", apiUrl).toString());

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("the isolated backend resolves the runtime to MOCK", async ({ request }) => {
  const response = await request.get(new URL("/llm-settings/runtime", apiUrl).toString());

  expect(response.status()).toBe(200);
  const runtime: unknown = await response.json();
  expect(runtime).toMatchObject({ source: "MOCK", provider: null });
});
