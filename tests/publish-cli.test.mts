/**
 * qam publish (Q7, Q8, Q34), through the real CLI on a scratch QA project whose store is the file store: a dry run that
 * writes nothing and exits 3 when there is something to write, then --apply, the ledger, conflicts, smoke and retiring.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runHash } from '../plugin/src/testgen/run.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');
const CSV = 'testcases/testcases.csv';
const LEDGER = '.qamaster/ledger.json';

type Case = Record<string, unknown>;
const kase = (id: string, more: Case = {}): Case => ({
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

/** A QA project with a DSM and a reviewed run, and a way to run qam in it. */
function project() {
  const dir = tmpDir('qam-publish-cli-');
  const env = { ...process.env, QAMASTER_HOME: HOME, QAMASTER_STORE: 'file' };
  const qam = (...args: string[]) => {
    const r = spawnSync(QAM, ['--repo', dir, ...args], { encoding: 'utf8', env });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  assert.equal(qam('setup', '--no-install', '--app', 'Shop').status, 0);
  fs.mkdirSync(path.join(dir, 'dsm'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dsm/dsm.json'),
    JSON.stringify({ generated_at: 'D1', page: { nodes: [{ id: '/cart', files: ['shop:src/cart/Cart.tsx'] }] } }),
  );
  /** Writes the run, validated and reviewed as the files stand. `review: false` leaves it unreviewed. */
  const writeRun = (cases: Case[], o: { review?: boolean; name?: string } = {}) => {
    const runDir = path.join(dir, 'testgen/output', o.name ?? RUN);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, 'manifest.json'),
      JSON.stringify({ app: 'Shop', scope: { module: 'Cart', sub_module: '' } }),
    );
    fs.writeFileSync(path.join(runDir, 'testcases.json'), JSON.stringify(cases));
    const hash = runHash(runDir);
    fs.writeFileSync(
      path.join(runDir, 'validation.json'),
      JSON.stringify({
        status: 'pass',
        errors: [],
        gaps: [],
        dsm_generated_at: 'D1',
        run_hash: hash,
        validated_at: 'x',
      }),
    );
    fs.rmSync(path.join(runDir, 'run.json'), { force: true });
    if (o.review !== false) {
      fs.writeFileSync(
        path.join(runDir, 'run.json'),
        JSON.stringify({ reviewedBy: 'jo@example.test', reviewedAt: '2026-10-30T10:00:00Z', run_hash: hash }),
      );
    }
  };
  const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8');
  const exists = (f: string) => fs.existsSync(path.join(dir, f));
  const json = (...args: string[]) => JSON.parse(qam('--json', ...args).out);
  return { dir, qam, writeRun, read, exists, json };
}

const RUN = '20261030-1200-cart';
/** One test case's text in the CSV: its row and the step rows under it (a description spans several lines). */
const row = (csv: string, id: string) => csv.split(/\n(?=\d{4},)/).find((c) => c.startsWith(`${id},`)) ?? '';

test('publish: a dry run shows what would be created, writes nothing, and exits 3 (awaiting approval)', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  const r = p.qam('publish', RUN);
  assert.equal(r.status, 3, r.err);
  assert.match(r.out, /QAMaster publish 20261030-1200-cart → File testcases\/testcases\.csv, plan Shop \(dry run\)/);
  assert.match(r.out, /Reviewed by jo@example\.test on 2026-10-30/);
  assert.match(
    r.out,
    /Create \(2\)\n\s+TC-CART-001\s+Case TC-CART-001\s+suite Cart · tags cart, path:src\/cart\/\*(,|\s|$)/,
  );
  assert.match(r.out, /Reply yes to apply/);
  assert.equal(p.exists(CSV), false);
  assert.equal(p.exists(LEDGER), false);
});

