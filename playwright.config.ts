import { defineConfig, devices } from '@playwright/test'

// Mocked-RPC UI e2e. Standardised on Playwright (robust; replaces the former
// Cypress mocked suite, which exits SIGILL in the sandbox). The app is built with
// VITE_E2E=1 so main.ts registers the mock wallet + fetch mock (tree-shaken from
// prod). Real-chain e2e stays in scripts/e2e-deploy.mjs (npm run e2e:localnet…).
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run build:e2e && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
})
