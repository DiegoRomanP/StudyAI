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
    include: ["src/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    // Tests never depend on a developer's .env: without these the login activates and the suite breaks.
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
  },
});
