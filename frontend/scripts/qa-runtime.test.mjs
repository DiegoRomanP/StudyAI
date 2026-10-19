import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createBackendEnvironment,
  createTestEnvironment,
  getApiCoverageMode,
  getBrunoCollectionState,
  getBrunoRequestPaths,
  getQaConfiguration,
  isProcessTreeRunning,
  parseQaMode,
  terminateProcessTree,
  waitForHttp,
} from "./qa-runtime.mjs";

const frontendDirectory = fileURLToPath(new URL("..", import.meta.url));

test("QA defaults to dedicated ports and rejects a shared port", () => {
  const config = getQaConfiguration({});
  assert.equal(config.backend.port, 8002);
  assert.equal(config.frontend.port, 4173);
  assert.throws(
    () => getQaConfiguration({ STUDYAI_QA_BACKEND_PORT: "4173", STUDYAI_QA_FRONTEND_PORT: "4173" }),
    /deben ser distintos/,
  );
  assert.throws(() => getQaConfiguration({ STUDYAI_QA_BACKEND_PORT: "80" }), /entre 1024 y 65535/);
});

test("QA modes reject unknown commands instead of skipping suites", () => {
  assert.equal(parseQaMode([]), "all");
  assert.equal(parseQaMode(["api"]), "api");
  assert.equal(parseQaMode(["--help"]), "help");
  assert.throws(() => parseQaMode(["missing"]), /Modo QA no válido/);
});

test("backend and test environments override dotenv values and omit inherited credentials", () => {
  const source = {
    PATH: "/usr/bin",
    DATABASE_URL: "sqlite:///development.db",
    CORS_ORIGINS: "http://localhost:5173",
    ANTHROPIC_API_KEY: "never-expose-this",
    OPENAI_API_KEY: "never-expose-this",
    GITHUB_TOKEN: "never-expose-this",
    SECRET_KEY: "never-expose-this",
    VITE_API_URL: "http://localhost:8001",
    VITE_EXAMPLE_SECRET: "never-expose-this",
  };
  const backend = createBackendEnvironment({
    source,
    runDirectory: "/tmp/studyai-qa-run",
    backendUrl: "http://127.0.0.1:8002",
    frontendUrl: "http://127.0.0.1:4173",
    secretKey: "qa-only-random-secret",
  });
  const client = createTestEnvironment({
    source,
    backendUrl: "http://127.0.0.1:8002",
    frontendUrl: "http://127.0.0.1:4173",
    reportDirectory: "/repo/frontend/qa-results/run",
  });

  assert.equal(backend.ANTHROPIC_API_KEY, "");
  assert.equal(backend.DEEPSEEK_API_KEY, "");
  assert.equal(backend.DATABASE_URL, "sqlite:////tmp/studyai-qa-run/studyai.sqlite3");
  assert.equal(backend.UPLOAD_DIR, "/tmp/studyai-qa-run/uploads");
  assert.equal(backend.CHROMA_PERSIST_DIR, "/tmp/studyai-qa-run/chroma");
  assert.equal(backend.CORS_ORIGINS, "http://127.0.0.1:4173");
  assert.equal(backend.SECRET_KEY, "qa-only-random-secret");
  assert.equal(backend.HF_HUB_OFFLINE, "1");
  assert.equal(backend.TRANSFORMERS_OFFLINE, "1");
  assert.equal(client.VITE_API_URL, "http://127.0.0.1:8002");
  assert.equal(client.STUDYAI_QA_FRONTEND_URL, "http://127.0.0.1:4173");
  assert.equal(client.VITE_EXAMPLE_SECRET, undefined);
  assert.equal(JSON.stringify({ backend, client }).includes("never-expose-this"), false);
});

