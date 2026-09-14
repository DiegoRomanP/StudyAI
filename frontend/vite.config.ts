import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Dev server on 5173 (matches the backend CORS default).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
