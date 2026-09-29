import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appBase = (process.env.A02_APP_BASE ?? "http://127.0.0.1:5174").replace(/\/$/, "");
const apiBase = (process.env.A02_API_BASE ?? "http://127.0.0.1:8011").replace(/\/$/, "");
const runId = process.env.A02_RUN_ID;
const outputRoot = path.resolve(process.cwd(), "docs/frontend-integration/evidence/a02/runs");
const outputDir = path.resolve(process.env.A02_OUTPUT_DIR ?? "");
const viewport = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } };
const fixturePath = fileURLToPath(new URL("./a02-carbon-cycle-synthetic.md", import.meta.url));
const fixtureName = path.basename(fixturePath);
const goalInput = {
  goal_type: "LEARNING",
  title: "A02 · Carbono sintético",
  description: "Aprender ciclo del carbono, fotosíntesis, respiración y reservorios del material sintético.",
};

if (!runId || !/^[A-Za-z0-9._-]+$/.test(runId)) {
  throw new Error("A02_RUN_ID debe ser un identificador simple y único.");
}
if (!outputDir.startsWith(`${outputRoot}${path.sep}`)) {
  throw new Error("A02_OUTPUT_DIR debe quedar dentro de evidence/a02/runs/.");
}

await mkdir(outputDir, { recursive: true });
const fixtureBytes = await readFile(fixturePath);
const startedAt = new Date();
const startedClock = performance.now();
const report = {
  activity: "A02",
  run_id: runId,
  started_at_utc: startedAt.toISOString(),
  finished_at_utc: null,
  baseline_commit: "efea4b867770feb2bf3b9ad39e2339208508ccfa",
  environment: {
    app_origin: appBase,
    api_origin: apiBase,
  browser: "Chromium via installed Playwright",
    viewport_css_px: viewport,
    device_scale_factor: 1,
    fixture: {
      path: "docs/frontend-integration/evidence/a02/a02-carbon-cycle-synthetic.md",
      filename: fixtureName,
      bytes: fixtureBytes.byteLength,
      sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
    },
    storage: "Run-specific temporary SQLite, uploads and vector store; no development data used.",
  },
  exact_inputs: {
    goal: goalInput,
    quiz_response_rule: "For every flashcard submit quality 5; for every multiple-choice item click the GET /quizzes/{session_id} option equal to that question's answer. The script persists only the selected option index, never prompt/answer text.",
    score_rule: "Multiple-choice only: correct / multiple_choice_total * 100, rounded to one decimal; flashcard ratings are submitted but excluded from score.",
  },
  steps: [],
  id_correlations: {},
  quiz_calculation: null,
  post_completion: null,
  runtime_checks: null,
  network_events: [],
  console_events: [],
  page_errors: [],
  failed_requests: [],
  failed_http_responses: [],
  screenshots: [],
  outcome: { status: "RUNNING", last_completed_step: null, error: null },
};

let activeStep = "initialize";
let eventSequence = 0;
const requestSequence = new WeakMap();
const questionById = new Map();
const pendingEventWrites = [];
let browser;

function step(name, details = {}) {
  activeStep = name;
  report.steps.push({ index: report.steps.length + 1, name, at_utc: new Date().toISOString(), ...details });
}

function safeMessage(value) {
  return String(value)
    .replace(/\b(?:sk|pk|api)[-_][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_SECRET]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 400);
}

function endpoint(request) {
  const url = new URL(request.url());
  return { path: url.pathname, method: request.method().toUpperCase() };
}

