import { defineConfig, devices } from "@playwright/test";

// Own ports, so `pnpm e2e` never touches the normal dev servers (8787 / 5173).
export const API_PORT = 8788;
export const WEB_PORT = 5174;

// One seed for the whole run: every worker has to see the same S40 title.
process.env.E2E_SEED ??= String(Date.now() % 100000);

export default defineConfig({
  testDir: "./scenarios",
  // Each scenario makes its own party, so they can run side by side.
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 3),
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "en-US",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      // The API with the short timers on (E2E_FAST) and its own throw-away state.
      command: `pnpm --filter @karaoke-tube/api exec wrangler dev --port ${API_PORT} --inspector-port 9330 --var E2E_FAST:1 --var ACCOUNTS_ENABLED:true --persist-to .wrangler/e2e`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: `VITE_ACCOUNTS=1 API_PORT=${API_PORT} pnpm --filter @karaoke-tube/web exec vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
});
