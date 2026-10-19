import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// E2E runs its own API and web server on separate ports against a throwaway store, so it never
// touches real data or a running `pnpm dev`.
const API_PORT = '4318';
const WEB_PORT = '5174';
const dataDir = mkdtempSync(join(tmpdir(), 'finapp-e2e-'));
const env = { FINAPP_DATA_DIR: dataDir, FINAPP_PORT: API_PORT, FINAPP_WEB_PORT: WEB_PORT };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @finapp/api start',
      url: `http://127.0.0.1:${API_PORT}/api/session`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @finapp/web dev',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
