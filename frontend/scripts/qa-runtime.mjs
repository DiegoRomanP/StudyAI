import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_BACKEND_PORT = 8002;
const DEFAULT_FRONTEND_PORT = 4173;
const DEFAULT_READY_TIMEOUT_MS = 60_000;
const READY_POLL_INTERVAL_MS = 200;
const REQUEST_TIMEOUT_MS = 1_000;
const PROCESS_GRACE_PERIOD_MS = 3_000;
const PROCESS_KILL_TIMEOUT_MS = 3_000;
const SENSITIVE_ENVIRONMENT_NAME = /(API[_-]?KEY|ACCESS[_-]?KEY|TOKEN|PASSWORD|CREDENTIAL|SECRET)/i;

/** @typedef {"api" | "e2e" | "all" | "help"} QaMode */

/** @typedef {{name: string, port: number}} QaPort */

/** @typedef {{status: number, body: unknown}} HttpResult */

/**
 * @param {string[]} args
 * @returns {QaMode}
 */
export function parseQaMode(args) {
  if (args.length === 0) return "all";
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return "help";
  if (args.length === 1 && (args[0] === "api" || args[0] === "e2e" || args[0] === "all")) {
    return args[0];
  }
  throw new Error("Modo QA no válido. Usa api, e2e, all o --help.");
}

/**
 * @param {NodeJS.ProcessEnv} [environment]
 * @returns {{backend: QaPort, frontend: QaPort, backendUrl: string, frontendUrl: string}}
 */
export function getQaConfiguration(environment = process.env) {
  const backendPort = parsePort("STUDYAI_QA_BACKEND_PORT", environment.STUDYAI_QA_BACKEND_PORT, DEFAULT_BACKEND_PORT);
  const frontendPort = parsePort("STUDYAI_QA_FRONTEND_PORT", environment.STUDYAI_QA_FRONTEND_PORT, DEFAULT_FRONTEND_PORT);
  if (backendPort === frontendPort) {
    throw new Error("Los puertos QA del backend y del frontend deben ser distintos.");
  }

  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  return {
    backend: { name: "backend", port: backendPort },
    frontend: { name: "frontend", port: frontendPort },
    backendUrl,
    frontendUrl,
  };
}

/**
 * @param {string} name
 * @param {string | undefined} value
 * @param {number} defaultPort
 * @returns {number}
 */
function parsePort(name, value, defaultPort) {
  if (value === undefined || value.trim() === "") return defaultPort;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} debe ser un puerto entero entre 1024 y 65535.`);
  }
  return port;
}

/** @param {QaPort[]} ports */
export async function assertPortsAvailable(ports) {
  for (const { name, port } of ports) {
    await assertPortAvailable(name, port);
  }
}

/**
 * @param {string} name
 * @param {number} port
 */
function assertPortAvailable(name, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (/** @type {NodeJS.ErrnoException} */ error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`El puerto QA ${name} ${port} ya está en uso.`));
      } else {
        reject(error);
      }
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close((/** @type {Error | undefined} */ error) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    });
  });
}

/**
 * @param {NodeJS.ProcessEnv} source
 * @returns {NodeJS.ProcessEnv}
 */
function safeChildEnvironment(source) {
  const entries = Object.entries(source).filter(([name]) => {
    if (SENSITIVE_ENVIRONMENT_NAME.test(name)) return false;
    return !name.startsWith("VITE_");
  });
  return Object.fromEntries(entries);
}

/**
 * @param {{source: NodeJS.ProcessEnv, runDirectory: string, backendUrl: string, frontendUrl: string, secretKey: string}} options
 * @returns {NodeJS.ProcessEnv}
 */
export function createBackendEnvironment({ source, runDirectory, backendUrl, frontendUrl, secretKey }) {
  const databasePath = `${runDirectory}/studyai.sqlite3`.replace(/\\/g, "/");
  return {
    ...safeChildEnvironment(source),
    APP_ENV: "qa",
    ANTHROPIC_API_KEY: "",
    // The included free-tier AI must never reach a QA run: no network, no quota.
    DEEPSEEK_API_KEY: "",
    CORS_ORIGINS: frontendUrl,
    DATABASE_URL: `sqlite:///${databasePath}`,
    CHROMA_PERSIST_DIR: `${runDirectory}/chroma`,
    UPLOAD_DIR: `${runDirectory}/uploads`,
    SECRET_KEY: secretKey,
    OLLAMA_BASE_URL: "http://127.0.0.1:9",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    PYTHONUNBUFFERED: "1",
    STUDYAI_QA_API_URL: backendUrl,
  };
}

/**
 * @param {{source: NodeJS.ProcessEnv, backendUrl: string, frontendUrl: string, reportDirectory: string}} options
 * @returns {NodeJS.ProcessEnv}
 */
export function createTestEnvironment({ source, backendUrl, frontendUrl, reportDirectory }) {
  return {
    ...safeChildEnvironment(source),
    VITE_API_URL: backendUrl,
    STUDYAI_QA_API_URL: backendUrl,
    STUDYAI_QA_FRONTEND_URL: frontendUrl,
    STUDYAI_QA_REPORT_DIR: reportDirectory,
  };
}

/**
 * @param {string} url
 * @param {{timeoutMs?: number, isProcessRunning?: () => boolean}} [options]
 * @returns {Promise<HttpResult>}
 */