test('publish: --json gives the same facts as data', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  const j = p.json('publish', RUN);
  assert.equal(j.result, 'awaiting approval');
  assert.equal(j.apply, false);
  assert.equal(j.store, 'File testcases/testcases.csv, plan Shop');
  assert.deepEqual(
    j.changes.map((c: { kind: string; localId: string }) => `${c.kind} ${c.localId}`),
    ['create TC-CART-001'],
  );
});

test('publish: a run nobody reviewed is blocked with the way forward', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')], { review: false });
  const r = p.qam('publish', RUN);
  assert.equal(r.status, 2);
  assert.match(r.err, /hasn't been reviewed.*qam review/);
});

test('publish: no run named, or no such run, is blocked', () => {
  const p = project();
  assert.match(p.qam('publish').err, /Name the run/);
  assert.match(p.qam('publish', 'nope').err, /No run nope/);
});

test('publish --apply writes the cases and the ledger; publishing again says there is nothing to do and writes nothing', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  const r = p.qam('publish', RUN, '--apply');
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /Created 2/);
  const csv = p.read(CSV);
  assert.match(csv, /1000,Case TC-CART-001/);
  assert.match(csv, /1001,Case TC-CART-002/);
  const ledger = JSON.parse(p.read(LEDGER));
  assert.equal(ledger.store, 'File testcases/testcases.csv, plan Shop');
  assert.deepEqual(
    ledger.entries.map((e: { localId: string; trackerId: number }) => [e.localId, e.trackerId]),
    [
      ['TC-CART-001', 1000],
      ['TC-CART-002', 1001],
    ],
  );

  const again = p.qam('publish', RUN);
  assert.equal(again.status, 0);
  assert.match(again.out, /Unchanged \(2\)/);
  assert.match(again.out, /Nothing to publish/);
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  assert.equal(p.read(CSV), csv, 'the store was not rewritten');
});

test('publish: the plan and suite are made only with --apply', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN);
  assert.equal(p.exists(CSV), false, 'a dry run makes no suite');
  p.qam('publish', RUN, '--apply');
  assert.match(p.read(CSV), /Cart/);
});

test('publish: --leave-out skips a case, and a case the run does not have is blocked', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  const r = p.qam('publish', RUN, '--apply', '--leave-out', 'TC-CART-002');
  assert.equal(r.status, 0, r.err);
  assert.match(p.read(CSV), /Case TC-CART-001/);
  assert.doesNotMatch(p.read(CSV), /Case TC-CART-002/);
  const bad = p.qam('publish', RUN, '--leave-out', 'TC-NOPE');
  assert.equal(bad.status, 2);
  assert.match(bad.err, /TC-NOPE.*isn't in/);
});

test('publish: smoke is suggested and ticked, written only on apply, and --skip-smoke unticks one', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002'), kase('TC-CART-003', { priority: 'P3' })]);
  const dry = p.qam('publish', RUN);
  assert.match(
    dry.out,
    /Smoke suggestions \(P1, Positive or E2E; the plan has 0 smoke, 2 ticked here: 2 of max 20 for the whole plan\)/,
  );
  assert.match(dry.out, /\[x\] TC-CART-001/);
  assert.match(dry.out, /\[x\] TC-CART-002/);
  assert.doesNotMatch(dry.out, /\[x\] TC-CART-003/);
  assert.equal(p.exists(CSV), false);

  p.qam('publish', RUN, '--apply', '--skip-smoke', 'TC-CART-002');
  assert.match(row(p.read(CSV), '1000'), /smoke/);
  assert.doesNotMatch(row(p.read(CSV), '1001'), /smoke/);
});

