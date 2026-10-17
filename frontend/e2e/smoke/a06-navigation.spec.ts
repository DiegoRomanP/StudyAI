import { writeFile } from "node:fs/promises";

import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

import type {
  DashboardDTO,
  DocumentDTO,
  GoalDTO,
  LLMRuntimeDTO,
  PlanDTO,
  ProviderCatalogEntry,
  QuizDTO,
  SessionDetailDTO,
} from "../../src/api/types";

const apiOrigin = process.env.STUDYAI_QA_API_URL ?? "http://127.0.0.1:8002";
const delayedApiGetMs = 500;

const documents: DocumentDTO[] = [
  {
    id: 8,
    filename: "Apuntes de ecología urbana y redes de polinizadores.md",
    file_type: "md",
    file_size: 18_240,
    status: "INDEXED",
    error_message: "",
    created_at: "2026-09-29T12:00:00Z",
  },
  {
    id: 9,
    filename: "Notas complementarias sobre biodiversidad.pdf",
    file_type: "pdf",
    file_size: 45_120,
    status: "PENDING",
    error_message: "",
    created_at: "2026-09-29T12:01:00Z",
  },
];

const goals: GoalDTO[] = [
  {
    id: 4,
    goal_type: "LEARNING",
    title: "Comprender cómo se conectan los hábitats urbanos",
    description:
      "Meta sintética con una descripción suficientemente larga para comprobar el reflow de la fila y sus acciones en móvil.",
    created_at: "2026-09-29T12:00:00Z",
  },
];

const plan: PlanDTO = {
  id: 27,
  title: "Plan de navegación A06",
  status: "READY",
  goal_id: 4,
  document_ids: [8],
  created_at: "2026-09-29T12:00:00Z",
  error_message: "",
  topics: [
    {
      id: 31,
      name: "Conectividad y diversidad de hábitats urbanos",
      subtopics: ["Corredores verdes", "Recursos florales"],
      difficulty: 2,
      relevance: 0.9,
      selected: true,
    },
  ],
  sessions: Array.from({ length: 8 }, (_, index) => ({
    id: 54 + index,
    order_index: index,
    topic_name:
      index === 0
        ? "Sesión de navegación A06: conectividad de hábitats y recursos florales"
        : `Sesión ${index + 1}: diversidad y corredores ecológicos en la ciudad`,
    duration_minutes: 25,
    review_offset_days: 1 + index,
    status: index === 6 ? "COMPLETED" : "PENDING",
  })),
};

const session: SessionDetailDTO = {
  id: 54,
  plan_id: 27,
  order_index: 0,
  topic_name: plan.sessions[0].topic_name,
  duration_minutes: 25,
  review_offset_days: 1,
  status: "PENDING",
  completed_at: null,
  material: {
    content_markdown: [
      "## Material de estudio A06",
      ...Array.from(
        { length: 12 },
        (_, index) =>
          `La conectividad de los hábitats urbanos depende de corredores verdes, recursos florales distribuidos y refugios que permitan el movimiento de distintas especies. Este párrafo ${index + 1} aporta contenido sintético largo para comprobar el scroll vertical y el reflow del material en una pantalla estrecha.`,
      ),
    ].join("\n\n"),
    youtube_keywords: ["polinizadores urbanos", "corredores verdes y biodiversidad"],
  },
};

const quiz: QuizDTO = {
  id: 504,
  session_id: 54,
  questions: [
    {
      id: 801,
      order_index: 0,
      question_type: "MULTIPLE_CHOICE",
      prompt:
        "¿Qué combinación ayuda a mantener conectadas las poblaciones de polinizadores en una ciudad con calles, parques y espacios construidos?",
      options: [
        "Corredores verdes y recursos florales distribuidos durante el año",
        "Únicamente edificios altos y avenidas sin vegetación",
        "Reducir todos los refugios naturales a un único parque",
        "Eliminar las plantas nativas de los espacios públicos",
        "Concentrar los recursos en una sola estación del año",
        "Separar los jardines mediante superficies impermeables",
        "Sustituir todos los espacios verdes por estacionamientos",
      ],
      answer: "Corredores verdes y recursos florales distribuidos durante el año",
    },
  ],
};

