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

/**
 * What kind of failure an error is (0.8.0 item 4, D18), judged from its text: the app showed something other than
 * the case expected (assertion), a step couldn't do its action on the page (Playwright's action errors, a missing
 * element, the app not answering), or the script itself is wrong (a JavaScript or Python error, a missing step).
 * Null when the text says none of these: no kind is better than a guessed one.
 */
export function failureKind(error: string | undefined): string | null {
  const e = error ?? '';
  if (/\bexpect\(|AssertionError|^E\s+assert\b/m.test(e)) return 'assertion failed';
  if (
    /\b(?:locator|page|frame|elementHandle|keyboard|mouse|request|apiRequestContext)\.\w+: |waiting for (?:locator|getBy)|strict mode violation|net::ERR_|Target (?:page|closed)/.test(
      e,
    )
  )
    return "step couldn't act on the page";
  if (
    /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|NameError|AttributeError|ImportError|ModuleNotFoundError)\b|Cannot find module|is not defined|is not a function|Missing step definition/.test(
      e,
    )
  )
    return 'script error';
  return null;
}

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
    const kind = r.status === 'failed' ? failureKind(r.error) : null;
    if (problem && r.status === 'failed' && o.newScripts?.has(r.testCaseId))
      reasons.push(
        `TC${r.testCaseId} failed: new script failed${kind ? ` (${kind})` : ''}: check the script or the app.${first ? ` First error: ${first}` : ''}`,
      );
    else if (first) reasons.push(`TC${r.testCaseId} failed: ${kind ? `${kind}: ` : ''}${first}`);
    else if (problem) reasons.push(`TC${r.testCaseId} ${problem}.`);
    else if (r.status === 'flaky')
      warnings.push(`TC${r.testCaseId} is flaky: failed, then passed on retry (gate.retries: 0 makes it a fail).`);
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
