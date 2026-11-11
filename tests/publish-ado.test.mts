/**
 * qam publish on the real ADO adapter, in process on an in-memory ADO (tests/fake-ado.mts): the dry run reads through
 * the cache, --apply reads live and writes work items and suite membership, and a change made in ADO since the last
 * publish is held back. The same cases on the file store are in tests/publish-cli.test.mts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { AdoClient, AdoTestCases } from '../plugin/src/adapters/ado.mts';
import { STORES } from '../plugin/src/adapters/registry.mts';
import { publish } from '../plugin/src/cli/publish.mts';
import { setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { BlockedError, NoProjectError } from '../plugin/src/shared/errors.mts';
import { runHash } from '../plugin/src/testgen/run.mts';
import { FakeAdo } from './fake-ado.mts';
import { tmpDir } from './tmp.mts';

const REAL = STORES.ado;
afterEach(() => {
  STORES.ado = REAL;
});

const RUN = '20261030-1200-cart';
const kase = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  title: `Case ${id}`,
  component: 'Cart',
  category: 'Positive',
  priority: 'P1',
  objective: `Objective of ${id}`,
  preconditions: [],
  test_data: {},
  steps: [{ screen: '/cart', action: 'Click Pay', expected: 'The order is placed' }],
  expected_result: 'Placed',
  evidence: [],
  ...more,
});

const adoStore = (ado: FakeAdo) =>
  new AdoTestCases(
    new AdoClient(
      'org',
      'Shop',
      () => 'Basic t',
      ado.fetch,
      async () => {},
    ),
    { organization: 'org', project: 'Shop', repoName: 'shop-web' },
  );

/** A QA project whose store is the in-memory ADO, with a DSM and a reviewed run. */
function project(ado: FakeAdo) {
  const dir = tmpDir('qam-publish-ado-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  fs.mkdirSync(path.join(dir, 'dsm'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dsm/dsm.json'),
    JSON.stringify({ generated_at: 'D1', page: { nodes: [{ id: '/cart', files: ['shop:src/cart/Cart.tsx'] }] } }),
  );
  STORES.ado = () => adoStore(ado);
  const cfg = loadConfig(dir, { QAMASTER_STORE: 'ado', QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop' });
  const runDir = path.join(dir, 'testgen/output', RUN);
  const writeRun = (cases: unknown[]) => {
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ scope: { module: 'Cart', sub_module: '' } }));
    fs.writeFileSync(path.join(runDir, 'testcases.json'), JSON.stringify(cases));
    const hash = runHash(runDir);
    const stamp = { run_hash: hash };
    fs.writeFileSync(
      path.join(runDir, 'validation.json'),
      JSON.stringify({ status: 'pass', errors: [], gaps: [], dsm_generated_at: 'D1', validated_at: 'x', ...stamp }),
    );
    fs.writeFileSync(
      path.join(runDir, 'run.json'),
      JSON.stringify({ reviewedBy: 'jo@example.test', reviewedAt: '2026-10-30T10:00:00Z', ...stamp }),
    );
  };
  const run = async (...argv: string[]) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(' '));
    try {
      return { code: await publish(cfg, [RUN, ...argv], false), out: lines.join('\n') };
    } finally {
      console.log = log;
    }
  };
  const ledger = () => JSON.parse(fs.readFileSync(path.join(dir, '.qamaster/ledger.json'), 'utf8'));
  return { dir, writeRun, run, ledger };
}

const field = (ado: FakeAdo, id: number, name: string) => ado.items.get(id)?.fields[name];

test('ado publish: the dry run reads through the cache, --refresh reads live, and nothing is written to ADO', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const before = JSON.stringify([...ado.items]);
  const first = await p.run();
  assert.equal(first.code, 3, first.out);
  assert.doesNotMatch(first.out, /from the cache/);
  assert.ok(fs.existsSync(path.join(p.dir, '.qamaster/cache/store.json')));
  const second = await p.run();
  assert.match(second.out, /Store as of \d{4}-\d\d-\d\dT.* \(from the cache\)\. Run with --refresh/);
  assert.doesNotMatch((await p.run('--refresh')).out, /from the cache/);
  assert.equal(JSON.stringify([...ado.items]), before, 'ADO was only read');
});