// 0.2.1 verification E2: a case unticked with --skip-smoke was offered again on every later preview
test('E2: --skip-smoke is remembered in the ledger, so the case is not suggested again', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  p.qam('publish', RUN, '--apply', '--skip-smoke', 'TC-CART-002');
  const ledger = JSON.parse(p.read(LEDGER)).entries;
  assert.equal(ledger.find((e: { localId: string }) => e.localId === 'TC-CART-002').smokeDeclined, true);
  assert.equal(ledger.find((e: { localId: string }) => e.localId === 'TC-CART-001').smokeDeclined, false);
  const again = p.qam('publish', RUN).out;
  assert.doesNotMatch(again, /\[[x ]\] TC-CART-002/, 'no longer offered');
});

test('publish: smoke QA removes in the store is not suggested again', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  const edited = p.read(CSV).replace(/;?\s?smoke/, '');
  fs.writeFileSync(path.join(p.dir, CSV), edited);
  const r = p.qam('publish', RUN, '--apply');
  assert.equal(r.status, 0, r.err);
  assert.equal(JSON.parse(p.read(LEDGER)).entries[0].smokeDeclined, true);
  assert.doesNotMatch(p.qam('publish', RUN).out, /\[x\] TC-CART-001/);
});

test('publish: a case someone changed in the store is a conflict, not written, and apply exits 1', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  const dry = p.qam('publish', RUN);
  assert.equal(dry.status, 1, 'only a conflict: nothing to approve, and not clean');
  assert.match(dry.out, /Conflict \(1\), not written\n\s+TC1000 ← TC-CART-001\s+.*changed in the store/);
  const applied = p.qam('publish', RUN, '--apply');
  assert.equal(applied.status, 1);
  assert.match(p.read(CSV), /Edited by hand/, "the person's edit stays");
  assert.doesNotMatch(p.read(CSV), /Mine/);
});

test('K6: a conflict lists its fields, the store value beside the run value', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  const dry = p.qam('publish', RUN);
  assert.match(dry.out, /Conflict \(1\)[\s\S]*title: store "Edited by hand", run "Mine"/);
  const data = JSON.parse(p.qam('--json', 'publish', RUN).out);
  assert.deepEqual(data.changes[0].differences, [{ field: 'title', store: 'Edited by hand', run: 'Mine' }]);
});

test('K7: an edit made only in the store is reported in the preview, and nothing is written', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  const dry = p.qam('publish', RUN);
  assert.equal(dry.status, 0, 'nothing to approve');
  assert.match(
    dry.out,
    /Edited in the store only \(1\), kept as it is[\s\S]*TC1000 ← TC-CART-001[\s\S]*title: store "Edited by hand", run "Case TC-CART-001"/,
  );
  const applied = p.qam('publish', RUN, '--apply');
  assert.match(applied.out, /Edited in the store only \(1\)/);
  assert.match(p.read(CSV), /Edited by hand/);
});

test('Q56: a republish with narrower path: tags removes the old ones, the preview lists them, and other tags stay', () => {
  const p = project();
  const dsm = (files: string[]) =>
    fs.writeFileSync(
      path.join(p.dir, 'dsm/dsm.json'),
      JSON.stringify({ generated_at: 'D1', page: { nodes: [{ id: '/cart', files }] } }),
    );
  dsm(['shop:src/cart/Cart.tsx', 'shop:src/auth/auth.ts']);
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  const before = row(p.read(CSV), '1000');
  assert.match(before, /path:src\/auth\/\*/, 'the broad tag is stored');
  dsm(['shop:src/cart/Cart.tsx']);
  p.writeRun([kase('TC-CART-001')]);
  const dry = p.qam('publish', RUN);
  assert.equal(dry.status, 3);
  assert.match(dry.out, /TC1000 ← TC-CART-001[\s\S]*removes tag path:src\/auth\/\*/);
  assert.doesNotMatch(dry.out, /removes tag path:src\/cart/);
  p.qam('publish', RUN, '--apply');
  const after = row(p.read(CSV), '1000');
  assert.doesNotMatch(after, /path:src\/auth\//);
  assert.match(after, /path:src\/cart\/\*/);
  const tags = (after.match(/(?:^|,)"?([^,"]*path:[^,"]*)"?(?=,)/)?.[1] ?? '').split(';').map((t) => t.trim());
  assert.ok(tags.includes('cart'), `the group tag stays: ${tags.join(', ')}`);
});

test('publish: a case no longer generated is listed, and closed only with --retire', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  p.qam('publish', RUN, '--apply');
  p.writeRun([kase('TC-CART-001')]);
  const dry = p.qam('publish', RUN);
  assert.equal(dry.status, 0, 'retiring needs its own flag, so there is nothing to approve');
  assert.match(dry.out, /Retire \(1\), only with --retire\n\s+TC1001 ← TC-CART-002/);
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  assert.doesNotMatch(p.read(CSV), /Closed/);

  const withFlag = p.qam('publish', RUN, '--retire');
  assert.equal(withFlag.status, 3);
  assert.equal(p.qam('publish', RUN, '--apply', '--retire').status, 0);
  assert.match(row(p.read(CSV), '1001'), /,Closed,/);
  assert.deepEqual(
    JSON.parse(p.read(LEDGER)).entries.map((e: { localId: string }) => e.localId),
    ['TC-CART-001'],
  );
});

