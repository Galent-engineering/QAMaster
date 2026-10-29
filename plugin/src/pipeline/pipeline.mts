/**
 * The onboarding pipeline (tech.md, "Onboarding pipeline"): 15 stages from setup to the first reports. A stage's
 * status comes from EVIDENCE in the project first: files, their freshness, review results. Recorded marks
 * (.qamaster/state.json) add only what can't be detected: skipped, failed with a note, in progress. So the pipeline
 * resumes correctly after an interruption, shows stale work, and never reports undone work as done.
 *
 * Stages whose features come later read the file that feature writes; each such file is named where it's read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveRef } from '../adapters/git.mts';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { BlockedError } from '../shared/errors.mts';

export const STATUSES = ['pending', 'in_progress', 'done', 'failed', 'skipped'] as const;
export const CHANNELS = ['web', 'mobile-web', 'android', 'ios', 'api'];

type Mark = { status: (typeof STATUSES)[number]; at: string; note?: string };
export type PipelineState = {
  inputs?: { url?: string; source?: string; app?: string; channels?: string[]; started_at?: string };
  stages?: Record<string, Mark>;
};
type Evidence = { done: boolean; detail: string; stale?: boolean; skip?: boolean };
type Ctx = {
  project: string;
  appRepo: string;
  app: string | null;
  dsm: { generated_at: string; stats?: { pages: number; page_relations: number } } | null;
  dsmDir: string;
  state: PipelineState;
};
type Stage = { id: string; title: string; optional?: boolean; detect: (c: Ctx) => Evidence; how: (c: Ctx) => string };

const exists = (p: string) => fs.existsSync(p);
const mtime = (p: string) => (exists(p) ? fs.statSync(p).mtimeMs : 0);
function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}
/** Files under `dir` whose names match `re`, skipping node_modules and dot folders. */
function files(dir: string, re: RegExp): string[] {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, re) : re.test(e.name) ? [p] : [];
  });
}
/** TestGen runs whose `file` (written by feature 7) satisfies `ok`. */
function runs(c: Ctx, file: string, ok: (data: Record<string, unknown>) => boolean): string[] {
  const base = path.join(c.project, 'testgen', 'output');
  if (!exists(base)) return [];
  return fs
    .readdirSync(base)
    .sort()
    .filter((d) => {
      const data = readJson<Record<string, unknown>>(path.join(base, d, file));
      return data !== null && ok(data);
    });
}
const appFolder = (c: Ctx) => (c.app ? path.join(c.project, c.app) : null);

