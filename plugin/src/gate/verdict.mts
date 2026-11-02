/**
 * The verdict (Q13), ported from CheckMaster's verdict.py. Never green when a selected test failed, didn't run or was
 * skipped, or a selected case is BROKEN. Nothing matched is a pass with a coverage warning (gate.noMatch). A script
 * drafted by this check that fails still fails, with a label (Q39).
 */
import type { Plan, TestResult, Verdict } from '../shared/models.mts';

const PROBLEM: Partial<Record<TestResult['status'], string>> = {
  failed: 'failed',
  not_run: "didn't run",
  skipped: 'was skipped',
};

export function decide(plan: Plan, results: TestResult[], o: { newScripts?: Set<number> } = {}): Verdict {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!plan.items.some((i) => i.selected)) warnings.push('No automated test case matches this change.');
  for (const n of plan.notRun) if (n.broken) reasons.push(`TC${n.testCase.id}: ${n.why}.`);
  for (const r of results) {
    const problem = PROBLEM[r.status];
    if (problem && r.status === 'failed' && o.newScripts?.has(r.testCaseId))
      reasons.push(`TC${r.testCaseId} failed: new script failed: check the script or the app.`);
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
