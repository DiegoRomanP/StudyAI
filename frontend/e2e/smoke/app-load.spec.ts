import { expect, test } from "@playwright/test";

const apiOrigin = process.env.STUDYAI_QA_API_URL ?? "http://127.0.0.1:8002";

test("the production app loads the StudyAI home page", async ({ page }) => {
  const navigationResponse = await page.goto("/");
  expect(navigationResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /StudyAI organiza/i })).toBeVisible();
  await expect(page).toHaveTitle("Inicio | StudyAI");

  const documentsResponse = page.waitForResponse(
    (response) =>
      response.url() === new URL("/documents", apiOrigin).href &&
      response.request().method() === "GET",
  );
  await page.getByRole("link", { name: "Explorar documentos" }).click();
  await expect(page).toHaveURL(/\/documents$/);

  const response = await documentsResponse;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual([]);
  await expect(page.getByText("Aún no has subido documentos.", { exact: true })).toBeVisible();
});
