/**
 * Which test cases a change selects, and why (Q11, Q31): `path:<glob>` tags matching the diff, the `smoke` tag, the
 * cases that visit screens the DSM says the diff touches, then the groups asked for (Claude's picks or by hand).
 * Ported from CheckMaster's selection.py. Changes: links carry their runner's prefix (Q9, Q38), so a link with none
 * blocks; and a file whose path tags cover more than `sharedShare` of the plan is shared: it selects nothing by path,
 * and smoke and the DSM cover it instead (Q37).
 */
import { BlockedError } from '../shared/errors.mts';
import type { Change, NotRun, PlanItem, Reason, TestCase } from '../shared/models.mts';

const PATH = 'path:';
const SMOKE = 'smoke';
/** Below this many cases in the plan no file counts as shared (Q37, amended 2026-11-02). */
export const SHARED_MIN_PLAN = 20;
/** Link prefixes that differ from the runner's registry name. */
const PREFIX_RUNNER: Record<string, string> = { bdd: 'playwright-bdd' };

const globs = new Map<string, RegExp>();
/** `**` matches across folders, `*` and `?` within one (CheckMaster's matcher). */
function glob(pattern: string): RegExp {
  let re = globs.get(pattern);
  if (re) return re;
  let out = '';
  for (let i = 0; i < pattern.length; ) {
    if (pattern.startsWith('**/', i)) [out, i] = [`${out}(?:.*/)?`, i + 3];
    else if (pattern.startsWith('**', i)) [out, i] = [`${out}.*`, i + 2];
    else if (pattern[i] === '*') [out, i] = [`${out}[^/]*`, i + 1];
    else if (pattern[i] === '?') [out, i] = [`${out}[^/]`, i + 1];
    else [out, i] = [out + pattern[i].replace(/[.+^${}()|[\]\\]/g, '\\$&'), i + 1];
  }
  re = new RegExp(`^${out}$`);
  globs.set(pattern, re);
  return re;
}

export const matches = (pattern: string, path: string) => glob(pattern).test(path);

const isGroup = (tag: string) => tag !== SMOKE && !tag.startsWith(PATH);

/** Group tag -> its test case IDs, sorted by tag. Groups are the tags that aren't rules. */
export function groups(catalog: Map<number, TestCase>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const tc of catalog.values()) for (const t of tc.tags) if (isGroup(t)) out[t] = [...(out[t] ?? []), tc.id];
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** The runner a link names: `pytest:…` -> pytest, `bdd:@TC-…` -> playwright-bdd; null when it has no prefix. */
export function linkRunner(link: string): string | null {
  const m = /^([a-z][\w-]*):/.exec(link);
  return m ? (PREFIX_RUNNER[m[1]] ?? m[1]) : null;
}

export type SelectInput = {
  change: Change;
  catalog: Map<number, TestCase>;
  /** Group tag -> why it applies (may be empty). */
  wanted: Record<string, string>;
  /** Q37: above this share of the plan, a file's path tags select nothing. Unset: no file is shared. */
  sharedShare?: number;
  /** Filled with each shared file and how many cases its path tags cover. */
  shared?: { file: string; cases: number }[];
  /** Test case ID -> the impacted screens it visits (Q31 `dsm`). */
  dsm?: Map<number, string[]>;
  /** qam plan --all: every case with a script, whatever changed (a first run, a nightly check). */
  all?: boolean;
  /** Q49: cases whose script QAMaster recorded (drafts.json), still manual in the store; --all plans them too. */
  recorded?: Set<number>;
};

