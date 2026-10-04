import { defineConfig, devices } from '@playwright/test';

// E2E_URL targets a deployed build (e.g. https://houserengineering.github.io/site-eval/); default is a local preview.
const url = process.env.E2E_URL ?? 'http://localhost:4173/site-eval/';
export const SIGNED_IN = { name: 'site-eval:google-user', value: JSON.stringify({ email: 'test@houserengineering.com', name: 'Test User', signedInAt: '2026-10-04T00:00:00Z' }) };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: url,
    serviceWorkers: 'allow',
    // Signed in with Google (the gate; e2e/signin.spec.ts starts signed out). The demo runs on a device's first
    // launch; only e2e/demo.spec.ts starts without demo-done.
    storageState: { cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [SIGNED_IN, { name: 'site-eval:demo-done', value: '1' }] }] },
  },
  outputDir: 'test-results',
  webServer: process.env.E2E_URL
    ? undefined
    : { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url, reuseExistingServer: true, timeout: 180_000 },
});
