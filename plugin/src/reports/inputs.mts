/**
 * What reports and feedback read from disk: the gate's verdicts and plans (the app repo's .qamaster/, Q22), the QA
 * project's TestGen runs, ledger, DSM and saved feedback. A missing input is null or empty, never a guess: the
 * builders say which input they lack.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Dsm } from '../dsm/build.mts';
import type { Feedback, RunCase, RunCases } from '../feedback/feedback.mts';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { readLedger } from '../publish/ledger.mts';
import type { Config } from '../shared/config.mts';
import type { Plan, Verdict } from '../shared/models.mts';

export type Inputs = {
  root: string; // the app repo
  project: string; // the QA project: reports/, testgen/, dsm/
  verdicts: Verdict[]; // newest first
  plans: Map<string, Plan>;
  runs: RunCases[];
  ledger: Map<string, number>;
  dsm: Dsm | null;
  dsmDir: string;
  feedback: Map<string, Feedback>; // by head
  requirements: { scope: string; requirements: { id: string; title: string }[] }[]; // requirements/<scope>/
  now: Date;
};

export const reportsDir = (project: string, sub: 'data' | 'output') => path.join(project, 'reports', sub);

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null; // absent, or not ours to repair: the builder reports what it lacks
  }
}

function jsonFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

export function loadInputs(cfg: Config, now = new Date()): Inputs {
  const project = cfg.qaProject ?? cfg.root;
  const vdir = path.join(cfg.root, QAMASTER_DIR, 'verdicts');
  const verdicts = jsonFiles(vdir)
    .map((f) => ({ v: readJson<Verdict>(path.join(vdir, f)), t: fs.statSync(path.join(vdir, f)).mtimeMs }))
    .filter((x): x is { v: Verdict; t: number } => !!x.v?.head && Array.isArray(x.v.results))
    .sort((a, b) => b.t - a.t)
    .map((x) => x.v);

  const plans = new Map<string, Plan>();
  const pdir = path.join(cfg.root, QAMASTER_DIR, 'plans');
  for (const f of jsonFiles(pdir)) {
    const p = readJson<Plan>(path.join(pdir, f));
    if (p?.id) plans.set(p.id, p);
  }

  const runs: RunCases[] = [];
  const out = path.join(project, 'testgen', 'output');
  try {
    for (const run of fs.readdirSync(out).sort()) {
      const list = readJson<RunCase[]>(path.join(out, run, 'testcases.json'));
      if (Array.isArray(list)) runs.push({ run, cases: list });
    }
  } catch {
    // no testgen/output yet
  }

  const ledger = new Map<string, number>();
  for (const e of readLedger(project)?.entries ?? []) ledger.set(e.localId, e.trackerId);

  const dsmConfig = readJson<{ output_dir?: string }>(path.join(project, 'config', 'dsm-config.json'));
  const dsmDir = path.resolve(project, dsmConfig?.output_dir ?? 'dsm');
  const feedback = new Map<string, Feedback>();
  const fdir = reportsDir(project, 'data');
  for (const f of jsonFiles(fdir)) {
    const fb = readJson<Feedback>(path.join(fdir, f));
    if (f.startsWith('feedback-') && fb?.head) feedback.set(fb.head, fb);
  }
  const requirements: Inputs['requirements'] = [];
  const rdir = path.join(project, 'requirements');
  for (const scope of fs.existsSync(rdir) ? fs.readdirSync(rdir).sort() : []) {
    const r = readJson<{ requirements?: { id: string; title: string }[] }>(path.join(rdir, scope, 'requirements.json'));
    if (Array.isArray(r?.requirements)) requirements.push({ scope, requirements: r.requirements });
  }
  return {
    root: cfg.root,
    project,
    verdicts,
    plans,
    runs,
    ledger,
    dsm: readJson<Dsm>(path.join(dsmDir, 'dsm.json')),
    dsmDir,
    feedback,
    requirements,
    now,
  };
}