export async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const isProcessRunning = options.isProcessRunning ?? (() => true);
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "sin respuesta HTTP";

  while (Date.now() < deadline) {
    if (!isProcessRunning()) {
      throw new Error(`El proceso terminó antes de estar disponible ${new URL(url).pathname}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const body = response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : undefined;
      if (response.ok) return { status: response.status, body };
      lastFailure = `HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.name : "error de red";
    }
    await delay(READY_POLL_INTERVAL_MS);
  }

  throw new Error(`Tiempo agotado esperando ${new URL(url).pathname} (${lastFailure}).`);
}

/**
 * @param {string} collectionDirectory
 * @returns {Promise<"absent" | "ready" | "invalid">}
 */
export async function getBrunoCollectionState(collectionDirectory) {
  let entries;
  try {
    entries = await readdir(collectionDirectory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "absent";
    throw error;
  }
  const manifests = new Set(["bruno.json", "opencollection.yml"]);
  if (!entries.some((entry) => entry.isFile() && manifests.has(entry.name))) return "invalid";

  let environmentEntries;
  try {
    environmentEntries = await readdir(join(collectionDirectory, "environments"), { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "invalid";
    throw error;
  }
  const hasQaEnvironment = environmentEntries.some((entry) => entry.isFile() && entry.name === "qa.bru");
  if (!hasQaEnvironment) return "invalid";

  return (await getBrunoRequestPaths(collectionDirectory)).length > 0 ? "ready" : "invalid";
}

/**
 * Return the HTTP request paths that Bruno 4.2.0 will report for the smoke folder.
 * Bruno strips `.bru` from the `result.path` field in its JSON reporter.
 *
 * @param {string} collectionDirectory
 * @returns {Promise<string[]>}
 */
export async function getBrunoRequestPaths(collectionDirectory) {
  const smokeDirectory = join(collectionDirectory, "smoke");
  /** @type {string[]} */
  const requestPaths = [];
  await collectBrunoRequestPaths(smokeDirectory, collectionDirectory, requestPaths);
  return requestPaths.sort();
}

/**
 * @param {string} currentDirectory
 * @param {string} collectionDirectory
 * @param {string[]} requestPaths
 */
async function collectBrunoRequestPaths(currentDirectory, collectionDirectory, requestPaths) {
  let entries;
  try {
    entries = await readdir(currentDirectory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = join(currentDirectory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "environments" || entry.name === ".git" || entry.name === "node_modules") continue;
      await collectBrunoRequestPaths(entryPath, collectionDirectory, requestPaths);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".bru") || entry.name === "collection.bru" || entry.name === "folder.bru") {
      continue;
    }
    const contents = await readFile(entryPath, "utf8");
    if (hasBrunoHttpRequest(contents)) {
      requestPaths.push(relative(collectionDirectory, entryPath).replace(/\\/g, "/").replace(/\.bru$/i, ""));
    }
  }
}

/**
 * Bruno HTTP requests use a method block and a non-empty `url` field. Searching
 * only within that block avoids treating comments or collection metadata as a
 * runnable request.
 *
 * @param {string} contents
 * @returns {boolean}
 */
function hasBrunoHttpRequest(contents) {
  const lines = contents.split(/\r?\n/);
  const methodBlock = /^\s*(get|post|put|patch|delete|head|options)\s*\{\s*$/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (!methodBlock.test(lines[index])) continue;

    for (let requestLine = index + 1; requestLine < lines.length; requestLine += 1) {
      const line = lines[requestLine];
      if (/^\s*}\s*$/.test(line) || methodBlock.test(line)) break;
      if (/^\s*url:\s*\S/.test(line)) return true;
    }
  }
  return false;
}

/** @param {"absent" | "ready" | "invalid"} state */
export function getApiCoverageMode(state) {
  if (state === "ready") return "bruno-collection-plus-health-runtime";
  if (state === "absent") return "provisional-health-runtime-only-a04-pending";
  return "invalid-bruno-collection-configuration";
}

/**
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessTreeRunning(pid) {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, 0);
    return true;
  } catch (error) {
    const errorCode = error instanceof Error && "code" in error ? error.code : undefined;
    return errorCode !== "ESRCH";
  }
}

/**
 * @param {number} pid
 * @param {NodeJS.Signals} signal
 */
async function signalProcessTree(pid, signal) {
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
    } catch (error) {
      const errorCode = error instanceof Error && "code" in error ? error.code : undefined;
      if (errorCode !== "ESRCH") throw error;
    }
    return;
  }

  const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise((resolve) => {
    killer.once("error", () => resolve(undefined));
    killer.once("close", () => resolve(undefined));
  });
}

/**
 * Stop a detached process group and its descendants. Callers must start the process
 * with `detached: true` on POSIX so the negative PID targets only its process group.
 *
 * @param {number | undefined} pid
 * @returns {Promise<boolean>} whether the process tree is confirmed stopped
 */
export async function terminateProcessTree(pid) {
  if (!pid || !isProcessTreeRunning(pid)) return true;

  await signalProcessTree(pid, "SIGTERM");
  if (await waitForProcessTreeExit(pid, PROCESS_GRACE_PERIOD_MS)) return true;

  await signalProcessTree(pid, "SIGKILL");
  return waitForProcessTreeExit(pid, PROCESS_KILL_TIMEOUT_MS);
}

/**
 * @param {number} pid
 * @param {number} timeoutMs
 */
async function waitForProcessTreeExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessTreeRunning(pid)) return true;
    await delay(READY_POLL_INTERVAL_MS);
  }
  return !isProcessTreeRunning(pid);
}
