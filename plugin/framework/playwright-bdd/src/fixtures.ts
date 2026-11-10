import fs from 'node:fs';
import { test as base, createBdd } from 'playwright-bdd';
import { parseAllow, watchApp } from './app-errors';

/**
 * Fixtures every step definition can ask for. Add one per shared helper; page objects are created in the steps that
 * use them, from src/web/pages.
 *
 * appErrors runs in every case (Q53): a 5xx answer from the app or an uncaught page error fails the case even when
 * every step passed, with the request, status and body (or the error) in the failure and in app-errors.json. The gate's
 * allowErrors list (config/qamaster.json) names what to ignore; QAMASTER_APP_ORIGINS adds origins (comma-separated)
 * when the app's backend is served from another one.
 */
export const test = base.extend<{ appErrors: void }>({
  appErrors: [
    async ({ page, baseURL }, use, testInfo) => {
      const origins = [baseURL, ...(process.env.QAMASTER_APP_ORIGINS ?? '').split(',')]
        .map((u) => u?.trim())
        .filter((u): u is string => !!u)
        .map((u) => new URL(u).origin);
      const watch = watchApp(page, origins, parseAllow(process.env.QAMASTER_ALLOW_ERRORS));
      await use();
      const errors = await watch.finish();
      if (!errors.length) return;
      const file = testInfo.outputPath('app-errors.json');
      fs.writeFileSync(file, `${JSON.stringify(errors, null, 2)}\n`);
      await testInfo.attach('app-errors', { path: file, contentType: 'application/json' });
      throw new Error(`The app reported ${errors.length === 1 ? 'an error' : 'errors'} during this case:\n${watch.describe(errors)}`);
    },
    { auto: true },
  ],
});
export const { Given, When, Then } = createBdd(test);
export { expect } from '@playwright/test';
