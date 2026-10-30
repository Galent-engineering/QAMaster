/**
 * qam doctor on the ADO store, in process on an in-memory ADO (tests/fake-ado.mts): the numbered plan choices when no
 * plan matches, and --check-write. Ordinary doctor runs are in tests/project.test.mts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { AdoClient, type AdoSettings, AdoTestCases, makeAdoStore } from '../plugin/src/adapters/ado.mts';
import { STORES } from '../plugin/src/adapters/registry.mts';
import { doctor } from '../plugin/src/cli/project.mts';
import { setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { FakeAdo } from './fake-ado.mts';

const NODE = 'vstfs:///Classification/Node/';
const REAL_STORE = STORES.ado;
afterEach(() => {
  STORES.ado = REAL_STORE;
});
const ENV = { QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop' };

/** A QA project that passes every doctor check but the store ones; `ado` backs the store. */
function project(ado: FakeAdo, env: Record<string, string> = ENV, more: Partial<AdoSettings> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-doctor-ado-'));
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  // an app URL and a Playwright that is "installed", so the checks before the store pass
  const dsm = path.join(dir, 'config/dsm-config.json');
  const d = JSON.parse(fs.readFileSync(dsm, 'utf8'));
  fs.writeFileSync(
    dsm,
    JSON.stringify({ ...d, application: { ...d.application, base_url: 'https://shop.example.test/' } }),
  );
  fs.mkdirSync(path.join(dir, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/playwright/package.json'), '{}');
  const cfg = loadConfig(dir, { ...env });
  STORES.ado = () =>
    new AdoTestCases(
      new AdoClient(
        'org',
        'Shop',
        () => 'Basic t',
        ado.fetch,
        async () => {},
      ),
      { organization: 'org', project: 'Shop', repoName: 'shop-web', ...more },
    );
  return { dir, cfg };
}

async function run(cfg: ReturnType<typeof loadConfig>, argv: string[], json = false) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    const code = await doctor(cfg, argv, json);
    return { code, out: lines.join('\n') };
  } finally {
    console.log = log;
  }
}

test('doctor: when no plan matches, the plans are numbered, creating one is last, and --json carries both as data', async () => {
  const ado = new FakeAdo(); // one plan, 'Shop Web'; the repo is called 'billing', which matches none
  const { cfg, dir } = project(ado, ENV, { repoName: 'billing' });
  const r = await run(cfg, []);
  assert.equal(r.code, 2);
  assert.match(
    r.out,
    /FIX +test case store +No test plan is named like this repo \('billing'\) in org\/Shop\. Choose one:/,
  );
  // continuation lines stay under the detail column
  assert.match(r.out, /\n {8,}1\. Use the plan 'Shop Web': set QAMASTER_ADO_PLAN=Shop Web/);
  assert.match(r.out, /\n {8,}2\. Create a new plan, named 'billing' by default or any name you type/);
  const j = JSON.parse((await run(cfg, [], true)).out);
  assert.equal(j.result, 'blocked');
  const store = j.checks.find((c: { check: string }) => c.check === 'test case store');
  assert.deepEqual(store.plans, [{ id: 1, name: 'Shop Web' }]);
  assert.equal(store.createName, 'billing');
  assert.match(store.detail, /1\. Use the plan/);
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.qamaster/doctor.json'), 'utf8'));
  assert.equal(record.store.ok, false);
  assert.doesNotMatch(record.store.detail, /\n/, "the record's one-line detail, as before");
});

