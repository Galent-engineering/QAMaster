/**
 * The gate: plan → approve → run (Q11–Q13). Ported from CheckMaster's pipeline.py. Each step takes its services as
 * arguments, so tests pass fakes. Changes from CheckMaster:
 *   - each case runs on the runner its link's prefix names, in that runner's folder (Q38);
 *   - retries live here, around any runner, so every runner gets the same flaky rule;
 *   - approval is bound to HEAD and, when the tests live in a QA project, to its commit (Q22);
 *   - the DSM adds the cases on impacted screens and the screens no case visits (Q31), and a shared file selects
 *     nothing by path (Q37).
 */
import { randomBytes } from 'node:crypto';
import type { RepoReader, Runner, TestCaseStore } from '../adapters/base.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Gap, Plan, PlanItem, TestCase, TestResult, Verdict } from '../shared/models.mts';
import { candidates, groups, linkRunner, resolve, split } from './select.mts';
import { decide } from './verdict.mts';

export type Gate = {
  store: Pick<TestCaseStore, 'inPlan' | 'url'>;
  repo: RepoReader;
  /** The runner registered under a name, or null when QAMaster has none. */
  runner: (name: string) => Runner | null;
  /** The folder a runner runs in (Q38: runners.<name>.root, else the test root). */
  root: (name: string) => string;
  /** The QA project's commit when the tests live there (Q22). */
  testsHead?: () => string | undefined;
  /** The cases on the screens the changed files touch, and the touched screens no case visits. */
  dsm?: (files: string[]) => { cases: Map<number, string[]>; gaps: Gap[] };
  retries: number;
  sharedShare?: number;
};

const ids = (xs: number[]) => xs.map((id) => `TC${id}`).join(', ');

/** Runner name -> its runner, for every runner the links name; blocks on a runner QAMaster doesn't have (Q38). */
function runnersFor(g: Gate, cases: TestCase[]): Map<string, Runner> {
  const out = new Map<string, Runner>();
  const missing = new Map<string, number[]>();
  for (const c of cases) {
    const name = c.automatedTest ? linkRunner(c.automatedTest) : null;
    if (!name || out.has(name)) continue;
    const r = g.runner(name);
    if (r) out.set(name, r);
    else missing.set(name, [...(missing.get(name) ?? []), c.id]);
  }
  if (missing.size)
    throw new BlockedError(
      [...missing]
        .map(([name, cs]) => `No ${name} runner in QAMaster for ${ids(cs)}: change the link, or wait for that runner.`)
        .join('\n'),
    );
  return out;
}

async function collect(g: Gate, runners: Map<string, Runner>): Promise<string[]> {
  return (await Promise.all([...runners].map(([name, r]) => r.collected(g.root(name))))).flat();
}

export async function makePlan(g: Gate, base: string, wanted: Record<string, string>): Promise<Plan> {
  const change = await g.repo.diff(base, await g.repo.head());
  const catalog = await g.store.inPlan();
  const dsm = g.dsm?.(change.files.map((f) => f.path));
  const shared: { file: string; cases: number }[] = [];
  const reasons = candidates({ change, catalog, wanted, sharedShare: g.sharedShare, shared, dsm: dsm?.cases });
  const picked = [...reasons.keys()].map((id) => catalog.get(id)).filter((c): c is TestCase => !!c);
  const runners = runnersFor(g, picked);
  const { items, notRun } = split(reasons, catalog, await collect(g, runners), (id) => g.store.url(id));
  const otherGroups = Object.fromEntries(
    Object.entries(groups(catalog))
      .filter(([, cs]) => !cs.every((id) => reasons.has(id)))
      .map(([tag, cs]) => [tag, cs.filter((id) => !reasons.has(id)).map((id) => catalog.get(id)?.title ?? `TC${id}`)]),
  );
  const testsHead = g.testsHead?.();
  return {
    id: randomBytes(4).toString('hex'),
    createdAt: new Date().toISOString(),
    change,
    ...(testsHead ? { testsHead } : {}),
    items,
    notRun,
    gaps: dsm?.gaps ?? [],
    ...(shared.length ? { shared } : {}),
    catalogSize: catalog.size,
    otherGroups,
  };
}

async function requireSame(g: Gate, plan: Plan): Promise<void> {
  if ((await g.repo.head()) !== plan.change.head)
    throw new BlockedError(`HEAD moved since plan ${plan.id} was made. Run qam plan again.`);
  const tests = g.testsHead?.();
  if (plan.testsHead && tests !== plan.testsHead)
    throw new BlockedError(`The QA project moved since plan ${plan.id} was made (Q22). Run qam plan again.`);
}

