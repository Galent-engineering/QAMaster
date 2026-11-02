import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// app.json is written by `qam app create`; WEB_BASE_URL overrides it (another environment)
const app = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8')) as { name: string; webUrl: string };

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts', 'src/fixtures.ts'],
});

export default defineConfig({
  testDir,
  outputDir: 'test-results',
  // retries belong to QAMaster's gate, which retries a failed case once and calls a pass on retry flaky
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_BASE_URL || app.webUrl,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
