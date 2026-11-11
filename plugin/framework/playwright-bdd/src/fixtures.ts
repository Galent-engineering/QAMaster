import fs from 'node:fs';
import { test as base, createBdd } from 'playwright-bdd';
import { parseAllow, watchApp } from './app-errors';
import { type Cleanup, createCleanup } from './cleanup';

/**
 * Fixtures every step definition can ask for. Add one per shared helper; page objects are created in the steps that
 * use them, from src/web/pages.
 *
 * appErrors runs in every case (Q53): a 5xx answer from the app or an uncaught page error fails the case even when
 * every step passed, with the request, status and body (or the error) in the failure and in app-errors.json. The gate's
 * allowErrors list (config/qamaster.json) names what to ignore: a string found in the request's URL or the error's
 * message. The app's origins are baseURL and the API's (API_BASE_URL, else apiUrl in app.json); a request to them that
 * got no answer counts too, except net::ERR_ABORTED. app-errors.ts is QAMaster's file: `qam app create` replaces it
 * when it differs from the template, so keep your own helpers in other files.
 *
 * cleanup (Q58) is how a step undoes the data it creates: `cleanup.add('todo "Buy milk"', () => deleteTodo(id))`
 * right after the create. The undos run when the case ends; one that fails fails the case with "left data on the test
 * account: <label>" and cleanup.json attached. See src/cleanup.ts.
 */
export const test = base.extend<{ appErrors: void; cleanup: Cleanup }>({
  cleanup: async ({}, use, testInfo) => {
    const cleanup = createCleanup();
    await use(cleanup);
    const results = await cleanup.run();
    const failure = cleanup.describe(results);
    if (!failure) return;
    const file = testInfo.outputPath('cleanup.json');
    fs.writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
    await testInfo.attach('cleanup', { path: file, contentType: 'application/json' });
    throw new Error(failure);
  },
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
