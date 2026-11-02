/**
 * Just-in-time automation (Q39; 0.3.0 C3): the worklist of drafts, updates and keeps, and binding the plan to the
 * drafted scripts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { bind, folderHash, recordedUnchanged, worklist } from '../plugin/src/gate/automate.mts';
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

test('bind: a case without a scenario stays manual; a drafted one moves into the plan, and the folder is hashed', () => {
  const app = tmpDir('qam-automate-');
  const scripts = new Map([['TC-A-003', ['features/web/a.feature']]]);
  const drafts = { cases: {}, files: {} };
  const work = worklist(PLAN, { ledger: LEDGER, scripts, drafts });
  const link = (id: string) => `bdd:@${id}`;
  const none = bind(PLAN, { appDir: app, work, ledger: LEDGER, scripts, drafts, link });
  assert.deepEqual(none.plan.newScripts, [], 'nothing drafted: the manual case stays under Not run');
  assert.equal(none.plan.notRun.length, 1);
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

// Found in the D4 run: at --done the drafts exist, so a manual case's fresh script must still count as a draft.
test('at --done a manual case whose script is written but not yet recorded is a draft, and moves into the plan', () => {
  const app = tmpDir('qam-automate-');
  fs.mkdirSync(path.join(app, 'features/web'), { recursive: true });
  fs.writeFileSync(path.join(app, 'features/web/a.feature'), '@web\nFeature: A\n  @TC-A-001\n');
  const scripts = new Map([['TC-A-001', ['features/web/a.feature']]]);
  const drafts = { cases: {}, files: {} };
  const work = worklist(PLAN, { ledger: LEDGER, scripts, drafts });
  assert.equal(work.find((w) => w.localId === 'TC-A-001')?.action, 'draft');
  const r = bind(PLAN, { appDir: app, work, ledger: LEDGER, scripts, drafts, link: (id) => `bdd:@${id}` });
  assert.deepEqual(r.plan.newScripts, [1]);
  assert.equal(r.plan.items.at(-1)?.testCase.automatedTest, 'bdd:@TC-A-001');
  // recorded now: the next check keeps it, and still runs it with its local link while the store has none
  const again = worklist(PLAN, { ledger: LEDGER, scripts, drafts: r.drafts });
  assert.equal(again.find((w) => w.localId === 'TC-A-001')?.action, 'keep');
  const next = bind(PLAN, {
    appDir: app,
    work: again,
    ledger: LEDGER,
    scripts,
    drafts: r.drafts,
    link: (id) => `bdd:@${id}`,
  });
  assert.deepEqual(next.plan.newScripts, [1], 'recorded, not yet passed: still new');
  assert.equal(next.plan.items.at(-1)?.testCase.automatedTest, 'bdd:@TC-A-001');
});

// Q39: a script stays new until it passes once; found in the D4 run, where a re-recorded script lost its label.
test('a recorded script is new until it passes once', async () => {
  const { prove } = await import('../plugin/src/gate/automate.mts');
  const app = tmpDir('qam-automate-');
  fs.mkdirSync(path.join(app, 'features/web'), { recursive: true });
  fs.writeFileSync(path.join(app, 'features/web/a.feature'), '@web\nFeature: A\n  @TC-A-001\n');
  const scripts = new Map([['TC-A-001', ['features/web/a.feature']]]);
  const link = (id: string) => `bdd:@${id}`;
  const first = bind(PLAN, {
    appDir: app,
    work: worklist(PLAN, { ledger: LEDGER, scripts, drafts: { cases: {}, files: {} } }),
    ledger: LEDGER,
    scripts,
    drafts: { cases: {}, files: {} },
    link,
  });
  const again = (drafts: typeof first.drafts) =>
    bind(PLAN, {
      appDir: app,
      work: worklist(PLAN, { ledger: LEDGER, scripts, drafts }),
      ledger: LEDGER,
      scripts,
      drafts,
      link,
    }).plan.newScripts;
  assert.deepEqual(again(first.drafts), [1], 'recorded but never passed: still new');
  assert.deepEqual(again(prove(first.drafts, LEDGER, [1])), [], 'passed once: proven');
});

// Found in the D4 run: publishing adds a link and a Script line, which changes the ledger's hash but not the case.
test('a script needs updating only when its TestGen case changed, not when publish rewrote the store copy', () => {
  const scripts = new Map([['TC-A-002', ['features/web/a.feature']]]);
  const drafts = { cases: { 'TC-A-002': { caseHash: 'case-v1', proven: true } }, files: {} };
  const published = [entry('TC-A-002', 2, 'ledger-after-publish')];
  const action = (caseHash: Map<string, string>) =>
    worklist(PLAN, { ledger: published, scripts, drafts, caseHash }).find((w) => w.localId === 'TC-A-002')?.action;
  assert.equal(action(new Map([['TC-A-002', 'case-v1']])), 'keep');
  assert.equal(action(new Map([['TC-A-002', 'case-v2']])), 'update');
});
