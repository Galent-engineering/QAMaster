/**
 * Just-in-time automation (Q39; 0.3.0 C3): the worklist of drafts, updates and keeps, and binding the plan to the
 * drafted scripts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { bind, folderHash, recordedUnchanged, worklist } from '../plugin/src/gate/automate.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { LedgerEntry, Plan } from '../plugin/src/shared/models.mts';
import { tmpDir } from './tmp.mts';

const tc = (id: number, automatedTest: string | null = null) => ({
  id,
  title: `Case ${id}`,
  url: 'u',
  tags: [],
  automatedTest,
});
const entry = (localId: string, trackerId: number, hash: string) => ({ localId, trackerId, hash }) as LedgerEntry;
const LEDGER = [entry('TC-A-001', 1, 'h-a'), entry('TC-A-002', 2, 'h-b2'), entry('TC-A-003', 3, 'h-c')];
const PLAN: Plan = {
  id: 'p1',
  createdAt: 'now',
  change: { base: 'main', head: 'h', branch: 'b', files: [] },
  items: [
    { testCase: tc(2, 'bdd:@TC-A-002'), reasons: [{ kind: 'smoke', detail: '' }], selected: true },
    { testCase: tc(3, 'bdd:@TC-A-003'), reasons: [{ kind: 'smoke', detail: '' }], selected: true },
    { testCase: tc(9, 'pytest:t.py::x'), reasons: [{ kind: 'smoke', detail: '' }], selected: true },
  ],
  notRun: [
    {
      testCase: tc(1),
      why: 'manual (no automated test)',
      broken: false,
      reasons: [{ kind: 'path', detail: 'src/a/**' }],
    },
  ],
  gaps: [],
  catalogSize: 4,
  otherGroups: {},
};

test('worklist: no scenario is a draft, a case changed since its script was recorded is an update, else keep', () => {
  const scripts = new Map([
    ['TC-A-002', ['features/web/a.feature']],
    ['TC-A-003', ['features/web/a.feature']],
  ]);
  const drafts = { cases: { 'TC-A-002': { caseHash: 'h-b1' }, 'TC-A-003': { caseHash: 'h-c' } }, files: {} };
  assert.deepEqual(
    worklist(PLAN, { ledger: LEDGER, scripts, drafts }).map((w) => [w.testCaseId, w.localId, w.action]),
    [
      [2, 'TC-A-002', 'update'],
      [3, 'TC-A-003', 'keep'],
      [1, 'TC-A-001', 'draft'],
    ],
  );
});

test('bind: blocks until each case to draft has a scenario, then moves it into the plan and hashes the folder', () => {
  const app = tmpDir('qam-automate-');
  const scripts = new Map([['TC-A-003', ['features/web/a.feature']]]);
  const drafts = { cases: {}, files: {} };
  const work = worklist(PLAN, { ledger: LEDGER, scripts, drafts });
  const link = (id: string) => `bdd:@${id}`;
  assert.throws(
    () => bind(PLAN, { appDir: app, work, ledger: LEDGER, scripts, drafts, link }),
    (e) => e instanceof BlockedError && /@TC-A-002, @TC-A-001/.test(e.message),
  );
  fs.mkdirSync(path.join(app, 'features/web'), { recursive: true });
  fs.writeFileSync(
    path.join(app, 'features/web/a.feature'),
    '@web\nFeature: A\n  @TC-A-001\n  @TC-A-002\n  @TC-A-003\n',
  );
  const all = new Map([
    ['TC-A-001', ['features/web/a.feature']],
    ['TC-A-002', ['features/web/a.feature']],
    ['TC-A-003', ['features/web/a.feature']],
  ]);
  const r = bind(PLAN, { appDir: app, work, ledger: LEDGER, scripts: all, drafts, link });
  assert.deepEqual(r.plan.notRun, []);
  assert.deepEqual(r.plan.items.at(-1), {
    testCase: tc(1, 'bdd:@TC-A-001'),
    reasons: [{ kind: 'path', detail: 'src/a/**' }],
    selected: true,
  });
  assert.deepEqual(r.plan.newScripts, [2, 1]);
  assert.equal(r.plan.scriptsHash, folderHash(app));
  assert.deepEqual(r.drafts.cases, { 'TC-A-001': { caseHash: 'h-a' }, 'TC-A-002': { caseHash: 'h-b2' } });
  const feature = path.join(fs.realpathSync(app), 'features/web/a.feature');
  assert.ok(recordedUnchanged(r.drafts, feature));
  fs.appendFileSync(feature, '# edited\n');
  assert.equal(recordedUnchanged(r.drafts, feature), false);
  assert.notEqual(folderHash(app), r.plan.scriptsHash);
});
