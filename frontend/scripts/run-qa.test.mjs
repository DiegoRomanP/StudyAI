import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { assertPortsAvailable } from "./qa-runtime.mjs";
import * as runQaModule from "./run-qa.mjs";

const runnerPath = fileURLToPath(new URL("./run-qa.mjs", import.meta.url));
const frontendDirectory = fileURLToPath(new URL("..", import.meta.url));
const reportsDirectory = fileURLToPath(new URL("../qa-results", import.meta.url));
const playwrightCliPath = join(frontendDirectory, "node_modules", "@playwright", "test", "cli.js");
const playwrightConfigPath = join(frontendDirectory, "playwright.config.ts");

/** @typedef {{schemaVersion: number, status: string, mode: string, backendUrl: string, command: {script: string, args: string[], exitCode: number | null}, failure?: {message?: string, phase?: string}, metadata: {sourceControl: {commit: string | null, ref: string | null, workingTree: string, verified: boolean}, toolVersions: {node: string, npm: string | null, python: string | null, playwrightTest: string | null, brunoCli: string | null}}, testResults: {suites: {api: {status: string, counts: PlaywrightCounts}, e2e: {status: string, counts: PlaywrightCounts}, bruno: {status: string, exitCode: number | null, signal: string | null, counts: {requests: BrunoRequestCounts, assertions: BrunoCheckCounts, tests: BrunoCheckCounts, checks: PlaywrightCounts}}}, total: PlaywrightCounts, requests: BrunoRequestCounts}, readiness?: {backend?: {status?: number}}, processes: {name: string, treeStopped: boolean | null}[], cleanup: {temporaryDataRemoved: boolean | null, processTreesStopped: boolean | null}}} RunnerReport */
/** @typedef {{total: number, passed: number, failed: number, skipped: number}} PlaywrightCounts */
/** @typedef {{expected: number, total: number, executed: number, passed: number, failed: number, skipped: number, omitted: number, unexpected: number}} BrunoRequestCounts */
/** @typedef {{total: number, passed: number, failed: number}} BrunoCheckCounts */
/** @typedef {{path: string, status?: string, skipped?: boolean, assertionStatus?: string | null}} BrunoFixtureEntry */

const runQaHelpers = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (runQaModule));

/** @param {string[]} args @param {NodeJS.ProcessEnv} [environment] @param {number} [timeoutMs] */
function runRunner(args, environment = {}, timeoutMs = 5_000) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    cwd: frontendDirectory,
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, ...environment },
  });
}

/** @param {string} content @returns {RunnerReport} */
function parseRunnerReport(content) {
  return JSON.parse(content);
}

async function getAvailablePort() {
  const server = createServer();
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, resolve);
  });
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const { port } = address;
  /** @type {Promise<void>} */
  const closed = new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await closed;
  return port;
}

/** @param {Set<string>} previousRuns @param {number} [timeoutMs] @returns {Promise<{path: string, report: RunnerReport}>} */
async function waitForStartedReport(previousRuns, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runIds = await readdir(reportsDirectory).catch(() => []);
    for (const runId of runIds) {
      if (previousRuns.has(runId)) continue;
      const path = `${reportsDirectory}/${runId}/run-report.json`;
      let reportContents;
      try {
        reportContents = await readFile(path, "utf8");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      const report = parseRunnerReport(reportContents);
      if (report.status === "failed") {
        throw new Error(`QA terminó antes de estar listo: ${report.failure?.message ?? "fallo de setup"}`);
      }
      if (report.status !== "running") throw new Error("QA terminó antes de que la prueba pudiera enviar la señal.");

      try {
        const response = await fetch(new URL("/health", report.backendUrl), { signal: AbortSignal.timeout(500) });
        const health = await response.json();
        if (response.ok && health.status === "ok") return { path, report };
      } catch {
        // The runner has created its report but has not started the backend yet.
      }
    }
    await delay(20);
  }
  throw new Error("El backend QA no llegó a readiness para probar la señal.");
}

