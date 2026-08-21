import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-logic unit tests only — no Postgres/Supabase involved. See
// supabase/tests/README.md for why the RLS/masking test suite lives
// separately as pgTAP specs instead of here: this repo has never had
// Docker/a real Postgres connection available to run against.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
