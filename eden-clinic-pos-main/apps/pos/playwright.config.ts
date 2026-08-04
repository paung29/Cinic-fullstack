import { defineConfig } from '@playwright/test';

// This repository deliberately has no "type": "module" declaration, so Playwright loads this TS config as CommonJS.
const appRoot = __dirname;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  workers: 1,
  webServer: [
    {
      command: 'node ../../mock/mock-server.mjs',
      cwd: appRoot,
      env: { ...process.env, PORT: '4010', NEXT_PUBLIC_EDEN_API_BASE_URL: 'http://127.0.0.1:4010' },
      url: 'http://127.0.0.1:4010/health',
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node tests/e2e/static-server.mjs --root out --port 4173',
      url: 'http://127.0.0.1:4173',
      cwd: appRoot,
      env: { ...process.env, NEXT_PUBLIC_EDEN_API_BASE_URL: 'http://127.0.0.1:4010' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: 'node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 4174',
      url: 'http://127.0.0.1:4174',
      cwd: appRoot,
      env: { ...process.env, NEXT_PUBLIC_EDEN_API_BASE_URL: 'http://127.0.0.1:4010' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'e2e-export',
      testMatch: /.*\.export\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'e2e-dev-locales',
      testMatch: /.*\.locales\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1280, height: 800 } },
    },
  ],
});