/** @param {"SIGINT" | "SIGTERM"} signal */
async function verifySignalCleanup(signal) {
  const previousRuns = new Set(await readdir(reportsDirectory).catch(() => []));
  const backendPort = await getAvailablePort();
  const runner = spawn(process.execPath, [runnerPath, "api"], {
    cwd: frontendDirectory,
    detached: true,
    env: { ...process.env, STUDYAI_QA_BACKEND_PORT: String(backendPort) },
    stdio: "ignore",
  });
  /** @type {Promise<{code: number | null, signal: NodeJS.Signals | null}>} */
  const closed = new Promise((resolveClosed) => {
    runner.once("close", (code, receivedSignal) => resolveClosed({ code, signal: receivedSignal }));
  });

  try {
    const { path, report: startedReport } = await waitForStartedReport(previousRuns);
    assert.equal(startedReport.mode, "api");
    assert.equal(runner.kill(signal), true);

    const outcome = await closed;
    assert.equal(outcome.code, signal === "SIGINT" ? 130 : 143);
    assert.equal(outcome.signal, null);
    const report = parseRunnerReport(await readFile(path, "utf8"));
    assert.equal(report.status, "interrupted");
    assert.equal(report.cleanup.temporaryDataRemoved, true);
    assert.equal(report.cleanup.processTreesStopped, true);
    assert.ok(report.processes.every((processRecord) => processRecord.treeStopped));
    await assertPortsAvailable([{ name: "backend", port: backendPort }]);
  } finally {
    if (runner.exitCode === null && runner.signalCode === null) {
      runner.kill("SIGKILL");
      await closed;
    }
  }
}

