import { expect, test } from "@playwright/test";

test("the production app loads Documents and reads the isolated API", async ({ page }) => {
  const documentsResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/documents" && response.request().method() === "GET";
  });

  const navigationResponse = await page.goto("/");
  expect(navigationResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole("heading", { name: "Documentos", exact: true })).toBeVisible();

  const documentsResponse = await documentsResponsePromise;
  expect(documentsResponse.status()).toBe(200);
  expect(await documentsResponse.json()).toEqual([]);
});
