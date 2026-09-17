// Playwright: browser-mode smoke + the Phase 0 acceptance recording (Blueprint section 12, contract
// "Acceptance script notes"). Runs against `vite preview` (the built `dist/`), so `npm run build` first.
// Videos land in test-results/<test>/video.webm.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
/** Contract window size for scale 3 (M): (160*3 + 48) x (120*3 + 48). */
const VIEWPORT = { width: 528, height: 408 };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    video: 'on',
    viewport: VIEWPORT,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
  ],
});