test('ado publish: --apply creates the work item with its tags and steps, adds it to the suite, and records it', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const r = await p.run('--apply');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Created 1, updated 0, retired 0, unchanged 0; 0 held back/);
  const [entry] = p.ledger().entries;
  assert.match(p.ledger().store, /^Azure DevOps org\/Shop/);
  assert.equal(field(ado, entry.trackerId, 'System.WorkItemType'), 'Test Case');
  assert.equal(field(ado, entry.trackerId, 'System.Title'), 'Case TC-CART-001');
  assert.match(String(field(ado, entry.trackerId, 'System.Tags')), /cart; path:src\/cart\/\*(;|$)/);
  const suite = ado.plans[0].suites.find((s) => s.name === 'Cart');
  assert.ok(suite?.members.has(entry.trackerId), 'the case is in the Cart suite, created for it');
  assert.ok(fs.existsSync(path.join(p.dir, 'testgen/output', RUN, 'published.json')));
});

test('ado publish: publishing the same run again writes nothing to ADO', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  await p.run('--apply');
  const after = JSON.stringify([...ado.items]);
  const again = await p.run('--apply');
  assert.equal(again.code, 0, again.out);
  assert.match(again.out, /Created 0, updated 0, retired 0, unchanged 1/);
  assert.equal(JSON.stringify([...ado.items]), after);
});

test('ado publish: a change made in ADO since the last publish is held back, even when the cached preview misses it', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  await p.run('--apply');
  const id = p.ledger().entries[0].trackerId;
  const other = adoStore(ado); // someone else, in ADO
  await other.update(await other.show(id), { title: 'Edited in ADO' });
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);

  const preview = await p.run(); // reads the cache, which still has the old revision
  assert.match(preview.out, /Update \(1\)/);
  assert.match(preview.out, /from the cache/);

  const applied = await p.run('--apply'); // reads live
  assert.equal(applied.code, 1, applied.out);
  assert.match(applied.out, /Conflict \(1\), not written/);
  assert.equal(field(ado, id, 'System.Title'), 'Edited in ADO', "the person's edit stays");
});

test('ado publish: the test plan is created on --apply when the repo has none, and not before', async () => {
  const ado = new FakeAdo(false);
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const dry = await p.run();
  assert.equal(dry.code, 3);
  assert.match(dry.out, /test plan 'shop-web' doesn't exist yet; --apply will create it/);
  assert.equal(ado.plans.length, 0, 'a dry run creates no plan');
  const r = await p.run('--apply');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Created test plan/);
  assert.equal(ado.plans.length, 1);
});

test('ado publish: a missing project is created on --apply, then its plan, and not before (Q35)', async () => {
  const ado = new FakeAdo(false);
  ado.missingProject = true;
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const dry = await p.run();
  assert.equal(dry.code, 3, dry.out);
  assert.match(
    dry.out,
    /The ADO project 'Shop' doesn't exist \(or this token can't see it\); --apply will create it \(process Agile, private\)\./,
  );
  assert.match(dry.out, /test plan 'shop-web' doesn't exist yet; --apply will create it/);
  assert.match(dry.out, /Create \(1\)/);
  assert.deepEqual(
    ado.log.filter((l) => !l.startsWith('GET')),
    [],
    'a dry run creates nothing',
  );
  const r = await p.run('--apply');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Created ADO project Shop\.\nCreated test plan shop-web\./);
  assert.equal(ado.createdProjects.length, 1);
  assert.equal(ado.createdProjects[0].visibility, 'private');
  assert.deepEqual(ado.log.filter((l) => l.startsWith('POST')).slice(0, 2), ['POST projects', 'POST testplan/plans']);
  assert.equal(ado.plans.length, 1);
});

test('ado publish: a refused project creation (403) names the permission and writes nothing else', async () => {
  const ado = new FakeAdo(false);
  ado.missingProject = true;
  ado.createStatus = 403;
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  await assert.rejects(p.run('--apply'), (e) => e instanceof BlockedError && /Create new projects/.test(e.message));
  assert.equal(ado.plans.length, 0);
});