function requestProjection(request) {
  const { path: pathname, method } = endpoint(request);
  let body;
  try {
    body = request.postDataJSON();
  } catch {
    body = undefined;
  }

  if (method === "POST" && pathname === "/goals" && body) {
    return { goal_type: body.goal_type, title: body.title, description_length: String(body.description ?? "").length };
  }
  if (method === "POST" && pathname === "/documents/upload") return undefined;
  if (method === "POST" && pathname === "/plans/generate" && body) {
    return { goal_id: body.goal_id, document_ids: body.document_ids };
  }
  if (method === "POST" && /^\/quizzes\/\d+\/submit$/.test(pathname) && body) {
    return {
      answers: (body.answers ?? []).map((answer) => {
        const question = questionById.get(answer.question_id);
        if (question?.type === "FLASHCARD") {
          return { question_id: answer.question_id, type: question.type, quality: answer.quality };
        }
        return {
          question_id: answer.question_id,
          type: question?.type ?? "UNKNOWN",
          selected_option_index: question?.options.indexOf(answer.selected_option) ?? null,
          matched_answer: question ? answer.selected_option === question.answer : null,
        };
      }),
    };
  }
  return undefined;
}

async function responseProjection(response) {
  const { path: pathname, method } = endpoint(response.request());
  let body;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }

  if (pathname === "/health") return { status: body.status };
  if (pathname === "/llm-settings/runtime") return { source: body.source };
  if (pathname === "/documents/upload" && method === "POST") {
    return { id: body.id, filename: body.filename, status: body.status, file_type: body.file_type };
  }
  if (pathname === "/documents" && method === "GET") {
    return body.map((document) => ({ id: document.id, filename: document.filename, status: document.status }));
  }
  if (/^\/documents\/\d+$/.test(pathname)) {
    return { id: body.id, filename: body.filename, status: body.status, file_type: body.file_type };
  }
  if (pathname === "/goals" && method === "POST") {
    return { id: body.id, goal_type: body.goal_type, title: body.title };
  }
  if (pathname === "/plans/generate") return { id: body.id, status: body.status };
  if (/^\/plans\/\d+\/status$/.test(pathname)) return { id: body.id, status: body.status };
  if (/^\/plans\/\d+$/.test(pathname)) {
    return {
      id: body.id,
      status: body.status,
      goal_id: body.goal_id,
      document_ids: body.document_ids,
      sessions: (body.sessions ?? []).map((session) => ({
        id: session.id,
        order_index: session.order_index,
        status: session.status,
      })),
    };
  }
  if (/^\/sessions\/\d+$/.test(pathname)) {
    return {
      id: body.id,
      plan_id: body.plan_id,
      status: body.status,
      completed_at_present: body.completed_at != null,
      has_material: body.material != null,
    };
  }
  if (/^\/quizzes\/\d+$/.test(pathname)) {
    const questions = body.questions ?? [];
    return {
      id: body.id,
      session_id: body.session_id,
      question_count: questions.length,
      question_types: questions.reduce((counts, question) => {
        counts[question.question_type] = (counts[question.question_type] ?? 0) + 1;
        return counts;
      }, {}),
      questions: questions.map((question) => ({
        id: question.id,
        type: question.question_type,
        option_count: question.options.length,
      })),
    };
  }
  if (/^\/quizzes\/\d+\/submit$/.test(pathname)) {
    return { score: body.score, correct: body.correct, total: body.total };
  }
  if (pathname === "/dashboard") {
    return {
      sessions_completed: body.sessions_completed,
      average_score: body.average_score,
      scores_count: body.scores?.length ?? 0,
    };
  }
  return undefined;
}

async function saveScreenshot(page, name, viewportName) {
  const filePath = path.join(outputDir, name);
  const expected = viewport[viewportName];
  await page.screenshot({ path: filePath, fullPage: false, animations: "disabled" });
  const bytes = await readFile(filePath);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== expected.width || height !== expected.height) {
    throw new Error(`Screenshot ${name} dimensions ${width}x${height} != viewport ${expected.width}x${expected.height}.`);
  }
  report.screenshots.push({
    path: path.relative(process.cwd(), filePath),
    viewport_css_px: `${width}x${height}`,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    run_id: runId,
  });
}

async function pageFetch(page, pathname) {
  return page.evaluate(async ({ apiBase, pathname }) => {
    const response = await fetch(`${apiBase}${pathname}`);
    const json = await response.json();
    return { status_code: response.status, json };
  }, { apiBase, pathname });
}

