/**
 * Just-in-time automation (Q39): the gate's step between plan and approve.
 *   worklist()  each case of the plan that a TestGen case stands behind (through the ledger) is a draft (no scenario is
 *               tagged with it yet), an update (its case changed since its script was recorded) or a keep;
 *   bind()      after the AutomationCode skill wrote the scripts and the script check passed: records each drafted case
 *               and the hash of every file in the automation folder (.qamaster/drafts.json), moves the drafted manual
 *               cases into the plan with their local link, and binds the plan to the folder's hash.
 * Approval then refuses if any script changed after bind; the QA project's "uncommitted changes" rule skips the files
 * recorded here while their hash still matches. QAMaster never commits, pushes or deletes them.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';
import type { LedgerEntry, Plan } from '../shared/models.mts';

export type Drafts = {
  /** TC ID -> the hash of its test case when its script was recorded. */
  cases: Record<string, { caseHash: string }>;
  /** Every file of the automation folder at bind (absolute path -> sha256). */
  files: Record<string, string>;
};
export type Work = { testCaseId: number; localId: string; action: 'draft' | 'update' | 'keep'; files: string[] };

const SKIP = new Set(['node_modules', '.features-gen', 'test-results', 'playwright-report']);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Every source file of the automation folder, absolute, sorted (generated folders left out). */
export function folderFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...folderFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}

/** One hash for the folder's files and their contents. */
export function folderHash(dir: string): string {
  const h = createHash('sha256');
  for (const f of folderFiles(dir)) h.update(`${path.relative(dir, f)}\0${sha(f)}\0`);
  return h.digest('hex');
}

/** The cases the plan selected (manual ones included) that a TestGen case stands behind, and what each needs. */
export function worklist(
  plan: Plan,
  o: { ledger: LedgerEntry[]; scripts: Map<string, string[]>; drafts: Drafts },
): Work[] {
  const byTracker = new Map(o.ledger.map((e) => [e.trackerId, e]));
  const cases = [
    ...plan.items.filter((i) => i.selected).map((i) => i.testCase.id),
    ...plan.notRun.filter((n) => !n.broken).map((n) => n.testCase.id),
  ];
  const out: Work[] = [];
  for (const id of cases) {
    const e = byTracker.get(id);
    if (!e) continue; // not from a TestGen run: nothing to draft from
    const files = o.scripts.get(e.localId) ?? [];
    const recorded = o.drafts.cases[e.localId];
    const action = !files.length ? 'draft' : recorded && recorded.caseHash !== e.hash ? 'update' : 'keep';
    out.push({ testCaseId: id, localId: e.localId, action, files });
  }
  return out;
}

/** Records the drafted scripts and binds the plan to them. Blocks when a case to draft still has no scenario. */
export function bind(
  plan: Plan,
  o: {
    appDir: string;
    work: Work[];
    ledger: LedgerEntry[];
    scripts: Map<string, string[]>;
    drafts: Drafts;
    link: (localId: string) => string;
  },
): { plan: Plan; drafts: Drafts } {
  const touched = o.work.filter((w) => w.action !== 'keep');
  const missing = touched.filter((w) => !o.scripts.get(w.localId)?.length);
  if (missing.length)
    throw new BlockedError(
      `No scenario is tagged with ${missing.map((w) => `@${w.localId}`).join(', ')} in ${path.basename(o.appDir)}/features yet: draft ${missing.length === 1 ? 'it' : 'them'} first, then run this again.`,
    );
  const hashOf = new Map(o.ledger.map((e) => [e.localId, e.hash]));
  const cases = { ...o.drafts.cases };
  for (const w of touched) cases[w.localId] = { caseHash: hashOf.get(w.localId) ?? '' };
  const files = Object.fromEntries(folderFiles(o.appDir).map((f) => [f, sha(f)]));

  const drafted = new Map(touched.map((w) => [w.testCaseId, w.localId]));
  const moved = plan.notRun.filter((n) => drafted.has(n.testCase.id));
  return {
    drafts: { cases, files },
    plan: {
      ...plan,
      items: [
        ...plan.items,
        ...moved.map((n) => ({
          testCase: { ...n.testCase, automatedTest: o.link(drafted.get(n.testCase.id) ?? '') },
          reasons: n.reasons ?? [],
          selected: true,
        })),
      ],
      notRun: plan.notRun.filter((n) => !drafted.has(n.testCase.id)),
      newScripts: [...drafted.keys()],
      scriptsHash: folderHash(o.appDir),
    },
  };
}

/** Files of a `git status --porcelain` list that QAMaster recorded and that are unchanged since. */
export function recordedUnchanged(drafts: Drafts | null, file: string): boolean {
  const want = drafts?.files[file];
  return !!want && fs.existsSync(file) && sha(file) === want;
}
