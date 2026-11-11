/** 0.7.2 items 8-12: --tag parsing, the no-touch warning, verdict wording (first error, flaky, API origin). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderPlan, renderVerdict, tags } from '../plugin/src/cli/gate.mts';
import { decide } from '../plugin/src/gate/verdict.mts';
import type { Plan, PlanItem, Reason, TestResult } from '../plugin/src/shared/models.mts';

const tc = (id: number) => ({ id, title: `case ${id}`, url: 'u', tags: [], automatedTest: null });
const item = (id: number, kind: Reason['kind']): PlanItem => ({
  testCase: tc(id),
  reasons: [{ kind, detail: 'x' }],
  selected: true,
});
function plan(items: PlanItem[], files = ['a.ts']): Plan {
  return {
    id: 'p1',
    createdAt: '2026-11-11T00:00:00Z',
    change: { base: 'main', head: 'sha1', branch: 'b', files: files.map((path) => ({ path, status: 'M' })) },
    items,
    notRun: [],
    gaps: [],
    catalogSize: 3,
    otherGroups: {},
  } as unknown as Plan;
}
const res = (testCaseId: number, status: TestResult['status'], error?: string): TestResult => ({
  testCaseId,
  status,
  durationS: 1,
  testIds: [],
  evidence: [],
  ...(error ? { error } : {}),
});

test('item 8: a comma in a --tag reason stays in the reason', () => {
  assert.deepEqual(tags(['todo=the Todo module, and its list']), { todo: 'the Todo module, and its list' });
  assert.deepEqual(tags(['todo=a', 'cart=b, c']), { todo: 'a', cart: 'b, c' });
  assert.deepEqual(tags(['todo']), { todo: '' });
});

test('item 9: a plan whose cases none touch the change says so as a warning', () => {
  assert.match(renderPlan(plan([item(1, 'group')])), /warning: no selected test case covers or visits/i);
  assert.doesNotMatch(renderPlan(plan([item(1, 'group'), item(2, 'dsm')])), /warning: no selected/i);
  assert.doesNotMatch(renderPlan(plan([item(1, 'path')])), /warning: no selected/i);
  assert.doesNotMatch(renderPlan(plan([item(1, 'group')], [])), /warning: no selected/i);
  const v = decide(plan([item(1, 'group')]), [res(1, 'passed')]);
  assert.ok(v.warnings.some((w) => /no selected test case covers or visits/i.test(w)));
});

test('item 10: the verdict reason names the first error line of each failed case', () => {
  const v = decide(plan([item(1, 'path'), item(2, 'path')]), [
    res(1, 'failed', 'Add a todo\n  Error: locator.check: Element is outside of the viewport\n  at x'),
    res(2, 'failed', 'tests/t.py::test_a\nE   assert 3 == 4\nE   more'),
  ]);
  assert.ok(
    v.reasons.some(
      (r) =>
        r === "TC1 failed: step couldn't act on the page: Error: locator.check: Element is outside of the viewport",
    ),
  );
  assert.ok(v.reasons.some((r) => r === 'TC2 failed: assertion failed: E   assert 3 == 4'));
  const n = decide(plan([item(1, 'path')]), [res(1, 'failed', 'Boom')], { newScripts: new Set([1]) });
  assert.match(n.reasons[0], /^TC1 failed: new script failed: check the script or the app\. First error: Boom/);
  assert.deepEqual(decide(plan([item(1, 'path')]), [res(1, 'failed')]).reasons, ['TC1 failed.']);
});

test('item 11: the check summary names each flaky case on its own line; flaky still passes', () => {
  const p = plan([item(1, 'path'), item(2, 'path'), item(3, 'path')]);
  const v = decide(p, [res(1, 'flaky', 'timeout'), res(2, 'flaky'), res(3, 'passed')]);
  assert.equal(v.result, 'pass');
  const lines = renderVerdict(v, p).split('\n');
  assert.ok(lines.some((l) => /^ {2}flaky: TC1 .*case 1.*still a pass/.test(l)));
  assert.ok(lines.some((l) => /^ {2}flaky: TC2 .*case 2.*still a pass/.test(l)));
});

test('item 12: the verdict says an API on another origin is not watched', () => {
  const p = plan([item(1, 'path')]);
  const text = renderVerdict(decide(p, [res(1, 'passed')]), p);
  assert.match(text, /not watched.*origin other than baseURL|origin other than baseURL.*not watched/i);
});