try {
  browser = await chromium.launch({ headless: true });
  report.environment.browser_version = browser.version();
  const context = await browser.newContext({ viewport: viewport.desktop, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  page.on("request", (request) => {
    if (!request.url().startsWith(apiBase)) return;
    const sequence = ++eventSequence;
    requestSequence.set(request, sequence);
    report.network_events.push({
      sequence,
      kind: "request",
      request_sequence: sequence,
      elapsed_ms: Math.round(performance.now() - startedClock),
      step: activeStep,
      ...endpoint(request),
      body: requestProjection(request),
    });
  });

  page.on("response", (response) => {
    if (!response.url().startsWith(apiBase)) return;
    const task = (async () => {
      const sequence = ++eventSequence;
      const status = response.status();
      const record = {
        sequence,
        kind: "response",
        request_sequence: requestSequence.get(response.request()) ?? null,
        elapsed_ms: Math.round(performance.now() - startedClock),
        step: activeStep,
        ...endpoint(response.request()),
        status_code: status,
        body: await responseProjection(response),
      };
      report.network_events.push(record);
      if (status >= 400) report.failed_http_responses.push(record);
    })().catch((error) => {
      report.outcome.error ??= `Could not record HTTP response: ${safeMessage(error.message)}`;
    });
    pendingEventWrites.push(task);
  });

  page.on("requestfailed", (request) => {
    if (!request.url().startsWith(apiBase)) return;
    report.failed_requests.push({
      at_utc: new Date().toISOString(),
      step: activeStep,
      ...endpoint(request),
      error: safeMessage(request.failure()?.errorText ?? "request failed"),
    });
  });

  page.on("console", (message) => {
    report.console_events.push({
      at_utc: new Date().toISOString(),
      type: message.type(),
      text: safeMessage(message.text()),
    });
  });
  page.on("pageerror", (error) => {
    report.page_errors.push({ at_utc: new Date().toISOString(), message: safeMessage(error.message) });
  });

  step("open_app_and_check_demo_runtime");
  await page.goto(appBase, { waitUntil: "domcontentloaded" });
  await page.waitForURL("**/documents");
  const [health, runtime] = await Promise.all([
    pageFetch(page, "/health"),
    pageFetch(page, "/llm-settings/runtime"),
  ]);
  report.runtime_checks = {
    health: { status_code: health.status_code, body_status: health.json.status },
    llm_runtime_source: runtime.json.source,
  };
  if (health.status_code !== 200 || runtime.json.source !== "MOCK") {
    throw new Error("Runtime gate failed: expected /health 200 and /llm-settings/runtime source MOCK.");
  }

  step("upload_fixture_and_wait_until_indexed");
  const uploadResponsePromise = page.waitForResponse((response) => {
    const { path: pathname, method } = endpoint(response.request());
    return pathname === "/documents/upload" && method === "POST";
  });
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  const uploadResponse = await uploadResponsePromise;
  const uploadedDocument = await uploadResponse.json();
  if (uploadResponse.status() !== 201) throw new Error(`Document upload returned ${uploadResponse.status()}.`);
  await page.getByText("Indexado", { exact: true }).waitFor();
  const documentState = await pageFetch(page, `/documents/${uploadedDocument.id}`);
  if (documentState.status_code !== 200 || documentState.json.status !== "INDEXED") {
    throw new Error(`Document ${uploadedDocument.id} did not reach INDEXED.`);
  }
  const documentId = documentState.json.id;
  report.id_correlations.document_id = documentId;
  await saveScreenshot(page, "documents-desktop.png", "desktop");

  step("create_goal_with_exact_synthetic_input", { goal_type: goalInput.goal_type, title: goalInput.title });
  await page.locator('a[href="/goals"]').click();
  await page.locator('input[placeholder="Ej. Aprobar el parcial de Cálculo"]').fill(goalInput.title);
  await page.locator('textarea[placeholder="Detalles: temas a cubrir, fecha, énfasis..."]').fill(goalInput.description);
  const goalResponsePromise = page.waitForResponse((response) => {
    const { path: pathname, method } = endpoint(response.request());
    return pathname === "/goals" && method === "POST";
  });
  await page.getByRole("button", { name: "Guardar meta", exact: true }).click();
  const goalResponse = await goalResponsePromise;
  const goal = await goalResponse.json();
  if (goalResponse.status() !== 201) throw new Error(`Goal creation returned ${goalResponse.status()}.`);
  await page.getByText(goalInput.title, { exact: true }).waitFor();
  report.id_correlations.goal_id = goal.id;

  step("generate_plan_and_wait_for_ready", { goal_id: goal.id, document_ids: [documentId] });
  await page.locator('a[href="/plan"]').click();
  await page.locator("select").first().selectOption(String(goal.id));
  await page.getByRole("checkbox", { name: fixtureName }).check();
  const generateResponsePromise = page.waitForResponse((response) => {
    const { path: pathname, method } = endpoint(response.request());
    return pathname === "/plans/generate" && method === "POST";
  });
  await page.getByRole("button", { name: "Generar plan", exact: true }).click();
  const generateResponse = await generateResponsePromise;
  const generatedPlan = await generateResponse.json();
  if (generateResponse.status() !== 202 || generatedPlan.status !== "PROCESSING") {
    throw new Error(`Plan generation did not return 202/PROCESSING (HTTP ${generateResponse.status()}).`);
  }
  const planId = generatedPlan.id;
  await page.waitForURL(`**/plan/${planId}`);
  await page.getByText(/^Listo · \d+ sesiones$/).waitFor();
  const planState = await pageFetch(page, `/plans/${planId}`);
  if (planState.status_code !== 200 || planState.json.status !== "READY") {
    throw new Error(`Plan ${planId} did not reach READY.`);
  }
  const sessionIds = (planState.json.sessions ?? []).map((session) => session.id);
  if (sessionIds.length === 0) throw new Error(`READY plan ${planId} has no sessions.`);
  const sessionId = sessionIds[0];
  report.id_correlations = {
    document_id: documentId,
    goal_id: goal.id,
    plan_id: planId,
    plan_generation_request: { goal_id: goal.id, document_ids: [documentId] },
    plan_status_after_poll: planState.json.status,
    session_ids: sessionIds,
    selected_session_id: sessionId,
  };

  step("open_ready_session_and_load_quiz", { plan_id: planId, session_id: sessionId });
  await page.locator(`a[href="/session/${sessionId}"]`).click();
  await page.waitForURL(`**/session/${sessionId}`);
  await page.getByRole("button", { name: "Saltar al receso →", exact: true }).waitFor();
  await page.getByRole("button", { name: "Saltar al receso →", exact: true }).click();
  const quizResponsePromise = page.waitForResponse((response) => {
    const { path: pathname, method } = endpoint(response.request());
    return /^\/quizzes\/\d+$/.test(pathname) && method === "GET";
  });
  await page.getByRole("button", { name: "Ir al test →", exact: true }).click();
  const quizResponse = await quizResponsePromise;
  const quiz = await quizResponse.json();
  if (quizResponse.status() !== 200 || quiz.session_id !== sessionId) {
    throw new Error(`GET quiz for session ${sessionId} did not return the matching session (HTTP ${quizResponse.status()}).`);
  }
  const quizId = quiz.id;
  for (const question of quiz.questions) {
    questionById.set(question.id, {
      type: question.question_type,
      options: question.options,
      answer: question.answer,
    });
  }
  report.id_correlations.quiz = {
    session_id_used_in_get_path: sessionId,
    quiz_id_returned_by_get: quizId,
    quiz_response_session_id: quiz.session_id,
    quiz_id_and_session_id_numerically_equal: quizId === sessionId,
    submit_path_uses_quiz_id: `/quizzes/${quizId}/submit`,
  };
  if (quiz.questions.length === 0) throw new Error(`Quiz ${quizId} contains no questions.`);

  step("answer_every_flashcard_and_multiple_choice_question", {
    session_id: sessionId,
    quiz_id: quizId,
    question_count: quiz.questions.length,
  });
  const answerAudit = [];
  let submitResponse;
  for (let index = 0; index < quiz.questions.length; index += 1) {
    const question = quiz.questions[index];
    const isLast = index === quiz.questions.length - 1;
      if (question.question_type === "FLASHCARD") {
      if (await page.getByText("¿Qué tan bien la recordaste? (SM-2)", { exact: true }).count() === 0) {
        await page.locator(".cursor-pointer").click();
      }
      await page.getByRole("button", { name: "5", exact: true }).click();
      answerAudit.push({ question_id: question.id, type: "FLASHCARD", quality: 5 });
    } else if (question.question_type === "MULTIPLE_CHOICE") {
      const optionIndex = question.options.indexOf(question.answer);
      if (optionIndex < 0) throw new Error(`MC question ${question.id} answer is not among its options.`);
      await page.getByRole("button", { name: question.answer, exact: true }).click();
      answerAudit.push({
        question_id: question.id,
        type: "MULTIPLE_CHOICE",
        selected_option_index: optionIndex,
        correct: true,
      });
    } else {
      throw new Error(`Unsupported question type in quiz: ${question.question_type}.`);
    }
    const submitResponsePromise = isLast
      ? page.waitForResponse((response) => {
          const { path: pathname, method } = endpoint(response.request());
          return pathname === `/quizzes/${quizId}/submit` && method === "POST";
        })
      : null;
    await page.getByRole("button", { name: isLast ? "Finalizar" : "Siguiente →", exact: true }).click();
    if (submitResponsePromise) submitResponse = await submitResponsePromise;
  }
  await page.getByRole("heading", { name: "¡Sesión completada!", exact: true }).waitFor();

  await Promise.all(pendingEventWrites);
  const submitEvent = [...report.network_events].reverse().find((event) =>
    event.kind === "response" && event.path === `/quizzes/${quizId}/submit`
  );
  if (!submitEvent || submitEvent.status_code !== 200 || !submitEvent.body) {
    throw new Error(`No successful sanitized quiz submission response was recorded for quiz ${quizId}.`);
  }
  const questionCounts = answerAudit.reduce((counts, answer) => {
    counts[answer.type] = (counts[answer.type] ?? 0) + 1;
    return counts;
  }, {});
  const mcAnswers = answerAudit.filter((answer) => answer.type === "MULTIPLE_CHOICE");
  const expectedCorrect = mcAnswers.filter((answer) => answer.correct).length;
  const expectedScore = mcAnswers.length ? Math.round((expectedCorrect / mcAnswers.length) * 1000) / 10 : 0;
  if (
    submitResponse?.status() !== 200 ||
    submitEvent.body.total !== mcAnswers.length ||
    submitEvent.body.correct !== expectedCorrect ||
    submitEvent.body.score !== expectedScore
  ) {
    throw new Error("Quiz result does not match the audit of all submitted MC and flashcard answers.");
  }
  report.quiz_calculation = {
    answers_submitted: answerAudit.map(({ correct, ...answer }) => answer),
    question_count: answerAudit.length,
    flashcards_total: questionCounts.FLASHCARD ?? 0,
    flashcards_all_submitted: answerAudit.filter((answer) => answer.type === "FLASHCARD").length === (questionCounts.FLASHCARD ?? 0),
    multiple_choice_total: submitEvent.body.total,
    multiple_choice_correct: submitEvent.body.correct,
    independently_computed_score_percent: expectedScore,
    server_score_percent: submitEvent.body.score,
    calculation: "correct multiple-choice / multiple-choice total * 100, rounded to one decimal; flashcard self-ratings are not in this score",
  };
  await saveScreenshot(page, "session-completed-desktop.png", "desktop");

  step("open_dashboard_after_submit");
  const dashboardResponsePromise = page.waitForResponse((response) => {
    const { path: pathname, method } = endpoint(response.request());
    return pathname === "/dashboard" && method === "GET";
  });
  await page.getByRole("link", { name: "Ver Dashboard", exact: true }).click();
  const dashboardResponse = await dashboardResponsePromise;
  if (dashboardResponse.status() !== 200) throw new Error(`Dashboard returned ${dashboardResponse.status()}.`);
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await saveScreenshot(page, "dashboard-desktop.png", "desktop");
  await page.setViewportSize(viewport.mobile);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await saveScreenshot(page, "dashboard-mobile.png", "mobile");

  step("verify_completed_status_and_plan_badge_link");
  await page.setViewportSize(viewport.desktop);
  await page.goto(`${appBase}/plan/${planId}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Completada", { exact: true }).waitFor();
  const completedSessionLink = page.locator(`a[href="/session/${sessionId}"]`);
  await completedSessionLink.waitFor();
  const linkHref = await completedSessionLink.getAttribute("href");
  const sessionState = await pageFetch(page, `/sessions/${sessionId}`);
  if (
    sessionState.status_code !== 200 ||
    sessionState.json.status !== "COMPLETED" ||
    sessionState.json.plan_id !== planId ||
    linkHref !== `/session/${sessionId}`
  ) {
    throw new Error(`Post-submit session, plan badge and session link did not correlate for ${sessionId}.`);
  }
  report.post_completion = {
    plan_id: planId,
    plan_status_after_submit: "READY",
    session_id: sessionId,
    get_session_status: sessionState.json.status,
    get_session_plan_id: sessionState.json.plan_id,
    plan_detail_badge_visible: true,
    session_link_href: linkHref,
    reopened_phase: null,
  };
  await saveScreenshot(page, "plan-completed-desktop.png", "desktop");

  step("click_completed_session_link_and_capture_reopened_session");
  await completedSessionLink.click();
  await page.waitForURL(`**/session/${sessionId}`);
  await page.getByText("Estudio", { exact: true }).waitFor();
  report.post_completion.reopened_phase = "Estudio";
  report.post_completion.timer_or_quiz_restoration_claimed = false;
  await saveScreenshot(page, "completed-session-reopened-desktop.png", "desktop");
  await page.setViewportSize(viewport.mobile);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Estudio", { exact: true }).waitFor();
  await saveScreenshot(page, "completed-session-reopened-mobile.png", "mobile");

    report.outcome = { status: "COMPLETED", last_step_started: activeStep, error: null };
  } catch (error) {
    report.outcome = {
      status: "FAILED",
      last_step_started: report.steps.at(-1)?.name ?? null,
      error: safeMessage(error?.stack ?? error?.message ?? error),
  };
} finally {
  if (browser) await browser.close().catch(() => {});
  await Promise.all(pendingEventWrites);
  report.finished_at_utc = new Date().toISOString();
  report.network_events.sort((left, right) => left.sequence - right.sequence);
  report.audit_summary = {
    backend_request_count: report.network_events.filter((event) => event.kind === "request").length,
    backend_response_count: report.network_events.filter((event) => event.kind === "response").length,
    console_event_count: report.console_events.length,
    page_error_count: report.page_errors.length,
    failed_request_count: report.failed_requests.length,
    failed_http_response_count: report.failed_http_responses.length,
    all_backend_requests_have_responses: report.network_events
      .filter((event) => event.kind === "request")
      .every((request) => report.network_events.some((event) => event.kind === "response" && event.request_sequence === request.request_sequence)),
  };
  await writeFile(path.join(outputDir, "flow-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ run_id: runId, status: report.outcome.status, report: path.relative(process.cwd(), path.join(outputDir, "flow-report.json")), audit_summary: report.audit_summary })}\n`);
  if (report.outcome.status !== "COMPLETED") process.exitCode = 1;
}
