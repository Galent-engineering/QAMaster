/**
 * A trial run (0.8.0 item 4, D18): `qam automate <plan-id> --try` runs the scripts the plan has to draft or update once,
 * so a bad script shows before the person approves. It writes no state: no plan, no drafts.json, no verdict, so a trial
 * pass never makes a script proven (Q39); only the approved run does.
 */

import type { TestResult } from '../shared/models.mts';
import type { Work } from './automate.mts';
import type { Gate } from './gate.mts';
import { linkRunner, resolve } from './select.mts';
import { failureKind } from './verdict.mts';

/** Runs each script to draft or update (and every script already bound as new) once, on the runner its link names. */
export async function trial(
  g: Pick<Gate, 'runner' | 'root'>,
  work: Work[],
  link: (localId: string) => string,
  evidence: string,
): Promise<TestResult[]> {
  const mine = work.filter((w) => w.action !== 'keep' && w.files.length);
  const byRunner = new Map<string, Map<number, string>>();
  for (const w of mine) {
    const l = link(w.localId);
    const name = linkRunner(l);
    if (name) byRunner.set(name, (byRunner.get(name) ?? new Map()).set(w.testCaseId, l));
  }
  const out = new Map<number, TestResult>();
  for (const [name, links] of byRunner) {
    const runner = g.runner(name);
    if (!runner) continue;
    const collected = await runner.collected(g.root(name));
    const selection = new Map<number, string[]>();
    for (const [id, l] of links) {
      const ids = resolve(l, collected);
      if (ids.length) selection.set(id, ids);
      else
        out.set(id, {
          testCaseId: id,
          status: 'not_run',
          durationS: 0,
          testIds: [],
          evidence: [],
          error: `No scenario tagged ${l} was found: the script isn't where the runner looks, or isn't tagged.`,
        });
    }
    if (selection.size) for (const r of await runner.run(selection, g.root(name), evidence)) out.set(r.testCaseId, r);
  }
  return mine.map((w) => out.get(w.testCaseId)).filter((r): r is TestResult => !!r);
}

/** The trial's lines: one per script, the failure's kind and first error, and what a pass does not mean. */
export function renderTrial(results: TestResult[], titles: Map<number, string>, evidence: string): string {
  const lines = [`Trial run of ${results.length} new script${results.length === 1 ? '' : 's'} (nothing recorded):`];
  for (const r of results) {
    lines.push(
      `  ${r.status.padEnd(8)} TC${r.testCaseId}  ${titles.get(r.testCaseId) ?? ''}  ${r.durationS.toFixed(1)}s`.trimEnd(),
    );
    if (r.status === 'passed') continue;
    const errs = (r.error ?? '').split('\n').filter((l) => l.trim());
    const kind = failureKind(r.error);
    if (kind) lines.push(`      ${kind}`);
    lines.push(...errs.slice(0, 5).map((l) => `      ${l}`));
  }
  if (results.some((r) => r.status !== 'passed')) lines.push(`  evidence kept in ${evidence}`);
  lines.push(
    "A trial pass doesn't make a script proven (Q39): it is still new until an approved run passes it. Fix what failed, run qam check-scripts, then qam automate --done.",
  );
  return lines.join('\n');
}