export const STAGES: Stage[] = [
  {
    id: 'setup',
    title: 'Setup',
    detect: (c) => {
      const need: [string, string][] = [
        [`${QAMASTER_DIR}/plugin.json`, path.join(c.project, QAMASTER_DIR, 'plugin.json')],
        ['config/qamaster.json', path.join(c.project, 'config', 'qamaster.json')],
        ['config/dsm-config.json', path.join(c.project, 'config', 'dsm-config.json')],
        ['Playwright', path.join(c.project, 'node_modules', 'playwright', 'package.json')],
      ];
      const missing = need.filter(([, p]) => !exists(p)).map(([n]) => n);
      return {
        done: !missing.length,
        detail: missing.length ? `missing: ${missing.join(', ')}` : 'project link, config and Playwright present',
      };
    },
    how: (c) => {
      if (exists(path.join(c.project, 'config', 'dsm-config.json')))
        return 'Run qam setup (safe to re-run: it installs only what is missing).';
      const i = c.state.inputs ?? {};
      return `Run qam setup${i.url ? ` --url ${i.url}` : ' --url <app URL>'}${i.source ? ` --source ${i.source}` : ' --source <code folder or git URL>'} --entry claude-code.`;
    },
  },
  {
    id: 'store',
    title: 'Test case store',
    detect: (c) => {
      // written by qam doctor's store check (step 4: the ADO adapter)
      const d = readJson<{ store?: { ok: boolean; at: string; detail?: string } }>(
        path.join(c.project, QAMASTER_DIR, 'doctor.json'),
      );
      if (d?.store?.ok) return { done: true, detail: d.store.detail ?? `reachable (checked ${d.store.at})` };
      return {
        done: false,
        detail: d?.store ? `last check failed: ${d.store.detail ?? d.store.at}` : 'not checked yet',
      };
    },
    how: () =>
      'Set QAMASTER_ADO_ORG and QAMASTER_ADO_PROJECT in the app repo .env (token: QAMASTER_ADO_TOKEN or az login), then run qam doctor.',
  },
  {
    id: 'context',
    title: 'Context sources (v2)',
    optional: true,
    detect: () => ({ done: false, skip: true, detail: 'v2: skipped in v1' }),
    how: () => 'Nothing to do in v1.',
  },
  {
    id: 'dsm',
    title: 'Design Structure Matrix',
    detect: (c) => {
      if (!c.dsm) return { done: false, detail: 'no dsm/dsm.json yet' };
      const s = c.dsm.stats;
      const state = readJson<{ repos?: Record<string, { commit: string }> }>(path.join(c.dsmDir, 'state.json'));
      const cfg = readJson<{ repositories?: { name: string; path: string; branch?: string }[] }>(
        path.join(c.project, 'config', 'dsm-config.json'),
      );
      const behind = (cfg?.repositories ?? []).filter((r) => {
        const seen = state?.repos?.[r.name]?.commit;
        const now = resolveRef(path.resolve(c.project, r.path), r.branch ?? 'main')?.[1];
        return seen && now && seen !== now;
      });
      return {
        done: true,
        stale: behind.length > 0,
        detail: `${s?.pages ?? '?'} screens, ${s?.page_relations ?? '?'} relations (built ${c.dsm.generated_at})${behind.length ? `; new commits in ${behind.map((r) => r.name).join(', ')}` : ''}`,
      };
    },
    how: (c) =>
      c.dsm ? 'Run qam dsm refresh.' : 'Run qam dsm run (sign-in details in a terminal or .env.dsm, never in chat).',
  },
  {
    id: 'knowledge',
    title: 'Application knowledge',
    detect: (c) => {
      if (!c.app) return { done: false, detail: 'no app name (config/qamaster.json app.name)' };
      // written by the AUT-Skill-Builder (feature 5)
      const build = readJson<{ dsm_generated_at?: string }>(
        path.join(c.project, '.claude', 'skills', `AUT_${c.app}`, '.aut-build.json'),
      );
      if (!build) return { done: false, detail: `AUT_${c.app} skills not built` };
      if (c.dsm && build.dsm_generated_at !== c.dsm.generated_at)
        return { done: true, stale: true, detail: `AUT_${c.app} built from an older DSM` };
      return { done: true, detail: `AUT_${c.app}, current with the DSM` };
    },
    how: () => 'Use the AUT-Skill-Builder skill to build or refresh the application knowledge skills.',
  },
  {
    id: 'requirements',
    title: 'Requirements',
    optional: true,
    detect: (c) => {
      // written by qam requirements fetch (feature 6)
      const dir = path.join(c.project, 'requirements');
      const saved = files(dir, /^requirements\.json$/);
      return saved.length
        ? { done: true, detail: `${saved.length} scope(s) saved` }
        : { done: false, detail: 'none fetched yet (optional)' };
    },
    how: () =>
      'Ask the user which sprint or dates, then run qam requirements fetch --sprint <name> (or --current-sprint, or --from/--to). Without requirements: qam pipeline mark requirements skipped --note "…".',
  },
  {
    id: 'test-cases',
    title: 'Test cases',
    detect: (c) => {
      // written by qam testgen validate (feature 7)
      const ok = runs(c, 'validation.json', (v) => v.status === 'pass');
      if (!ok.length) return { done: false, detail: 'no TestGen run has passed validation' };
      const last = path.join(c.project, 'testgen', 'output', ok[ok.length - 1], 'validation.json');
      const stale = c.dsm ? mtime(last) < Date.parse(c.dsm.generated_at) : false;
      return {
        done: true,
        stale,
        detail: `${ok.length} validated run(s), latest ${ok[ok.length - 1]}${stale ? ' (older than the DSM)' : ''}`,
      };
    },
    how: () =>
      'Ask the user which module to cover, then follow the TestGen skill; the run must pass qam testgen validate.',
  },
  {
    id: 'review',
    title: 'Review',
    detect: (c) => {
      // run.json reviewedBy, set by qam review (feature 7) after the person's yes
      const ok = runs(c, 'run.json', (r) => Boolean(r.reviewedBy));
      return ok.length
        ? { done: true, detail: `${ok.length} reviewed run(s)` }
        : { done: false, detail: 'no run reviewed yet' };
    },
    how: () => 'Show the person the test cases; only after their yes, run qam review <run>.',
  },
  {
    id: 'publish',
    title: 'Publish',
    detect: (c) => {
      // published.json, written by qam publish --apply (feature 7)
      const ok = runs(c, 'published.json', () => true);
      return ok.length
        ? { done: true, detail: `${ok.length} published run(s)` }
        : { done: false, detail: 'nothing published yet' };
    },
    how: () => 'Run qam publish <run> to preview, and qam publish <run> --apply after the person agrees.',
  },
  {
    id: 'app-folder',
    title: 'Automation folder',
    detect: (c) => {
      const dir = appFolder(c);
      // .aut-app.json, written by qam app create (feature 8)
      return dir && exists(path.join(dir, '.aut-app.json'))
        ? { done: true, detail: `${c.app}/` }
        : { done: false, detail: c.app ? `${c.app}/ not created` : 'no app name yet' };
    },
    how: (c) => `Run qam app create --app ${c.app ?? '<Name>'} --web-url <URL>.`,
  },
  {
    id: 'locators',
    title: 'UI locators',
    detect: (c) => {
      const dir = appFolder(c);
      const locs = dir ? files(path.join(dir, 'src', 'web', 'locators'), /\.locators\.ts$/) : [];
      return locs.length
        ? { done: true, detail: `${locs.length} locator file(s)` }
        : { done: false, detail: 'no locator files yet' };
    },
    how: () => 'Use the UI-Locator-Sync skill.',
  },
  {
    id: 'scripts',
    title: 'Scripts',
    detect: (c) => {
      const dir = appFolder(c);
      const feats = dir ? files(path.join(dir, 'features'), /\.feature$/) : [];
      const traced = feats.filter((f) => /@TC-/.test(fs.readFileSync(f, 'utf8')));
      return {
        done: traced.length > 0,
        detail: `${feats.length} feature file(s), ${traced.length} traced to test cases`,
      };
    },
    how: () => 'Ask the user for the go-ahead, then automate the reviewed test cases with the AutomationCode skill.',
  },
  {
    id: 'script-gate',
    title: 'Script gate',
    detect: (c) => {
      // written by qam check-scripts (feature 8)
      const gate = readJson<{ status: string; at: string }>(path.join(c.project, QAMASTER_DIR, 'check-scripts.json'));
      const dir = appFolder(c);
      if (!gate) return { done: false, detail: 'not run yet' };
      const changed = dir ? files(dir, /\.(ts|feature)$/).filter((f) => mtime(f) > Date.parse(gate.at) + 1000) : [];
      if (gate.status !== 'pass') return { done: false, detail: `last run ${gate.status} (${gate.at})` };
      return changed.length
        ? { done: true, stale: true, detail: `passed ${gate.at}; ${changed.length} file(s) changed since` }
        : { done: true, detail: `passed ${gate.at}` };
    },
    how: () => 'Run qam check-scripts and fix every finding.',
  },
  {
    id: 'first-gate',
    title: 'First gate run',
    detect: (c) => {
      // the gate's verdicts (step 5), in the app repo (Q22)
      const verdicts = files(path.join(c.appRepo, QAMASTER_DIR, 'verdicts'), /\.json$/);
      return verdicts.length
        ? { done: true, detail: `${verdicts.length} verdict(s)` }
        : { done: false, detail: 'no verdict yet' };
    },
    how: () => 'Run qam check --all.',
  },
  {
    id: 'reports',
    title: 'Reports',
    detect: (c) => {
      const summaries = files(path.join(c.project, 'reports', 'output'), /^test-summary-report.*\.html$/);
      return summaries.length
        ? { done: true, detail: `${summaries.length} test summary report(s)` }
        : { done: false, detail: 'no test summary report yet' };
    },
    how: () => 'Run qam report all.',
  },
];