test('doctor: a project that does not exist lists the projects, closest first, and --json carries them as data', async () => {
  const ado = new FakeAdo();
  ado.missingProject = true; // the org has 'Billing' and 'Shop Web'
  const { cfg, dir } = project(ado);
  const r = await run(cfg, []);
  assert.equal(r.code, 2);
  assert.match(
    r.out,
    /FIX +test case store +Azure DevOps project 'Shop' doesn't exist in org\. Existing projects, closest first:/,
  );
  // continuation lines stay under the detail column
  assert.match(r.out, /\n {8,}Shop Web\n {8,}Billing\n/);
  assert.match(r.out, /QAMASTER_ADO_PROJECT=/);
  const j = JSON.parse((await run(cfg, [], true)).out);
  const store = j.checks.find((c: { check: string }) => c.check === 'test case store');
  assert.deepEqual(store.projects, ['Billing', 'Shop Web']);
  assert.deepEqual(store.suggestions, ['Shop Web', 'Billing']);
  const record = JSON.parse(fs.readFileSync(path.join(dir, '.qamaster/doctor.json'), 'utf8'));
  assert.doesNotMatch(record.store.detail, /\n/, "the record's one-line detail, as before");
  // a token that can't list projects still names the missing project, with the scope it needs
  ado.projectsStatus = 403;
  const refused = await run(cfg, []);
  assert.match(refused.out, /project 'Shop' doesn't exist in org.*Project and Team \(Read\)/s);
});

test('doctor: a configured plan name that matches nothing gets the same choices; two matching plans keep their message', async () => {
  const ado = new FakeAdo();
  const { cfg } = project(ado, { ...ENV, QAMASTER_ADO_PLAN: 'Nope' }, { plan: 'Nope' });
  const r = await run(cfg, []);
  assert.match(r.out, /QAMASTER_ADO_PLAN='Nope' matches no test plan in org\/Shop\. Choose one:/);
  const two = new FakeAdo();
  two.plans.push({ ...two.plans[0], id: 2 });
  const t = project(two, ENV, { repoName: 'Shop Web' });
  const tr = await run(t.cfg, [], true);
  const store = JSON.parse(tr.out).checks.find((c: { check: string }) => c.check === 'test case store');
  assert.match(store.detail, /^2 test plans in org\/Shop match 'Shop Web'/);
  assert.equal(store.plans, undefined);
});

test('doctor --check-write: allowed prints what Azure DevOps says, exits 0, and sends only GETs', async () => {
  const ado = new FakeAdo();
  const { cfg } = project(ado);
  const plain = await run(cfg, []);
  assert.doesNotMatch(plain.out, /write access/);
  assert.equal(ado.permissionCalls.length, 0, 'not asked unless requested');
  ado.log.length = 0;
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok +write access +Azure DevOps says your user holds Manage test plans/);
  assert.match(r.out, /licence is not checked/);
  const j = JSON.parse((await run(cfg, ['--check-write'], true)).out);
  assert.equal(j.write.state, 'allowed');
  assert.equal(j.write.area, 'Shop');
  assert.equal(j.result, 'pass');
  assert.ok(ado.log.every((l) => l.startsWith('GET ')));
});

test('doctor --check-write: blocked exits 2 and names the permission and the area', async () => {
  const ado = new FakeAdo();
  ado.denied.set(`${NODE}${ado.areaId('Shop')}`, 128);
  const { cfg } = project(ado);
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 2);
  assert.match(r.out, /FIX +write access +Azure DevOps says your user lacks Manage test suites on area 'Shop'/);
  const j = JSON.parse((await run(cfg, ['--check-write'], true)).out);
  assert.deepEqual([j.result, j.write.state, j.write.missing], ['blocked', 'blocked', ['Manage test suites']]);
});

test('doctor --check-write: unknown exits 0, says so first, and names the first write that would tell', async () => {
  const ado = new FakeAdo();
  ado.permissionStatus = 403;
  const { cfg } = project(ado);
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN +write access +unknown: .*403/);
  assert.match(r.out, /creating a suite or test case/);
  const j = JSON.parse((await run(cfg, ['--check-write'], true)).out);
  assert.deepEqual([j.result, j.write.state], ['pass', 'unknown']);
});

