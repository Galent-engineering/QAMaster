/**
 * The gate's `dsm` selector (Q31; settled for the 0.3.0 MVP on 2026-11-02): the changed files go through the code
 * model's owners to the screens they touch (`impact`), then through the TestGen runs (the screens each case visits) and
 * the ledger (local ID -> store ID) to the published cases on those screens. A touched screen that no case visits is a
 * coverage gap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { matchKey } from '../dsm/build.mts';
import type { RepoConfig } from '../dsm/scan.mts';
import { impact } from '../dsm/update.mts';
import type { CodeModel, Gap } from '../shared/models.mts';

export type DsmInput = {
  /** Changed files, relative to the app repo's root (git's paths). */
  files: string[];
  /** The app repo's root, and each configured repository's folder (absolute): files are keyed "<repo>:<path>". */
  appRoot: string;
  repos: { name: string; dir: string }[];
  code: CodeModel | null;
  /** Each generated case's local ID and the screens its steps visit. */
  cases: { localId: string; screens: string[] }[];
  /** Local ID -> test case ID in the store. */
  ledger: Map<string, number>;
};

/** "<repo>:<path relative to that repo's folder>" for a file of the app repo, or null when no repository holds it. */
function key(file: string, appRoot: string, repos: DsmInput['repos']): string | null {
  const abs = path.join(appRoot, file);
  for (const r of repos) {
    const rel = path.relative(r.dir, abs);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return `${r.name}:${rel.split(path.sep).join('/')}`;
  }
  return null;
}

export function dsmCases(i: DsmInput): { cases: Map<number, string[]>; gaps: Gap[] } {
  const owners = new Map<string, string[]>(); // screen -> the changed files that touch it
  for (const f of i.files) {
    const k = key(f, i.appRoot, i.repos);
    if (!k) continue;
    for (const s of impact([k], i.code).screens) owners.set(s, [...(owners.get(s) ?? []), f]);
  }
  const cases = new Map<number, string[]>();
  const visited = new Set<string>();
  for (const c of i.cases) {
    const hit = [...new Set(c.screens.map(matchKey))].filter((s) => owners.has(s));
    const id = i.ledger.get(c.localId);
    if (!hit.length || id === undefined) continue;
    cases.set(id, hit.sort());
    for (const s of hit) visited.add(s);
  }
  const gaps = [...owners]
    .filter(([s]) => !visited.has(s))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([screen, files]) => ({ screen, files, why: 'no published test case visits this screen' }));
  return { cases, gaps };
}

type RunCase = { id?: string; steps?: { screen?: string; leads_to?: string }[] };

/** Every case of every TestGen run under testgen/output, with the screens its steps visit. */
export function runCases(project: string): DsmInput['cases'] {
  const out = path.join(project, 'testgen', 'output');
  if (!fs.existsSync(out)) return [];
  const cases: DsmInput['cases'] = [];
  for (const run of fs.readdirSync(out).sort()) {
    const file = path.join(out, run, 'testcases.json');
    if (!fs.existsSync(file)) continue;
    let list: RunCase[];
    try {
      list = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // an unreadable run is the validator's to report, not the gate's
    }
    for (const c of Array.isArray(list) ? list : []) {
      if (!c.id) continue;
      const screens = (c.steps ?? []).flatMap((s) => [s.screen, s.leads_to]).filter((x): x is string => !!x);
      cases.push({ localId: c.id, screens });
    }
  }
  return cases;
}

/** The configured repositories' folders, resolved against the QA project. */
export const repoDirs = (project: string, repos: RepoConfig[] = []) =>
  repos.map((r) => ({ name: r.name, dir: path.resolve(project, r.path) }));