test('publish: a ledger from another store blocks before anything is written', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  fs.mkdirSync(path.join(p.dir, '.qamaster'), { recursive: true });
  fs.writeFileSync(
    path.join(p.dir, LEDGER),
    JSON.stringify({ store: 'Azure DevOps galent/Shop, plan Shop', entries: [] }),
  );
  const r = p.qam('publish', RUN, '--apply');
  assert.equal(r.status, 2);
  assert.match(r.err, /belongs to Azure DevOps galent\/Shop/);
  assert.equal(p.exists(CSV), false);
});

// Q39, Q40: a script is linked only once it's pushed to the QA repo's remote, with a Script line pinned to the commit.
test('publish: a scenario tagged with the case ID becomes its link only once pushed, with where it is', () => {
  const p = project();
  fs.mkdirSync(path.join(p.dir, 'Shop/features'), { recursive: true });
  fs.writeFileSync(
    path.join(p.dir, 'Shop/features/cart.feature'),
    '@web\nFeature: Cart\n\n  @TC-CART-001\n  Scenario: Pay\n    Given a cart\n',
  );
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  const dry = p.qam('publish', RUN);
  assert.match(dry.out, /Scripts not pushed to the QA repo \(1\): .*TC-CART-001/);
  assert.doesNotMatch(dry.out, /bdd:@/);

  const g = (...a: string[]) =>
    assert.equal(
      spawnSync('git', ['-C', p.dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a]).status,
      0,
      a.join(' '),
    );
  const remote = tmpDir('qam-qa-remote-');
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-qm', 'scripts');
  assert.match(p.qam('publish', RUN).out, /not pushed to the QA repo \(1\)/, 'committed but not pushed');
  assert.equal(spawnSync('git', ['init', '-q', '--bare', remote]).status, 0);
  g('remote', 'add', 'origin', remote);
  g('push', '-q', 'origin', 'main');
  const sha = spawnSync('git', ['-C', p.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();

  p.qam('publish', RUN, '--apply');
  assert.match(row(p.read(CSV), '1000'), /bdd:@TC-CART-001/);
  assert.match(p.read(CSV), new RegExp(`Script: Shop/features/cart\\.feature @ ${sha.slice(0, 12)}`));
  assert.doesNotMatch(row(p.read(CSV), '1001'), /bdd:@/);
});

test('publish: cases the DSM cannot place are named, and the owner warning shows', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001', { steps: [{ screen: '/nowhere', action: 'Open', expected: 'It opens' }] })]);
  const cfg = path.join(p.dir, 'config/qamaster.json');
  const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  fs.writeFileSync(cfg, JSON.stringify({ ...c, owners: { Cart: 'a.rao@example.test' } }));
  const r = p.qam('publish', RUN);
  assert.match(r.out, /Not linked to code \(no path: tag\): TC-CART-001/);
  assert.match(r.out, /Warning: Cart's owner is a\.rao@example\.test.*jo@example\.test reviewed/);
});

test('publish: --refresh is accepted, and a clean apply marks the run published for the pipeline', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  assert.equal(p.qam('publish', RUN, '--refresh').status, 3);
  const stage = () => {
    const st = p.json('pipeline', 'status');
    return (st.stages ?? st).find((s: { stage: string }) => s.stage === 'publish');
  };
  assert.equal(stage().status, 'pending');
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  const rec = JSON.parse(p.read(`testgen/output/${RUN}/published.json`));
  assert.deepEqual(
    [rec.created, rec.updated, rec.retired, rec.store],
    [1, 0, 0, 'File testcases/testcases.csv, plan Shop'],
  );
  assert.equal(stage().status, 'done');
});

// 0.2.1 verification E7: an apply that held cases back left the stage at "nothing published yet"
test('E7: an apply with a conflict left records it, and the status says done with the cases held back', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.rmSync(path.join(p.dir, `testgen/output/${RUN}/published.json`));
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  assert.equal(p.qam('publish', RUN, '--apply').status, 1, 'a conflict left is still exit 1');
  const rec = JSON.parse(p.read(`testgen/output/${RUN}/published.json`));
  assert.equal(rec.heldBack, 1);
  const st = p.json('pipeline', 'status');
  const stage = (st.stages ?? st).find((s: { stage: string }) => s.stage === 'publish');
  assert.equal(stage.status, 'done');
  assert.match(stage.evidence, /1 published run\(s\); 1 held back by a conflict/);
});

