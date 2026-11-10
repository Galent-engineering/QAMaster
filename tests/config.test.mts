import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { type Env, loadEnv } from '../plugin/src/shared/env.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { asProjectConfig, DEFAULT_PROJECT_CONFIG } from '../plugin/src/shared/schema.mts';
import { tmpDir } from './tmp.mts';

function tmp(): string {
  return tmpDir('qam-config-');
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

test('defaults: the local file store (Q44), ado requirements, playwright-bdd runner, tests in the repo, AI on', () => {
  const root = tmp();
  const c = loadConfig(root, {});
  assert.deepEqual(
    [c.store, c.requirements, c.runner, c.testRoot, c.qaProject, c.ai],
    ['file', 'ado', 'playwright-bdd', root, null, 'on'],
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
    publish: { pathDepth: 4, suiteBy: 'module' },
    smoke: { max: 20, priorities: ['P1'], categories: ['Positive', 'E2E'] },
    testgen: { hallucination_tolerance: 0 },
    ai: 'on',
    owners: { Checkout: 'a.rao@example.com' },
    gate: { retries: 1, noMatch: 'pass-with-warning', sharedShare: 0.3 },
    runners: { pytest: { root: '../shop/tests' }, 'playwright-bdd': { root: 'Shop' } },
  };
  const c = asProjectConfig(example, 'qamaster.json');
  assert.equal(c.app?.name, 'Shop');
  assert.deepEqual(c.owners, { Checkout: 'a.rao@example.com' });
  assert.deepEqual(c.runners.pytest, { root: '../shop/tests' });
});

test('gate.sharedShare defaults to 0.3 and must be a fraction; a runner needs a root (Q37, Q38)', () => {
  assert.equal(asProjectConfig({}, 'q.json').gate.sharedShare, 0.3);
  assert.deepEqual(asProjectConfig({}, 'q.json').runners, {});
  assert.throws(
    () => asProjectConfig({ gate: { sharedShare: 30 } }, 'q.json'),
    /"gate\.sharedShare" must be a fraction/,
  );
  assert.throws(() => asProjectConfig({ runners: { pytest: {} } }, 'q.json'), /"runners\.pytest" must be/);
});

test('gate.allowErrors: nothing allowed by default, a list of non-empty strings otherwise (Q53)', () => {
  assert.deepEqual(asProjectConfig({}, 'q.json').gate.allowErrors, []);
  assert.deepEqual(DEFAULT_PROJECT_CONFIG.gate.allowErrors, []);
  const c = asProjectConfig({ gate: { allowErrors: ['/api/telemetry', 'ResizeObserver'] } }, 'q.json');
  assert.deepEqual(c.gate.allowErrors, ['/api/telemetry', 'ResizeObserver']);
  for (const bad of ['x', [1], [''], { a: 1 }])
    assert.throws(
      () => asProjectConfig({ gate: { allowErrors: bad } }, 'q.json'),
      /"gate\.allowErrors" must be a list/,
    );
});

test('publish.pathDepth defaults to 4, in the schema and in the template qam setup copies', () => {
  // 3 cut Juice Shop's frontend/src/app/address-create to frontend/src/app/**, the whole Angular app
  assert.equal(DEFAULT_PROJECT_CONFIG.publish.pathDepth, 4);
  const template = path.resolve(import.meta.dirname, '../plugin/templates/project/config/qamaster.json');
  assert.equal(JSON.parse(fs.readFileSync(template, 'utf8')).publish.pathDepth, 4);
});

// From the Toolshop run (T2): product and invoice IDs are ULIDs, which the default rules didn't fold into :id.
test('0.3.2 T2: the default route rules fold a ULID, a UUID and a number into :id', async () => {
  const { readFileSync } = await import('node:fs');
  const tpl = JSON.parse(
    readFileSync(new URL('../plugin/templates/project/config/dsm-config.json', import.meta.url), 'utf8'),
  );
  const rules: { pattern: string; replace: string }[] = tpl.application.route_normalization;
  const fold = (route: string) => rules.reduce((r, x) => r.replace(new RegExp(x.pattern, 'g'), x.replace), route);
  assert.equal(fold('/account/invoices/01M6DMTD4XPJRKAP06CTQX2333'), '/account/invoices/:id');
  assert.equal(fold('/product/01M6DMTD1S095QT6ATYWZ5E9MR/reviews'), '/product/:id/reviews');
  assert.equal(fold('/order/3f2a91c0-1b2c-4d3e-8f90-a1b2c3d4e5f6'), '/order/:id');
  assert.equal(fold('/cart/42'), '/cart/:id');
  assert.equal(fold('/category/power-tools'), '/category/power-tools', 'a slug stays');
  assert.equal(
    fold('/product/ALLUPPERCASEWORDSLUGOFLENGTH'),
    '/product/ALLUPPERCASEWORDSLUGOFLENGTH',
    'not 26 Crockford characters',
  );
});

// Q44: local first. A project that has published keeps the store its ledger names, so nobody switches by surprise.
test('Q44: with no QAMASTER_STORE, a QA project that published keeps the store its ledger names', () => {
  const qa = tmp();
  write(path.join(qa, 'config/qamaster.json'), JSON.stringify(DEFAULT_PROJECT_CONFIG));
  assert.equal(loadConfig(qa, {}).store, 'file', 'nothing published yet: local');
  write(path.join(qa, '.qamaster/ledger.json'), JSON.stringify({ store: 'Azure DevOps galent/Shop', entries: [] }));
  assert.equal(loadConfig(qa, {}).store, 'ado', 'its ledger says Azure DevOps');
  write(
    path.join(qa, '.qamaster/ledger.json'),
    JSON.stringify({ store: 'File testcases/testcases.csv, plan Shop', entries: [] }),
  );
  assert.equal(loadConfig(qa, {}).store, 'file');
  assert.equal(loadConfig(qa, { QAMASTER_STORE: 'ado' }).store, 'ado', 'QAMASTER_STORE always wins');
  write(path.join(qa, '.qamaster/ledger.json'), 'not json');
  assert.equal(loadConfig(qa, {}).store, 'file', "a broken ledger doesn't pick the store: publish reports it");
});

test('a repo inside a QA project reads the QA project .env for what its own .env leaves out (0.4.2 W14)', () => {
  const qa = tmpDir('qam-cfg-');
  const clone = path.join(qa, 'dummy-static-website');
  fs.mkdirSync(path.join(qa, 'config'), { recursive: true });
  fs.mkdirSync(clone);
  fs.writeFileSync(path.join(qa, 'config', 'qamaster.json'), '{}');
  fs.writeFileSync(path.join(qa, '.env'), 'QAMASTER_ADO_ORG=acme\nQAMASTER_ADO_PROJECT=from-qa\n');
  fs.writeFileSync(path.join(clone, '.env'), 'QAMASTER_ADO_PROJECT=from-clone\n');
  const env: Record<string, string | undefined> = {};
  const cfg = loadConfig(clone, env);
  assert.equal(cfg.qaProject, qa);
  assert.equal(env.QAMASTER_ADO_ORG, 'acme');
  assert.equal(env.QAMASTER_ADO_PROJECT, 'from-clone', "the repo's own .env still wins");
});