const dashboard: DashboardDTO = {
  scores: [
    {
      session_id: 54,
      topic_name: "Conectividad de hábitats",
      score: 80,
      completed_at: "2026-09-29T12:00:00Z",
    },
  ],
  weak_topics: [{ topic_name: "Recursos florales urbanos", score: 42 }],
  upcoming_reviews: [{ next_review_date: "2026-10-01", count: 3 }],
  sessions_completed: 1,
  average_score: 80,
};

const providerCatalog: ProviderCatalogEntry[] = [
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
];

const runtime: LLMRuntimeDTO = {
  source: "MOCK",
  provider: null,
  models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
  fallback_reason: null,
};

type ApiRequest = { method: string; path: string };
type ControlDescription = { tag: string; label: string; href: string | null };
type ExpectedControl = { tag: string; label?: string; href?: string | null };
type MeasuredControl = ControlDescription & { left: number; right: number };
type MobileLayoutEvidence = {
  label: string;
  width: number;
  bottomNavigationTop: number;
  readinessEvidence: string[];
  expectedControls: ExpectedControl[];
  controls: MeasuredControl[];
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    json: body,
    headers: { "access-control-allow-origin": "*" },
  });
}

async function openMobileOverflow(page: Page) {
  const moreButton = page.getByRole("button", { name: /^Más/ });
  await moreButton.focus();
  await page.keyboard.press("Enter");
  await expect(moreButton).toHaveAttribute("aria-expanded", "true");
  const navigation = page.getByRole("navigation", { name: "Más destinos" });
  await expect(navigation).toBeVisible();
  return { moreButton, navigation };
}

const OVERFLOW_LABELS = ["Temas (Pareto)", "Recursos", "Metas", "API Keys"];