test("API coverage requires the real A04 layout and an executable request inside smoke", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-bruno-state-"));
  const collection = join(temporaryRoot, "bruno");
  try {
    assert.equal(await getBrunoCollectionState(collection), "absent");
    assert.equal(getApiCoverageMode("absent"), "provisional-health-runtime-only-a04-pending");
    await mkdir(collection);
    assert.equal(await getBrunoCollectionState(collection), "invalid");
    await writeFile(join(collection, "bruno.json"), JSON.stringify({ version: "1", name: "smoke", type: "collection" }), "utf8");
    assert.equal(await getBrunoCollectionState(collection), "invalid");

    const environments = join(collection, "environments");
    await mkdir(environments);
    await writeFile(join(environments, "qa.bru"), "vars {\n  baseUrl: http://127.0.0.1:8002\n}\n", "utf8");
    assert.equal(await getBrunoCollectionState(collection), "invalid");

    await writeFile(join(collection, "health.bru"), "get {\n  url: {{baseUrl}}/health\n}\n", "utf8");
    assert.equal(await getBrunoCollectionState(collection), "invalid", "requests outside smoke are not run by `bru run smoke`");

    const smokeDirectory = join(collection, "smoke");
    await mkdir(smokeDirectory);
    const requestPath = join(smokeDirectory, "health.bru");
    await writeFile(requestPath, "get {\n  body: none\n}\n", "utf8");
    assert.equal(await getBrunoCollectionState(collection), "invalid", "an HTTP verb without a URL is not a runnable request");
    await writeFile(requestPath, "# get {\n#   url: {{baseUrl}}/health\n", "utf8");
    assert.equal(await getBrunoCollectionState(collection), "invalid", "commented request syntax is not executable");
    await writeFile(requestPath, "meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/health\n  body: none\n  auth: none\n}\n", "utf8");
    assert.equal(await getBrunoCollectionState(collection), "ready");
    assert.deepEqual(await getBrunoRequestPaths(collection), ["smoke/health"]);
    assert.equal(getApiCoverageMode("ready"), "bruno-collection-plus-health-runtime");
    assert.equal(getApiCoverageMode("invalid"), "invalid-bruno-collection-configuration");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("an OpenCollection manifest is accepted when the rest of the A04 layout is runnable", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-opencollection-state-"));
  const collection = join(temporaryRoot, "bruno");
  try {
    await mkdir(join(collection, "environments"), { recursive: true });
    await mkdir(join(collection, "smoke"));
    await writeFile(join(collection, "opencollection.yml"), "name: StudyAI\nversion: 1\n", "utf8");
    await writeFile(join(collection, "environments", "qa.bru"), "vars {\n  baseUrl: http://127.0.0.1:8002\n}\n", "utf8");
    await writeFile(join(collection, "smoke", "health.bru"), "get {\n  url: {{baseUrl}}/health\n}\n", "utf8");

    assert.equal(await getBrunoCollectionState(collection), "ready");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("the Bruno 4.2.0 CLI executes a synthetic health collection with a valid assertion", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "studyai-bruno-cli-"));
  const collection = join(temporaryRoot, "bruno");
  const reportPath = join(temporaryRoot, "bruno-report.json");
  let requestReceived = false;
  const server = createHttpServer((request, response) => {
    requestReceived = request.method === "GET"
      && request.url === "/health"
      && request.headers["x-qa-secret"] === "secret-header-value";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", secret: "response-body-secret" }));
  });
  server.listen({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const packagePath = join(frontendDirectory, "node_modules", "@usebruno", "cli", "package.json");
    const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
    assert.equal(packageMetadata.version, "4.2.0");
    const executable = typeof packageMetadata.bin === "string" ? packageMetadata.bin : packageMetadata.bin?.bru;
    assert.equal(typeof executable, "string");
    const cliPath = join(dirname(packagePath), executable);
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await mkdir(join(collection, "environments"), { recursive: true });
    await mkdir(join(collection, "smoke"));
    await writeFile(join(collection, "bruno.json"), JSON.stringify({ version: "1", name: "StudyAI QA", type: "collection" }), "utf8");
    await writeFile(join(collection, "environments", "qa.bru"), `vars {\n  baseUrl: ${baseUrl}\n}\n`, "utf8");
    await writeFile(
      join(collection, "smoke", "health.bru"),
      "meta {\n  name: Health\n  type: http\n  seq: 1\n}\n\nget {\n  url: {{baseUrl}}/health\n  body: none\n  auth: none\n}\n\nheaders {\n  X-QA-Secret: secret-header-value\n}\n\nassert {\n  res.status: eq 200\n}\n",
      "utf8",
    );

    const outcome = await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        cliPath,
        "run",
        "smoke",
        "-r",
        "--env",
        "qa",
        "--sandbox",
        "safe",
        "--delay",
        "500",
        "--reporter-json",
        reportPath,
        "--reporter-skip-all-headers",
        "--reporter-skip-body",
      ], { cwd: collection, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
      child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
      child.once("error", (error) => resolve({ code: null, signal: null, error }));
    });

    assert.equal(outcome.code, 0, `${outcome.stdout}\n${outcome.stderr}`);
    assert.equal(outcome.signal, null);
    assert.equal(requestReceived, true, "the selected smoke request must actually reach the HTTP server");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(report.length, 1);
    assert.deepEqual(
      {
        totalRequests: report[0].summary.totalRequests,
        skippedRequests: report[0].summary.skippedRequests,
        totalAssertions: report[0].summary.totalAssertions,
        passedAssertions: report[0].summary.passedAssertions,
        failedAssertions: report[0].summary.failedAssertions,
      },
      { totalRequests: 1, skippedRequests: 0, totalAssertions: 1, passedAssertions: 1, failedAssertions: 0 },
    );
    assert.equal(report[0].results[0].path, "smoke/health");
    assert.equal(report[0].results[0].status, "pass");
    assert.equal(report[0].results[0].assertionResults[0].status, "pass");
    assert.doesNotMatch(JSON.stringify(report), /X-QA-Secret|secret-header-value|response-body-secret/);
  } finally {
    /** @type {Promise<void>} */
    const serverClosed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await serverClosed;
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("HTTP readiness waits for an actual successful response", async () => {
  const server = createHttpServer((_, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  /** @type {Promise<void>} */
  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, resolve);
  });
  await listening;
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const result = await waitForHttp(`http://127.0.0.1:${address.port}/health`, { timeoutMs: 1_000 });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { status: "ok" });
  } finally {
    /** @type {Promise<void>} */
    const closed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await closed;
  }
});

test("process cleanup terminates a detached child process tree", { skip: process.platform === "win32" }, async () => {
  const child = spawn(
    process.execPath,
    ["-e", "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)"],
    { detached: true, stdio: "ignore" },
  );
  await once(child, "spawn");
  assert.ok(child.pid);

  const stopped = await terminateProcessTree(child.pid);
  assert.equal(stopped, true);
  assert.equal(isProcessTreeRunning(child.pid), false);
});
