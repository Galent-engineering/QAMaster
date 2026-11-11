/**
 * 0.8.0 item 11 (Q58, D2): a @signed-in scenario signs in through a framework hook with the account in the QA .env.
 * accountFrom() is driven from a copy of src/web/session.ts; the hook runs end to end under real Playwright against a
 * small app with a sign-in form (skipped when the packages or Chromium aren't there).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { accountEnvForScripts } from '../plugin/src/gate/automate.mts';
import { FRAMEWORK, installedFramework, write } from './framework-e2e.mts';
import { tmpDir } from './tmp.mts';

const copy = path.join(tmpDir('qam-session-'), 'session.mts');
fs.copyFileSync(path.join(FRAMEWORK, 'src/web/session.ts'), copy);
const { accountFrom } = (await import(copy)) as {
  accountFrom(env: Record<string, string | undefined>): string | Record<string, string>;
};
const SECRET = 'pw-secret-4417';

test('accountFrom reads the account by the names the runner passes, and names what is missing without a value', () => {
  const ok = accountFrom({
    QAMASTER_LOGIN_USER_VAR: 'TODO_USER',
    QAMASTER_LOGIN_PASSWORD_VAR: 'TODO_PASSWORD',
    QAMASTER_LOGIN_URL: '/signin',
    TODO_USER: 'tester',
    TODO_PASSWORD: SECRET,
  });
  assert.deepEqual(ok, {
    userVar: 'TODO_USER',
    passwordVar: 'TODO_PASSWORD',
    user: 'tester',
    password: SECRET,
    loginUrl: '/signin',
  });
  const noPassword = accountFrom({
    QAMASTER_LOGIN_USER_VAR: 'TODO_USER',
    QAMASTER_LOGIN_PASSWORD_VAR: 'TODO_PASSWORD',
    TODO_USER: 'tester',
  });
  assert.match(String(noPassword), /TODO_PASSWORD is not in the QA project's \.env/);
  assert.doesNotMatch(String(noPassword), /tester/);
  assert.match(String(accountFrom({})), /Run it with qam/);
});

test('accountEnvForScripts passes the two named variables and their names, from the QA .env', () => {
  const dir = tmpDir('qam-acct-env-');
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  const dsm = (login: object) =>
    fs.writeFileSync(path.join(dir, 'config/dsm-config.json'), JSON.stringify({ application: { login } }));
  const names = { username_env: 'TODO_USER', password_env: 'TODO_PASSWORD' };
  dsm({ mode: 'auto', url: '/signin', ...names });
  assert.deepEqual(accountEnvForScripts(dir, { TODO_USER: 'u', TODO_PASSWORD: 'p', OTHER: 'x' }), {
    QAMASTER_LOGIN_USER_VAR: 'TODO_USER',
    QAMASTER_LOGIN_PASSWORD_VAR: 'TODO_PASSWORD',
    QAMASTER_LOGIN_URL: '/signin',
    TODO_USER: 'u',
    TODO_PASSWORD: 'p',
  });
  assert.deepEqual(accountEnvForScripts(dir, { TODO_USER: 'u' }), {
    QAMASTER_LOGIN_USER_VAR: 'TODO_USER',
    QAMASTER_LOGIN_PASSWORD_VAR: 'TODO_PASSWORD',
    QAMASTER_LOGIN_URL: '/signin',
    TODO_USER: 'u',
  });
  dsm({ mode: 'none', ...names });
  assert.deepEqual(accountEnvForScripts(dir, { TODO_USER: 'u', TODO_PASSWORD: 'p' }), {}, 'no sign-in: nothing passed');
  dsm({ mode: 'auto' });
  assert.deepEqual(accountEnvForScripts(dir, {}), {});
});

const APP_SERVER = `
const http = require('node:http');
const [USER, PASS] = [process.argv[1], process.argv[2]];
const form = (msg) => '<h1>Please sign in</h1><p>' + msg + '</p><form method="post" action="/login"><input name="email" type="text"><input name="password" type="password"><button type="submit">Sign in</button></form>';
const server = http.createServer((req, res) => {
  const signedIn = /sid=ok/.test(req.headers.cookie || '');
  if (req.method === 'POST' && req.url === '/login') {
    let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
      const p = new URLSearchParams(body);
      if (p.get('email') === USER && p.get('password') === PASS) { res.writeHead(302, { 'set-cookie': 'sid=ok; Path=/', location: '/todo' }); return res.end(); }
      res.end(form('wrong account'));
    });
    return;
  }
  res.setHeader('content-type', 'text/html');
  if (req.url === '/todo') return res.end(signedIn ? '<h1>Your todos</h1>' : form(''));
  res.end(signedIn ? '<h1>Home</h1>' : form(''));
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`;

test('end to end: @signed-in signs in before the scenario, @signed-out does not, and a wrong account fails without showing it', async (t) => {
  const dir = installedFramework('qam-session-e2e-');
  if (!dir) return t.skip('@playwright/test, playwright-bdd or Chromium not available offline');
  const server = spawn(process.execPath, ['-e', APP_SERVER, 'tester', SECRET], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => server.kill());
  const [port] = (await once(server.stdout, 'data')).map((d: Buffer) => d.toString().trim());
  write(dir, {
    'app.json': JSON.stringify({ name: 'Shop', webUrl: `http://127.0.0.1:${port}` }),
    'features/web/session.feature': `@web
Feature: Session

  @TC-1 @signed-in
  Scenario: Signed in sees the list
    Given I open the path "/todo"
    Then I should see the text "Your todos"

  @TC-2 @signed-out
  Scenario: Signed out sees the sign-in form
    Given I open the path "/todo"
    Then I should see the text "Please sign in"
`,
  });
  const { PlaywrightBddRunner } = await import('../plugin/src/adapters/runner-bdd.mts');
  const selection = new Map([
    [1, ['bdd:@TC-1']],
    [2, ['bdd:@TC-2']],
  ]);
  const account = (password: string) => ({
    QAMASTER_LOGIN_USER_VAR: 'SHOP_USER',
    QAMASTER_LOGIN_PASSWORD_VAR: 'SHOP_PASSWORD',
    SHOP_USER: 'tester',
    SHOP_PASSWORD: password,
  });
  const good = await new PlaywrightBddRunner('npx', [], account(SECRET)).run(selection, dir, path.join(dir, 'ev1'));
  assert.deepEqual(
    good.map((r) => r.status),
    ['passed', 'passed'],
    good.map((r) => r.error).join('\n'),
  );
  const bad = await new PlaywrightBddRunner('npx', [], account('not-the-password')).run(
    selection,
    dir,
    path.join(dir, 'ev2'),
  );
  assert.equal(bad[0].status, 'failed');
  assert.match(bad[0].error ?? '', /Still on the sign-in form after signing in with SHOP_USER and SHOP_PASSWORD/);
  assert.doesNotMatch(bad[0].error ?? '', /not-the-password|tester/);
  assert.equal(bad[1].status, 'passed', 'a signed-out scenario never signs in');
});
