import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

import type {
  GoalDTO,
  LLMCredentialDTO,
  LLMRuntimeDTO,
  ProviderCatalogEntry,
} from "../../src/api/types";

const goal: GoalDTO = {
  id: 91,
  goal_type: "LEARNING",
  title: "Meta de prueba A05",
  description: "Datos sintéticos para comprobar el foco del editor.",
  created_at: "2026-09-29T00:00:00Z",
};

const catalog: ProviderCatalogEntry[] = [
  {
    provider: "OPENAI",
    label: "OpenAI",
    requires_model_selection: true,
    default_model: "gpt-4o-mini",
    default_base_url: "https://api.openai.com/v1",
    common_models: [{ id: "gpt-4o-mini", free: false }],
    key_placeholder: "sk-openai-test",
    requires_api_key: true,
    supports_model_discovery: false,
    supports_custom_base_url: true,
    allows_custom_model: true,
  },
  {
    provider: "ANTHROPIC",
    label: "Anthropic",
    requires_model_selection: true,
    default_model: "claude-test",
    default_base_url: null,
    common_models: [{ id: "claude-test", free: false }],
    key_placeholder: "sk-ant-test",
    requires_api_key: true,
    supports_model_discovery: false,
    supports_custom_base_url: false,
    allows_custom_model: false,
  },
];

const credential: LLMCredentialDTO = {
  provider: "OPENAI",
  label: "OpenAI",
  masked_api_key: "sk-...test",
  model: "gpt-4o-mini",
  base_url: "https://proxy.example.test/v1",
  is_active: false,
  config_revision: 1,
  is_verified: true,
  verified_at: "2026-09-29T00:00:00Z",
  requires_model_selection: true,
  requires_api_key: true,
  supports_model_discovery: false,
  supports_custom_base_url: true,
  allows_custom_model: true,
  created_at: "2026-09-29T00:00:00Z",
};

const runtime: LLMRuntimeDTO = {
  source: "MOCK",
  provider: null,
  models: {
    topic_analysis: "simulado",
    session_plan: "simulado",
    session_content: "simulado",
  },
  fallback_reason: null,
};

const apiOrigin = process.env.STUDYAI_QA_API_URL ?? "http://127.0.0.1:8002";

async function fulfillJson(route: Route, value: unknown) {
  await route.fulfill({
    json: value,
    headers: { "access-control-allow-origin": "*" },
  });
}

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }

  throw new Error("El control objetivo no recibió foco mediante Tab.");
}

async function expectVisibleKeyboardFocus(
  page: Page,
  target: Locator,
) {
  await tabTo(page, target);
  const focusStyle = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });

  expect(focusStyle.focusVisible).toBe(true);
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
  const expectedFocusColor = await page.evaluate(() => {
    const channels = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-focus")
      .trim()
      .split(/\s+/);
    return `rgb(${channels.join(", ")})`;
  });
  expect(focusStyle.outlineColor).toBe(expectedFocusColor);
  return focusStyle;
}

test("legacy controls retain visible keyboard focus without calling a real provider", async ({ page }, testInfo) => {
  await page.route(`${apiOrigin}/goals`, (route) => fulfillJson(route, [goal]));
  await page.route(`${apiOrigin}/llm-settings/catalog`, (route) => fulfillJson(route, catalog));
  await page.route(`${apiOrigin}/llm-settings`, (route) => fulfillJson(route, [credential]));
  await page.route(`${apiOrigin}/llm-settings/runtime`, (route) => fulfillJson(route, runtime));

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Metas", exact: true })).toBeVisible();
    const goalsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(goalsOverflow).toBe(false);

    await expectVisibleKeyboardFocus(page, page.getByRole("button", { name: /Sacar buena nota/ }));
    const titleFocus = await expectVisibleKeyboardFocus(
      page,
      page.getByPlaceholder("Ej. Aprobar el parcial de Cálculo"),
    );
    await page.screenshot({ path: testInfo.outputPath(`goals-focus-${width}.png`) });
    expect(titleFocus).toMatchObject({ focusVisible: true, outlineStyle: "solid", outlineWidth: "3px" });
    await expectVisibleKeyboardFocus(page, page.getByPlaceholder("Detalles: temas a cubrir, fecha, énfasis..."));

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();
    await expectVisibleKeyboardFocus(page, page.locator("select").first());
    await expectVisibleKeyboardFocus(page, page.getByPlaceholder("https://api.openai.com/v1"));
    await expectVisibleKeyboardFocus(page, page.getByPlaceholder("sk-ant-test"));

    const settingsOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(settingsOverflow).toBe(false);
  }

  await page.setViewportSize({ width: 1280, height: 790 });
  await page.goto("/goals");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectVisibleKeyboardFocus(page, page.getByRole("link", { name: /Documentos/ }));

  const hoverTarget = page.getByRole("button", { name: /Sacar buena nota/ });
  await hoverTarget.hover();
  const hoverStyle = await hoverTarget.evaluate((element) => ({
    focused: element.matches(":focus"),
    focusVisible: element.matches(":focus-visible"),
    outlineStyle: getComputedStyle(element).outlineStyle,
  }));
  expect(hoverStyle.focused).toBe(false);
  expect(hoverStyle.focusVisible).toBe(false);
  expect(hoverStyle.outlineStyle).toBe("none");
  const reducedMotionDuration = await hoverTarget.evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).transitionDuration),
  );
  expect(reducedMotionDuration).toBeLessThan(0.001);
});