// From the 0.2.0 publish walkthrough: 4 previews promised 38 smoke cases, the plan-wide cap let 20 through, unannounced.
test('0.2.1 A5: smoke is counted across the plan; apply refuses when the cap changed since the dry run', () => {
  const p = project();
  fs.writeFileSync(
    path.join(p.dir, 'config/qamaster.json'),
    JSON.stringify({ app: { name: 'Shop' }, smoke: { max: 2 } }),
  );
  const B = '20261030-1300-cart';
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  p.writeRun([kase('TC-CART-101'), kase('TC-CART-102')], { name: B });
  // both previews run before either is applied, so each sees an empty plan
  assert.match(p.qam('publish', RUN).out, /\[x\] TC-CART-001/);
  assert.match(p.qam('publish', B).out, /\[x\] TC-CART-101/);
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);

  const stale = p.qam('publish', B, '--apply');
  assert.equal(stale.status, 3, stale.out);
  assert.match(
    stale.out,
    /Smoke changed since the dry run: the plan has 2 smoke now, so 0 of the 2 suggested fit \(max 2\)\. Nothing was written/,
  );
  assert.doesNotMatch(p.read(CSV), /TC-CART-101/);

  const again = p.qam('publish', B);
  assert.match(
    again.out,
    /2 more cases match the smoke rule but weren't offered: the plan's smoke set is full \(2 of max 2\)/,
  );
  assert.doesNotMatch(again.out, /\[x\] TC-CART-101/);
  const applied = p.qam('publish', B, '--apply');
  assert.equal(applied.status, 0, applied.out);
  assert.match(applied.out, /smoke in the plan: 2 of max 2/);
});

// 0.2.1 verification E1: the dry run promised smoke other previewed runs would also take, and apply refused later
test('E1: the dry run says how much smoke other previewed runs are also holding', () => {
  const p = project();
  fs.writeFileSync(
    path.join(p.dir, 'config/qamaster.json'),
    JSON.stringify({ app: { name: 'Shop' }, smoke: { max: 3 } }),
  );
  const B = '20261030-1300-cart';
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  p.writeRun([kase('TC-CART-101'), kase('TC-CART-102')], { name: B });
  assert.doesNotMatch(p.qam('publish', RUN).out, /other run/, 'nothing else is previewed yet');
  const second = p.qam('publish', B).out;
  assert.match(
    second,
    /2 more smoke cases are suggested by 1 other previewed run not applied yet: with them the plan could pass its max of 3/,
  );
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  assert.doesNotMatch(p.qam('publish', B).out, /other previewed run/, 'an applied run no longer holds a preview');
});

