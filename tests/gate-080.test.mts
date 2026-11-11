/** 0.8.0 gate items 1-7: an empty approval is refused, consent with no terminal, evidence per run, failure kinds, stories. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Runner } from '../plugin/src/adapters/base.mts';
import { renderPlan, renderVerdict } from '../plugin/src/cli/gate.mts';
import { approve, type Gate, makePlan } from '../plugin/src/gate/gate.mts';
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
