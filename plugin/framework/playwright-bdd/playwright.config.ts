import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { defineBddProject } from 'playwright-bdd';

// app.json is written by `qam app create`; WEB_BASE_URL and API_BASE_URL override it (another environment)
const app = JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8')) as {
  name: string;
  webUrl: string;
  apiUrl?: string;
};
const apiUrl = process.env.API_BASE_URL || app.apiUrl;

/** A channel's project exists only when its folder holds a feature, so an empty channel adds nothing to run. */
function hasFeatures(folder: string): boolean {
  const dir = path.join(__dirname, 'features', folder);
  return fs.existsSync(dir) && fs.readdirSync(dir, { recursive: true }).some((f) => String(f).endsWith('.feature'));
}
if (hasFeatures('api') && !apiUrl)
  throw new Error('features/api has scripts but no API base URL: run `qam app create --api-url <URL>`, or set API_BASE_URL.');

const steps = ['steps/**/*.ts', 'src/fixtures.ts'];

/**
 * One Playwright project per channel, each generating its own specs from its own folder: a test case runs in its
 * channel's project and nowhere else.
 *   chromium       features/web          desktop Chrome
 *   api            features/api          no browser; Playwright's request context against the API base URL
 *   mobile-chrome  features/mobile-web   Chromium with a phone's viewport and touch (Pixel 7)
 * The web project is also there while no folder has a feature yet, so a new folder still lists.
 */
export default defineConfig({
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
  projects: [
    ...(hasFeatures('web') || !(hasFeatures('api') || hasFeatures('mobile-web'))
      ? [
          {
            ...defineBddProject({ name: 'chromium', features: 'features/web/**/*.feature', steps }),
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
    ...(hasFeatures('api')
      ? [
          {
            ...defineBddProject({ name: 'api', features: 'features/api/**/*.feature', steps }),
            use: { baseURL: apiUrl, extraHTTPHeaders: { Accept: 'application/json' } },
          },
        ]
      : []),
    ...(hasFeatures('mobile-web')
      ? [
          {
            ...defineBddProject({ name: 'mobile-chrome', features: 'features/mobile-web/**/*.feature', steps }),
            use: { ...devices['Pixel 7'] },
          },
        ]
      : []),
  ],
});