async function navigateByKeyboard(
  page: Page,
  destination: { label: string; path: string; index: number },
) {
  const bottomNavigation = page.getByRole("navigation", { name: "Navegación inferior" });
  const moreButton = page.getByRole("button", { name: /^Más/ });
  const isOverflowDestination = OVERFLOW_LABELS.includes(destination.label);
  let link: Locator;

  if (isOverflowDestination) {
    const overflow = await openMobileOverflow(page);
    link = overflow.navigation.getByRole("link", { name: destination.label, exact: true });
    // From the Más trigger, the overflow links follow in DOM order.
    for (let tab = 0; tab <= destination.index; tab += 1) {
      await page.keyboard.press("Tab");
    }
  } else {
    link = bottomNavigation.getByRole("link", { name: destination.label, exact: true });
    await bottomNavigation.getByRole("link", { name: "Inicio", exact: true }).focus();
    for (let tab = 0; tab < destination.index; tab += 1) {
      await page.keyboard.press("Tab");
    }
  }

  await expect(link).toBeFocused();
  const bounds = await link.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${destination.path.replace(/\//g, "\\/")}$`));
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(moreButton).toHaveAttribute("aria-expanded", "false");

  if (isOverflowDestination) {
    const activeOverflow = await openMobileOverflow(page);
    await expect(
      activeOverflow.navigation.getByRole("link", { name: destination.label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(activeOverflow.moreButton).toBeFocused();
  } else {
    await expect(
      bottomNavigation.getByRole("link", { name: destination.label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
}

async function assertMobileLayout(
  page: Page,
  label: string,
  expectVerticalScroll = false,
  expectedControls: ExpectedControl[] = [],
  readinessEvidence: string[] = [],
): Promise<MobileLayoutEvidence> {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });

  const layout = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    if (!main) throw new Error("No se encontró #main-content.");
    const bottomNavigation = document.querySelector<HTMLElement>(
      'nav[aria-label="Navegación inferior"]',
    );
    if (!bottomNavigation) throw new Error("No se encontró la navegación inferior móvil.");
    const bottomNavigationTop = bottomNavigation.getBoundingClientRect().top;

    const describe = (element: Element): ControlDescription => ({
      tag: element.tagName.toLowerCase(),
      label:
        element.getAttribute("aria-label") ??
        (element instanceof HTMLInputElement
          ? element.getAttribute("placeholder") ?? element.type
          : element.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
    });
    const isVisible = (element: HTMLElement) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const controls = Array.from(
      main.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea"),
    ).filter(isVisible);
    const measuredControls = controls.map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        ...describe(element),
        left: Math.round(bounds.left * 100) / 100,
        right: Math.round(bounds.right * 100) / 100,
      };
    });
    const focusables = controls.filter((element) => {
      if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        if (element.disabled) return false;
      }
      return element.tabIndex >= 0;
    });
    const width = document.documentElement.clientWidth;
    const overflowingControls = measuredControls
      .filter((control) => control.left < -0.5 || control.right > width + 0.5);
    const overflowingContent = [main, ...Array.from(main.querySelectorAll<HTMLElement>("*"))]
      .filter(isVisible)
      .filter((element) => !element.classList.contains("truncate"))
      .filter((element) => element.scrollWidth > element.clientWidth + 8)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));

    return {
      width,
      documentWidth: document.documentElement.scrollWidth,
      bottomNavigationTop,
      measuredControls,
      focusables: focusables.map(describe),
      overflowingControls,
      overflowingContent,
    };
  });

  expect(layout.width, `${label}: viewport width`).toBe(320);
  expect(layout.documentWidth, `${label}: document horizontal overflow`).toBe(320);
  expect(layout.bottomNavigationTop, `${label}: visible bottom navigation`).toBeGreaterThan(0);
  expect(layout.overflowingControls, `${label}: controls outside the viewport`).toEqual([]);
  expect(layout.overflowingContent, `${label}: content clipped by an ancestor`).toEqual([]);
  for (const expected of expectedControls) {
    const matches = (control: ControlDescription) =>
      control.tag === expected.tag &&
      (expected.label === undefined || control.label === expected.label) &&
      (!("href" in expected) || control.href === expected.href);
    const matchedControls = layout.measuredControls.filter(matches);
    expect(
      matchedControls.length,
      `${label}: expected ${JSON.stringify(expected)} in the measured controls`,
    ).toBeGreaterThan(0);
    expect(
      matchedControls.every((control) => control.left >= -0.5 && control.right <= layout.width + 0.5),
      `${label}: expected ${JSON.stringify(expected)} inside the viewport`,
    ).toBe(true);
    expect(
      layout.focusables.some(matches),
      `${label}: expected ${JSON.stringify(expected)} among enabled keyboard controls`,
    ).toBe(true);
  }
  if (layout.focusables.length === 0) {
    expect(label, "only the read-only Estadísticas page has no in-page keyboard actions").toBe(
      "Estadísticas",
    );
    await expect(page.locator("#main-content")).toBeVisible();
    return {
      label,
      width: layout.width,
      bottomNavigationTop: layout.bottomNavigationTop,
      readinessEvidence,
      expectedControls,
      controls: layout.measuredControls,
    };
  }

  let maxScrollY = 0;
  await page.locator("#main-content").focus();
  for (const expected of layout.focusables) {
    await page.keyboard.press("Tab");
    const activeControl = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;
      return {
        tag: active.tagName.toLowerCase(),
        label:
          active.getAttribute("aria-label") ??
          (active instanceof HTMLInputElement
            ? active.getAttribute("placeholder") ?? active.type
            : active.textContent?.replace(/\s+/g, " ").trim() ?? ""),
        href: active instanceof HTMLAnchorElement ? active.getAttribute("href") : null,
        left: active.getBoundingClientRect().left,
        right: active.getBoundingClientRect().right,
        top: active.getBoundingClientRect().top,
        bottom: active.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
        scrollY: window.scrollY,
      };
    });

    expect(activeControl, `${label}: Tab reaches ${expected.label}`).not.toBeNull();
    expect(
      { tag: activeControl!.tag, label: activeControl!.label, href: activeControl!.href },
      `${label}: sequential focus order`,
    ).toEqual(expected);
    expect(activeControl!.left, `${label}: focused control left edge`).toBeGreaterThanOrEqual(-0.5);
    expect(activeControl!.right, `${label}: focused control right edge`).toBeLessThanOrEqual(320.5);
    expect(activeControl!.top, `${label}: focused control is scrolled into view`).toBeGreaterThanOrEqual(-0.5);
    expect(activeControl!.bottom, `${label}: focused control is scrolled into view`).toBeLessThanOrEqual(
      activeControl!.viewportHeight + 0.5,
    );
    expect(
      activeControl!.bottom,
      `${label}: focused control clears the fixed bottom navigation`,
    ).toBeLessThanOrEqual(layout.bottomNavigationTop + 0.5);
    maxScrollY = Math.max(maxScrollY, activeControl!.scrollY);
  }

  if (expectVerticalScroll) {
    expect(maxScrollY, `${label}: keyboard navigation causes real vertical scrolling`).toBeGreaterThan(0);
  }

  return {
    label,
    width: layout.width,
    bottomNavigationTop: layout.bottomNavigationTop,
    readinessEvidence,
    expectedControls,
    controls: layout.measuredControls,
  };
}

