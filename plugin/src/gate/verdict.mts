/**
 * The verdict (Q13), ported from CheckMaster's verdict.py. Never green when a selected test failed, didn't run or was
 * skipped, or a selected case is BROKEN. Nothing matched is a pass with a coverage warning (gate.noMatch). A script
 * drafted by this check that fails still fails, with a label (Q39).
 */

import type { Plan, TestResult, Verdict } from '../shared/models.mts';
import { noTouchWarning } from './select.mts';

/** First line of an error worth reading: pytest's `E ` line, else the first line after the runner's header (the scenario title or node id), else the only line. */
const firstError = (e: string | undefined): string => {
  const lines = (e ?? '').split('\n').filter((l) => l.trim());
  const line = (lines.find((l) => l.startsWith('E ')) ?? lines[1] ?? lines[0] ?? '').trim();
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
};

const PROBLEM: Partial<Record<TestResult['status'], string>> = {
  failed: 'failed',
  not_run: "didn't run",
  skipped: 'was skipped',
};

export function decide(plan: Plan, results: TestResult[], o: { newScripts?: Set<number> } = {}): Verdict {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (plan.allowEmpty)
    warnings.push('Approved with --allow-empty: no test case ran, so this pass says nothing about the change.');
  else if (!plan.items.some((i) => i.selected)) warnings.push('No automated test case matches this change.');
  const untouched = noTouchWarning(plan.items, plan.change.files.length);
  if (untouched) warnings.push(untouched);
  for (const n of plan.notRun) if (n.broken) reasons.push(`TC${n.testCase.id}: ${n.why}.`);
  for (const r of results) {
    const problem = PROBLEM[r.status];
    const first = r.status === 'failed' ? firstError(r.error) : '';
    if (problem && r.status === 'failed' && o.newScripts?.has(r.testCaseId))
      reasons.push(
        `TC${r.testCaseId} failed: new script failed: check the script or the app.${first ? ` First error: ${first}` : ''}`,
      );
    else if (first) reasons.push(`TC${r.testCaseId} failed: ${first}`);
    else if (problem) reasons.push(`TC${r.testCaseId} ${problem}.`);
    else if (r.status === 'flaky') warnings.push(`TC${r.testCaseId} is flaky: failed, then passed on retry.`);
  }
  const pass = !reasons.length;
  if (pass) {
    const passed = results.filter((r) => r.status === 'passed' || r.status === 'flaky').length;
    reasons.push(`${passed} of ${results.length} test cases passed.`);
  }
  return {
    result: pass ? 'pass' : 'fail',
    head: plan.change.head,
    ...(plan.testsHead ? { testsHead: plan.testsHead } : {}),
    planId: plan.id,
    reasons,
    warnings,
    results,
  };
}
