import { defineConfig } from "@playwright/test";

const PORT = 3100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/yardstick_e2e";

/**
 * End to end against a real server and a real database, on its own port and its own
 * database so a run can never touch development data.
 */
process.env.DATABASE_URL = DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  // localhost, not 127.0.0.1: `next dev` treats a different host as a cross-origin
  // request and answers /_next/* with 403, so nothing hydrates and only the
  // progressively-enhanced form posts work.
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    /**
     * Dev locally for the fast loop, a real build in CI.
     *
     * These are not the same runtime. A revoked portal link kept returning 200 for about
     * a third of a second under `next dev`, which is a stale render the dev server serves
     * and production does not: against `next start` the same link 404s in 54ms, every
     * time. A suite that only ever runs against dev can fail for reasons production will
     * never have, and pass for reasons production will never share, so the gate runs
     * against what Railway actually runs.
     */
    command: process.env.CI
      ? `next build && next start --port ${PORT}`
      : `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
    env: {
      DATABASE_URL,
      BETTER_AUTH_SECRET: "e2e-secret-that-is-long-enough-to-pass-validation",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
