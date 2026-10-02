import { defineConfig, devices } from '@playwright/test';

// E2E_URL targets a deployed build (e.g. https://houserengineering.github.io/site-eval/); default is a local preview.
const url = process.env.E2E_URL ?? 'http://localhost:4173/site-eval/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { ...devices['Pixel 7'], baseURL: url, serviceWorkers: 'allow' },
  outputDir: 'test-results',
  webServer: process.env.E2E_URL
    ? undefined
    : { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url, reuseExistingServer: true, timeout: 180_000 },
});
