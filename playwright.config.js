import { defineConfig, devices } from '@playwright/test';

// One end-to-end run of the main flow against a production build, on its own
// database (parallax_e2e, created and emptied by e2e/global-setup.js) and port,
// so it never touches the dev journal or a running `npm run dev`.
const PORT = 3100;
export const E2E_DATABASE_URL = 'postgres://parallax:parallax@localhost:5432/parallax_e2e';
export const E2E_PASSWORD = 'e2e correct horse battery staple';

export default defineConfig({
  testDir: './e2e',
  // Not *.spec.js, which Vitest's unit project would also pick up.
  testMatch: '**/*.e2e.js',
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_PASSWORD: E2E_PASSWORD,
      SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
      // Empty, so the entry's context capture and MAE/MFE fail quietly (logged,
      // left blank) instead of calling Alpaca with the keys in .env.local.
      ALPACA_KEY_ID: '',
      ALPACA_SECRET_KEY: '',
    },
  },
});