export type StageStatus = {
  stage: string;
  title: string;
  status: string;
  evidence: string;
  note?: string;
  how: string;
};
export type PipelineStatus = {
  project: string;
  app: string | null;
  complete: boolean;
  next: string | null;
  inputs: PipelineState['inputs'];
  stages: StageStatus[];
};

const stateFile = (project: string) => path.join(project, QAMASTER_DIR, 'state.json');
export const loadState = (project: string): PipelineState => readJson<PipelineState>(stateFile(project)) ?? {};
function saveState(project: string, state: PipelineState) {
  fs.mkdirSync(path.dirname(stateFile(project)), { recursive: true });
  fs.writeFileSync(stateFile(project), `${JSON.stringify(state, null, 2)}\n`);
}

/** Every stage, decided from evidence, then recorded marks for what evidence can't show. */
export function status(project: string, appRepo: string, app: string | null): PipelineStatus {
  const state = loadState(project);
  const cfg = readJson<{ output_dir?: string }>(path.join(project, 'config', 'dsm-config.json'));
  const dsmDir = path.join(project, cfg?.output_dir ?? 'dsm');
  const name = app ?? state.inputs?.app ?? null;
  const c: Ctx = { project, appRepo, app: name, dsm: readJson(path.join(dsmDir, 'dsm.json')), dsmDir, state };
  const stages = STAGES.map((s): StageStatus => {
    const ev = s.detect(c);
    const mark = state.stages?.[s.id];
    let st = ev.done ? (ev.stale ? 'stale' : 'done') : ev.skip ? 'skipped' : 'pending';
    if (!ev.done && mark && ['failed', 'skipped', 'in_progress'].includes(mark.status)) st = mark.status;
    return {
      stage: s.id,
      title: s.title,
      status: st,
      evidence: ev.detail,
      ...(mark?.note ? { note: mark.note } : {}),
      how: s.how(c),
    };
  });
  const next = stages.find((r) => !['done', 'skipped'].includes(r.status)) ?? null;
  return { project, app: name, complete: !next, next: next?.stage ?? null, inputs: state.inputs, stages };
}

