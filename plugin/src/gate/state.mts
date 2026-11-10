/**
 * Where the gate keeps its files (Q52, 0.6.0). A repo that a QA project recorded as a code source (config/dsm-config.json
 * repositories[]) keeps plans, verdicts, evidence and drafts.json in that QA project, under .qamaster/gate/<name>/, and
 * the push hook finds the project through the per-user index of QA projects. Any other repo keeps them in its own
 * .qamaster/. For one release the old place is still read; nothing is ever written or deleted there.
 *
 * Node standard library only: the push hook imports this on every Bash call.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Recorded = { project: string; name: string };
export type StateDirs = {
  write: string; // where this run writes
  read: string[]; // where it reads, newest place first
  legacy: string | null; // the app clone's own folder, when files may still be there from before 0.6.0
};

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const readJson = (file: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** The name a QA project gave the repository at `appRepo` in its dsm-config.json, or null. */
export function recordedIn(project: string, appRepo: string): string | null {
  const d = readJson(path.join(project, 'config', 'dsm-config.json')) as {
    repositories?: { name?: unknown; path?: unknown }[];
  } | null;
  const here = real(appRepo);
  for (const r of d?.repositories ?? [])
    if (typeof r.name === 'string' && typeof r.path === 'string' && real(path.resolve(project, r.path)) === here)
      return r.name;
  return null;
}

/** The QA project, from the per-user index (QAMASTER_HOME, else ~/.qamaster), that recorded this clone as a code source. */
export function recordingProject(appRepo: string, home?: string): Recorded | null {
  const dir = home ?? (process.env.QAMASTER_HOME || path.join(os.homedir(), '.qamaster'));
  const index = readJson(path.join(dir, 'installs.json')) as { repos?: Record<string, unknown> } | null;
  for (const project of Object.keys(index?.repos ?? {})) {
    if (real(project) === real(appRepo)) continue; // a repo is not its own QA project here
    const name = recordedIn(project, appRepo);
    if (name) return { project, name };
  }
  return null;
}

const safe = (name: string) => name.replace(/[^\w.-]+/g, '_');

export function stateDirs(appRepo: string, project: string | null): StateDirs {
  const own = path.join(appRepo, '.qamaster');
  const name = project && real(project) !== real(appRepo) ? recordedIn(project, appRepo) : null;
  if (!project || !name) return { write: own, read: [own], legacy: null };
  const write = path.join(project, '.qamaster', 'gate', safe(name));
  return { write, read: [write, own], legacy: own };
}

/** Every place reports and status read from: this repo's (see stateDirs) and every app a QA project keeps gate files for. */
export function readAll(appRepo: string, project: string | null): string[] {
  const dirs = [...stateDirs(appRepo, project).read];
  const gate = project ? path.join(project, '.qamaster', 'gate') : null;
  try {
    if (gate) for (const d of fs.readdirSync(gate).sort()) dirs.push(path.join(gate, d));
  } catch {} // no gate files in the QA project yet
  return [...new Set(dirs)];
}
