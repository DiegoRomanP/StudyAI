import { join } from "node:path";

import { defineConfig } from "@playwright/test";

const reportDirectory = process.env.STUDYAI_QA_REPORT_DIR ?? "qa-results/manual";
const suiteName = process.env.STUDYAI_QA_SUITE ?? "playwright";
const suiteDirectory = join(reportDirectory, suiteName);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: join(suiteDirectory, "test-results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: join(suiteDirectory, "playwright-report"), open: "never" }],
    ["json"],
  ],
  use: {
    baseURL: process.env.STUDYAI_QA_FRONTEND_URL ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "api",
      testMatch: "**/api/**/*.spec.ts",
    },
    {
      name: "e2e",
      testMatch: "**/*.spec.ts",
      testIgnore: "**/api/**/*.spec.ts",
    },
  ],
});