// 0.6.0 item 9 (R23): switch stores with a command, and each store keeps its IDs
test('R23: qam store use switches the store and the ledger keeps each store IDs, so switching back restores them', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  // the project's own settings decide the store from here: no QAMASTER_STORE in the shell
  const { QAMASTER_STORE: _shell, ...base } = process.env;
  const env = {
    ...base,
    QAMASTER_HOME: HOME,
    QAMASTER_ADO_ORG: 'org',
    QAMASTER_ADO_PROJECT: 'Shop',
    AZURE_CONFIG_DIR: p.dir,
  };
  const qam = (...args: string[]) => {
    const r = spawnSync(QAM, ['--repo', p.dir, ...args], { encoding: 'utf8', env });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  const ledger = () => JSON.parse(p.read(LEDGER));

  const toAdo = qam('store', 'use', 'ado');
  assert.equal(toAdo.status, 0, toAdo.err + toAdo.out);
  assert.match(toAdo.out, /Test cases now go to Azure DevOps org\/Shop/);
  assert.match(p.read('.env'), /^QAMASTER_STORE=ado$/m);
  assert.equal(ledger().store, 'Azure DevOps org/Shop');
  assert.deepEqual(ledger().entries, []);
  assert.equal(
    Object.values(ledger().other as Record<string, unknown[]>)[0].length,
    1,
    "the file store's ID is parked",
  );
  assert.match(qam('store').out, /Azure DevOps org\/Shop/);

  // a line the person wrote with export keeps it
  fs.writeFileSync(path.join(p.dir, '.env'), p.read('.env').replace(/^QAMASTER_STORE=/m, 'export QAMASTER_STORE='));
  const back = qam('store', 'use', 'file');
  assert.equal(back.status, 0, back.err);
  assert.match(p.read('.env'), /^export QAMASTER_STORE=file$/m);
  assert.doesNotMatch(p.read('.env'), /QAMASTER_STORE=ado/);
  assert.match(ledger().store, /^File testcases/);
  assert.equal(ledger().entries.length, 1, 'the file store IDs came back');
  assert.match(back.out, /1 test case/);
  // and publish sees nothing to do: the bindings survived
  assert.equal(qam('publish', RUN).status, 0);
});

