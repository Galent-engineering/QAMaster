import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { type Env, loadEnv } from '../plugin/src/shared/env.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { asProjectConfig, DEFAULT_PROJECT_CONFIG } from '../plugin/src/shared/schema.mts';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qam-config-'));
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('loadEnv reads values without overriding the shell', () => {
  const file = path.join(tmp(), '.env');
  write(
    file,
    '# comment\nA=plain\nexport B=\'single quoted\'\nC="has = sign"\nEMPTY=\nSHELL_WINS=from-file\nnot a variable\n',
  );
  const env: Env = { SHELL_WINS: 'from-shell' };
  loadEnv(file, env);
  assert.deepEqual(env, { SHELL_WINS: 'from-shell', A: 'plain', B: 'single quoted', C: 'has = sign' });
});

test('loadEnv ignores a missing file', () => {
  const env: Env = {};
  loadEnv(path.join(tmp(), 'nope.env'), env);
  assert.deepEqual(env, {});
});

test('defaults: ado store and requirements, playwright-bdd runner, tests in the repo, AI on', () => {
  const root = tmp();
  const c = loadConfig(root, {});
  assert.deepEqual(
    [c.store, c.requirements, c.runner, c.testRoot, c.qaProject, c.ai],
    ['ado', 'ado', 'playwright-bdd', root, null, 'on'],
  );
  assert.deepEqual(c.project, DEFAULT_PROJECT_CONFIG);
});

test('the repo .env picks adapters and the shell wins over it', () => {
  const root = tmp();
  write(path.join(root, '.env'), 'QAMASTER_RUNNER=pytest\nQAMASTER_STORE=file\n');
  const c = loadConfig(root, { QAMASTER_STORE: 'ado' });
  assert.equal(c.runner, 'pytest');
  assert.equal(c.store, 'ado');
});

test('the QA project is found above QAMASTER_TEST_ROOT and its config is read', () => {
  const ws = tmp();
  const root = path.join(ws, 'shop');
  const qa = path.join(ws, 'shop-qa');
  fs.mkdirSync(path.join(qa, 'Shop'), { recursive: true });
  write(path.join(root, '.env'), 'QAMASTER_TEST_ROOT=../shop-qa/Shop\n');
  write(path.join(qa, 'config', 'qamaster.json'), JSON.stringify({ smoke: { max: 5 }, gate: { retries: 0 } }));
  const c = loadConfig(root, {});
  assert.equal(c.testRoot, path.join(qa, 'Shop'));
  assert.equal(c.qaProject, qa);
  assert.equal(c.project.smoke.max, 5);
  assert.equal(c.project.gate.retries, 0);
  assert.deepEqual(c.project.smoke.categories, ['Positive', 'E2E']);
});

test('a missing QAMASTER_TEST_ROOT folder is blocked with the setting to fix', () => {
  const root = tmp();
  assert.throws(() => loadConfig(root, { QAMASTER_TEST_ROOT: '../nowhere' }), {
    name: 'BlockedError',
    message: /QAMASTER_TEST_ROOT points to .*nowhere, which doesn't exist/,
  });
});

for (const [envAi, configAi, want] of [
  [undefined, 'on', 'on'],
  ['off', 'on', 'off'],
  ['OFF', undefined, 'off'],
  ['on', 'off', 'off'],
] as const) {
  test(`AI is ${want} when .env says ${envAi} and config says ${configAi}: either off wins`, () => {
    const root = tmp();
    if (configAi) write(path.join(root, 'config', 'qamaster.json'), JSON.stringify({ ai: configAi }));
    assert.equal(loadConfig(root, envAi ? { QAMASTER_AI: envAi } : {}).ai, want);
  });
}

test('an unknown QAMASTER_AI value is blocked rather than read as on', () => {
  assert.throws(() => loadConfig(tmp(), { QAMASTER_AI: 'no' }), /QAMASTER_AI=no isn't valid/);
});

test('invalid JSON in config/qamaster.json is blocked', () => {
  const root = tmp();
  write(path.join(root, 'config', 'qamaster.json'), '{ "ai": ');
  assert.throws(() => loadConfig(root, {}), { name: 'BlockedError', message: /qamaster\.json isn't valid JSON/ });
});

test('asProjectConfig names the key to fix', () => {
  const cases: [unknown, RegExp][] = [
    [[], /"\(top level\)" must be a JSON object/],
    [{ app: { url: 'x' } }, /"app\.name" must be a non-empty string/],
    [{ publish: { pathDepth: 0 } }, /"publish\.pathDepth" must be a whole number of 1 or more/],
    [{ smoke: { priorities: ['P9'] } }, /"smoke\.priorities" must be a list of P1,P2,P3,P4/],
    [{ smoke: { categories: ['Happy'] } }, /"smoke\.categories"/],
    [{ ai: true }, /"ai" must be "on" or "off"/],
    [{ owners: { Checkout: 1 } }, /"owners" must be module names mapped to emails/],
    [{ gate: 'strict' }, /"gate" must be an object/],
  ];
  for (const [data, message] of cases) {
    assert.throws(
      () => asProjectConfig(data, 'qamaster.json'),
      (e) => e instanceof BlockedError && message.test(e.message),
    );
  }
});

test('asProjectConfig accepts the documented example', () => {
  const example = {
    app: { name: 'Shop', url: 'https://shop.example.test', repo: '../shop', channels: ['web', 'api'] },
    publish: { pathDepth: 3, suiteBy: 'module' },
    smoke: { max: 20, priorities: ['P1'], categories: ['Positive', 'E2E'] },
    testgen: { hallucination_tolerance: 0 },
    ai: 'on',
    owners: { Checkout: 'a.rao@example.com' },
    gate: { retries: 1, noMatch: 'pass-with-warning' },
  };
  const c = asProjectConfig(example, 'qamaster.json');
  assert.equal(c.app?.name, 'Shop');
  assert.deepEqual(c.owners, { Checkout: 'a.rao@example.com' });
});
