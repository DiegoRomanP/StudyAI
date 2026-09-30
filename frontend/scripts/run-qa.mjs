// @ts-check

import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPortsAvailable,
  createBackendEnvironment,
  createTestEnvironment,
  getApiCoverageMode,
  getBrunoCollectionState,
  getBrunoRequestPaths,
  getQaConfiguration,
  parseQaMode,
  terminateProcessTree,
  waitForHttp,
} from "./qa-runtime.mjs";

const frontendDirectory = fileURLToPath(new URL("..", import.meta.url));
const projectDirectory = resolve(frontendDirectory, "..");
const backendDirectory = join(projectDirectory, "backend");
const QA_REPORT_ROOT = join(frontendDirectory, "qa-results");
const QA_BRUNO_COLLECTION = join(frontendDirectory, "bruno");

/**
 * @typedef {{
 *   name: string,
 *   pid: number | null,
 *   exitCode: number | null,
 *   signal: NodeJS.Signals | null,
 *   treeStopped: boolean | null,
 *   closed: boolean,
 *   spawnError?: NodeJS.ErrnoException
 * }} ProcessRecord
 */

/**
 * @typedef {{
 *   child: import("node:child_process").ChildProcess,
 *   record: ProcessRecord,
 *   closed: Promise<{code: number | null, signal: NodeJS.Signals | null}>
 * }} ManagedProcess
 */

const USAGE = `Uso:
  npm run test:api   # /health + runtime MOCK; Bruno smoke cuando A04 cree la colección
  npm run test:e2e   # build de producción + smoke de carga de la UI
  npm run test:qa    # API y UI en una ejecución aislada
  npm run test:qa:types

La ejecución usa 8002/4173 por defecto. Para evitar conflictos se pueden fijar
STUDYAI_QA_BACKEND_PORT y STUDYAI_QA_FRONTEND_PORT (1024–65535). No reutiliza servidores existentes.`;

/** @type {ManagedProcess[]} */
const managedProcesses = [];
/** @type {"SIGINT" | "SIGTERM" | null} */
let interruptSignal = null;

/** @param {"SIGINT" | "SIGTERM"} signal */
function onInterrupt(signal) {
  interruptSignal = signal;
  for (const managed of managedProcesses) {
    if (managed.record.closed || managed.record.pid === null) continue;
    try {
      process.kill(process.platform === "win32" ? managed.record.pid : -managed.record.pid, signal);
    } catch (error) {
      const errorCode = error instanceof Error && "code" in error ? error.code : undefined;
      if (errorCode !== "ESRCH") console.error(`No se pudo señalizar el proceso QA ${managed.record.name}.`);
    }
  }
}

/** @param {string} name @param {string} executable @param {string[]} args @param {string} cwd @param {NodeJS.ProcessEnv} env */
function startManagedProcess(name, executable, args, cwd, env) {
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  /** @type {ProcessRecord} */
  const record = {
    name,
    pid: child.pid ?? null,
    exitCode: null,
    signal: null,
    treeStopped: null,
    closed: false,
  };
  const closed = new Promise((resolveClosed) => {
    child.once("error", (/** @type {NodeJS.ErrnoException} */ error) => {
      record.spawnError = error;
    });
    child.once("close", (code, signal) => {
      record.exitCode = code;
      record.signal = signal;
      record.closed = true;
      resolveClosed({ code, signal });
    });
  });
  const managed = { child, record, closed };
  managedProcesses.push(managed);
  return managed;
}

/**
 * @param {string} name
 * @param {string} executable
 * @param {string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} env
 * @param {QaReport} report
 */
async function runCommand(name, executable, args, cwd, env, report) {
  const managed = startManagedProcess(name, executable, args, cwd, env);
  report.processes.push(managed.record);
  const outcome = await managed.closed;
  if (managed.record.pid !== null) {
    managed.record.treeStopped = await terminateProcessTree(managed.record.pid);
  } else {
    managed.record.treeStopped = true;
  }

  if (managed.record.spawnError) {
    throw new Error(`No se pudo iniciar ${name} (${managed.record.spawnError.code ?? "spawn error"}).`);
  }
  if (outcome.code !== 0) {
    const reason = outcome.signal ? `interrumpido por ${outcome.signal}` : `exit ${outcome.code}`;
    throw new Error(`${name} terminó con ${reason}.`);
  }
  if (managed.record.treeStopped !== true) {
    throw new Error(`No se confirmó la terminación del grupo de procesos de ${name}.`);
  }
}

/**
 * @typedef {{name: string, status: "running" | "passed" | "failed", startedAt: string, finishedAt?: string, exitCode?: number | null, signal?: string | null, message?: string}} QaStep
 */

/** @typedef {{total: number, passed: number, failed: number, skipped: number}} QaTestCounts */

/** @typedef {{status: "not-run" | "passed" | "failed" | "unavailable", counts: QaTestCounts}} QaSuiteResult */

/** @typedef {{expected: number, total: number, executed: number, passed: number, failed: number, skipped: number, omitted: number, unexpected: number}} QaBrunoRequestCounts */

/** @typedef {{total: number, passed: number, failed: number}} QaBrunoCheckCounts */

/** @typedef {{requests: QaBrunoRequestCounts, assertions: QaBrunoCheckCounts, tests: QaBrunoCheckCounts, checks: QaTestCounts}} QaBrunoCounts */

/** @typedef {{status: "not-run" | "running" | "passed" | "failed" | "unavailable", exitCode: number | null, signal: string | null, counts: QaBrunoCounts}} QaBrunoSuiteResult */

/** @typedef {{suites: {api: QaSuiteResult, e2e: QaSuiteResult, bruno: QaBrunoSuiteResult}, total: QaTestCounts, requests: QaBrunoRequestCounts}} QaTestResults */

