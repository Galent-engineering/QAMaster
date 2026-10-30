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

const QAM = path.resolve(import.meta.dirname, '..', 'plugin/bin/qam');
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
  const runDir = path.join(dir, 'testgen/output/20261030-1200-cart');
  /** Writes the run, validated and reviewed as the files stand. `review: false` leaves it unreviewed. */
  const writeRun = (cases: Case[], o: { review?: boolean } = {}) => {
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
  assert.match(r.out, /Create \(2\)\n\s+TC-CART-001\s+Case TC-CART-001\s+suite Cart · tags cart, path:src\/cart\/\*\*/);
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
  assert.match(dry.out, /Smoke suggestions \(P1, Positive or E2E; the smoke set would be 2 of max 20\)/);
  assert.match(dry.out, /\[x\] TC-CART-001/);
  assert.match(dry.out, /\[x\] TC-CART-002/);
  assert.doesNotMatch(dry.out, /\[x\] TC-CART-003/);
  assert.equal(p.exists(CSV), false);

  p.qam('publish', RUN, '--apply', '--skip-smoke', 'TC-CART-002');
  assert.match(row(p.read(CSV), '1000'), /smoke/);
  assert.doesNotMatch(row(p.read(CSV), '1001'), /smoke/);
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

test('publish: a scenario tagged with the case ID in the automation suite becomes its automation link', () => {
  const p = project();
  fs.mkdirSync(path.join(p.dir, 'Shop/features'), { recursive: true });
  fs.writeFileSync(
    path.join(p.dir, 'Shop/features/cart.feature'),
    'Feature: Cart\n\n  @TC-CART-001\n  Scenario: Pay\n    Given a cart\n',
  );
  p.writeRun([kase('TC-CART-001'), kase('TC-CART-002')]);
  p.qam('publish', RUN, '--apply');
  assert.match(row(p.read(CSV), '1000'), /bdd:@TC-CART-001/);
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

test('publish: a run with a conflict left is not marked published', () => {
  const p = project();
  p.writeRun([kase('TC-CART-001')]);
  p.qam('publish', RUN, '--apply');
  fs.rmSync(path.join(p.dir, `testgen/output/${RUN}/published.json`));
  fs.writeFileSync(path.join(p.dir, CSV), p.read(CSV).replace('Case TC-CART-001', 'Edited by hand'));
  p.writeRun([kase('TC-CART-001', { title: 'Mine' })]);
  assert.equal(p.qam('publish', RUN, '--apply').status, 1);
  assert.equal(p.exists(`testgen/output/${RUN}/published.json`), false);
});
