import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright is prepared in Phase 0 but the Kern-Flow E2E specs (F1–F7)
 * are written from Phase 2 onwards (SPEC.md §13). Run with `pnpm e2e`.
 * The dev server is started automatically for local runs.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // Mobile-first: the Survey-Runner is used primarily on phones (SPEC.md §5).
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