test('doctor --check-write: with no plan yet it checks the root area, and the plan choices still show', async () => {
  const ado = new FakeAdo(false);
  const { cfg } = project(ado);
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 2, 'the store is still blocked: no plan');
  assert.match(r.out, /FIX +test case store +No test plan is named like this repo/);
  assert.match(r.out, /ok +write access +Azure DevOps says your user holds .*no plan yet/);
  assert.deepEqual(ado.permissionCalls[0].tokens, [`${NODE}${ado.areaId('Shop')}`]);
});

test('doctor --check-write: without a configured store it says so; a store that cannot check is unknown', async () => {
  const { cfg } = project(new FakeAdo(), {});
  STORES.ado = makeAdoStore; // the real factory, which needs QAMASTER_ADO_ORG and _PROJECT
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 2);
  assert.match(r.out, /FIX +write access +not checked: the test case store isn't set up/);
  const { cfg: cfg2 } = project(new FakeAdo());
  const real = STORES.ado;
  STORES.ado = (c) => {
    const s = real(c);
    s.checkWrite = undefined;
    return s;
  };
  const r2 = await run(cfg2, ['--check-write']);
  assert.match(r2.out, /WARN +write access +unknown: this store can't be asked/);
});

test('review 5: doctor accepts a trailing --json, as it ignored its argv before', async () => {
  const { cfg } = project(new FakeAdo());
  const r = await run(cfg, ['--json']);
  assert.equal(JSON.parse(r.out).result, 'pass');
  const w = await run(cfg, ['--check-write', '--json']);
  assert.equal(JSON.parse(w.out).write.state, 'allowed');
});

test('review 8: a BlockedError from the write check (two matching plans) is a FIX line and a failed check in --json', async () => {
  const ado = new FakeAdo();
  ado.plans.push({ ...ado.plans[0], id: 2 });
  const { cfg } = project(ado, ENV, { repoName: 'Shop Web' });
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FIX +write access +2 test plans .* match/);
  const j = JSON.parse((await run(cfg, ['--check-write'], true)).out);
  const w = j.checks.find((c: { check: string }) => c.check === 'write access');
  assert.equal(w.ok, false);
  assert.match(w.detail, /2 test plans .* match/);
});

test('re-review 1: a 401 on the permissions call is a rejected credential (blocked), not an unknown answer', async () => {
  const ado = new FakeAdo();
  ado.permissionStatus = 401;
  const { cfg } = project(ado);
  const r = await run(cfg, ['--check-write']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /FIX +write access +.*rejected the credentials/);
  assert.doesNotMatch(r.out, /may not be allowed to ask/);
  // the create flow reads write.state, so it must be there when the check itself fails
  const j = JSON.parse((await run(cfg, ['--check-write'], true)).out);
  assert.equal(j.write?.state, 'blocked');
  assert.match(j.write.detail, /rejected the credentials/);
});

test('re-review 3: plan names without ASCII letters or digits match exactly, not all as one empty key', async () => {
  const ado = new FakeAdo();
  ado.plans.push({ ...ado.plans[0], id: 2, name: '計画' }, { ...ado.plans[0], id: 3, name: '予定' });
  const { cfg } = project(ado, { ...ENV, QAMASTER_ADO_PLAN: '予定' }, { plan: '予定' });
  const r = await run(cfg, [], true);
  const store = JSON.parse(r.out).checks.find((c: { check: string }) => c.check === 'test case store');
  assert.equal(store.ok, true, store.detail);
  const none = new FakeAdo();
  none.plans.push({ ...none.plans[0], id: 2, name: '計画' });
  const n = project(none, { ...ENV, QAMASTER_ADO_PLAN: '予定' }, { plan: '予定' });
  const nr = await run(n.cfg, [], true);
  const ns = JSON.parse(nr.out).checks.find((c: { check: string }) => c.check === 'test case store');
  assert.equal(ns.ok, false);
  assert.match(ns.detail, /QAMASTER_ADO_PLAN='予定' matches no test plan/);
});