/** @typedef {{commit: string | null, ref: string | null, workingTree: "clean" | "dirty" | "unavailable", verified: boolean, checkedAt: string}} QaSourceControl */

/** @typedef {{node: string, npm: string | null, python: string | null, playwrightTest: string | null, brunoCli: string | null}} QaToolVersions */

/**
 * @typedef {{
 *   schemaVersion: 3,
 *   runId: string,
 *   scope: string,
 *   mode: "api" | "e2e" | "all",
 *   status: "running" | "passed" | "failed" | "interrupted",
 *   startedAt: string,
 *   finishedAt?: string,
 *   command: {script: string, args: string[], exitCode: number | null},
 *   metadata: {sourceControl: QaSourceControl, toolVersions: QaToolVersions},
 *   backendUrl: string,
 *   frontendUrl: string | null,
 *   buildApiUrl: string,
 *   apiCoverage: string,
 *   runtimeSource: string | null,
 *   readiness: {backend?: {url: string, status: number, checkedAt: string}, runtime?: {url: string, status: number, source: string, checkedAt: string}, frontend?: {url: string, status: number, checkedAt: string}},
 *   testResults: QaTestResults,
 *   steps: QaStep[],
 *   processes: ProcessRecord[],
 *   cleanup: {temporaryDataRemoved: boolean | null, processTreesStopped: boolean | null},
 *   failure?: {phase: string, message: string}
 * }} QaReport
 */

/**
 * @param {QaReport} report
 * @param {string} reportPath
 */
async function persistReport(report, reportPath) {
  const temporaryPath = `${reportPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await rename(temporaryPath, reportPath);
}

function throwIfInterrupted() {
  if (interruptSignal) throw new Error(`Recibida ${interruptSignal}.`);
}

/**
 * @param {QaReport} report
 * @param {string} name
 * @param {() => Promise<void>} action
 */
async function runStep(report, name, action) {
  throwIfInterrupted();
  /** @type {QaStep} */
  const step = { name, status: "running", startedAt: new Date().toISOString() };
  report.steps.push(step);
  try {
    await action();
    throwIfInterrupted();
    step.status = "passed";
  } catch (error) {
    step.status = "failed";
    step.message = error instanceof Error ? error.message : "Error desconocido.";
    const failedProcess = report.processes.find((processRecord) => processRecord.exitCode !== null && processRecord.exitCode !== 0);
    if (failedProcess) {
      step.exitCode = failedProcess.exitCode;
      step.signal = failedProcess.signal;
    }
    throw error;
  } finally {
    step.finishedAt = new Date().toISOString();
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @returns {QaTestCounts} */
function emptyTestCounts() {
  return { total: 0, passed: 0, failed: 0, skipped: 0 };
}

/** @returns {QaBrunoRequestCounts} */
function emptyBrunoRequestCounts() {
  return { expected: 0, total: 0, executed: 0, passed: 0, failed: 0, skipped: 0, omitted: 0, unexpected: 0 };
}

/** @returns {QaBrunoCounts} */
function emptyBrunoCounts() {
  return {
    requests: emptyBrunoRequestCounts(),
    assertions: { total: 0, passed: 0, failed: 0 },
    tests: { total: 0, passed: 0, failed: 0 },
    checks: emptyTestCounts(),
  };
}

/**
 * Convert Playwright's JSON stats to the small, body-free summary retained in
 * the run report.
 *
 * @param {unknown} value
 * @returns {QaTestCounts}
 */
export function summarizePlaywrightReport(value) {
  if (!isRecord(value) || !isRecord(value.stats)) {
    throw new Error("Reporte JSON de Playwright sin estadísticas verificables.");
  }
  const expected = readPlaywrightCount(value.stats, "expected");
  const flaky = readPlaywrightCount(value.stats, "flaky");
  const failed = readPlaywrightCount(value.stats, "unexpected");
  const skipped = readPlaywrightCount(value.stats, "skipped");
  const passed = expected + flaky;
  return { total: passed + failed + skipped, passed, failed, skipped };
}

/** @param {Record<string, unknown>} stats @param {string} name @returns {number} */
function readPlaywrightCount(stats, name) {
  const value = stats[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Reporte JSON de Playwright contiene conteos no válidos.");
  }
  return value;
}

/** @param {QaTestCounts} counts */
export function assertRunnablePlaywrightCounts(counts) {
  if (counts.total === 0 || counts.passed === 0 || counts.failed > 0 || counts.skipped > 0) {
    throw new Error("La suite Playwright no terminó con todas sus pruebas aprobadas (vacía, fallida u omitida).");
  }
  return true;
}

/** @param {Record<string, unknown>} summary @param {string} name */
function readBrunoCount(summary, name) {
  const value = summary[name];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Reporte JSON de Bruno con conteo no válido: ${name}.`);
  }
  return value;
}