/** Test case IDs (`TC6` or `6`) and group tags, as test case IDs. */
function expand(names: string[], catalog: Map<number, TestCase>): number[] {
  const known = groups(catalog);
  const out: number[] = [];
  for (const n of names) {
    const id = n.replace(/^TC/i, '');
    if (/^\d+$/.test(id)) out.push(Number(id));
    else if (n in known) out.push(...known[n]);
    else throw new BlockedError(`'${n}' is neither a test case ID nor a group (${Object.keys(known).join(', ')}).`);
  }
  return [...new Set(out)];
}

export async function approve(g: Gate, plan: Plan, by: string, add: string[], remove: string[]): Promise<Plan> {
  await requireSame(g, plan);
  const inPlan = new Set(plan.items.map((i) => i.testCase.id));
  const catalog = add.length || remove.length ? await g.store.inPlan() : new Map<number, TestCase>();
  const removing = expand(remove, catalog);
  const adding = expand(add, catalog);
  const unknown = removing.filter((id) => !inPlan.has(id));
  if (unknown.length) throw new BlockedError(`Can't remove ${ids(unknown)}: not in plan ${plan.id}.`);
  const fresh = adding.filter((id) => !inPlan.has(id));
  if (fresh.length) {
    const cases = fresh.map((id) => {
      const c = catalog.get(id);
      if (!c) throw new BlockedError(`Can't add TC${id}: it isn't in the test case store's plan.`);
      return c;
    });
    const collected = await collect(g, runnersFor(g, cases));
    for (const c of cases) {
      if (!c.automatedTest || !linkRunner(c.automatedTest) || !resolve(c.automatedTest, collected).length)
        throw new BlockedError(`Can't add TC${c.id}: it has no automated test in the test root.`);
      plan.items.push({ testCase: c, reasons: [{ kind: 'added', detail: by }], selected: true });
    }
  }
  for (const i of plan.items) {
    if (removing.includes(i.testCase.id)) i.selected = false;
    else if (adding.includes(i.testCase.id)) i.selected = true;
  }
  plan.approvedBy = by;
  plan.approvedAt = new Date().toISOString();
  return plan;
}

/** One attempt: each runner gets the selected cases its links name. */
async function attempt(g: Gate, runners: Map<string, Runner>, items: PlanItem[], evidence: string) {
  const out = new Map<number, TestResult>();
  for (const [name, runner] of runners) {
    const mine = items.filter((i) => i.testCase.automatedTest && linkRunner(i.testCase.automatedTest) === name);
    if (!mine.length) continue;
    const collected = await runner.collected(g.root(name));
    const selection = new Map(mine.map((i) => [i.testCase.id, resolve(i.testCase.automatedTest ?? '', collected)]));
    for (const r of await runner.run(selection, g.root(name), evidence)) out.set(r.testCaseId, r);
  }
  return out;
}

export async function runPlan(g: Gate, plan: Plan, evidence: string): Promise<Verdict> {
  if (!plan.approvedBy) throw new BlockedError(`Plan ${plan.id} isn't approved. Run qam approve ${plan.id} first.`);
  await requireSame(g, plan);
  const selected = plan.items.filter((i) => i.selected);
  const runners = runnersFor(
    g,
    selected.map((i) => i.testCase),
  );
  // Playwright empties its output folder at the start of each session, so every attempt gets its own
  const results = await attempt(g, runners, selected, `${evidence}/attempt-1`);
  for (let n = 2; n <= g.retries + 1; n++) {
    const failed = selected.filter((i) => results.get(i.testCase.id)?.status === 'failed');
    if (!failed.length) break;
    for (const [id, retry] of await attempt(g, runners, failed, `${evidence}/attempt-${n}`)) {
      // the failed attempt's evidence shows what went wrong
      if (retry.status === 'passed')
        results.set(id, { ...retry, status: 'flaky', evidence: results.get(id)?.evidence ?? [] });
    }
  }
  const ordered = selected.map(
    (i): TestResult =>
      results.get(i.testCase.id) ?? {
        testCaseId: i.testCase.id,
        status: 'not_run',
        durationS: 0,
        error: 'No test ran for this test case.',
        testIds: [],
        evidence: [],
      },
  );
  return decide(plan, ordered);
}
