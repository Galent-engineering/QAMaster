/**
 * 0.4.1 publish items (A15, A16), through the real CLI on a scratch QA project with the file store.
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
const RUN = '20261030-1200-cart';
const DOCTOR = '.qamaster/doctor.json';

function project() {
  const dir = tmpDir('qam-publish-041-');
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
  const runDir = path.join(dir, 'testgen/output', RUN);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'manifest.json'),
    JSON.stringify({ app: 'Shop', scope: { module: 'Cart', sub_module: '' } }),
  );
  fs.writeFileSync(
    path.join(runDir, 'testcases.json'),
    JSON.stringify([
      {
        id: 'TC-CART-001',
        title: 'Case 1',
        component: 'Cart',
        category: 'Positive',
        priority: 'P1',
        objective: 'o',
        preconditions: [],
        test_data: {},
        steps: [{ screen: '/cart', action: 'Click Pay', expected: 'Placed' }],
        expected_result: 'Placed',
        evidence: [],
      },
    ]),
  );
  const hash = runHash(runDir);
  fs.writeFileSync(
    path.join(runDir, 'validation.json'),
    JSON.stringify({ status: 'pass', errors: [], gaps: [], dsm_generated_at: 'D1', run_hash: hash, validated_at: 'x' }),
  );
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({ reviewedBy: 'jo@example.test', reviewedAt: '2026-10-30T10:00:00Z', run_hash: hash }),
  );
  const doctor = (d: unknown) => {
    fs.mkdirSync(path.join(dir, '.qamaster'), { recursive: true });
    fs.writeFileSync(path.join(dir, DOCTOR), JSON.stringify(d));
  };
  const readDoctor = () => JSON.parse(fs.readFileSync(path.join(dir, DOCTOR), 'utf8'));
  return { dir, qam, doctor, readDoctor };
}

const failed = { ok: false, at: '2026-11-01T00:00:00Z', detail: 'HTTP 404' };

test('publish --apply records the store as reachable in doctor.json and keeps its other keys', () => {
  const p = project();
  p.doctor({ at: 'A', ok: false, checks: [{ check: 'x' }], store: failed });
  const r = p.qam('publish', RUN, '--apply');
  assert.equal(r.status, 0, r.err);
  const d = p.readDoctor();
  assert.equal(d.store.ok, true);
  assert.match(d.store.detail, /reached by publish --apply \(created 1, updated 0\)/);
  assert.match(d.store.detail, /testcases\.csv/);
  assert.equal(d.at, 'A');
  assert.deepEqual(d.checks, [{ check: 'x' }]);
  assert.match(p.qam('pipeline', 'status').out, /reached by publish --apply/);
});

test('publish --apply creates doctor.json when absent', () => {
  const p = project();
  assert.equal(fs.existsSync(path.join(p.dir, DOCTOR)), false);
  assert.equal(p.qam('publish', RUN, '--apply').status, 0);
  assert.equal(p.readDoctor().store.ok, true);
});

test('a dry run leaves doctor.json alone', () => {
  const p = project();
  p.doctor({ store: failed });
  assert.equal(p.qam('publish', RUN).status, 3);
  assert.deepEqual(p.readDoctor(), { store: failed });
});

function withUnpushedScript(p: ReturnType<typeof project>) {
  fs.mkdirSync(path.join(p.dir, 'Shop/features'), { recursive: true });
  fs.writeFileSync(
    path.join(p.dir, 'Shop/features/cart.feature'),
    '@web\nFeature: Cart\n\n  @TC-CART-001\n  Scenario: Pay\n    Given a cart\n',
  );
}

test('the unpushed-scripts message names qam automate with the real plan id and --done', () => {
  const p = project();
  withUnpushedScript(p);
  const plans = path.join(p.dir, '.qamaster/plans');
  fs.mkdirSync(plans, { recursive: true });
  fs.writeFileSync(path.join(plans, 'old111.json'), '{}');
  fs.utimesSync(path.join(plans, 'old111.json'), new Date(2020, 1, 1), new Date(2020, 1, 1));
  fs.writeFileSync(path.join(plans, 'new222.json'), '{}');
  const out = p.qam('publish', RUN).out;
  assert.match(out, /Scripts not pushed to the QA repo \(1\):/);
  assert.match(out, /committed and pushed/);
  assert.match(out, /qam automate new222 --done/);
  assert.doesNotMatch(out, /<[a-z-]+>/);
});

test('with no plan, the message says to run qam plan first', () => {
  const p = project();
  withUnpushedScript(p);
  const out = p.qam('publish', RUN).out;
  assert.match(out, /qam plan, then qam automate with its id and --done/);
  assert.doesNotMatch(out, /<[a-z-]+>/);
});