test("the QA runner documents its commands without starting services", () => {
  const result = runRunner(["--help"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /test:api/);
  assert.match(result.stdout, /test:e2e/);
  assert.match(result.stdout, /test:qa:types/);
});

test("Playwright projects select API and E2E by directory without requiring title tags", () => {
  const api = spawnSync(process.execPath, [
    playwrightCliPath,
    "test",
    "--config",
    playwrightConfigPath,
    "--project=api",
    "--list",
    "--reporter=list",
  ], { cwd: frontendDirectory, encoding: "utf8" });
  const e2e = spawnSync(process.execPath, [
    playwrightCliPath,
    "test",
    "--config",
    playwrightConfigPath,
    "--project=e2e",
    "--list",
    "--reporter=list",
  ], { cwd: frontendDirectory, encoding: "utf8" });

  assert.equal(api.status, 0, api.stderr);
  assert.match(api.stdout, /health\.spec\.ts/);
  assert.doesNotMatch(api.stdout, /app-load\.spec\.ts/);
  assert.equal(e2e.status, 0, e2e.stderr);
  assert.match(e2e.stdout, /app-load\.spec\.ts/);
  assert.doesNotMatch(e2e.stdout, /health\.spec\.ts/);
  assert.match(api.stdout, /GET \/health reports a ready backend/);
  assert.match(e2e.stdout, /production app loads Documents/);
});

test("Playwright report counts are explicit and empty, failed, or skipped suites cannot pass", () => {
  const summarize = runQaHelpers.summarizePlaywrightReport;
  const assertRunnable = runQaHelpers.assertRunnablePlaywrightCounts;
  assert.equal(typeof summarize, "function");
  assert.equal(typeof assertRunnable, "function");
  const counts = /** @type {PlaywrightCounts} */ (
    /** @type {(report: unknown) => unknown} */ (summarize)({
      stats: { expected: 3, flaky: 1, unexpected: 2, skipped: 4 },
    })
  );
  assert.deepEqual(counts, { total: 10, passed: 4, failed: 2, skipped: 4 });
  assert.throws(() => /** @type {(summary: PlaywrightCounts) => boolean} */ (assertRunnable)(counts), /fallida u omitida/);
  const successfulCounts = { total: 4, passed: 4, failed: 0, skipped: 0 };
  assert.equal(/** @type {(summary: PlaywrightCounts) => boolean} */ (assertRunnable)(successfulCounts), true);

  const empty = { total: 0, passed: 0, failed: 0, skipped: 0 };
  assert.throws(() => /** @type {(summary: PlaywrightCounts) => boolean} */ (assertRunnable)(empty), /vacía, fallida u omitida/);
  const skippedOnly = { total: 3, passed: 0, failed: 0, skipped: 3 };
  assert.throws(() => /** @type {(summary: PlaywrightCounts) => boolean} */ (assertRunnable)(skippedOnly), /vacía, fallida u omitida/);
});

test("Bruno 4.2.0 report counts require real assertions and reject failures, skips, and omitted requests", () => {
  const summarize = runQaHelpers.summarizeBrunoReport;
  const assertRunnable = runQaHelpers.assertRunnableBrunoCounts;
  assert.equal(typeof summarize, "function");
  assert.equal(typeof assertRunnable, "function");

  /** @param {BrunoFixtureEntry[]} entries */
  const makeIteration = (entries) => {
    const results = entries.map(({ path, status = "pass", skipped = false, assertionStatus = "pass" }) => ({
      iterationIndex: 0,
      name: path,
      path,
      status,
      skipped,
      skipReason: skipped ? "user" : undefined,
      error: null,
      assertionResults: assertionStatus ? [{ status: assertionStatus }] : [],
      testResults: [],
      preRequestTestResults: [],
      postResponseTestResults: [],
    }));
    const skippedRequests = results.filter((result) => result.skipped).length;
    const failedAssertions = results.reduce(
      (total, result) => total + result.assertionResults.filter((assertion) => assertion.status !== "pass").length,
      0,
    );
    const totalAssertions = results.reduce((total, result) => total + result.assertionResults.length, 0);
    const failedRequests = results.filter((result) => result.status === "fail").length;
    const passedRequests = results.filter((result) => result.status === "pass").length;
    return [{
      iterationIndex: 0,
      results,
      summary: {
        totalRequests: results.length,
        passedRequests,
        failedRequests,
        errorRequests: 0,
        skippedRequests,
        skippedByBail: 0,
        totalAssertions,
        passedAssertions: totalAssertions - failedAssertions,
        failedAssertions,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        totalPreRequestTests: 0,
        passedPreRequestTests: 0,
        failedPreRequestTests: 0,
        totalPostResponseTests: 0,
        passedPostResponseTests: 0,
        failedPostResponseTests: 0,
      },
    }];
  };
  const summarizeBruno = /** @type {(report: unknown, expectedPaths: string[]) => unknown} */ (summarize);
  const assertRunnableBruno = /** @type {(counts: unknown) => boolean} */ (assertRunnable);

  const passing = summarizeBruno(makeIteration([{ path: "smoke/health.bru" }]), ["smoke/health.bru"]);
  assert.equal(assertRunnableBruno(passing), true);
  assert.deepEqual(passing, {
    requests: { expected: 1, total: 1, executed: 1, passed: 1, failed: 0, skipped: 0, omitted: 0, unexpected: 0 },
    assertions: { total: 1, passed: 1, failed: 0 },
    tests: { total: 0, passed: 0, failed: 0 },
    checks: { total: 1, passed: 1, failed: 0, skipped: 0 },
  });

  const noAssertions = summarizeBruno(
    makeIteration([{ path: "smoke/health.bru", assertionStatus: null }]),
    ["smoke/health.bru"],
  );
  assert.throws(() => assertRunnableBruno(noAssertions), /no ejecutó aserciones/);

  const skipped = summarizeBruno(
    makeIteration([
      { path: "smoke/health.bru" },
      { path: "smoke/second.bru", status: "skipped", skipped: true, assertionStatus: null },
    ]),
    ["smoke/health.bru", "smoke/second.bru"],
  );
  assert.throws(() => assertRunnableBruno(skipped), /omitidas|saltadas/);

  const omitted = summarizeBruno(makeIteration([{ path: "smoke/health.bru" }]), [
    "smoke/health.bru",
    "smoke/second.bru",
  ]);
  assert.throws(() => assertRunnableBruno(omitted), /omitidas/);

  const failed = summarizeBruno(
    makeIteration([{ path: "smoke/health.bru", status: "fail", assertionStatus: "fail" }]),
    ["smoke/health.bru"],
  );
  assert.throws(() => assertRunnableBruno(failed), /fallidos/);
  assert.throws(() => summarizeBruno({ invalid: true }, []), /Reporte JSON de Bruno sin formato/);
});

test("Bruno JSON report reading rejects absent or malformed files without a fallback", async () => {
  const readReport = runQaHelpers.readBrunoJsonReport;
  assert.equal(typeof readReport, "function");
  const readBruno = /** @type {(path: string) => Promise<unknown>} */ (readReport);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-bruno-report-"));
  const reportPath = join(temporaryRoot, "report.json");
  try {
    await assert.rejects(readBruno(reportPath), /No se pudo leer el reporte JSON de Bruno/);
    await writeFile(reportPath, "{ invalid JSON", "utf8");
    await assert.rejects(readBruno(reportPath), /no es JSON válido/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("the Bruno runner records real assertions and rejects empty/failing CLI-zero-or-nonzero reports", { timeout: 25_000 }, async () => {
  const runBruno = runQaHelpers.runBrunoCollection;
  assert.equal(typeof runBruno, "function");
  const runCollection = /** @type {(report: any, environment: NodeJS.ProcessEnv, frontendRoot: string, collectionDirectory: string, reportDirectory: string, apiUrl: string) => Promise<void>} */ (runBruno);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-bruno-runner-"));
  const collection = join(temporaryRoot, "bruno");
  const reportDirectory = join(temporaryRoot, "reports");
  const api = createHttpServer((_, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    api.once("error", reject);
    api.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  await listening;
  const address = api.address();
  assert.ok(address && typeof address !== "string");
  const createReport = () => ({
    apiCoverage: "not-run",
    testResults: {
      suites: {
        api: { status: "not-run", counts: { total: 0, passed: 0, failed: 0, skipped: 0 } },
        e2e: { status: "not-run", counts: { total: 0, passed: 0, failed: 0, skipped: 0 } },
        bruno: {
          status: "not-run",
          exitCode: null,
          signal: null,
          counts: {
            requests: { expected: 0, total: 0, executed: 0, passed: 0, failed: 0, skipped: 0, omitted: 0, unexpected: 0 },
            assertions: { total: 0, passed: 0, failed: 0 },
            tests: { total: 0, passed: 0, failed: 0 },
            checks: { total: 0, passed: 0, failed: 0, skipped: 0 },
          },
        },
      },
      total: { total: 0, passed: 0, failed: 0, skipped: 0 },
      requests: { expected: 0, total: 0, executed: 0, passed: 0, failed: 0, skipped: 0, omitted: 0, unexpected: 0 },
    },
    processes: [],
  });

  try {
    await mkdir(join(collection, "environments"), { recursive: true });
    await mkdir(join(collection, "smoke"));
    await mkdir(reportDirectory);
    await writeFile(join(collection, "bruno.json"), JSON.stringify({ version: "1", name: "StudyAI QA", type: "collection" }), "utf8");
    await writeFile(join(collection, "environments", "qa.bru"), `vars {\n  baseUrl: http://127.0.0.1:${address.port}\n}\n`, "utf8");
    await writeFile(
      join(collection, "smoke", "health.bru"),
      "meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/health\n  body: none\n  auth: none\n}\n\nassert {\n  res.status: eq 200\n}\n",
      "utf8",
    );

    const goodReport = createReport();
    await runCollection(goodReport, process.env, frontendDirectory, collection, reportDirectory, `http://127.0.0.1:${address.port}`);
    assert.equal(goodReport.testResults.suites.bruno.status, "passed");
    assert.equal(goodReport.testResults.suites.bruno.exitCode, 0);
    assert.deepEqual(goodReport.testResults.suites.bruno.counts.assertions, { total: 1, passed: 1, failed: 0 });
    assert.deepEqual(goodReport.testResults.suites.bruno.counts.requests, {
      expected: 1, total: 1, executed: 1, passed: 1, failed: 0, skipped: 0, omitted: 0, unexpected: 0,
    });
    assert.deepEqual(goodReport.testResults.total, { total: 1, passed: 1, failed: 0, skipped: 0 });
    assert.deepEqual(goodReport.testResults.requests, goodReport.testResults.suites.bruno.counts.requests);
    assert.doesNotMatch(JSON.stringify(goodReport), /"headers"|"data"|secret-header-value|response-body-secret/);

    await writeFile(
      join(collection, "smoke", "health.bru"),
      "meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/health\n  body: none\n  auth: none\n}\n",
      "utf8",
    );
    const noAssertionReport = createReport();
    await assert.rejects(
      runCollection(noAssertionReport, process.env, frontendDirectory, collection, reportDirectory, `http://127.0.0.1:${address.port}`),
      /no ejecutó aserciones/,
    );
    assert.equal(noAssertionReport.testResults.suites.bruno.status, "failed");
    assert.equal(noAssertionReport.testResults.suites.bruno.exitCode, 0, "Bruno CLI 4.2.0 exits 0 with no assertions");
    assert.deepEqual(noAssertionReport.testResults.suites.bruno.counts.assertions, { total: 0, passed: 0, failed: 0 });
    assert.doesNotMatch(JSON.stringify(noAssertionReport), /Authorization|response-body-secret/);

    await writeFile(
      join(collection, "smoke", "health.bru"),
      "meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/health\n  body: none\n  auth: none\n}\n\nassert {\n  res.status: eq 500\n}\n",
      "utf8",
    );
    const failedReport = createReport();
    await assert.rejects(
      runCollection(failedReport, process.env, frontendDirectory, collection, reportDirectory, `http://127.0.0.1:${address.port}`),
      /terminó con exit 1|aserciones o tests fallidos/,
    );
    assert.equal(failedReport.testResults.suites.bruno.status, "failed");
    assert.equal(failedReport.testResults.suites.bruno.exitCode, 1);
    assert.deepEqual(failedReport.testResults.suites.bruno.counts.assertions, { total: 1, passed: 0, failed: 1 });
    assert.doesNotMatch(JSON.stringify(failedReport), /Authorization|response-body-secret/);

    await rm(join(collection, "environments", "qa.bru"));
    const readinessFailureReport = createReport();
    await assert.rejects(
      runCollection(readinessFailureReport, process.env, frontendDirectory, collection, reportDirectory, `http://127.0.0.1:${address.port}`),
      /readiness/,
    );
    assert.equal(readinessFailureReport.apiCoverage, "invalid-bruno-collection-configuration");
    assert.notEqual(readinessFailureReport.testResults.suites.bruno.status, "passed");
    assert.equal(readinessFailureReport.testResults.suites.bruno.exitCode !== null, true, "the CLI still runs after readiness fails");
    assert.equal(readinessFailureReport.processes.length, 1);
  } finally {
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
    await closed;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("an unknown runner mode exits as an error rather than skipping tests", () => {
  const result = runRunner(["not-a-suite"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Modo QA no válido/);
});

test("an occupied QA backend port fails before any service is started", async () => {
  const occupied = createServer();
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen({ port: 0, host: "127.0.0.1" }, resolve);
  });
  await listening;
  const address = occupied.address();
  assert.ok(address && typeof address !== "string");

  try {
    const result = runRunner(["api"], {
      STUDYAI_QA_BACKEND_PORT: String(address.port),
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(`${result.stdout}\n${result.stderr}`, /puerto QA backend .* ya está en uso/i);
    assert.equal(occupied.listening, true);

    const reportPath = result.stdout.match(/Reporte QA conservado: (.+)/)?.[1];
    assert.ok(reportPath, "the preflight failure must retain its run report");
    const report = parseRunnerReport(await readFile(reportPath, "utf8"));
    assert.equal(report.schemaVersion, 3);
    assert.equal(report.status, "failed");
    assert.equal(report.command.exitCode, 1);
    assert.equal(report.failure?.phase, "preflight-ports");
    assert.deepEqual(report.processes, []);
    assert.deepEqual(report.cleanup, { temporaryDataRemoved: true, processTreesStopped: true });
  } finally {
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
      occupied.close((error) => (error ? reject(error) : resolve()));
    });
    await closed;
  }
});

test("an occupied QA frontend port fails before starting the backend", async () => {
  const occupied = createServer();
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    occupied.once("error", reject);
    occupied.listen({ port: 0, host: "127.0.0.1" }, resolve);
  });
  await listening;
  const address = occupied.address();
  assert.ok(address && typeof address !== "string");

  try {
    const backendPort = await getAvailablePort();
    const result = runRunner(["all"], {
      STUDYAI_QA_BACKEND_PORT: String(backendPort),
      STUDYAI_QA_FRONTEND_PORT: String(address.port),
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(`${result.stdout}\n${result.stderr}`, /puerto QA frontend .* ya está en uso/i);
    assert.equal(occupied.listening, true);

    const reportPath = result.stdout.match(/Reporte QA conservado: (.+)/)?.[1];
    assert.ok(reportPath, "the preflight failure must retain its run report");
    const report = parseRunnerReport(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "failed");
    assert.equal(report.failure?.phase, "preflight-ports");
    assert.deepEqual(report.processes, []);
    assert.deepEqual(report.cleanup, { temporaryDataRemoved: true, processTreesStopped: true });
  } finally {
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
      occupied.close((error) => (error ? reject(error) : resolve()));
    });
    await closed;
  }
});

test("a failure after backend startup stops processes and removes run data", { timeout: 30_000 }, async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-qa-failure-test-"));
  const emptyPath = join(temporaryRoot, "empty-bin");
  await mkdir(emptyPath);

  try {
    const backendPort = await getAvailablePort();
    const frontendPort = await getAvailablePort();
    const result = runRunner(
      ["e2e"],
      {
        PATH: emptyPath,
        TMPDIR: temporaryRoot,
        STUDYAI_QA_BACKEND_PORT: String(backendPort),
        STUDYAI_QA_FRONTEND_PORT: String(frontendPort),
      },
      25_000,
    );

    assert.equal(result.status, 1, result.stderr);
    assert.match(`${result.stdout}\n${result.stderr}`, /No se pudo iniciar Build de producción frontend/);

    const reportPath = result.stdout.match(/Reporte QA conservado: (.+)/)?.[1];
    assert.ok(reportPath, "the failed run must retain its report");
    const report = parseRunnerReport(await readFile(reportPath, "utf8"));
    assert.equal(report.status, "failed");
    assert.equal(report.failure?.phase, "production-build");
    assert.equal(report.command.exitCode, 1);
    assert.equal(report.testResults.suites.api.status, "not-run");
    assert.equal(report.testResults.suites.e2e.status, "not-run");
    assert.deepEqual(report.testResults.total, { total: 0, passed: 0, failed: 0, skipped: 0 });
    assert.match(report.metadata.toolVersions.node, /^v\d+\./);
    assert.equal(report.metadata.toolVersions.playwrightTest, "1.62.1");
    assert.equal(report.metadata.toolVersions.brunoCli, "4.2.0");
    assert.equal(report.metadata.sourceControl.workingTree, "unavailable", "the controlled empty PATH prevents a false git verification");
    assert.equal(report.metadata.sourceControl.verified, false);
    assert.equal(report.cleanup.temporaryDataRemoved, true);
    assert.equal(report.cleanup.processTreesStopped, true);
    assert.ok(report.processes.some((processRecord) =>
      processRecord.name === "Uvicorn backend aislado" && processRecord.treeStopped === true,
    ));
    assert.deepEqual(await readdir(temporaryRoot), ["empty-bin"]);
    await assertPortsAvailable([
      { name: "backend", port: backendPort },
      { name: "frontend", port: frontendPort },
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("SIGINT stops backend descendants and removes the isolated data directory", { timeout: 30_000 }, async () => {
  await verifySignalCleanup("SIGINT");
});

test("SIGTERM stops backend descendants and removes the isolated data directory", { timeout: 30_000 }, async () => {
  await verifySignalCleanup("SIGTERM");
});
