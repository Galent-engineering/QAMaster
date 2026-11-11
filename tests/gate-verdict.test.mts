/**
 * The verdict (Q13; 0.3.0 B2), ported from CheckMaster's tests/test_verdict.py, plus Q39's label for a script that
 * has never passed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../plugin/src/gate/verdict.mts';
import type { NotRun, Plan, TestResult, TestStatus } from '../plugin/src/shared/models.mts';

const tc = (id: number) => ({ id, title: 't', url: 'u', tags: [], automatedTest: null });
function plan(selected = [1, 2], notRun: NotRun[] = []): Plan {
  return {
    id: 'p1',
    createdAt: '2026-11-02T00:00:00Z',
    change: { base: 'main', head: 'sha1', branch: 'b', files: [] },
    items: selected.map((id) => ({ testCase: tc(id), reasons: [{ kind: 'smoke', detail: '' }], selected: true })),
    notRun,
    gaps: [],
    catalogSize: 0,
    otherGroups: {},
  };
}
const results = (statuses: Record<number, TestStatus>): TestResult[] =>
  Object.entries(statuses).map(([id, status]) => ({
    testCaseId: Number(id),
    status,
    durationS: 0,
    testIds: [],
    evidence: [],
  }));

test('all passed is pass', () => {
  const v = decide(plan(), results({ 1: 'passed', 2: 'passed' }));
  assert.deepEqual([v.result, v.reasons, v.head], ['pass', ['2 of 2 test cases passed.'], 'sha1']);
});

test('any failed, missing or skipped test fails', () => {
  for (const status of ['failed', 'not_run', 'skipped'] as const) {
    const v = decide(plan(), results({ 1: 'passed', 2: status }));
    assert.equal(v.result, 'fail', status);
    assert.match(v.reasons[0], /^TC2 /);
  }
});

test('flaky passes with a warning', () => {
  const v = decide(plan(), results({ 1: 'passed', 2: 'flaky' }));
  assert.equal(v.result, 'pass');
  assert.deepEqual(v.warnings, ['TC2 is flaky: failed, then passed on retry (gate.retries: 0 makes it a fail).']);
});

test('nothing selected is a pass with a coverage warning (gate.noMatch: pass-with-warning)', () => {
  const v = decide(plan([]), []);
  assert.deepEqual([v.result, v.warnings.length], ['pass', 1]);
  assert.match(v.warnings[0], /No automated test case matches this change/);
});

test('a BROKEN automation link fails, a manual case does not', () => {
  const broken: NotRun = { testCase: tc(7), why: 'gone', broken: true };
  const manual: NotRun = { testCase: tc(8), why: 'manual', broken: false };
  const v = decide(plan([1, 2], [broken, manual]), results({ 1: 'passed', 2: 'passed' }));
  assert.deepEqual([v.result, v.reasons], ['fail', ['TC7: gone.']]);
});

// Q39: a script drafted by this check that fails still fails the verdict, labelled so the person looks at both.
test('a new script that failed fails, labelled "new script failed"', () => {
  const v = decide(plan(), results({ 1: 'passed', 2: 'failed' }), { newScripts: new Set([2]) });
  assert.equal(v.result, 'fail');
  assert.equal(v.reasons[0], 'TC2 failed: new script failed: check the script or the app.');
});