test('R23: qam store use blocks on a store that is not known, and warns when the shell setting would win', () => {
  const p = project();
  const bad = p.qam('store', 'use', 'jira');
  assert.equal(bad.status, 2);
  assert.match(bad.err, /jira isn't a store\. Use one of: ado, file/);
  const env = { ...process.env, QAMASTER_HOME: HOME, QAMASTER_STORE: 'ado' };
  const r = spawnSync(QAM, ['--repo', p.dir, 'store', 'use', 'file'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /QAMASTER_STORE=ado is set in the shell and wins/);
});

// ---- 0.8.0 items 14 and 15

/** A case published, edited by hand in the store, then changed in the run: a conflict. */
function conflicted() {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  return p;
}

test("0.8.0 item 14: --take-store previews the store's version and writes nothing without --apply", () => {
  const p = conflicted();
  const ledger = p.read(LEDGER);
  const csv = p.read(CSV);
  const r = p.qam('publish', RUN, '--take-store', 'TC-CART-001');
  assert.equal(r.status, 3, r.err);
  assert.match(
    r.out,
    /Take the store's version \(1\), only with --apply\n\s+TC1000 ← TC-CART-001[\s\S]*title: store "Edited by hand", run "Mine"/,
  );
  assert.doesNotMatch(r.out, /Conflict \(/);
  assert.equal(p.read(LEDGER), ledger);
  assert.equal(p.read(CSV), csv);
});

test("0.8.0 item 14: --take-store with --apply keeps the store's edit, records its revision, and the conflict is gone", () => {
  const p = conflicted();
  const applied = p.qam('publish', RUN, '--take-store', 'TC-CART-001', '--apply');
  assert.equal(applied.status, 0, applied.out + applied.err);
  assert.match(p.read(CSV), /Edited by hand/);
  assert.doesNotMatch(p.read(CSV), /Mine/);
  assert.equal(JSON.parse(p.read(LEDGER)).entries[0].trackerRev, 2);
  const again = p.qam('publish', RUN);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /Nothing to publish/);
  assert.doesNotMatch(again.out, /Conflict|Edited in the store only/);
});

test('0.8.0 item 14: a taken case is not also counted as unchanged, in the preview or the apply summary', () => {
  const p = conflicted();
  const preview = p.qam('publish', RUN, '--take-store', 'TC-CART-001');
  assert.match(preview.out, /Take the store's version \(1\)/);
  assert.doesNotMatch(preview.out, /Unchanged \(/);
  const applied = p.qam('publish', RUN, '--take-store', 'TC-CART-001', '--apply');
  assert.match(applied.out, /unchanged 0;/);
});

test('0.8.0 item 14: --take-store names the case the store has not changed, and an ID the run does not have', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  const none = p.qam('publish', RUN, '--take-store', 'TC-CART-001');
  assert.equal(none.status, 2);
  assert.match(none.err, /TC-CART-001.*hasn't been changed in the store|nothing to take/);
  const unknown = p.qam('publish', RUN, '--take-store', 'TC-NOPE-9');
  assert.equal(unknown.status, 2);
  assert.match(unknown.err, /TC-NOPE-9 isn't in/);
});

test('0.8.0 item 14: an update row shows the store value beside the run value', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  const dry = p.qam('publish', RUN);
  assert.equal(dry.status, 3);
  assert.match(dry.out, /Update \(1\)\n\s+TC1000 ← TC-CART-001[^\n]*\n\s+title: store "Case TC-CART-001", run "Mine"/);
});

test('0.8.0 item 15: the preview lists each story a case cites, and publish writes it as a req: tag', () => {
  const p = project();
  p.writeRun([
    kase('TC-CART-001', { evidence: ['req:AB-5'] }),
    kase('TC-CART-002', { evidence: ['req:AB-5', 'req:77'] }),
    kase('TC-CART-003'),
  ]);
  const dry = p.qam('publish', RUN);
  assert.match(
    dry.out,
    /Stories \(2\), written as req: tags\n\s+req:77\s+TC-CART-002\n\s+req:AB-5\s+TC-CART-001, TC-CART-002/,
  );
  assert.match(dry.out, /TC-CART-001\s+Case TC-CART-001\s+suite Cart · tags cart, req:AB-5, path:/);
  const data = p.json('publish', RUN);
  assert.deepEqual(data.requirements, { '77': ['TC-CART-002'], 'AB-5': ['TC-CART-001', 'TC-CART-002'] });
  p.qam('publish', RUN, '--apply');
  assert.match(row(p.read(CSV), '1000'), /req:AB-5/);
  assert.doesNotMatch(row(p.read(CSV), '1002'), /req:/);
  // a story cited later reaches the case already published
  p.writeRun([kase('TC-CART-001', { evidence: ['req:AB-5', 'req:99'] }), kase('TC-CART-002'), kase('TC-CART-003')]);
  const next = p.qam('publish', RUN);
  assert.match(next.out, /Update \(2\)[\s\S]*TC1000 ← TC-CART-001[\s\S]*TC1001 ← TC-CART-002[\s\S]*removes tag req:77/);
});