/** @param {unknown} value @param {string} name @returns {unknown[]} */
function readBrunoResultList(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Reporte JSON de Bruno con resultados no válidos: ${name}.`);
  return value;
}

/** @param {string} requestPath */
function normalizeBrunoRequestPath(requestPath) {
  return requestPath.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/\.bru$/i, "");
}

/** @param {unknown} values @param {string} fieldName */
function sumBrunoResultStatuses(values, fieldName) {
  const results = readBrunoResultList(values, fieldName);
  let total = 0;
  let passed = 0;
  let failed = 0;
  for (const value of results) {
    if (!isRecord(value)) throw new Error(`Reporte JSON de Bruno con elemento de resultado no válido: ${fieldName}.`);
    if (value.isScriptError === true) continue;
    total += 1;
    if (value.status === "pass") passed += 1;
    else failed += 1;
  }
  return { total, passed, failed };
}

/**
 * Parse Bruno CLI 4.2.0's actual JSON shape: an array of iterations, each with
 * `summary` counters and `results` carrying request paths, skips and assertions.
 *
 * @param {unknown} value
 * @param {string[]} expectedRequestPaths
 * @returns {QaBrunoCounts}
 */
export function summarizeBrunoReport(value, expectedRequestPaths) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Reporte JSON de Bruno sin formato verificable (se esperaba un array de iteraciones).");
  }
  if (!Array.isArray(expectedRequestPaths) || expectedRequestPaths.length === 0) {
    throw new Error("No se pudo verificar el conjunto de peticiones Bruno esperado.");
  }

  /** @type {QaBrunoCounts} */
  const counts = emptyBrunoCounts();
  const reportedPathOccurrences = new Map();
  const expectedPathOccurrences = new Map();
  for (const requestPath of expectedRequestPaths) {
    const normalizedPath = normalizeBrunoRequestPath(requestPath);
    expectedPathOccurrences.set(normalizedPath, (expectedPathOccurrences.get(normalizedPath) ?? 0) + 1);
  }

  for (const iteration of value) {
    if (!isRecord(iteration) || !isRecord(iteration.summary)) {
      throw new Error("Reporte JSON de Bruno sin formato verificable (falta summary por iteración).");
    }
    const summary = iteration.summary;
    const results = iteration.results;
    if (!Array.isArray(results)) {
      throw new Error("Reporte JSON de Bruno sin formato verificable (falta results por iteración).");
    }

    const totalRequests = readBrunoCount(summary, "totalRequests");
    const passedRequests = readBrunoCount(summary, "passedRequests");
    const failedRequests = readBrunoCount(summary, "failedRequests");
    const errorRequests = readBrunoCount(summary, "errorRequests");
    const skippedRequests = readBrunoCount(summary, "skippedRequests");
    const skippedByBail = readBrunoCount(summary, "skippedByBail");
    const totalAssertions = readBrunoCount(summary, "totalAssertions");
    const passedAssertions = readBrunoCount(summary, "passedAssertions");
    const failedAssertions = readBrunoCount(summary, "failedAssertions");
    const totalTests = readBrunoCount(summary, "totalTests");
    const passedTests = readBrunoCount(summary, "passedTests");
    const failedTests = readBrunoCount(summary, "failedTests");
    const totalPreRequestTests = readBrunoCount(summary, "totalPreRequestTests");
    const passedPreRequestTests = readBrunoCount(summary, "passedPreRequestTests");
    const failedPreRequestTests = readBrunoCount(summary, "failedPreRequestTests");
    const totalPostResponseTests = readBrunoCount(summary, "totalPostResponseTests");
    const passedPostResponseTests = readBrunoCount(summary, "passedPostResponseTests");
    const failedPostResponseTests = readBrunoCount(summary, "failedPostResponseTests");

    if (results.length !== totalRequests
      || passedRequests + failedRequests + errorRequests + skippedRequests !== totalRequests
      || passedAssertions + failedAssertions !== totalAssertions
      || passedTests + failedTests !== totalTests
      || passedPreRequestTests + failedPreRequestTests !== totalPreRequestTests
      || passedPostResponseTests + failedPostResponseTests !== totalPostResponseTests) {
      throw new Error("Reporte JSON de Bruno contiene conteos inconsistentes con sus resultados.");
    }

    const reportedAssertions = [];
    const reportedTests = [];
    const reportedPreRequestTests = [];
    const reportedPostResponseTests = [];
    let skippedResultCount = 0;
    let passedResultCount = 0;
    let failedResultCount = 0;
    let errorResultCount = 0;
    for (const result of results) {
      if (!isRecord(result) || typeof result.path !== "string" || result.path.length === 0) {
        throw new Error("Reporte JSON de Bruno con petición sin path verificable.");
      }
      const requestPath = normalizeBrunoRequestPath(result.path);
      reportedPathOccurrences.set(requestPath, (reportedPathOccurrences.get(requestPath) ?? 0) + 1);
      const assertionResults = readBrunoResultList(result.assertionResults, "assertionResults");
      const testResults = readBrunoResultList(result.testResults, "testResults");
      const preRequestTestResults = readBrunoResultList(result.preRequestTestResults, "preRequestTestResults");
      const postResponseTestResults = readBrunoResultList(result.postResponseTestResults, "postResponseTestResults");
      reportedAssertions.push(...assertionResults);
      reportedTests.push(...testResults);
      reportedPreRequestTests.push(...preRequestTestResults);
      reportedPostResponseTests.push(...postResponseTestResults);

      if (result.skipped === true || result.status === "skipped") {
        skippedResultCount += 1;
      } else {
        const requestChecks = [...assertionResults, ...testResults, ...preRequestTestResults, ...postResponseTestResults];
        const failedCheck = requestChecks.some((check) => !isRecord(check) || check.isScriptError === true || check.status !== "pass");
        if (failedCheck) failedResultCount += 1;
        else if (result.status === "error" || (typeof result.error === "string" && result.error.length > 0)) errorResultCount += 1;
        else if (result.status === "pass") passedResultCount += 1;
        else throw new Error("Reporte JSON de Bruno con estado de petición no válido.");
      }
    }
    if (skippedResultCount !== skippedRequests
      || passedResultCount !== passedRequests
      || failedResultCount !== failedRequests
      || errorResultCount !== errorRequests) {
      throw new Error("Reporte JSON de Bruno contiene conteos de peticiones inconsistentes con sus resultados.");
    }

    const iterationAssertions = sumBrunoResultStatuses(reportedAssertions, "assertionResults");
    const iterationTests = sumBrunoResultStatuses(reportedTests, "testResults");
    const iterationPreRequestTests = sumBrunoResultStatuses(reportedPreRequestTests, "preRequestTestResults");
    const iterationPostResponseTests = sumBrunoResultStatuses(reportedPostResponseTests, "postResponseTestResults");
    if (iterationAssertions.total !== totalAssertions
      || iterationAssertions.passed !== passedAssertions
      || iterationAssertions.failed !== failedAssertions
      || iterationTests.total !== totalTests
      || iterationTests.passed !== passedTests
      || iterationTests.failed !== failedTests
      || iterationPreRequestTests.total !== totalPreRequestTests
      || iterationPreRequestTests.passed !== passedPreRequestTests
      || iterationPreRequestTests.failed !== failedPreRequestTests
      || iterationPostResponseTests.total !== totalPostResponseTests
      || iterationPostResponseTests.passed !== passedPostResponseTests
      || iterationPostResponseTests.failed !== failedPostResponseTests) {
      throw new Error("Reporte JSON de Bruno contiene conteos de aserciones/tests inconsistentes con sus resultados.");
    }

    counts.requests.total += totalRequests;
    counts.requests.passed += passedRequests;
    counts.requests.failed += failedRequests + errorRequests;
    counts.requests.skipped += skippedRequests;
    counts.assertions.total += totalAssertions;
    counts.assertions.passed += passedAssertions;
    counts.assertions.failed += failedAssertions;
    counts.tests.total += totalTests + totalPreRequestTests + totalPostResponseTests;
    counts.tests.passed += passedTests + passedPreRequestTests + passedPostResponseTests;
    counts.tests.failed += failedTests + failedPreRequestTests + failedPostResponseTests;
    // skippedByBail is emitted by the CLI summary; skippedRequests is the complete count.
    if (skippedByBail > skippedRequests) {
      throw new Error("Reporte JSON de Bruno contiene un conteo de bail no válido.");
    }
  }

  counts.requests.expected = [...expectedPathOccurrences.values()].reduce((total, count) => total + count, 0) * value.length;
  counts.requests.executed = counts.requests.total - counts.requests.skipped;
  for (const [requestPath, expectedOccurrences] of expectedPathOccurrences) {
    const actualOccurrences = reportedPathOccurrences.get(requestPath) ?? 0;
    counts.requests.omitted += Math.max(expectedOccurrences * value.length - actualOccurrences, 0);
    counts.requests.unexpected += Math.max(actualOccurrences - expectedOccurrences * value.length, 0);
  }
  for (const [requestPath, actualOccurrences] of reportedPathOccurrences) {
    if (!expectedPathOccurrences.has(requestPath)) counts.requests.unexpected += actualOccurrences;
  }

  counts.checks = {
    total: counts.assertions.total + counts.tests.total,
    passed: counts.assertions.passed + counts.tests.passed,
    failed: counts.assertions.failed + counts.tests.failed,
    skipped: 0,
  };
  return counts;
}

/** @param {QaBrunoCounts} counts */
export function assertRunnableBrunoCounts(counts) {
  if (counts.requests.expected === 0 || counts.requests.total === 0 || counts.requests.executed === 0) {
    throw new Error("Bruno no ejecutó ninguna petición verificable.");
  }
  if (counts.assertions.total === 0) {
    throw new Error("Bruno no ejecutó aserciones; exit 0 no demuestra cobertura.");
  }
  if (counts.requests.omitted > 0 || counts.requests.unexpected > 0) {
    throw new Error("Bruno reportó peticiones omitidas o inesperadas respecto a la colección seleccionada.");
  }
  if (counts.requests.skipped > 0) {
    throw new Error("Bruno reportó peticiones saltadas u omitidas.");
  }
  if (counts.requests.failed > 0 || counts.assertions.failed > 0 || counts.tests.failed > 0) {
    throw new Error("Bruno terminó con peticiones, aserciones o tests fallidos.");
  }
  if (counts.assertions.passed !== counts.assertions.total
    || counts.tests.passed !== counts.tests.total
    || counts.checks.passed !== counts.checks.total) {
    throw new Error("Bruno no aprobó todas las aserciones y tests reportados.");
  }
  return true;
}

/** @param {string} reportPath @returns {Promise<unknown>} */
export async function readBrunoJsonReport(reportPath) {
  let contents;
  try {
    contents = await readFile(reportPath, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "read error";
    throw new Error(`No se pudo leer el reporte JSON de Bruno (${code}).`);
  }
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("El reporte JSON de Bruno no es JSON válido.");
  }
}

/** @returns {QaTestResults} */
function emptyTestResults() {
  return {
    suites: {
      api: { status: "not-run", counts: emptyTestCounts() },
      e2e: { status: "not-run", counts: emptyTestCounts() },
      bruno: { status: "not-run", exitCode: null, signal: null, counts: emptyBrunoCounts() },
    },
    total: emptyTestCounts(),
    requests: emptyBrunoRequestCounts(),
  };
}

/** @param {QaTestResults} results */
function updateTestResultTotals(results) {
  const playwrightTotal = [results.suites.api, results.suites.e2e].reduce((total, suite) => ({
    total: total.total + suite.counts.total,
    passed: total.passed + suite.counts.passed,
    failed: total.failed + suite.counts.failed,
    skipped: total.skipped + suite.counts.skipped,
  }), emptyTestCounts());
  results.total = {
    total: playwrightTotal.total + results.suites.bruno.counts.checks.total,
    passed: playwrightTotal.passed + results.suites.bruno.counts.checks.passed,
    failed: playwrightTotal.failed + results.suites.bruno.counts.checks.failed,
    skipped: playwrightTotal.skipped + results.suites.bruno.counts.checks.skipped,
  };
  results.requests = { ...results.suites.bruno.counts.requests };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {boolean} [shell]
 * @returns {string | null}
 */
function captureCommandOutput(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell,
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

/** @param {string} frontendRoot @param {string} packageName */
function getInstalledPackageVersion(frontendRoot, packageName) {
  try {
    const packagePath = join(frontendRoot, "node_modules", ...packageName.split("/"), "package.json");
    const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
    return typeof metadata.version === "string" ? metadata.version : null;
  } catch {
    return null;
  }
}

/** @returns {QaSourceControl} */
function getSourceControlReference() {
  const commit = captureCommandOutput("git", ["rev-parse", "HEAD"], projectDirectory);
  const branch = captureCommandOutput("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], projectDirectory);
  const status = captureCommandOutput("git", ["status", "--porcelain=v1", "--untracked-files=all"], projectDirectory);
  return {
    commit,
    ref: branch ?? (commit ? "HEAD" : null),
    workingTree: status === null ? "unavailable" : status.length === 0 ? "clean" : "dirty",
    verified: commit !== null && status !== null,
    checkedAt: new Date().toISOString(),
  };
}

/** @returns {string | null} */
function getNpmVersion() {
  const userAgentVersion = process.env.npm_config_user_agent?.match(/(?:^|\s)npm\/([^\s]+)/)?.[1];
  return userAgentVersion
    ?? captureCommandOutput("npm", ["--version"], projectDirectory, process.platform === "win32");
}

/** @param {string} phase @param {unknown} error */
function safeFailure(phase, error) {
  const message = error instanceof Error ? error.message : "Error desconocido.";
  const safeMessage = message
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "[REDACTED_URL]@");
  return { phase, message: safeMessage };
}

/** @param {string} projectPath */
function getQaPython(projectPath) {
  const python = process.platform === "win32"
    ? join(projectPath, ".venv-qa", "Scripts", "python.exe")
    : join(projectPath, ".venv-qa", "bin", "python");
  if (!existsSync(python)) {
    throw new Error("Falta backend/.venv-qa. Crea el entorno QA e instala solo backend/requirements.txt; consulta docs/frontend-integration/qa.md.");
  }
  return python;
}

/** @param {string} python @param {QaReport} report @param {NodeJS.ProcessEnv} environment */
async function verifyCorePythonEnvironment(python, report, environment) {
  const version = captureCommandOutput(python, ["--version"], backendDirectory);
  if (!version) throw new Error("No se pudo verificar la versión del intérprete Python QA.");
  report.metadata.toolVersions.python = version.replace(/^Python\s+/, "");

  const code = [
    "import fastapi, uvicorn, importlib.util, sys",
    "optional = ('fitz', 'sentence_transformers', 'chromadb', 'langchain_text_splitters')",
    "installed = [name for name in optional if importlib.util.find_spec(name) is not None]",
    "print('QA Python core dependencies available; optional RAG packages:', ', '.join(installed) or 'none')",
    "sys.exit(1 if installed else 0)",
  ].join("; ");
  await runCommand("Validar Python core sin dependencias RAG", python, ["-c", code], backendDirectory, environment, report);
}

/** @param {string} url @param {ManagedProcess} server */
async function waitForProcessHttp(url, server) {
  return waitForHttp(url, { isProcessRunning: () => !server.record.closed });
}

/** @param {QaReport} report @param {string} backendUrl @param {ManagedProcess} backend */
async function verifyBackendReadiness(report, backendUrl, backend) {
  const healthUrl = `${backendUrl}/health`;
  const health = await waitForProcessHttp(healthUrl, backend);
  if (!isRecord(health.body) || health.body.status !== "ok") {
    throw new Error("El backend respondió a /health sin status=ok.");
  }
  report.readiness.backend = { url: healthUrl, status: health.status, checkedAt: new Date().toISOString() };
  console.log(`Backend disponible: ${healthUrl} (HTTP ${health.status}).`);

  const runtimeUrl = `${backendUrl}/llm-settings/runtime`;
  const runtime = await waitForProcessHttp(runtimeUrl, backend);
  if (!isRecord(runtime.body) || runtime.body.source !== "MOCK") {
    throw new Error("El backend QA no informa runtime MOCK; no se ejecutan pruebas.");
  }
  report.runtimeSource = "MOCK";
  report.readiness.runtime = {
    url: runtimeUrl,
    status: runtime.status,
    source: "MOCK",
    checkedAt: new Date().toISOString(),
  };
  console.log(`Runtime QA confirmado por backend: MOCK (${runtimeUrl}).`);
}

/** @param {string} frontendUrl @param {ManagedProcess} frontend */
async function waitForFrontend(frontendUrl, frontend) {
  const response = await waitForProcessHttp(`${frontendUrl}/`, frontend);
  if (response.status !== 200) throw new Error(`El frontend QA respondió HTTP ${response.status}.`);
  console.log(`Frontend de producción disponible: ${frontendUrl}/ (HTTP ${response.status}).`);
  return response.status;
}

/** @param {string} frontendRoot */
function playwrightCli(frontendRoot) {
  return join(frontendRoot, "node_modules", "@playwright", "test", "cli.js");
}

/**
 * @param {QaReport} report
 * @param {"api" | "e2e"} suiteName
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} frontendRoot
 * @param {string} runDirectory
 */
async function runPlaywrightSuite(report, suiteName, environment, frontendRoot, runDirectory) {
  const jsonReportPath = join(runDirectory, `${suiteName}-playwright.json`);
  const suiteResult = report.testResults.suites[suiteName];
  let commandError = null;
  try {
    await runCommand(
      `Playwright ${suiteName} suite`,
      process.execPath,
      [
        playwrightCli(frontendRoot),
        "test",
        "--config",
        join(frontendRoot, "playwright.config.ts"),
        "--project",
        suiteName,
        "--forbid-only",
      ],
      frontendRoot,
      { ...environment, PLAYWRIGHT_JSON_OUTPUT_FILE: jsonReportPath },
      report,
    );
  } catch (error) {
    commandError = error;
  }

  try {
    const playwrightReport = JSON.parse(await readFile(jsonReportPath, "utf8"));
    suiteResult.counts = summarizePlaywrightReport(playwrightReport);
    suiteResult.status = commandError ? "failed" : "passed";
  } catch {
    suiteResult.status = commandError ? "failed" : "unavailable";
    if (!commandError) {
      commandError = new Error("Playwright no generó un reporte JSON con conteos verificables.");
    }
  }

  if (!commandError) {
    try {
      assertRunnablePlaywrightCounts(suiteResult.counts);
    } catch (error) {
      suiteResult.status = "failed";
      commandError = error;
    }
  }
  updateTestResultTotals(report.testResults);
  if (commandError) throw commandError;
}

/** @param {string} frontendRoot */
function viteCli(frontendRoot) {
  return join(frontendRoot, "node_modules", "vite", "bin", "vite.js");
}

/** @param {string} frontendRoot @param {string} reportDirectory @param {string} apiUrl */
async function resolveBrunoCli(frontendRoot, reportDirectory, apiUrl) {
  const packagePath = join(frontendRoot, "node_modules", "@usebruno", "cli", "package.json");
  if (!existsSync(packagePath)) throw new Error("No está instalada la dependencia versionada @usebruno/cli; ejecuta npm ci.");
  const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
  const executable = typeof packageMetadata.bin === "string" ? packageMetadata.bin : packageMetadata.bin?.bru;
  if (typeof executable !== "string") throw new Error("@usebruno/cli no publica el ejecutable bru esperado.");
  return {
    executable: join(dirname(packagePath), executable),
    args: [
      "run",
      "smoke",
      "-r",
      "--env",
      "qa",
      "--sandbox",
      "safe",
      "--delay",
      "500",
      "--env-var",
      `baseUrl=${apiUrl}`,
      "--reporter-json",
      join(reportDirectory, "bruno-report.json"),
      "--reporter-html",
      join(reportDirectory, "bruno-report.html"),
      "--reporter-junit",
      join(reportDirectory, "bruno-report.xml"),
      "--reporter-skip-all-headers",
      "--reporter-skip-body",
    ],
  };
}

/**
 * @param {QaReport} report
 * @param {NodeJS.ProcessEnv} environment
 * @param {string} frontendRoot
 * @param {string} collectionDirectory
 * @param {string} reportDirectory
 * @param {string} apiUrl
 */
export async function runBrunoCollection(report, environment, frontendRoot, collectionDirectory, reportDirectory, apiUrl) {
  /** @type {"absent" | "ready" | "invalid"} */
  let state;
  let readinessInspectionFailed = false;
  try {
    state = await getBrunoCollectionState(collectionDirectory);
  } catch {
    state = "invalid";
    readinessInspectionFailed = true;
  }
  report.apiCoverage = getApiCoverageMode(state);
  if (state === "absent") {
    console.log("Cobertura API provisional A03: sólo /health y runtime MOCK. A04 aún no creó la colección Bruno; esto no cubre el flujo de A04.");
    return;
  }

  const suiteResult = report.testResults.suites.bruno;
  suiteResult.status = "running";
  /** @type {string[]} */
  let expectedRequestPaths = [];
  /** @type {string[]} */
  const errors = [];

  if (state === "invalid") {
    errors.push("La colección Bruno no superó readiness: requiere bruno.json u opencollection.yml, environments/qa.bru y una petición HTTP ejecutable dentro de smoke/.");
    if (readinessInspectionFailed) errors.push("No se pudo inspeccionar la colección Bruno durante readiness.");
  }

  try {
    expectedRequestPaths = await getBrunoRequestPaths(collectionDirectory);
    if (expectedRequestPaths.length === 0) {
      errors.push("La colección Bruno no contiene peticiones HTTP ejecutables para validar.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "No se pudo inspeccionar la colección Bruno.");
  }

  try {
    const command = await resolveBrunoCli(frontendRoot, reportDirectory, apiUrl);
    const managed = startManagedProcess(
      "Bruno smoke API",
      process.execPath,
      [command.executable, ...command.args],
      collectionDirectory,
      environment,
    );
    report.processes.push(managed.record);
    const outcome = await managed.closed;
    suiteResult.exitCode = outcome.code;
    suiteResult.signal = outcome.signal;

    if (managed.record.pid !== null) {
      try {
        managed.record.treeStopped = await terminateProcessTree(managed.record.pid);
      } catch {
        managed.record.treeStopped = false;
      }
    } else {
      managed.record.treeStopped = true;
    }

    if (managed.record.spawnError) {
      errors.push(`No se pudo iniciar Bruno CLI (${managed.record.spawnError.code ?? "spawn error"}).`);
    } else if (outcome.code !== 0) {
      const reason = outcome.signal ? `interrumpido por ${outcome.signal}` : `exit ${outcome.code}`;
      errors.push(`Bruno smoke API terminó con ${reason}.`);
    }
    if (managed.record.treeStopped !== true) {
      errors.push("No se confirmó la terminación del grupo de procesos de Bruno.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "No se pudo ejecutar la colección Bruno.");
  }

  /** @type {QaBrunoCounts | null} */
  let brunoCounts = null;
  try {
    const brunoReport = await readBrunoJsonReport(join(reportDirectory, "bruno-report.json"));
    brunoCounts = summarizeBrunoReport(brunoReport, expectedRequestPaths);
    suiteResult.counts = brunoCounts;
  } catch (error) {
    suiteResult.status = "unavailable";
    errors.push(error instanceof Error ? error.message : "No se pudo validar el reporte Bruno.");
  }

  if (brunoCounts) {
    try {
      // This post-CLI gate is mandatory even when the CLI exits zero: Bruno 4.2.0
      // reports success for a collection that ran requests but executed no assertions.
      assertRunnableBrunoCounts(brunoCounts);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "El reporte Bruno no cumple los criterios de ejecución.");
    }
  }

  if (errors.length > 0) {
    if (suiteResult.status !== "unavailable") suiteResult.status = "failed";
    updateTestResultTotals(report.testResults);
    throw new Error(errors.join(" "));
  }

  suiteResult.status = "passed";
  updateTestResultTotals(report.testResults);
}

/** @param {string} apiUrl @param {string} frontendRoot @param {NodeJS.ProcessEnv} environment @param {string} buildDirectory @param {QaReport} report */
async function buildProductionFrontend(apiUrl, frontendRoot, environment, buildDirectory, report) {
  await runCommand(
    "Build de producción frontend (VITE_API_URL ya fijada)",
    "npm",
    ["run", "build", "--", "--outDir", buildDirectory, "--emptyOutDir"],
    frontendRoot,
    environment,
    report,
  );
  if (!existsSync(join(buildDirectory, "index.html"))) {
    throw new Error("El build de producción terminó sin crear el index.html esperado.");
  }
  console.log(`Build de producción QA: ${buildDirectory}; VITE_API_URL=${apiUrl}.`);
}

/** @param {string} path */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** @param {string[]} args */
async function main(args) {
  let mode;
  try {
    mode = parseQaMode(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Modo QA no válido.");
    console.error(USAGE);
    return 2;
  }
  if (mode === "help") {
    console.log(USAGE);
    return 0;
  }

  let configuration;
  try {
    configuration = getQaConfiguration();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Configuración de puertos QA no válida.");
    return 2;
  }

  const needsFrontend = mode !== "api";
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const reportDirectory = join(QA_REPORT_ROOT, runId);
  const reportPath = join(reportDirectory, "run-report.json");
  const startedAt = new Date().toISOString();
  /** @type {QaReport} */
  const report = {
    schemaVersion: 3,
    runId,
    scope: "A03 infrastructure smoke; not the A04 product-flow API coverage",
    mode,
    status: "running",
    startedAt,
    command: { script: "node scripts/run-qa.mjs", args: [mode], exitCode: null },
    metadata: {
      sourceControl: getSourceControlReference(),
      toolVersions: {
        node: process.version,
        npm: getNpmVersion(),
        python: null,
        playwrightTest: getInstalledPackageVersion(frontendDirectory, "@playwright/test"),
        brunoCli: getInstalledPackageVersion(frontendDirectory, "@usebruno/cli"),
      },
    },
    backendUrl: configuration.backendUrl,
    frontendUrl: needsFrontend ? configuration.frontendUrl : null,
    buildApiUrl: configuration.backendUrl,
    apiCoverage: "not-run",
    runtimeSource: null,
    readiness: {},
    testResults: emptyTestResults(),
    steps: [],
    processes: [],
    cleanup: { temporaryDataRemoved: null, processTreesStopped: null },
  };

  let exitCode = 0;
  let phase = "report-directory";
  /** @type {string | null} */
  let runDirectory = null;
  /** @type {ManagedProcess | null} */
  let backendProcess = null;
  /** @type {ManagedProcess | null} */
  let frontendProcess = null;
  const signalHandler = () => onInterrupt("SIGINT");
  const terminateHandler = () => onInterrupt("SIGTERM");
  process.once("SIGINT", signalHandler);
  process.once("SIGTERM", terminateHandler);

  try {
    await mkdir(QA_REPORT_ROOT, { recursive: true });
    await mkdir(reportDirectory, { recursive: false });
    await persistReport(report, reportPath);

    phase = "preflight-ports";
    await runStep(report, "Puertos QA libres (sin reutilizar servidores dev)", async () => {
      const ports = needsFrontend
        ? [configuration.backend, configuration.frontend]
        : [configuration.backend];
      await assertPortsAvailable(ports);
    });

    phase = "python-core";
    const qaPython = getQaPython(backendDirectory);
    const backendEnvironment = createBackendEnvironment({
      source: process.env,
      runDirectory: join(tmpdir(), `studyai-qa-${runId}`),
      backendUrl: configuration.backendUrl,
      frontendUrl: configuration.frontendUrl,
      secretKey: randomBytes(32).toString("hex"),
    });
    await runStep(report, "Verificar entorno Python core", async () => {
      await verifyCorePythonEnvironment(qaPython, report, backendEnvironment);
    });

    phase = "temporary-data";
    const qaDataDirectory = await mkdtemp(join(tmpdir(), "studyai-qa-"));
    runDirectory = qaDataDirectory;
    Object.assign(backendEnvironment, createBackendEnvironment({
      source: process.env,
      runDirectory: qaDataDirectory,
      backendUrl: configuration.backendUrl,
      frontendUrl: configuration.frontendUrl,
      secretKey: String(backendEnvironment.SECRET_KEY),
    }));

    phase = "backend-startup";
    await runStep(report, "Arrancar backend aislado", async () => {
      backendProcess = startManagedProcess(
        "Uvicorn backend aislado",
        qaPython,
        ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(configuration.backend.port), "--no-access-log"],
        backendDirectory,
        backendEnvironment,
      );
      report.processes.push(backendProcess.record);
      await verifyBackendReadiness(report, configuration.backendUrl, backendProcess);
    });

    const testEnvironment = createTestEnvironment({
      source: process.env,
      backendUrl: configuration.backendUrl,
      frontendUrl: configuration.frontendUrl,
      reportDirectory,
    });
    const apiTestEnvironment = { ...testEnvironment, STUDYAI_QA_SUITE: "api" };
    const e2eTestEnvironment = { ...testEnvironment, STUDYAI_QA_SUITE: "e2e" };

    if (needsFrontend) {
      phase = "production-build";
      const buildDirectory = join(qaDataDirectory, "frontend-dist");
      await runStep(report, "Build frontend de producción en directorio efímero", async () => {
        await buildProductionFrontend(
          configuration.backendUrl,
          frontendDirectory,
          testEnvironment,
          buildDirectory,
          report,
        );
      });

      phase = "frontend-startup";
      await runStep(report, "Servir build de producción y esperar HTTP", async () => {
        frontendProcess = startManagedProcess(
          "Vite preview de producción",
          process.execPath,
          [viteCli(frontendDirectory), "preview", "--host", "127.0.0.1", "--port", String(configuration.frontend.port), "--strictPort", "--outDir", buildDirectory],
          frontendDirectory,
          testEnvironment,
        );
        report.processes.push(frontendProcess.record);
        const status = await waitForFrontend(configuration.frontendUrl, frontendProcess);
        report.readiness.frontend = {
          url: `${configuration.frontendUrl}/`,
          status,
          checkedAt: new Date().toISOString(),
        };
      });
    }

    if (mode !== "e2e") {
      phase = "api-tests";
      await runStep(report, "Playwright API health/runtime smoke y Bruno cuando exista", async () => {
        await runPlaywrightSuite(report, "api", apiTestEnvironment, frontendDirectory, qaDataDirectory);
        await runBrunoCollection(
          report,
          testEnvironment,
          frontendDirectory,
          QA_BRUNO_COLLECTION,
          reportDirectory,
          configuration.backendUrl,
        );
      });
    } else {
      report.apiCoverage = "backend-health-and-runtime-preflight-only";
    }

    if (needsFrontend) {
      phase = "e2e-tests";
      await runStep(report, "Playwright smoke UI de producción", async () => {
        await runPlaywrightSuite(report, "e2e", e2eTestEnvironment, frontendDirectory, qaDataDirectory);
      });
    }

    if (!report.metadata.sourceControl.verified) {
      throw new Error("No se pudo verificar el commit y estado del árbol de trabajo para este reporte QA.");
    }
    report.status = "passed";
    if (report.apiCoverage === "provisional-health-runtime-only-a04-pending") {
      console.log("Resultado: A03 infrastructure smoke PASS; cobertura funcional de API A04 PENDIENTE (no implementada aquí).");
    } else {
      console.log("Resultado: suites QA solicitadas PASS.");
    }
  } catch (error) {
    exitCode = interruptSignal === "SIGINT" ? 130 : interruptSignal === "SIGTERM" ? 143 : 1;
    report.status = interruptSignal ? "interrupted" : "failed";
    report.failure = safeFailure(phase, error);
    console.error(`QA ${report.status} durante ${phase}: ${report.failure.message}`);
  } finally {
    const cleanupErrors = [];
    for (const managed of [...managedProcesses].reverse()) {
      if (managed.record.pid === null) {
        managed.record.treeStopped = true;
        continue;
      }
      try {
        managed.record.treeStopped = await terminateProcessTree(managed.record.pid);
        if (!managed.record.treeStopped) cleanupErrors.push(`grupo de procesos ${managed.record.name} no terminó`);
      } catch {
        managed.record.treeStopped = false;
        cleanupErrors.push(`no se pudo terminar el grupo de procesos ${managed.record.name}`);
      }
    }
    report.cleanup.processTreesStopped = cleanupErrors.length === 0;

    if (runDirectory) {
      try {
        await rm(runDirectory, { recursive: true, force: true });
        report.cleanup.temporaryDataRemoved = !(await pathExists(runDirectory));
        if (!report.cleanup.temporaryDataRemoved) cleanupErrors.push("el directorio temporal QA sigue presente");
      } catch {
        report.cleanup.temporaryDataRemoved = false;
        cleanupErrors.push("no se pudo limpiar el directorio temporal QA");
      }
    } else {
      report.cleanup.temporaryDataRemoved = true;
    }

    if (cleanupErrors.length > 0) {
      exitCode = exitCode || 1;
      report.status = interruptSignal ? "interrupted" : "failed";
      report.failure = safeFailure(phase, new Error(cleanupErrors.join("; ")));
      console.error(`QA cleanup incompleto: ${cleanupErrors.join("; ")}.`);
    }

    if (interruptSignal) {
      exitCode = interruptSignal === "SIGINT" ? 130 : 143;
      report.status = "interrupted";
      report.failure = safeFailure("interruption", new Error(`Recibida ${interruptSignal}.`));
    }

    updateTestResultTotals(report.testResults);
    report.command.exitCode = exitCode;
    report.finishedAt = new Date().toISOString();
    try {
      await persistReport(report, reportPath);
      console.log(`Reporte QA conservado: ${resolve(reportPath)}`);
    } catch {
      exitCode = exitCode || 1;
      console.error("No se pudo conservar el reporte QA.");
    }
    process.removeListener("SIGINT", signalHandler);
    process.removeListener("SIGTERM", terminateHandler);
  }

  return exitCode;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error("Error fatal no controlado en el runner de QA.");
      process.exitCode = 1;
    });
}
