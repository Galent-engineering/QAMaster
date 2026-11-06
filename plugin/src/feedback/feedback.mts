/**
 * Feedback (Q19): reads a verdict and its plan and proposes. It writes to no store and generates nothing: coverage
 * gaps, stale cases, BROKEN links and defect drafts for a person to file. Pure; the CLI loads the inputs and saves it.
 */
import { matchKey } from '../dsm/build.mts';
import type { Gap, Plan, Verdict } from '../shared/models.mts';

/** A case of a TestGen run (testgen/output/<run>/testcases.json); the file's own snake_case names. */
export type RunCase = {
  id?: string;
  title?: string;
  component?: string;
  priority?: string;
  type?: string;
  category?: string;
  objective?: string;
  expected_result?: string;
  evidence?: string[];
  steps?: {
    screen?: string;
    leads_to?: string;
    action?: string;
    element?: string;
    data?: string;
    expected?: string;
    evidence?: string[];
  }[];
};
export type RunCases = { run: string; cases: RunCase[] };

export type DefectDraft = {
  testCaseId: number;
  title: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence: string[];
  severity: string;
};
export type StaleCase = { localId: string; title: string; run: string; missing: string[] };
export type BrokenLink = { testCaseId: number; title: string; why: string };

export type Feedback = {
  head: string;
  planId: string;
  generatedAt: string;
  gaps: Gap[];
  stale: StaleCase[];
  broken: BrokenLink[];
  defects: DefectDraft[];
  /** What to do next, in words; starting a TestGen run is the person's choice. */
  proposal: string[];
  /** What couldn't be checked, so an empty list is not mistaken for a clean one. */
  notes: string[];
};

export type FeedbackInput = {
  verdict: Verdict;
  plan: Plan | null;
  runs: RunCases[];
  ledger: Map<string, number>; // local ID -> store ID
  /** The DSM's screens (node ids), or null when there is no DSM to compare with. */
  screens: string[] | null;
  now?: Date;
};

const titleOf = (plan: Plan | null, id: number): string =>
  [...(plan?.items ?? []).map((i) => i.testCase), ...(plan?.notRun ?? []).map((n) => n.testCase)].find(
    (t) => t.id === id,
  )?.title ?? `TC${id}`;

export function defectDrafts(i: Pick<FeedbackInput, 'verdict' | 'plan' | 'runs' | 'ledger'>): DefectDraft[] {
  const byStore = new Map<number, RunCase>();
  for (const r of i.runs)
    for (const c of r.cases) {
      const store = c.id ? i.ledger.get(c.id) : undefined;
      if (store !== undefined) byStore.set(store, c);
    }
  return i.verdict.results
    .filter((r) => r.status === 'failed')
    .map((r) => {
      const src = byStore.get(r.testCaseId);
      const steps = (src?.steps ?? []).map(
        (s, n) =>
          `${n + 1}. ${[s.action, s.element && `on ${s.element}`, s.screen && `(${s.screen})`].filter(Boolean).join(' ')}`,
      );
      const last = src?.steps?.at(-1)?.expected;
      return {
        testCaseId: r.testCaseId,
        title: `${titleOf(i.plan, r.testCaseId)} fails on ${i.verdict.head.slice(0, 8)}`,
        steps: steps.length ? steps : ['Steps are in the published test case.'],
        expected: src?.expected_result || last || 'See the published test case.',
        actual: r.error?.trim() || 'The automated test failed; no error text was captured.',
        evidence: r.evidence,
        severity: src?.priority ?? 'Not specified',
      };
    });
}

export function propose(i: FeedbackInput): Feedback {
  const { verdict, plan } = i;
  const notes: string[] = [];
  if (!plan) notes.push(`Plan ${verdict.planId} isn't on this machine, so gaps and BROKEN links are unknown.`);

  const known = i.screens ? new Set(i.screens.map(matchKey)) : null;
  if (!known) notes.push('No DSM yet (qam dsm run), so stale cases could not be checked.');
  const stale: StaleCase[] = [];
  for (const r of i.runs)
    for (const c of r.cases) {
      if (!c.id || !known) continue;
      const missing = [
        ...new Set((c.steps ?? []).flatMap((s) => [s.screen, s.leads_to]).filter((x): x is string => !!x)),
      ].filter((s) => !known.has(matchKey(s)));
      if (missing.length) stale.push({ localId: c.id, title: c.title ?? c.id, run: r.run, missing: missing.sort() });
    }

  const gaps = plan?.gaps ?? [];
  const broken = (plan?.notRun ?? [])
    .filter((n) => n.broken)
    .map((n) => ({ testCaseId: n.testCase.id, title: n.testCase.title, why: n.why }));
  const defects = defectDrafts(i);

  const proposal: string[] = [];
  if (gaps.length) proposal.push(`Run TestGen for the screens with no case: ${gaps.map((g) => g.screen).join(', ')}.`);
  if (stale.length)
    proposal.push(
      `Review ${stale.length} case(s) that cite screens the DSM no longer has, then retire or regenerate them.`,
    );
  if (broken.length)
    proposal.push(`Fix ${broken.length} BROKEN link(s): the automated test named in the store isn't in the test root.`);
  if (defects.length) proposal.push(`File ${defects.length} defect(s) from the drafts, if the failures are real.`);
  return {
    head: verdict.head,
    planId: verdict.planId,
    generatedAt: (i.now ?? new Date()).toISOString(),
    gaps,
    stale,
    broken,
    defects,
    proposal,
    notes,
  };
}
