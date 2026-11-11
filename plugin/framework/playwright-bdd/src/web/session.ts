/**
 * Q58: a scenario tagged @signed-in starts with the test account signed in. steps/shared/session.steps.ts runs
 * signIn() before it. The account is the one in the QA project's .env: QAMaster's runner passes the two variables named
 * by login.username_env / login.password_env in config/dsm-config.json (with their values), and QAMASTER_LOGIN_USER_VAR /
 * QAMASTER_LOGIN_PASSWORD_VAR holding those names, plus QAMASTER_LOGIN_URL when login.url is set. No value is ever put
 * in a message. Nothing here imports Playwright at run time: it takes anything shaped like a page.
 */
import type { Page } from '@playwright/test';

export type Account = { userVar: string; passwordVar: string; user: string; password: string; loginUrl?: string };
type Env = Record<string, string | undefined>;

/** The account from the environment, or a message that says which variable is missing (names only). */
export function accountFrom(env: Env): Account | string {
  const userVar = env.QAMASTER_LOGIN_USER_VAR;
  const passwordVar = env.QAMASTER_LOGIN_PASSWORD_VAR;
  if (!userVar || !passwordVar)
    return 'A @signed-in scenario needs the test account, and this run has no account names. Run it with qam (the gate does), or set QAMASTER_LOGIN_USER_VAR and QAMASTER_LOGIN_PASSWORD_VAR to the names of the two variables that hold the account.';
  const missing = [userVar, passwordVar].filter((n) => !env[n]);
  if (missing.length)
    return `The test account isn't set: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not in the QA project's .env.`;
  return {
    userVar,
    passwordVar,
    user: env[userVar] as string,
    password: env[passwordVar] as string,
    ...(env.QAMASTER_LOGIN_URL ? { loginUrl: env.QAMASTER_LOGIN_URL } : {}),
  };
}

const PASSWORD = 'input[type="password"]';
const USERNAME =
  'input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[type="text"]';
const SUBMIT = /sign[ -]?in|log[ -]?in|submit|continue/i;

/**
 * Signs the page in: opens the sign-in page (login.url when set, else the app's start page if it shows a sign-in form,
 * else /login), fills the first username-like field and the password field, submits, and waits for the form to go.
 */
export async function signIn(page: Page, account: Account): Promise<void> {
  const password = page.locator(PASSWORD).first();
  const showsForm = (wait: number) =>
    password.waitFor({ state: 'visible', timeout: wait }).then(
      () => true,
      () => false,
    );
  await page.goto(account.loginUrl ?? '/');
  if (!(await showsForm(account.loginUrl ? 8000 : 3000)) && !account.loginUrl) {
    await page.goto('/login');
    await showsForm(8000);
  }
  if (!(await password.isVisible()))
    throw new Error(
      "Couldn't find a sign-in form to sign the test account in. Set login.url in config/dsm-config.json to the sign-in page.",
    );
  await page.locator(USERNAME).first().fill(account.user);
  await password.fill(account.password);
  const button = page.getByRole('button', { name: SUBMIT }).first();
  if (await button.count()) await button.click();
  else await password.press('Enter');
  try {
    await password.waitFor({ state: 'hidden', timeout: 10000 });
  } catch {
    throw new Error(
      `Still on the sign-in form after signing in with ${account.userVar} and ${account.passwordVar}: check that the account in the QA project's .env is right for this app.`,
    );
  }
}