/** Test case ID -> every reason to run it, in rule order: path, smoke, dsm, group (all, when asked, first). */
export function candidates(i: SelectInput): Map<number, Reason[]> {
  const reasons = new Map<number, Reason[]>();
  const add = (id: number, r: Reason) => reasons.set(id, [...(reasons.get(id) ?? []), r]);
  const cases = [...i.catalog.values()];
  const paths = (tc: TestCase) => tc.tags.filter((t) => t.startsWith(PATH)).map((t) => t.slice(PATH.length));

  if (i.all)
    for (const tc of cases) if (tc.automatedTest || i.recorded?.has(tc.id)) add(tc.id, { kind: 'all', detail: '' });

  const byPath = new Set<string>();
  for (const f of i.change.files) {
    const covering = cases.filter((tc) => paths(tc).some((p) => matches(p, f.path)));
    // a share of a small plan says nothing: with 3 cases, 2 covering a file is ordinary coverage
    const shared =
      i.sharedShare !== undefined && cases.length >= SHARED_MIN_PLAN && covering.length > i.sharedShare * cases.length;
    if (shared) i.shared?.push({ file: f.path, cases: covering.length });
    else byPath.add(f.path);
  }
  for (const tc of cases)
    for (const p of paths(tc)) if ([...byPath].some((f) => matches(p, f))) add(tc.id, { kind: 'path', detail: p });
  for (const tc of cases) if (tc.tags.includes(SMOKE)) add(tc.id, { kind: 'smoke', detail: '' });
  for (const [id, screens] of i.dsm ?? []) if (i.catalog.has(id)) add(id, { kind: 'dsm', detail: screens.join(', ') });

  const known = groups(i.catalog);
  const unknown = Object.keys(i.wanted).filter((t) => !(t in known));
  if (unknown.length)
    throw new BlockedError(
      `No test case in the plan has the tag ${unknown.map((t) => `'${t}'`).join(', ')}. Groups: ${Object.keys(known).join(', ') || 'none'}.`,
    );
  for (const [tag, why] of Object.entries(i.wanted))
    for (const id of known[tag]) add(id, { kind: 'group', detail: why ? `${tag}: ${why}` : tag });
  return reasons;
}

/**
 * A warning when cases are selected, files changed, and no selected case got in by path or DSM: the plan
 * runs, but nothing in it covers the changed code (0.7.2 item 9). Says it; never refuses (decision D3).
 */
export function noTouchWarning(items: PlanItem[], files: number): string | null {
  const selected = items.filter((i) => i.selected);
  if (!files || !selected.length) return null;
  if (selected.some((i) => i.reasons.some((r) => r.kind === 'path' || r.kind === 'dsm' || r.kind === 'all')))
    return null;
  return 'No selected test case covers or visits the changed code (none was picked by path or by the DSM): a pass says little about this change.';
}

/** The test IDs a link stands for: itself, or its parametrized variants. */
export const resolve = (link: string, collected: string[]) =>
  collected.filter((n) => n === link || n.startsWith(`${link}[`));

/**
 * Splits the candidates into what runs and what doesn't: manual cases, and BROKEN ones whose test is gone. A selected
 * case whose link has no runner prefix blocks until it's relinked (settled 2026-11-02).
 */
export function split(
  reasons: Map<number, Reason[]>,
  catalog: Map<number, TestCase>,
  collected: string[],
  urlFor: (id: number) => string,
): { items: PlanItem[]; notRun: NotRun[] } {
  const items: PlanItem[] = [];
  const notRun: NotRun[] = [];
  const unprefixed: TestCase[] = [];
  for (const [id, why] of reasons) {
    const testCase = catalog.get(id) ?? {
      id,
      title: '(not found in the test case store)',
      url: urlFor(id),
      tags: [],
      automatedTest: null,
    };
    const link = testCase.automatedTest;
    if (!link) notRun.push({ testCase, why: 'manual (no automated test)', broken: false, reasons: why });
    else if (!linkRunner(link)) unprefixed.push(testCase);
    else if (!resolve(link, collected).length)
      notRun.push({ testCase, why: `its test ${link} isn't in the test root (renamed or moved?)`, broken: true });
    else items.push({ testCase, reasons: why, selected: true });
  }
  if (unprefixed.length)
    throw new BlockedError(
      `${unprefixed.map((c) => `TC${c.id} (${c.automatedTest})`).join(', ')}: the automation link has no runner prefix, so the gate can't tell which runner runs it. Relink it in the test case store as pytest:<node id> or bdd:@<TC id>, e.g. pytest:${unprefixed[0].automatedTest}.`,
    );
  return { items, notRun };
}
