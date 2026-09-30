import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runBrunoCollection } from "./run-qa.mjs";

const frontendDirectory = fileURLToPath(new URL("..", import.meta.url));
const collectionDirectory = `${frontendDirectory}/bruno`;
const smokeDirectory = `${collectionDirectory}/smoke`;
const fixturePath = `${frontendDirectory}/qa/fixtures/studyai-a04-smoke.md`;
const qaApiFixturePath = `${frontendDirectory}/e2e/api/a04-shared-fixture.spec.ts`;
const CONTROLLED_BRUNO_TEST_TIMEOUT_MS = 30_000;

async function readRequestFiles() {
  assert.ok(existsSync(smokeDirectory), "the ordered A04 Bruno smoke collection is not implemented yet");
  const names = (await readdir(smokeDirectory))
    .filter((name) => name.endsWith(".bru"))
    .sort();
  return Promise.all(names.map(async (name) => ({
    name,
    source: await readFile(`${smokeDirectory}/${name}`, "utf8"),
  })));
}

/** @param {string} source */
function requestSequence(source) {
  const match = source.match(/\bseq:\s*(\d+)/);
  assert.ok(match, "every Bruno request must have an explicit sequence number");
  return Number(match[1]);
}

/** @param {string} source */
function requestMethod(source) {
  const match = source.match(/^\s*(get|post|delete)\s*\{/im);
  assert.ok(match, "every smoke file must contain one ordered HTTP request");
  return match[1].toUpperCase();
}

/** @typedef {{documentStates?: string[], planStates?: string[], slowPath?: string, slowDelayMs?: number}} ControlledScenario */

/** @param {import("node:http").IncomingMessage} request */
function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.once("error", reject);
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

/** @param {import("node:http").ServerResponse} response @param {number} status @param {unknown} body */
function sendJson(response, status, body) {
  if (response.destroyed) return;
  if (status === 204) {
    response.writeHead(status);
    response.end();
    return;
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

/** @param {ControlledScenario} scenario */
async function startControlledApi(scenario = {}) {
  /** @type {{method: string, path: string}[]} */
  const events = [];
  let documentReadCount = 0;
  let planReadCount = 0;
  let planDeleted = false;
  let goalDeleted = false;
  let documentDeleted = false;
  let quizSubmitted = false;

  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
    events.push({ method, path: pathname });
    const rawBody = await readRequestBody(request);
    if (scenario.slowPath === pathname) {
      await new Promise((resolve) => setTimeout(resolve, scenario.slowDelayMs ?? 100));
    }

    if (pathname === "/health" && method === "GET") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    if (pathname === "/llm-settings/runtime" && method === "GET") {
      sendJson(response, 200, {
        source: "MOCK",
        provider: null,
        models: { topic_analysis: "simulado", session_plan: "simulado", session_content: "simulado" },
      });
      return;
    }
    if (pathname === "/documents/upload" && method === "POST") {
      sendJson(response, 201, {
        id: 101,
        filename: "studyai-a04-smoke.md",
        file_type: "md",
        file_size: 512,
        status: "PENDING",
      });
      return;
    }
    if (pathname === "/documents/101" && method === "GET") {
      if (documentDeleted) {
        sendJson(response, 404, { detail: "document not found" });
        return;
      }
      const statuses = scenario.documentStates ?? ["INDEXED"];
      const status = statuses[Math.min(documentReadCount, statuses.length - 1)] ?? "INDEXED";
      documentReadCount += 1;
      sendJson(response, 200, {
        id: 101,
        filename: "studyai-a04-smoke.md",
        file_type: "md",
        status,
        error_message: status === "FAILED" ? "controlled indexing failure" : "",
      });
      return;
    }
    if (pathname === "/documents/101" && method === "DELETE") {
      documentDeleted = true;
      sendJson(response, 204, null);
      return;
    }
    if (pathname === "/goals" && method === "POST") {
      let title = "A04 controlled goal";
      try {
        title = JSON.parse(rawBody).title ?? title;
      } catch {
        // The route remains deterministic if the client sends an unexpected body.
      }
      sendJson(response, 201, {
        id: 201,
        goal_type: "LEARNING",
        title,
        description: "Meta sintética creada por el smoke HTTP de A04.",
      });
      return;
    }
    if (pathname === "/plans/generate" && method === "POST") {
      sendJson(response, 202, { id: 301, status: "PROCESSING", error_message: "" });
      return;
    }
    if (pathname === "/plans/301/status" && method === "GET") {
      const statuses = scenario.planStates ?? ["READY"];
      const status = statuses[Math.min(planReadCount, statuses.length - 1)] ?? "READY";
      planReadCount += 1;
      sendJson(response, 200, {
        id: 301,
        status,
        error_message: status === "FAILED" ? "controlled generation failure" : "",
      });
      return;
    }
    if (pathname === "/plans/301" && method === "GET") {
      if (planDeleted) {
        sendJson(response, 404, { detail: "plan not found" });
        return;
      }
      sendJson(response, 200, {
        id: 301,
        goal_id: 201,
        document_ids: [101],
        status: "READY",
        sessions: [{ id: 501 }, { id: 502 }],
      });
      return;
    }
    if (pathname === "/plans/301" && method === "DELETE") {
      planDeleted = true;
      sendJson(response, 204, null);
      return;
    }
    if (pathname === "/goals/201" && method === "DELETE") {
      goalDeleted = true;
      sendJson(response, 204, null);
      return;
    }
    if (pathname === "/goals/201" && method === "GET") {
      sendJson(response, goalDeleted ? 404 : 200, goalDeleted ? { detail: "goal not found" } : { id: 201 });
      return;
    }
    const sessionMatch = pathname.match(/^\/sessions\/(501|502)$/);
    if (sessionMatch && method === "GET") {
      const id = Number(sessionMatch[1]);
      if (planDeleted) {
        sendJson(response, 404, { detail: "session not found" });
        return;
      }
      sendJson(response, 200, {
        id,
        plan_id: 301,
        topic_name: id === 501 ? "Conectividad de hábitats" : "Recursos florales",
        status: id === 501 && quizSubmitted ? "COMPLETED" : "PENDING",
        completed_at: id === 501 && quizSubmitted ? "2026-09-29T12:00:00Z" : null,
        material: { content_markdown: "## Material de estudio\n\nContenido sintético.", youtube_keywords: ["polinizadores"], },
      });
      return;
    }
    if (pathname === "/quizzes/501" && method === "GET") {
      if (planDeleted) {
        sendJson(response, 404, { detail: "quiz not found" });
        return;
      }
      sendJson(response, 200, {
        id: 701,
        session_id: 501,
        questions: [
          { id: 801, question_type: "FLASHCARD", options: [], answer: "" },
          { id: 802, question_type: "FLASHCARD", options: [], answer: "" },
          { id: 803, question_type: "MULTIPLE_CHOICE", options: ["A", "B"], answer: "A" },
        ],
      });
      return;
    }
    if (pathname === "/quizzes/701/submit" && method === "POST") {
      quizSubmitted = true;
      sendJson(response, 200, {
        correct: 3,
        total: 3,
        score: 100,
        detail: { "801": {}, "802": {}, "803": {} },
      });
      return;
    }
    if (pathname === "/dashboard" && method === "GET") {
      sendJson(response, 200, planDeleted
        ? { sessions_completed: 0, scores: [], upcoming_reviews: [], average_score: 0 }
        : {
          sessions_completed: quizSubmitted ? 1 : 0,
          scores: quizSubmitted ? [{ session_id: 501, score: 100 }] : [],
          upcoming_reviews: quizSubmitted ? [{ count: 2 }] : [],
          average_score: quizSubmitted ? 100 : 0,
        });
      return;
    }
    sendJson(response, 404, { detail: `unhandled controlled route: ${method} ${pathname}` });
  });

  server.listen({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    events,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      /** @type {Promise<void>} */
      const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

/** @param {ControlledScenario} scenario @param {Record<string, number>} [overrides] */
async function runRealSmokeAgainstControlledApi(scenario, overrides = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-a04-controlled-api-"));
  const api = await startControlledApi(scenario);
  const reportPath = join(temporaryRoot, "bruno-report.json");
  const packagePath = join(frontendDirectory, "node_modules", "@usebruno", "cli", "package.json");
  const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(packageMetadata.version, "4.2.0");
  const environment = /** @type {NodeJS.ProcessEnv} */ ({
    ...process.env,
    STUDYAI_BRUNO_DELAY_MS: "0",
    STUDYAI_BRUNO_POLL_INTERVAL_MS: "1",
    STUDYAI_BRUNO_DOCUMENT_POLL_MAX_ATTEMPTS: "4",
    STUDYAI_BRUNO_DOCUMENT_POLL_TIMEOUT_MS: "1000",
    STUDYAI_BRUNO_PLAN_POLL_MAX_ATTEMPTS: "4",
    STUDYAI_BRUNO_PLAN_POLL_TIMEOUT_MS: "1000",
    STUDYAI_BRUNO_REQUEST_TIMEOUT_MS: "250",
  });
  const overrideEnvironmentNames = /** @type {Record<string, string>} */ ({
    pollIntervalMs: "STUDYAI_BRUNO_POLL_INTERVAL_MS",
    documentPollMaxAttempts: "STUDYAI_BRUNO_DOCUMENT_POLL_MAX_ATTEMPTS",
    documentPollTimeoutMs: "STUDYAI_BRUNO_DOCUMENT_POLL_TIMEOUT_MS",
    planPollMaxAttempts: "STUDYAI_BRUNO_PLAN_POLL_MAX_ATTEMPTS",
    planPollTimeoutMs: "STUDYAI_BRUNO_PLAN_POLL_TIMEOUT_MS",
    requestTimeoutMs: "STUDYAI_BRUNO_REQUEST_TIMEOUT_MS",
  });
  for (const [name, value] of Object.entries(overrides)) {
    const environmentName = overrideEnvironmentNames[name];
    assert.ok(environmentName, `no QA environment mapping for ${name}`);
    environment[environmentName] = String(value);
  }

  const makeCounts = () => ({ total: 0, passed: 0, failed: 0, skipped: 0 });
  const makeBrunoCounts = () => ({
    requests: { expected: 0, total: 0, executed: 0, passed: 0, failed: 0, skipped: 0, omitted: 0, unexpected: 0 },
    assertions: { total: 0, passed: 0, failed: 0 },
    tests: { total: 0, passed: 0, failed: 0 },
    checks: makeCounts(),
  });
  const runReport = /** @type {Parameters<typeof runBrunoCollection>[0]} */ (/** @type {unknown} */ ({
    apiCoverage: "not-run",
    processes: [],
    testResults: {
      suites: {
        api: { status: "not-run", counts: makeCounts() },
        e2e: { status: "not-run", counts: makeCounts() },
        bruno: { status: "not-run", exitCode: null, signal: null, counts: makeBrunoCounts() },
      },
      total: makeCounts(),
      requests: { expected: 0, total: 0, executed: 0, passed: 0, failed: 0, skipped: 0, omitted: 0, unexpected: 0 },
    },
  }));

  let gateError = null;
  try {
    try {
      await runBrunoCollection(runReport, environment, frontendDirectory, collectionDirectory, temporaryRoot, api.baseUrl);
    } catch (error) {
      gateError = error instanceof Error ? error.message : String(error);
    }
    const cliReport = JSON.parse(await readFile(reportPath, "utf8"));
    const suite = runReport.testResults.suites.bruno;
    return {
      cli: { code: suite.exitCode, signal: suite.signal, timedOut: false, stdout: "", stderr: gateError ?? "" },
      report: cliReport,
      counts: suite.counts,
      gateError,
      events: [...api.events],
    };
  } finally {
    await api.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("A04 collection, QA environment, and shared Markdown fixture are versioned", async () => {
  assert.ok(existsSync(`${collectionDirectory}/bruno.json`), "the A04 Bruno collection manifest is not implemented yet");
  assert.ok(existsSync(`${collectionDirectory}/environments/qa.bru`), "the QA environment is not implemented yet");
  assert.ok(existsSync(fixturePath), "the shared synthetic Markdown fixture is not implemented yet");
  const manifest = JSON.parse(await readFile(`${collectionDirectory}/bruno.json`, "utf8"));
  const environment = await readFile(`${collectionDirectory}/environments/qa.bru`, "utf8");
  const fixture = await readFile(fixturePath, "utf8");

  assert.equal(manifest.version, "1");
  assert.equal(manifest.name, "StudyAI A04 HTTP smoke");
  assert.match(environment, /baseUrl:\s*http:\/\/127\.0\.0\.1:8002/);
  assert.match(environment, /pollIntervalMs:\s*\d+/);
  assert.match(environment, /documentPollMaxAttempts:\s*\d+/);
  assert.match(environment, /documentPollTimeoutMs:\s*\d+/);
  assert.match(environment, /planPollMaxAttempts:\s*\d+/);
  assert.match(environment, /planPollTimeoutMs:\s*\d+/);
  assert.match(environment, /requestTimeoutMs:\s*\d+/);
  assert.doesNotMatch(environment, /api[_-]?key|token|password|secret/i);
  assert.match(fixture, /^# A04 — Documento sintético de QA/m);
  assert.ok(fixture.trim().length > 300, "the shared fixture should contain useful synthetic study content");
});

test("the canonical A04 fixture has a Playwright API-suite consumer without mutating the QA database", async () => {
  assert.ok(existsSync(qaApiFixturePath), "Playwright must consume the canonical A04 fixture");
  const source = await readFile(qaApiFixturePath, "utf8");
  assert.match(source, /fileURLToPath\(new URL\(["']\.\.\/\.\.\/qa\/fixtures\/studyai-a04-smoke\.md["'],\s*import\.meta\.url\)\)/);
  assert.match(source, /readFile\(fixturePath,\s*["']utf8["']\)/);
  assert.match(source, /Redes urbanas de polinizadores/);
  assert.doesNotMatch(source, /request\.(?:post|put|delete)\(/i, "fixture verification must not add rows to the A03 empty-database smoke");
});

test("Bruno smoke requests are ordered, assertion-backed, and do not hardcode resource IDs", async () => {
  const requests = await readRequestFiles();
  assert.equal(requests.length, 21, "the HTTP workflow includes creation, polling, progress, and verified cleanup");
  assert.deepEqual(requests.map(({ source }) => requestSequence(source)), Array.from({ length: 21 }, (_, index) => index + 1));

  for (const { name, source } of requests) {
    assert.match(source, /meta\s*\{[\s\S]*?type:\s*http[\s\S]*?seq:\s*\d+[\s\S]*?\}/, `${name} must declare HTTP metadata and order`);
    assert.match(source, /assert\s*\{[\s\S]*?res\.status:\s*eq\s+\d+[\s\S]*?\}/, `${name} must assert its HTTP status`);
    assert.match(source, /tests\s*\{[\s\S]*?expect\(/, `${name} must assert response content or the expected empty 204 body`);
    assert.doesNotMatch(source, /\/(?:documents|goals|plans|sessions|quizzes)\/\d+(?:\/|\b)/, `${name} must use runtime resource IDs`);
  }

  assert.equal(requestMethod(requests[0].source), "GET");
  assert.equal(requestMethod(requests[2].source), "POST");
  assert.match(requests[2].source, /body:\s*multipartForm/);
  assert.match(requests[2].source, /@file\(\.\.\/qa\/fixtures\/studyai-a04-smoke\.md\)/);
  assert.match(requests[4].source, /goal_type:\s*["']LEARNING["']/);
  assert.match(requests[5].source, /goalId/);
  assert.match(requests[5].source, /documentId/);
});

test("index and plan polling are bounded GET-only flows that fail on FAILED and timeout", async () => {
  const requests = await readRequestFiles();
  const documentPoll = requests.find(({ name }) => name === "04-document-indexed.bru")?.source;
  const planPoll = requests.find(({ name }) => name === "07-plan-ready.bru")?.source;

  assert.ok(documentPoll, "document polling request must exist");
  assert.ok(planPoll, "plan polling request must exist");
  for (const source of [documentPoll, planPoll]) {
    assert.match(source, /bru\.sendRequest\(\s*\{\s*method:\s*["']GET["']/);
    assert.match(source, /await bru\.sleep\(/);
    assert.match(source, /MaxAttempts/);
    assert.match(source, /PollTimeoutMs/);
    assert.match(source, /FAILED/);
    assert.match(source, /bru\.runner\.stopExecution\(\)/);
    assert.match(source, /timeout/i);
    assert.doesNotMatch(source, /method:\s*["']POST["']/);
  }
  assert.match(documentPoll, /documentPollMaxAttempts/);
  assert.match(planPoll, /planPollMaxAttempts/);
});

test("plan details inspect every session, while quiz submission uses the returned quiz ID once", async () => {
  const requests = await readRequestFiles();
  const planDetails = requests.find(({ name }) => name === "08-plan-details-and-all-sessions.bru")?.source;
  const quizRequest = requests.find(({ name }) => name === "10-quiz-for-session.bru")?.source;
  const submitRequests = requests.filter(({ source }) => /url:.*\/quizzes\/\{\{quizId\}\}\/submit/.test(source));
  const submitRequest = requests.find(({ name }) => name === "11-quiz-submit.bru")?.source;

  assert.ok(planDetails);
  assert.ok(quizRequest);
  assert.ok(submitRequest);
  assert.match(planDetails, /for\s*\([^)]*session[^)]*\)\s*\{/i);
  assert.match(planDetails, /\/sessions\/\$\{[^}]*\.id\}/);
  assert.match(planDetails, /plan_id/);
  assert.match(quizRequest, /\/quizzes\/\{\{sessionId\}\}/);
  assert.match(quizRequest, /bru\.setVar\(["']quizId["'],\s*quiz\.id\)/);
  assert.match(quizRequest, /question_type/);
  assert.match(quizRequest, /\?\s*0\s*:\s*5/, "at least one flashcard exercises quality 0 within the 0..5 contract");
  assert.match(quizRequest, /selected_option/);
  assert.equal(submitRequests.length, 1, "the collection submits the quiz exactly once");
  assert.match(submitRequest, /quizId/);
  assert.doesNotMatch(submitRequest, /sessionId/);
});

test("created plan, goal, document, and cascaded quiz/session resources are deleted and checked", async () => {
  const requests = await readRequestFiles();
  const sourceByName = new Map(requests.map(({ name, source }) => [name, source]));

  for (const [name, runtimeId, resourcePath] of [
    ["14-plan-delete.bru", "planId", "/plans/"],
    ["17-goal-delete.bru", "goalId", "/goals/"],
    ["19-document-delete.bru", "documentId", "/documents/"],
  ]) {
    const source = sourceByName.get(name);
    assert.ok(source, `${name} must exist`);
    assert.equal(requestMethod(source), "DELETE");
    assert.match(source, new RegExp(`${resourcePath.replace(/\//g, "\\/")}\\{\\{${runtimeId}\\}\\}`));
    assert.match(source, /res\.status:\s*eq\s+204/);
  }

  for (const name of ["15-plan-absent.bru", "16-session-and-quiz-absent.bru", "18-goal-absent.bru", "20-document-absent.bru"]) {
    const source = sourceByName.get(name);
    assert.ok(source, `${name} must verify deletion`);
    assert.match(source, /res\.status:\s*eq\s+404/);
    assert.match(source, /detail/);
  }

  const dashboardCleanup = sourceByName.get("21-dashboard-cleanup.bru");
  assert.ok(dashboardCleanup, "the final dashboard cleanup check must exist");
  assert.match(dashboardCleanup, /sessions_completed/);
  assert.match(dashboardCleanup, /upcoming_reviews/);

  const deletedSessionAndQuiz = sourceByName.get("16-session-and-quiz-absent.bru");
  assert.ok(deletedSessionAndQuiz);
  assert.match(deletedSessionAndQuiz, /const\s+sessionIds\s*=\s*bru\.getVar\(["']sessionIds["']\)/);
  assert.match(deletedSessionAndQuiz, /for\s*\([^)]*sessionIds\.slice\(1\)[^)]*\)/);
  assert.match(deletedSessionAndQuiz, /\/sessions\/\$\{sessionId\}/);
  assert.match(deletedSessionAndQuiz, /\/quizzes\/\$\{bru\.getVar\(["']sessionId["']\)\}/);

  for (const name of ["04-document-indexed.bru", "07-plan-ready.bru"]) {
    const pollingRequest = sourceByName.get(name);
    assert.ok(pollingRequest);
    assert.match(pollingRequest, /script:pre-request\s*\{[\s\S]*?req\.setTimeout\(timeoutMs\)/,
      `${name} must bound the initial HTTP GET as well as the polling sends`);
  }
});

/** @param {Awaited<ReturnType<typeof runRealSmokeAgainstControlledApi>>} result @param {string} label */
function assertFailedBrunoRun(result, label) {
  assert.equal(result.cli.timedOut, false, `${label} must stop within the test deadline`);
  assert.notEqual(result.cli.code, 0, `${label} must fail the pinned Bruno CLI run`);
  assert.ok(result.report, `${label} must retain Bruno's JSON report`);
  assert.ok(result.gateError, `${label} must remain rejected by the A03 post-CLI gate`);
  assert.ok(
    result.counts.requests.failed > 0
      || result.counts.assertions.failed > 0
      || result.counts.tests.failed > 0
      || result.counts.requests.omitted > 0,
    `${label} must leave executable failure or omission evidence in the Bruno report`,
  );
  // Scenario assertions below enforce poll/deadline bounds with GET counts; elapsed time varies by host load.
}

/** @param {Awaited<ReturnType<typeof runRealSmokeAgainstControlledApi>>} result @param {string} method @param {string} path */
function countEvents(result, method, path) {
  return result.events.filter((event) => event.method === method && event.path === path).length;
}

test("Bruno CLI executes the actual A04 collection against controlled HTTP responses and polls to completion", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const result = await runRealSmokeAgainstControlledApi({
    documentStates: ["PENDING", "PENDING", "PENDING", "INDEXED"],
    planStates: ["PROCESSING", "PROCESSING", "PROCESSING", "READY"],
  });

  assert.equal(result.cli.code, 0, `${result.cli.stdout}\n${result.cli.stderr}`);
  assert.equal(result.cli.timedOut, false);
  assert.equal(result.gateError, null);
  assert.deepEqual(result.counts.requests, {
    expected: 21,
    total: 21,
    executed: 21,
    passed: 21,
    failed: 0,
    skipped: 0,
    omitted: 0,
    unexpected: 0,
  });

  assert.equal(countEvents(result, "POST", "/documents/upload"), 1);
  assert.equal(countEvents(result, "POST", "/goals"), 1);
  assert.equal(countEvents(result, "POST", "/plans/generate"), 1);
  assert.equal(countEvents(result, "POST", "/quizzes/701/submit"), 1);
  assert.equal(countEvents(result, "GET", "/documents/101"), 5, "four indexing reads plus the post-delete absence check");
  assert.equal(countEvents(result, "GET", "/plans/301/status"), 4, "initial PROCESSING plus three controlled poll responses");
  assert.equal(countEvents(result, "GET", "/sessions/502"), 2, "plan inspection and post-delete cascade verification");
  assert.equal(countEvents(result, "GET", "/quizzes/501"), 2, "quiz read and post-delete absence verification");
});

test("Bruno CLI fails immediately on document FAILED and stops before goal or plan writes", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const result = await runRealSmokeAgainstControlledApi({ documentStates: ["FAILED"] });
  assertFailedBrunoRun(result, "document FAILED");

  assert.equal(countEvents(result, "GET", "/documents/101"), 1);
  assert.equal(countEvents(result, "POST", "/documents/upload"), 1);
  assert.equal(countEvents(result, "POST", "/goals"), 0);
  assert.equal(countEvents(result, "POST", "/plans/generate"), 0);
  assert.match(JSON.stringify(result.report), /FAILED/);
});

test("Bruno CLI fails immediately on plan FAILED without repeating generation or submitting a quiz", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const result = await runRealSmokeAgainstControlledApi({ documentStates: ["INDEXED"], planStates: ["FAILED"] });
  assertFailedBrunoRun(result, "plan FAILED");

  assert.equal(countEvents(result, "POST", "/plans/generate"), 1);
  assert.equal(countEvents(result, "GET", "/plans/301/status"), 1);
  assert.equal(countEvents(result, "POST", "/quizzes/701/submit"), 0);
  assert.match(JSON.stringify(result.report), /FAILED/);
});

test("Bruno CLI fails a document poll at its configured iteration limit", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const result = await runRealSmokeAgainstControlledApi(
    { documentStates: ["PENDING"] },
    { documentPollMaxAttempts: 2, documentPollTimeoutMs: 1_000 },
  );
  assertFailedBrunoRun(result, "document iteration timeout");

  assert.equal(countEvents(result, "GET", "/documents/101"), 3, "one initial GET and exactly two additional polling GETs");
  assert.equal(countEvents(result, "POST", "/plans/generate"), 0);
  assert.match(JSON.stringify(result.report), /timeout/i);
});

test("Bruno CLI fails a plan poll at its configured iteration limit", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const result = await runRealSmokeAgainstControlledApi(
    { documentStates: ["INDEXED"], planStates: ["PROCESSING"] },
    { planPollMaxAttempts: 2, planPollTimeoutMs: 1_000 },
  );
  assertFailedBrunoRun(result, "plan iteration timeout");

  assert.equal(countEvents(result, "POST", "/plans/generate"), 1);
  assert.equal(countEvents(result, "GET", "/plans/301/status"), 3, "one initial GET and exactly two additional polling GETs");
  assert.equal(countEvents(result, "POST", "/quizzes/701/submit"), 0);
  assert.match(JSON.stringify(result.report), /timeout/i);
});

test("Bruno CLI enforces short document and plan polling deadlines without issuing another GET", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const documentResult = await runRealSmokeAgainstControlledApi(
    { documentStates: ["PENDING"] },
    { pollIntervalMs: 50, documentPollMaxAttempts: 20, documentPollTimeoutMs: 5 },
  );
  assertFailedBrunoRun(documentResult, "document deadline timeout");
  assert.equal(countEvents(documentResult, "GET", "/documents/101"), 1);

  const planResult = await runRealSmokeAgainstControlledApi(
    { documentStates: ["INDEXED"], planStates: ["PROCESSING"] },
    { pollIntervalMs: 50, planPollMaxAttempts: 20, planPollTimeoutMs: 5 },
  );
  assertFailedBrunoRun(planResult, "plan deadline timeout");
  assert.equal(countEvents(planResult, "GET", "/plans/301/status"), 1);
  assert.equal(countEvents(planResult, "POST", "/plans/generate"), 1);
});

test("the initial document and plan polling GETs honor requestTimeoutMs", { timeout: CONTROLLED_BRUNO_TEST_TIMEOUT_MS }, async () => {
  const documentResult = await runRealSmokeAgainstControlledApi(
    { documentStates: ["INDEXED"], slowPath: "/documents/101", slowDelayMs: 100 },
    { requestTimeoutMs: 10 },
  );
  assertFailedBrunoRun(documentResult, "document initial GET timeout");
  assert.equal(countEvents(documentResult, "GET", "/documents/101"), 1);
  assert.equal(countEvents(documentResult, "POST", "/goals"), 0);

  const planResult = await runRealSmokeAgainstControlledApi(
    { documentStates: ["INDEXED"], planStates: ["READY"], slowPath: "/plans/301/status", slowDelayMs: 100 },
    { requestTimeoutMs: 10 },
  );
  assertFailedBrunoRun(planResult, "plan initial GET timeout");
  assert.equal(countEvents(planResult, "GET", "/plans/301/status"), 1);
  assert.equal(countEvents(planResult, "POST", "/plans/generate"), 1);
  assert.equal(countEvents(planResult, "POST", "/quizzes/701/submit"), 0);
});