test("responsive navigation, deep links, keyboard flow and recovery work at 320px", async ({ page }, testInfo) => {
  const apiRequests: ApiRequest[] = [];
  const delayedGetPaths: string[] = [];
  const mobileLayoutEvidence: MobileLayoutEvidence[] = [];
  let missingPlanAttempts = 0;

  await page.setViewportSize({ width: 320, height: 560 });
  await page.route(`${apiOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    apiRequests.push({ method, path: url.pathname });

    if (method === "GET") {
      delayedGetPaths.push(url.pathname);
      await new Promise<void>((resolve) => setTimeout(resolve, delayedApiGetMs));
      if (url.pathname === "/plans/27") return fulfillJson(route, plan);
      if (url.pathname === "/plans/404") {
        missingPlanAttempts += 1;
        if (missingPlanAttempts <= 2) {
          return fulfillJson(route, { detail: "plan not found" }, 404);
        }
        return fulfillJson(route, { ...plan, id: 404, title: "Plan recuperado tras 404" });
      }
      if (url.pathname === "/sessions/54") return fulfillJson(route, session);
      if (url.pathname === "/quizzes/54") return fulfillJson(route, quiz);
      if (url.pathname === "/documents") return fulfillJson(route, documents);
      if (url.pathname === "/goals") return fulfillJson(route, goals);
      if (url.pathname === "/plans") return fulfillJson(route, [plan]);
      if (url.pathname === "/dashboard") return fulfillJson(route, dashboard);
      if (url.pathname === "/llm-settings/catalog") return fulfillJson(route, providerCatalog);
      if (url.pathname === "/llm-settings") return fulfillJson(route, []);
      if (url.pathname === "/llm-settings/runtime") return fulfillJson(route, runtime);
    }

    if (method === "POST" && url.pathname === "/quizzes/504/submit") {
      return fulfillJson(route, { correct: 1, total: 1, score: 100, detail: { "801": {} } });
    }

    return route.fallback();
  });

  await page.goto("/inicio");
  const skipLink = page.getByRole("link", { name: "Saltar al contenido" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Tu camino de estudio de hoy" })).toBeVisible();
  await expect(page).toHaveTitle("Inicio | StudyAI");
  const todaySession = page.getByRole("region", { name: "Sesión de hoy" });
  await expect(todaySession.getByRole("link", { name: "Comenzar sesión" })).toHaveAttribute(
    "href",
    "/session/54",
  );
  mobileLayoutEvidence.push(
    await assertMobileLayout(page, "Inicio", true, [
      { tag: "a", href: "/session/54" },
      { tag: "a", href: "/plan/27" },
    ], ["today session link /session/54", "plan link /plan/27"]),
  );

  const bottomNavigation = page.getByRole("navigation", { name: "Navegación inferior" });
  const menuLabels = ["Inicio", "Plan", "Estadísticas"];
  expect(await bottomNavigation.getByRole("link").allTextContents()).toEqual(menuLabels);
  await expect(bottomNavigation.getByRole("link", { name: "API Keys" })).toHaveCount(0);

  const menuBounds = [];
  for (const label of menuLabels) {
    const link = bottomNavigation.getByRole("link", { name: label, exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    const bounds = await link.boundingBox();
    expect(bounds, `${label} bottom-navigation link bounds`).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    menuBounds.push({ label, x: bounds!.x, right: bounds!.x + bounds!.width });
  }
  expect(menuBounds).toHaveLength(menuLabels.length);

  const { moreButton, navigation } = await openMobileOverflow(page);
  expect(await navigation.getByRole("link").allTextContents()).toEqual(OVERFLOW_LABELS);
  for (const label of OVERFLOW_LABELS) {
    const overflowLink = navigation.getByRole("link", { name: label, exact: true });
    await page.keyboard.press("Tab");
    await expect(overflowLink).toBeFocused();
    const overflowBounds = await overflowLink.boundingBox();
    expect(overflowBounds, `${label} overflow link bounds`).not.toBeNull();
    expect(overflowBounds!.x).toBeGreaterThanOrEqual(0);
    expect(overflowBounds!.x + overflowBounds!.width).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: testInfo.outputPath("a06-mobile-navigation-320.png") });
  await page.keyboard.press("Escape");
  await expect(moreButton).toHaveAttribute("aria-expanded", "false");
  await expect(moreButton).toBeFocused();

  const destinations = [
    {
      label: "Temas (Pareto)",
      path: "/temas",
      heading: "Temas (Pareto)",
      title: "Temas (Pareto) | StudyAI",
      index: 0,
      expectedControls: [{ tag: "a", href: "/plan/27" }],
      readinessEvidence: [`prioritized topic: ${plan.topics[0].name}`, "plan link: /plan/27"],
      waitForFixture: async () => {
        await expect(page.getByRole("heading", { name: plan.topics[0].name })).toBeVisible();
      },
    },
    {
      label: "Recursos",
      path: "/documents",
      heading: "Recursos",
      title: "Recursos | StudyAI",
      index: 1,
      expectedControls: [{ tag: "button", label: "Eliminar" }],
      readinessEvidence: [`document row: ${documents[0].filename}`, "row action: Eliminar"],
      waitForFixture: async () => {
        const row = page.getByText(documents[0].filename, { exact: true });
        await expect(row).toBeVisible();
        await expect(row.locator("xpath=../..").getByRole("button", { name: "Eliminar" })).toBeVisible();
      },
    },
    {
      label: "Metas",
      path: "/goals",
      heading: "Metas",
      title: "Metas | StudyAI",
      index: 2,
      expectedControls: [
        { tag: "button", label: "Editar" },
        { tag: "button", label: "Eliminar" },
      ],
      readinessEvidence: [`goal row: ${goals[0].title}`, "row actions: Editar, Eliminar"],
      waitForFixture: async () => {
        const row = page.getByText(goals[0].title, { exact: true });
        await expect(row).toBeVisible();
        const rowActions = row.locator("xpath=../..");
        await expect(rowActions.getByRole("button", { name: "Editar" })).toBeVisible();
        await expect(rowActions.getByRole("button", { name: "Eliminar" })).toBeVisible();
      },
    },
    {
      label: "Plan",
      path: "/plan",
      heading: "Plan de estudio",
      title: "Plan de estudio | StudyAI",
      index: 1,
      expectedControls: [
        { tag: "a", href: "/plan/27" },
        { tag: "input", label: "checkbox" },
        { tag: "button", label: "Eliminar" },
      ],
      readinessEvidence: [
        `plan row: ${plan.title}`,
        "plan link: /plan/27",
        `indexed-document checkbox: ${documents[0].filename}`,
        "row action: Eliminar",
      ],
      waitForFixture: async () => {
        const row = page.getByText(plan.title, { exact: true });
        await expect(row).toBeVisible();
        await expect(row.locator("xpath=../..").getByRole("button", { name: "Eliminar" })).toBeVisible();
        await expect(page.getByLabel(documents[0].filename, { exact: true })).toBeVisible();
      },
    },
    {
      label: "Estadísticas",
      path: "/dashboard",
      heading: "Estadísticas",
      title: "Estadísticas | StudyAI",
      index: 2,
      expectedControls: [],
      readinessEvidence: ["weak topic: Recursos florales urbanos", "average score: 80%"],
      waitForFixture: async () => {
        await expect(page.getByText("Recursos florales urbanos", { exact: true })).toBeVisible();
        // The first match is the visible stat; the chart's text table repeats it inside <details>.
        await expect(page.getByText("80%", { exact: true }).first()).toBeVisible();
      },
    },
    {
      label: "API Keys",
      path: "/settings",
      heading: "API Keys",
      title: "API Keys | StudyAI",
      index: 3,
      expectedControls: [
        { tag: "input", label: "sk-openai-test" },
        { tag: "button", label: "Guardar clave" },
      ],
      readinessEvidence: ["provider key input placeholder: sk-openai-test", "provider action: Guardar clave"],
      waitForFixture: async () => {
        await expect(page.getByPlaceholder("sk-openai-test")).toBeVisible();
        await expect(page.getByRole("button", { name: "Guardar clave", exact: true })).toBeVisible();
      },
    },
  ];

  for (const destination of destinations) {
    await navigateByKeyboard(page, destination);
    await expect(page.getByRole("heading", { name: destination.heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(destination.title);
    await destination.waitForFixture();
    mobileLayoutEvidence.push(
      await assertMobileLayout(
        page,
        destination.label,
        false,
        destination.expectedControls,
        destination.readinessEvidence,
      ),
    );
  }

  await page.goto("/plan/27");
  await expect(page.getByRole("heading", { name: "Plan de navegación A06" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sesión 8:/ })).toBeVisible();
  await expect(page).toHaveTitle("Detalle del plan | StudyAI");
  mobileLayoutEvidence.push(
    await assertMobileLayout(
      page,
      "Detalle del plan",
      true,
      [{ tag: "a", href: "/session/61" }],
      [`eighth-session fixture link: /session/61 (${plan.sessions[7].topic_name})`],
    ),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("a06-plan-direct-link-320.png") });

  const planSessionLink = page.getByRole("link", { name: /Sesión de navegación A06/ });
  await expect(planSessionLink).toHaveAttribute("href", "/session/54");
  await planSessionLink.click();
  await expect(page).toHaveURL(/\/session\/54$/);
  await expect(page.getByRole("heading", { name: session.topic_name })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/plan\/27$/);
  await expect(page.getByRole("heading", { name: "Plan de navegación A06" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/session\/54$/);

  await page.goto("/session/54");
  await expect(page.getByRole("heading", { name: session.topic_name })).toBeVisible();
  await expect(page).toHaveTitle("Sesión de estudio | StudyAI");
  await expect(page.getByText("Material de estudio A06", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Saltar al receso/ })).toBeVisible();
  mobileLayoutEvidence.push(
    await assertMobileLayout(page, "Sesión de estudio", true, [
      { tag: "button", label: "Saltar al receso" },
    ], ["session heading and material: Material de estudio A06", "study action: Saltar al receso"]),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("a06-session-direct-link-320.png") });

  const breakButton = page.getByRole("button", { name: /Saltar al receso/ });
  await breakButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Receso activo (5 min)" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ir al test/ })).toBeVisible();
  mobileLayoutEvidence.push(
    await assertMobileLayout(
      page,
      "Receso",
      false,
      [{ tag: "button", label: "Ir al test" }],
      ["break state heading: Receso activo (5 min)", "break action: Ir al test"],
    ),
  );
  const quizButton = page.getByRole("button", { name: /Ir al test/ });
  await quizButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Pregunta 1 de 1")).toBeVisible();
  await expect(page.getByRole("button", { name: quiz.questions[0].options[0] })).toBeVisible();
  mobileLayoutEvidence.push(
    await assertMobileLayout(page, "Quiz", true, [
      { tag: "button", label: quiz.questions[0].options[0] },
    ], ["quiz state: Pregunta 1 de 1", `answer action: ${quiz.questions[0].options[0]}`]),
  );

  const requestsBeforeInvalidIds = apiRequests.length;
  await page.goto("/plan/NaN");
  await expect(page.getByRole("heading", { name: "Enlace al plan no válido" })).toBeVisible();
  await page.goto("/session/1.5");
  await expect(page.getByRole("heading", { name: "Enlace a la sesión no válido" })).toBeVisible();
  // Invalid IDs must never reach a plan/session/quiz request. The shell's streak card
  // still reads the dashboard on every page, which is a global GET unrelated to the ID.
  const invalidIdRequests = apiRequests.slice(requestsBeforeInvalidIds);
  expect(
    invalidIdRequests.filter(({ path }) => /^\/(plans|sessions|quizzes)\//.test(path)),
  ).toEqual([]);
  expect(invalidIdRequests.filter(({ method }) => method !== "GET")).toEqual([]);
  expect(invalidIdRequests.every(({ path }) => path === "/dashboard")).toBe(true);

  await page.goto("/plan/27/extra");
  await expect(page.getByRole("heading", { name: /No encontramos esa página/ })).toBeVisible();
  await expect(page).toHaveTitle("Página no encontrada | StudyAI");
  const unknownRouteBottomNavigation = page.getByRole("navigation", {
    name: "Navegación inferior",
  });
  await expect(
    unknownRouteBottomNavigation.getByRole("link", { name: "Plan", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  const unknownRouteOverflow = await openMobileOverflow(page);
  await expect(unknownRouteOverflow.moreButton).not.toHaveAttribute("aria-current", "page");
  await expect(
    unknownRouteOverflow.navigation.getByRole("link", { name: "API Keys", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(unknownRouteOverflow.moreButton).toBeFocused();

  await page.goto("/plan/404");
  await expect(page.getByRole("heading", { name: "Este plan ya no existe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { name: "Plan recuperado tras 404" })).toBeVisible();
  expect(missingPlanAttempts).toBe(3);
  expect(
    apiRequests.filter(({ method }) => method !== "GET"),
    "navigation and recovery should not mutate server state",
  ).toEqual([]);
  expect(delayedGetPaths).toEqual(
    expect.arrayContaining([
      "/documents",
      "/goals",
      "/plans",
      "/dashboard",
      "/llm-settings/catalog",
      "/llm-settings",
      "/llm-settings/runtime",
      "/plans/27",
      "/sessions/54",
      "/quizzes/54",
    ]),
  );
  const readinessEvidencePath = testInfo.outputPath("a06-mobile-readiness.json");
  await writeFile(
    readinessEvidencePath,
    `${JSON.stringify(
      {
        controlled_api_get_delay_ms: delayedApiGetMs,
        delayed_get_paths: delayedGetPaths,
        mobile_layouts: mobileLayoutEvidence,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await testInfo.attach("a06-mobile-readiness.json", {
    path: readinessEvidencePath,
    contentType: "application/json",
  });
});
