import { createBdd } from 'playwright-bdd';
import { test } from '../../src/fixtures';
import { accountFrom, signIn } from '../../src/web/session';

// A scenario tagged @signed-in starts with the test account signed in (Q58): TestGen tags a case with its `session`, and
// this hook signs in before the scenario's own steps, Background included. A web or mobile-web scenario only: an API
// scenario has no page. Don't write a sign-in step of your own for it; check-scripts flags a Background that does.
// `test` is the only thing taken from src/fixtures, so a fixtures.ts that exports no Before still works.
const { Before } = createBdd(test);

Before({ tags: '@signed-in and (@web or @mobile-web)' }, async ({ page }) => {
  const account = accountFrom(process.env);
  if (typeof account === 'string') throw new Error(account);
  await signIn(page, account);
});
