/** 0.8.0 gate items 1-7: an empty approval is refused, consent with no terminal, evidence per run, failure kinds, stories. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Runner } from '../plugin/src/adapters/base.mts';
import { evidenceName, renderPlan, renderVerdict } from '../plugin/src/cli/gate.mts';
import { approve, type Gate, makePlan } from '../plugin/src/gate/gate.mts';
import { planWith } from '../plugin/src/gate/presets.mts';
import { renderTrial, trial } from '../plugin/src/gate/trial.mts';
import { decide } from '../plugin/src/gate/verdict.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { NotRun, Plan, TestCase } from '../plugin/src/shared/models.mts';
import { FakeRepoReader, FakeRunner, FakeStore } from './fakes.mts';

function gate(more: Partial<Gate> = {}) {
  const runners: Record<string, Runner> = { 'playwright-bdd': new FakeRunner(), pytest: new FakeRunner() };
  const g: Gate = {
    store: new FakeStore(),
    repo: new FakeRepoReader(),
    runner: (name) => runners[name] ?? null,
    root: (name) => `/tests/${name}`,
    retries: 1,
    ...more,
  };
  return g;
}
const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);
const manual: TestCase = { id: 503, title: 'Gift card coupon', url: 'u', tags: [], automatedTest: null };
const notRun = (kind: 'path' | 'smoke' | 'group'): NotRun => ({
  testCase: manual,
  why: 'manual (no automated test)',
  broken: false,
  reasons: [{ kind, detail: 'x' }],
});
async function empty(rows: NotRun[]): Promise<Plan> {
  const plan = await makePlan(gate(), 'main', {});
  return { ...plan, items: [], notRun: rows };
}

test('item 1: approving a plan that would run 0 cases is refused when the change matched manual cases', async () => {
  for (const kind of ['path', 'group'] as const)
    await assert.rejects(
      approve(gate(), await empty([notRun(kind)]), 'ada', [], []),
      blocked(/would run 0 test cases/),
    );
});

test('item 1: nothing matched, or only manual smoke, stays approvable', async () => {
  assert.equal((await approve(gate(), await empty([]), 'ada', [], [])).approvedBy, 'ada');
  assert.equal((await approve(gate(), await empty([notRun('smoke')]), 'ada', [], [])).approvedBy, 'ada');
});

test('item 1: removing every item is refused', async () => {
  const g = gate();
  const plan = await makePlan(g, 'main', {});
  await assert.rejects(approve(g, plan, 'ada', [], ['TC501', 'TC502', 'TC601']), blocked(/would run 0 test cases/));
});

test('item 1: --allow-empty records allowEmpty on the plan and the verdict names it', async () => {
  const plan = await approve(gate(), await empty([notRun('path')]), 'ada', [], [], { allowEmpty: true });
  assert.equal(plan.allowEmpty, true);
  const v = decide(plan, []);
  assert.ok(v.warnings.some((w) => /--allow-empty/.test(w)));
  assert.match(renderVerdict(v, plan), /--allow-empty/);
});

test('item 1: a non-empty approval does not record allowEmpty', async () => {
  const g = gate();
  const plan = await approve(g, await makePlan(g, 'main', {}), 'ada', [], [], { allowEmpty: true });
  assert.equal(plan.allowEmpty, undefined);
});

test('item 1: renderPlan says when approval will be refused', async () => {
  assert.match(renderPlan(await empty([notRun('path')])), /approval will be refused/i);
  assert.doesNotMatch(renderPlan(await empty([notRun('smoke')])), /approval will be refused/i);
  assert.doesNotMatch(renderPlan(await makePlan(gate(), 'main', {})), /approval will be refused/i);
});

test('item 3: each run keeps its evidence in a folder named like its verdict file', async () => {
  const g = gate();
  const a = await makePlan(g, 'main', {});
  const b = await makePlan(g, 'main', {});
  assert.equal(evidenceName(a), `${a.change.head}-${a.id}`);
  assert.notEqual(evidenceName(a), evidenceName(b), 'two plans on one HEAD do not share a folder');
});

const planOf = (id: number): Plan =>
  ({
    id: 'p1',
    createdAt: '2026-11-11T00:00:00Z',
    change: { base: 'main', head: 'sha1', branch: 'b', files: [{ path: 'a.ts', status: 'M' }] },
    items: [
      {
        testCase: { id, title: 't', url: 'u', tags: [], automatedTest: 'bdd:@x' },
        reasons: [{ kind: 'path', detail: 'a' }],
        selected: true,
      },
    ],
    notRun: [],
    gaps: [],
    catalogSize: 1,
    otherGroups: {},
  }) as unknown as Plan;
const failed = (error: string) => ({
  testCaseId: 1,
  status: 'failed' as const,
  durationS: 1,
  testIds: [],
  evidence: [],
  error,
});

test('item 4: a failed case names its kind before the first error line', () => {
  const kind = (error: string) => decide(planOf(1), [failed(error)]).reasons[0];
  assert.match(
    kind('Add a todo\nError: expect(locator).toHaveText(expected) failed\nExpected: "2"\nReceived: "1"'),
    /^TC1 failed: assertion failed: Error: expect\(locator\)/,
  );
  assert.match(kind('Add\nE   assert 3 == 4'), /^TC1 failed: assertion failed: E {3}assert 3 == 4/);
  assert.match(
    kind('Add a todo\nError: locator.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole'),
    /^TC1 failed: step couldn't act on the page: Error: locator\.click: Timeout/,
  );
  assert.match(
    kind('Add\nError: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000'),
    /^TC1 failed: step couldn't act on the page:/,
  );
  assert.match(
    kind('Add\nTypeError: Cannot read properties of undefined (reading "click")\n  at steps.ts:4'),
    /^TC1 failed: script error: TypeError/,
  );
  assert.match(kind('Add\nError: Missing step definition for "I open the page"'), /^TC1 failed: script error:/);
  assert.equal(kind('Add\nsomething odd'), 'TC1 failed: something odd', 'an unrecognised error gets no guessed kind');
});

test('item 4: a new script that fails keeps its label and gains the kind', () => {
  const v = decide(planOf(1), [failed('Add\nError: locator.fill: Timeout 30000ms exceeded.')], {
    newScripts: new Set([1]),
  });
  assert.match(
    v.reasons[0],
    /^TC1 failed: new script failed \(step couldn't act on the page\): check the script or the app\. First error: Error: locator\.fill/,
  );
});

test('item 4: a trial runs only the new scripts once and returns their results', async () => {
  const runner = new FakeRunner(['bdd:@TC-NEW-1', 'bdd:@TC-NEW-2', 'bdd:@TC-OLD'], new Set([502]));
  const g = gate({ runner: () => runner });
  const work = [
    { testCaseId: 501, localId: 'TC-NEW-1', action: 'draft' as const, files: ['a.feature'] },
    { testCaseId: 502, localId: 'TC-NEW-2', action: 'update' as const, files: ['b.feature'] },
    { testCaseId: 601, localId: 'TC-OLD', action: 'keep' as const, files: ['c.feature'] },
    { testCaseId: 503, localId: 'TC-NONE', action: 'draft' as const, files: [] },
  ];
  const t = await trial(g, work, (id) => `bdd:@${id}`, '/ev');
  assert.deepEqual(
    t.map((r) => [r.testCaseId, r.status]),
    [
      [501, 'passed'],
      [502, 'failed'],
    ],
  );
  assert.equal(runner.ran.length, 1, 'once');
  assert.deepEqual(
    [...runner.ran[0].selection],
    [
      [501, ['bdd:@TC-NEW-1']],
      [502, ['bdd:@TC-NEW-2']],
    ],
  );
  assert.equal(runner.ran[0].evidence, '/ev');
});

test('item 4: a trial of a script the runner cannot find says so instead of passing', async () => {
  const g = gate({ runner: () => new FakeRunner([]) });
  const work = [{ testCaseId: 501, localId: 'TC-NEW-1', action: 'draft' as const, files: ['a.feature'] }];
  const [r] = await trial(g, work, (id) => `bdd:@${id}`, '/ev');
  assert.equal(r.status, 'not_run');
  assert.match(r.error ?? '', /no scenario/i);
});

test('item 4: renderTrial names each result, its kind, and that a trial pass is not proof', () => {
  const text = renderTrial(
    [
      { testCaseId: 501, status: 'passed', durationS: 1.2, testIds: [], evidence: [] },
      {
        testCaseId: 502,
        status: 'failed',
        durationS: 3,
        testIds: [],
        evidence: [],
        error: 'T\nError: locator.click: Timeout 30000ms exceeded.',
      },
    ],
    new Map([[501, 'Add a todo']]),
    '/tmp/ev',
  );
  assert.match(text, /passed\s+TC501\s+Add a todo/);
  assert.match(text, /failed\s+TC502/);
  assert.match(text, /step couldn't act on the page/);
  assert.match(text, /doesn't make a script proven/);
  assert.match(text, /\/tmp\/ev/);
});

// item 5: story-aware selection
const storyChange = (...stories: string[]) => ({
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  branch: 'feature/x',
  files: [{ path: 'docs/readme.md', status: 'M' }],
  stories,
});
const withReq = (): FakeStore => {
  const s = new FakeStore();
  const add = (id: number, tag: string) => {
    const i = s.items.get(id);
    if (i) i.tags = [...i.tags, tag];
  };
  add(503, 'req:42'); // a manual case
  add(701, 'req:42');
  add(502, 'req:7');
  return s;
};

test('item 5: a case tagged req:<id> is selected for the AB#<id> in the change, reason kind story', async () => {
  const g = gate({ store: withReq(), repo: new FakeRepoReader(storyChange('42')) });
  const plan = await makePlan(g, 'main', {});
  const story = plan.items.find((i) => i.testCase.id === 701);
  assert.deepEqual(story?.reasons, [{ kind: 'story', detail: 'AB#42' }]);
  assert.ok(!plan.items.some((i) => i.testCase.id === 502), 'req:7 is another story');
  assert.deepEqual(
    plan.notRun.map((n) => [n.testCase.id, n.reasons?.map((r) => r.kind)]),
    [[503, ['story']]],
  );
  assert.deepEqual(plan.stories, [{ id: '42', cases: [503, 701] }]);
});

test('item 5: a story no case covers is a listed gap and selects nothing', async () => {
  const g = gate({ store: withReq(), repo: new FakeRepoReader(storyChange('99')) });
  const plan = await makePlan(g, 'main', {});
  assert.deepEqual(plan.stories, [{ id: '99', cases: [] }]);
  assert.ok(!plan.items.some((i) => i.reasons.some((r) => r.kind === 'story')));
  const text = renderPlan(plan);
  assert.match(text, /AB#99\s+no test case is tagged req:99/);
  const v = decide(plan, []);
  assert.equal(v.result, 'pass', 'the verdict is unchanged');
});

test('item 5: req: tags are not groups, so they are not offered as other groups', async () => {
  const plan = await makePlan(gate({ store: withReq() }), 'main', {});
  assert.ok(!Object.keys(plan.otherGroups).some((t) => t.startsWith('req:')));
});

test('item 5: renderPlan says why a case is there', async () => {
  const g = gate({ store: withReq(), repo: new FakeRepoReader(storyChange('42')) });
  const text = renderPlan(await makePlan(g, 'main', {}));
  assert.match(text, /TC701\s+Add to cart\s+story AB#42/);
  assert.match(text, /AB#42\s+TC503, TC701/);
});

test('item 5: story selection runs under standard and full, not fast', async () => {
  const mk = () => gate({ store: withReq(), repo: new FakeRepoReader(storyChange('42')) });
  const o = { ai: 'off', groupsModel: null } as const;
  const fast = await planWith(mk(), 'main', {}, { preset: 'fast', ...o });
  assert.ok(!fast.items.some((i) => i.testCase.id === 701));
  assert.equal(fast.stories, undefined);
  assert.deepEqual(fast.selection?.selectors, ['path', 'smoke']);
  const std = await planWith(mk(), 'main', {}, { preset: 'standard', ...o });
  assert.ok(std.items.some((i) => i.testCase.id === 701));
  assert.deepEqual(std.selection?.selectors, ['path', 'smoke', 'story']);
  const full = await planWith(mk(), 'main', {}, { preset: 'full', ...o });
  assert.deepEqual(full.stories, [{ id: '42', cases: [503, 701] }]);
  assert.ok(full.items.find((i) => i.testCase.id === 701)?.reasons.some((r) => r.kind === 'story'));
});

test('item 5: a story-selected case counts as covering the change', async () => {
  const g = gate({ store: withReq(), repo: new FakeRepoReader(storyChange('42')) });
  const plan = await makePlan(g, 'main', {});
  assert.doesNotMatch(renderPlan(plan), /warning: no selected test case covers/i);
});
