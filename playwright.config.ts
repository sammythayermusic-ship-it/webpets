// Playwright: browser-mode smoke + the Phase 0 acceptance recording (Blueprint section 12, contract
// "Acceptance script notes"). Runs against `vite preview` (the built `dist/`), so `npm run build` first.
// Videos land in test-results/<test>/video.webm.

import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_SCALE, windowSizeForScale } from './src/sim/constants';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
/** Contract window size at the scale the app boots at (M = 688x528). Derived, never re-hardcoded. */
const VIEWPORT = windowSizeForScale(DEFAULT_SCALE);

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
      use: {
        ...devices['Desktop Chrome'],
        viewport: VIEWPORT,
        // Headless Chromium renders WebGL in software (SwiftShader) unless told otherwise, and the
        // live bowl (a full-canvas water pass and a lit fish) runs at ~1 fps there, so every
        // wall-clock wait in the suite timed out. ANGLE on Metal is the GPU path the packaged app
        // uses anyway: measured 60 fps headless on the M4.
        launchOptions: { args: ['--use-angle=metal'] },
      },
    },
  ],
});
