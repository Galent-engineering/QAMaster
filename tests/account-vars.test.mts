/**
 * Q57 (0.7.2 item 14): qam app create and qam automate stop when the test account's variables, named by
 * login.username_env and login.password_env in config/dsm-config.json, are not set in the QA project's .env. Names only:
 * a value never reaches the message.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { accountVarsMissing, requireAccountVars } from '../plugin/src/gate/automate.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const SECRET = 'hunter2-test-value';

function qaProject(login: unknown, dotenv = ''): string {
  const dir = tmpDir('qam-acct-');
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  const dsm = login === undefined ? { application: {} } : { application: { login } };
  fs.writeFileSync(path.join(dir, 'config', 'dsm-config.json'), JSON.stringify(dsm));
  fs.writeFileSync(
    path.join(dir, 'config', 'qamaster.json'),
    JSON.stringify({ app: { name: 'Todo App', url: 'http://localhost:3000' } }),
  );
  if (dotenv) fs.writeFileSync(path.join(dir, '.env'), dotenv);
  return dir;
}
const LOGIN = { mode: 'auto', username_env: 'TODOAPP_USER', password_env: 'TODOAPP_PASSWORD' };

test('no login block: nothing to check', () => {
  const dir = qaProject(undefined);
  assert.deepEqual(accountVarsMissing(dir, {}), []);
  assert.doesNotThrow(() => requireAccountVars(dir, {}));
});

test('a login block with both names set in the environment passes', () => {
  const dir = qaProject(LOGIN);
  const env = { TODOAPP_USER: 'u', TODOAPP_PASSWORD: SECRET };
  assert.deepEqual(accountVarsMissing(dir, env), []);
  assert.doesNotThrow(() => requireAccountVars(dir, env));
});

test('an empty value counts as missing', () => {
  const dir = qaProject(LOGIN);
  assert.deepEqual(accountVarsMissing(dir, { TODOAPP_USER: 'u', TODOAPP_PASSWORD: '' }), ['TODOAPP_PASSWORD']);
});

test('missing names stop with one message that names them and never a value', () => {
  const dir = qaProject(LOGIN);
  const env = { TODOAPP_USER: SECRET };
  assert.throws(
    () => requireAccountVars(dir, env),
    (e: unknown) => {
      assert.ok(e instanceof BlockedError);
      assert.match(e.message, /TODOAPP_PASSWORD/);
      assert.doesNotMatch(e.message, /TODOAPP_USER/);
      assert.doesNotMatch(e.message, new RegExp(SECRET));
      assert.match(e.message, /\.env/);
      return true;
    },
  );
});

test('qam app create stops with the names, exit 2, and writes no folder', () => {
  const dir = qaProject(LOGIN, 'TODOAPP_USER=some-user-value\n');
  const env: Record<string, string | undefined> = { ...process.env, QAMASTER_HOME: tmpDir('qam-home-') };
  delete env.TODOAPP_USER;
  delete env.TODOAPP_PASSWORD;
  const r = spawnSync(QAM, ['--repo', dir, 'app', 'create'], { encoding: 'utf8', env });
  assert.equal(r.status, 2, r.stderr + r.stdout);
  assert.match(r.stderr, /TODOAPP_PASSWORD/);
  assert.doesNotMatch(r.stderr + r.stdout, /some-user-value/);
  assert.equal(fs.existsSync(path.join(dir, 'TodoApp')), false);
});
