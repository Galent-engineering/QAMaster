/** 0.8.0 item 12 (Q58, Q57 as amended): the account lives only in the QA project's .env; .env.dsm is moved, never read. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { accountInOldFile, crawlEnv, moveAccount, requireAccountVars } from '../plugin/src/gate/automate.mts';
import { accountPrefix } from '../plugin/src/pipeline/setup.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const SECRET = 'pw-never-printed-9137';
const LOGIN = { mode: 'auto', username_env: 'TODOAPP_USER', password_env: 'TODOAPP_PASSWORD' };

function legacy(dsmEnv: string, dotenv = '', secretsFile?: string): string {
  const dir = tmpDir('qam-acct080-');
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config', 'dsm-config.json'),
    JSON.stringify({ application: { ...(secretsFile ? { secrets_file: secretsFile } : {}), login: LOGIN } }),
  );
  fs.writeFileSync(path.join(dir, secretsFile ?? '.env.dsm'), dsmEnv);
  if (dotenv) fs.writeFileSync(path.join(dir, '.env'), dotenv);
  return dir;
}
const OLD = `# the crawl's account\nTODOAPP_USER=tester\nTODOAPP_PASSWORD=${SECRET}\nOTHER=keep\n`;
const run = (dir: string, ...a: string[]) =>
  spawnSync(QAM, ['--repo', dir, ...a], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: tmpDir('qam-home-'), TODOAPP_USER: '', TODOAPP_PASSWORD: '' },
  });

test('a project that keeps the account in .env.dsm is told the two lines to move, with no value', () => {
  const dir = legacy(OLD);
  assert.deepEqual(accountInOldFile(dir, {}), ['TODOAPP_USER', 'TODOAPP_PASSWORD']);
  assert.throws(
    () => requireAccountVars(dir, {}),
    (e: unknown) => {
      assert.ok(e instanceof BlockedError);
      assert.match(e.message, /TODOAPP_USER and TODOAPP_PASSWORD lines from \.env\.dsm to the QA project's \.env/);
      assert.match(e.message, /qam setup --move-account/);
      assert.doesNotMatch(e.message, new RegExp(`${SECRET}|tester`));
      return true;
    },
  );
});

test('moveAccount copies the two lines to .env, removes them from .env.dsm and returns names only', () => {
  const dir = legacy(OLD, 'KEEP=1');
  assert.deepEqual(moveAccount(dir, {}), ['TODOAPP_USER', 'TODOAPP_PASSWORD']);
  assert.equal(
    fs.readFileSync(path.join(dir, '.env'), 'utf8'),
    `KEEP=1\nTODOAPP_USER=tester\nTODOAPP_PASSWORD=${SECRET}\n`,
  );
  assert.equal(fs.readFileSync(path.join(dir, '.env.dsm'), 'utf8'), "# the crawl's account\nOTHER=keep\n");
  assert.deepEqual(moveAccount(dir, {}), [], 'nothing left to move');
});

test('a name .env already has is not copied again', () => {
  const dir = legacy(OLD, 'TODOAPP_USER=already\n');
  assert.deepEqual(moveAccount(dir, { TODOAPP_USER: 'already' }), ['TODOAPP_PASSWORD']);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), `TODOAPP_USER=already\nTODOAPP_PASSWORD=${SECRET}\n`);
});

test('setup warns without --move-account, and --move-account moves the lines and prints no value', () => {
  const dir = legacy(OLD);
  const warn = run(dir, 'setup', '--no-install');
  assert.match(
    warn.stdout,
    /Warning: The test account \(TODOAPP_USER and TODOAPP_PASSWORD\) is in the old secrets file/,
  );
  assert.equal(fs.existsSync(path.join(dir, '.env')), false, 'nothing moved without the flag');
  const moved = run(dir, 'setup', '--no-install', '--move-account');
  assert.match(moved.stdout, /Test account\s+TODOAPP_USER and TODOAPP_PASSWORD copied/);
  assert.doesNotMatch(moved.stdout + moved.stderr, new RegExp(`${SECRET}|tester`));
  assert.match(fs.readFileSync(path.join(dir, '.env'), 'utf8'), new RegExp(`TODOAPP_PASSWORD=${SECRET}`));
  assert.doesNotMatch(run(dir, 'setup', '--no-install').stdout, /old secrets file/);
});

test('setup --check never moves anything', () => {
  const dir = legacy(OLD);
  run(dir, 'setup', '--check', '--move-account');
  assert.equal(fs.existsSync(path.join(dir, '.env')), false);
  assert.match(fs.readFileSync(path.join(dir, '.env.dsm'), 'utf8'), /TODOAPP_USER/);
});

test('the crawl reads the QA .env; a project that still names a secrets file keeps it working', () => {
  const dir = legacy('OLD_ONLY=x\n', `FROM_ENV=1\nSHARED=env\n`, '.secrets');
  fs.writeFileSync(path.join(dir, '.secrets'), 'FROM_SECRETS=2\nSHARED=secrets\n');
  const env = crawlEnv(dir, '.secrets');
  assert.equal(env.FROM_ENV, '1');
  assert.equal(env.FROM_SECRETS, '2');
  assert.equal(env.SHARED, 'env', '.env wins');
  assert.equal(crawlEnv(dir).FROM_SECRETS, undefined);
});

test('a new project names the account after the app and has no secrets_file', () => {
  assert.equal(accountPrefix('TodoApp'), 'TODOAPP');
  assert.equal(accountPrefix('Todo App'), 'TODOAPP');
  assert.equal(accountPrefix('9lives'), 'APP9LIVES');
  assert.equal(accountPrefix('!!'), 'APP');
  const dir = tmpDir('qam-acct080-new-');
  const r = run(dir, 'setup', '--no-install', '--app', 'TodoApp');
  assert.equal(r.status, 0, r.stderr);
  const dsm = JSON.parse(fs.readFileSync(path.join(dir, 'config/dsm-config.json'), 'utf8')).application;
  assert.equal(dsm.login.username_env, 'TODOAPP_USER');
  assert.equal(dsm.login.password_env, 'TODOAPP_PASSWORD');
  assert.equal('secrets_file' in dsm, false);
});