test('ado publish: when the creation check itself fails, the missing project error stands, with why', async () => {
  const ado = new FakeAdo(false);
  ado.missingProject = true;
  ado.processesStatus = 403;
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  await assert.rejects(p.run(), (e) => {
    assert.ok(e instanceof NoProjectError);
    assert.match(e.message, /project 'Shop' doesn't exist in org.*QAMASTER_ADO_PROJECT/s);
    assert.match(e.message, /Couldn't check whether publish can create it: .*403/);
    return true;
  });
});

test('ado publish: a case no longer generated is closed and taken out of its suites only with --retire', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  await p.run('--apply');
  const old = p.ledger().entries.find((e: { localId: string }) => e.localId === 'TC-CART-002').trackerId;
  p.writeRun([kase('TC-CART-001')]);
  await p.run('--apply');
  assert.notEqual(field(ado, old, 'System.State'), 'Closed');
  const r = await p.run('--apply', '--retire');
  assert.equal(r.code, 0, r.out);
  assert.equal(field(ado, old, 'System.State'), 'Closed');
  assert.ok(!ado.plans[0].suites.some((s) => s.members.has(old)), 'out of every suite');
  assert.deepEqual(
    p.ledger().entries.map((e: { localId: string }) => e.localId),
    ['TC-CART-001'],
  );
});

// ---- 0.8.0 item 13: the preview names the plan and suites with ids

test('0.8.0 item 13: the ADO preview names the plan with its id and each suite with its id, or says it is new', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const dry = await p.run();
  assert.match(dry.out, /Test plan: Shop Web \(#1\)\nSuites: Cart \(new, --apply creates it\)/);
  await p.run('--apply');
  const suite = ado.plans[0].suites.find((s) => s.name === 'Cart');
  const again = await p.run('--refresh');
  assert.match(again.out, new RegExp(`Test plan: Shop Web \\(#1\\)\\nSuites: Cart \\(#${suite?.id}\\)`));
});

test('0.8.0 item 13: the plan and suites come from the cache on the next dry run, and --refresh reads them live', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  await p.run();
  const plans = () => ado.log.filter((l) => /testplan\/plans|testplan\/Plans\/\d+\/suites$/i.test(l)).length;
  const after = plans();
  const cached = await p.run();
  assert.match(cached.out, /Test plan: Shop Web \(#1\)/);
  assert.equal(plans(), after, 'no plan or suite was read from ADO');
  await p.run('--refresh');
  assert.ok(plans() > after);
});

test("0.8.0 item 13: a first publish into a plan that holds cases this project didn't publish warns, with their ids and the hint", async () => {
  const ado = new FakeAdo(); // plan 'Shop Web' already holds test case 501
  const p = project(ado);
  p.writeRun([kase('TC-CART-001')]);
  const dry = await p.run();
  assert.match(
    dry.out,
    /Warning: test plan 'Shop Web' \(#1\) already holds 1 test case this project didn't publish: TC501\./,
  );
  assert.match(dry.out, /QAMASTER_ADO_PLAN=<exact plan name>/);
  const data = await (async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(' '));
    try {
      const cfg = loadConfig(p.dir, { QAMASTER_STORE: 'ado', QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop' });
      await publish(cfg, [RUN], true);
    } finally {
      console.log = log;
    }
    return JSON.parse(lines.join('\n'));
  })();
  assert.deepEqual(data.plan, { id: 1, name: 'Shop Web' });
  assert.deepEqual(data.suites, [{ name: 'Cart', id: null }]);
  assert.deepEqual(data.foreignCases, [501]);
  await p.run('--apply');
  assert.doesNotMatch(
    (await p.run('--refresh')).out,
    /Warning: test plan/,
    "once published, the plan is this project's",
  );
});

test('0.8.0 item 13: a plan the publish creates, or one the project already published into, gets no such warning', async () => {
  const fresh = new FakeAdo(false);
  const p = project(fresh);
  p.writeRun([kase('TC-CART-001')]);
  const dry = await p.run();
  assert.doesNotMatch(dry.out, /Warning: test plan|Test plan: /);
  assert.match(dry.out, /doesn't exist yet; --apply will create it/);
});
