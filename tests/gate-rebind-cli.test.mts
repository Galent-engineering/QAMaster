/**
 * 0.6.0 item 3 (Q49) and item 14 through the real CLI, from a recorded app clone: qam plan, qam automate --done, then a
 * second qam plan runs the recorded script with no new --done, now that drafts.json lives in the QA project's gate
 * folder. playwright-bdd is not installed offline, so a stub npx stands in for bddgen and `playwright test --list`; the
 * live run of the real BDD tools is part of the end-to-end check. A store switch is modelled as a new file store and a
 * new ledger: the same TestGen ID under a new store ID.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { buildStore } from '../plugin/src/adapters/registry.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');

function git(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.test', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
}
function write(dir: string, files: Record<string, string>) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}

const FEATURE = '@web\nFeature: Cart\n  @TC-CART-001\n  Scenario: total\n    Given the cart\n';

/** A clone on a feature branch, the QA project that recorded it with one manual case and its feature, and a stub npx. */
async function world() {
  const clone = tmpDir('qam-clone-');
  const qa = tmpDir('qam-qa-');
  const home = tmpDir('qam-home-');
  const bin = tmpDir('qam-bin-');
  write(clone, { 'site/cart.js': 'export const total = 1;\n' });
  write(qa, {
    'config/qamaster.json': JSON.stringify({ app: { name: 'Shop' } }),
    'config/dsm-config.json': JSON.stringify({ repositories: [{ name: 'shop', path: path.relative(qa, clone) }] }),
    'testgen/output/run-1/testcases.json': JSON.stringify([{ id: 'TC-CART-001', title: 'Cart total' }]),
    'Shop/features/web/cart.feature': FEATURE,
    'Shop/node_modules/playwright-bdd/package.json': '{}',
  });
  write(home, {
    'installs.json': JSON.stringify({ repos: { [qa]: { app: 'Shop', integrations: ['x'], updated_at: 'x' } } }),
  });
  write(bin, { npx: '#!/bin/sh\nexit 0\n' });
  fs.chmodSync(path.join(bin, 'npx'), 0o755);
  const store = buildStore(loadConfig(qa, { QAMASTER_STORE: 'file' }));
  await store.ensureSuite('Cart');
  const made = await store.create({ title: 'Cart total', addTags: ['cart', 'path:site/cart.js'] });
  await store.addToSuite(made.id, 'Cart');
  write(qa, {
    '.qamaster/ledger.json': JSON.stringify({
      store: 'file',
      entries: [
        {
          localId: 'TC-CART-001',
          trackerId: made.id,
          hash: 'h',
          ownedTags: [],
          smokeDeclined: false,
          publishedAt: 'x',
          trackerRev: 0,
        },
      ],
    }),
  });
  git(clone, 'init', '-q', '-b', 'main');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-qm', 'init');
  git(clone, 'switch', '-q', '-c', 'feature/cart');
  write(clone, { 'site/cart.js': 'export const total = 2;\n' });
  git(clone, 'commit', '-qam', 'cart total');
  const qam = (...args: string[]) => {
    const r = spawnSync(QAM, ['--repo', clone, ...args], {
      encoding: 'utf8',
      env: { ...process.env, QAMASTER_HOME: home, QAMASTER_STORE: 'file', PATH: `${bin}:${process.env.PATH}` },
    });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  /** A switch of test case store: the old store and ledger moved aside, the case published again under a new ID. */
  const switchStore = async () => {
    fs.renameSync(path.join(qa, 'testcases'), path.join(qa, 'testcases.old'));
    const fresh = buildStore(loadConfig(qa, { QAMASTER_STORE: 'file' }));
    await fresh.ensureSuite('Cart');
    await fresh.create({ title: 'Other', addTags: ['other'] }); // so the new ID differs from the old one
    const again = await fresh.create({ title: 'Cart total', addTags: ['cart', 'path:site/cart.js'] });
    await fresh.addToSuite(again.id, 'Cart');
    const ledgerFile = path.join(qa, '.qamaster', 'ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    ledger.entries[0].trackerId = again.id;
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
    return again.id;
  };
  return { clone, qa, id: made.id, qam, switchStore };
}

type PlanJson = {
  id: string;
  items: { testCase: { id: number; automatedTest: string | null } }[];
  notRun: { testCase: { id: number }; why: string }[];
};
const planOf = (r: { status: number | null; out: string; err: string }): PlanJson => {
  assert.equal(r.status, 3, r.out + r.err);
  return JSON.parse(r.out);
};
const links = (p: PlanJson) => p.items.map((i) => [i.testCase.id, i.testCase.automatedTest]);

test('Q49 via the CLI: plan, automate --done, then a later plan and plan --all run the recorded script', async () => {
  const w = await world();
  const first = planOf(w.qam('--json', 'plan', '--base', 'main'));
  assert.deepEqual(links(first), []);
  assert.deepEqual(
    first.notRun.map((n) => n.testCase.id),
    [w.id],
  );

  const done = planOf(w.qam('--json', 'automate', first.id, '--done'));
  assert.deepEqual(links(done), [[w.id, 'bdd:@TC-CART-001']]);
  const drafts = path.join(w.qa, '.qamaster', 'gate', 'shop', 'drafts.json');
  assert.ok(fs.existsSync(drafts), 'drafts.json is in the QA project');
  assert.ok(!fs.existsSync(path.join(w.clone, '.qamaster')), 'the clone gets nothing');

  // the store still says manual (nothing published): the recorded script binds with no new --done
  const later = planOf(w.qam('--json', 'plan', '--base', 'main'));
  assert.deepEqual(links(later), [[w.id, 'bdd:@TC-CART-001']]);
  assert.deepEqual(later.notRun, []);

  // item 14: --all on a change that touches nothing plans it too
  const all = planOf(w.qam('--json', 'plan', '--base', 'feature/cart', '--all'));
  assert.deepEqual(links(all), [[w.id, 'bdd:@TC-CART-001']]);

  // after a store switch the binding holds: it is by TestGen ID, not store ID
  const newId = await w.switchStore();
  assert.notEqual(newId, w.id);
  const switched = planOf(w.qam('--json', 'plan', '--base', 'main'));
  assert.deepEqual(links(switched), [[newId, 'bdd:@TC-CART-001']]);
  assert.deepEqual(switched.notRun, []);

  // an edit by hand unbinds it until it is recorded again
  fs.appendFileSync(path.join(w.qa, 'Shop/features/web/cart.feature'), '    Then it changed\n');
  const edited = planOf(w.qam('--json', 'plan', '--base', 'main'));
  assert.deepEqual(links(edited), []);
  assert.match(edited.notRun[0]?.why ?? '', /script edited since recorded \(features\/web\/cart\.feature\)/);
});

test('0.7.2 item 14 (Q57): qam automate stops with exit 2 and the names when the account variables are not set', async () => {
  const w = await world();
  const first = planOf(w.qam('--json', 'plan', '--base', 'main'));
  const cfgFile = path.join(w.qa, 'config', 'dsm-config.json');
  const dsm = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  dsm.application = { login: { username_env: 'SHOP_USER_072', password_env: 'SHOP_PASSWORD_072' } };
  fs.writeFileSync(cfgFile, JSON.stringify(dsm));
  const r = w.qam('automate', first.id);
  assert.equal(r.status, 2, r.err + r.out);
  assert.match(r.err, /SHOP_USER_072 and SHOP_PASSWORD_072/);
  fs.writeFileSync(path.join(w.qa, '.env'), 'SHOP_USER_072=u\nSHOP_PASSWORD_072=p\n');
  assert.notEqual(w.qam('automate', first.id).status, 2);
});

test('0.8.0 item 4: qam automate --try does not pass or say nothing is waiting while drafts have no script', async () => {
  const w = await world();
  const first = planOf(w.qam('--json', 'plan', '--base', 'main'));
  fs.rmSync(path.join(w.qa, 'Shop/features/web/cart.feature')); // the case is waiting to be drafted
  const r = w.qam('automate', first.id, '--try');
  assert.equal(r.status, 3, r.out + r.err);
  assert.doesNotMatch(r.out, /no script is waiting/);
  assert.match(r.out, /TC\d+/);
  const j = JSON.parse(w.qam('--json', 'automate', first.id, '--try').out);
  assert.deepEqual(j.unwritten, [w.id]);
});
