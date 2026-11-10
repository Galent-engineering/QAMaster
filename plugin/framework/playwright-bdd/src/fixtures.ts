import fs from 'node:fs';
import { test as base, createBdd } from 'playwright-bdd';
import { parseAllow, watchApp } from './app-errors';

/**
 * Fixtures every step definition can ask for. Add one per shared helper; page objects are created in the steps that
 * use them, from src/web/pages.
 *
 * appErrors runs in every case (Q53): a 5xx answer from the app or an uncaught page error fails the case even when
 * every step passed, with the request, status and body (or the error) in the failure and in app-errors.json. The gate's
 * allowErrors list (config/qamaster.json) names what to ignore: a string found in the request's URL or the error's
 * message. Only answers from the app's own origin (baseURL) are watched.
 */
export const test = base.extend<{ appErrors: void }>({
  appErrors: [
    async ({ page, baseURL }, use, testInfo) => {
      const origins = baseURL ? [new URL(baseURL).origin] : [];
      const watch = watchApp(page, origins, parseAllow(process.env.QAMASTER_ALLOW_ERRORS));
      await use();
      const errors = await watch.finish();
      if (!errors.length) return;
      const file = testInfo.outputPath('app-errors.json');
      fs.writeFileSync(file, `${JSON.stringify(errors, null, 2)}\n`);
      await testInfo.attach('app-errors', { path: file, contentType: 'application/json' });
      const what = errors.length === 1 ? 'an error' : 'errors';
      throw new Error(`The app reported ${what} during this case:\n${watch.describe(errors)}`);
    },
    { auto: true },
  ],
});
export const { Given, When, Then } = createBdd(test);
export { expect } from '@playwright/test';