/** Records the onboarding inputs. Never credentials. */
export function start(project: string, inputs: { url?: string; source?: string; app?: string; channels?: string }) {
  if (!inputs.url && !inputs.source)
    throw new BlockedError('Give at least one input: --url <app URL> or --source <code folder or git URL>.');
  if (inputs.url && !/^https?:\/\/\S+$/.test(inputs.url))
    throw new BlockedError("--url must be the app's http(s) URL.");
  const channels = (inputs.channels ?? 'web,api')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const bad = channels.filter((x) => !CHANNELS.includes(x));
  if (bad.length) throw new BlockedError(`Unknown channel(s) ${bad.join(', ')}. Use ${CHANNELS.join(', ')}.`);
  const state = loadState(project);
  state.inputs = {
    ...(inputs.url ? { url: inputs.url } : {}),
    ...(inputs.source ? { source: inputs.source } : {}),
    ...(inputs.app ? { app: inputs.app } : {}),
    channels,
    started_at: new Date().toISOString(),
  };
  state.stages ??= {};
  saveState(project, state);
}

export function mark(project: string, stage: string, value: string, note?: string) {
  if (!STAGES.some((s) => s.id === stage) || !(STATUSES as readonly string[]).includes(value)) {
    throw new BlockedError(
      `Use qam pipeline mark <${STAGES.map((s) => s.id).join('|')}> <${STATUSES.join('|')}> [--note TEXT].`,
    );
  }
  const state = loadState(project);
  state.stages = {
    ...(state.stages ?? {}),
    [stage]: { status: value as Mark['status'], at: new Date().toISOString(), ...(note ? { note } : {}) },
  };
  saveState(project, state);
}

export function reset(project: string, stage?: string) {
  const state = loadState(project);
  if (stage) delete state.stages?.[stage];
  else state.stages = {};
  saveState(project, state);
}

export function table(st: PipelineStatus): string {
  const w = Math.max(...st.stages.map((r) => r.title.length));
  return (
    `QAMaster pipeline: ${st.complete ? 'complete' : `next: ${st.next}`}\nProject: ${st.project}${st.app ? `   App: ${st.app}` : ''}\n\n` +
    st.stages
      .map(
        (r, i) =>
          `  ${String(i + 1).padStart(2)}. ${r.title.padEnd(w)}  ${r.status.padEnd(11)} ${r.evidence}${r.note ? ` (note: ${r.note})` : ''}`,
      )
      .join('\n') +
    '\n'
  );
}
