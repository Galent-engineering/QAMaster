/**
 * Project commands: setting a QA project up, the onboarding pipeline, health checks, and integrations.
 *
 *     qam setup [--check] [--no-install] [--browsers chromium|all|none] [--app NAME] [--url URL]
 *               [--source FOLDER|GIT-URL [--branch B] [--name N] [--clone-to DIR | --use-clone DIR]]
 *               [--entry claude-code,vscode,…]
 *     qam pipeline start [--url URL] [--source S] [--app NAME] [--channels web,api] | status | next | mark <stage> <status> [--note T] | reset [<stage>]
 *     qam doctor
 *     qam integrations list [--all] | add <entry…> | remove <id> | verify
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  add,
  type Context,
  ENTRY_POINTS,
  installs,
  list,
  QAMASTER_DIR,
  remove,
  verify,
} from '../integrations/integrations.mts';
import { mark, reset, start, status, table } from '../pipeline/pipeline.mts';
import { pluginVersion, type SetupOptions, type Step, setupProject } from '../pipeline/setup.mts';
import { checkSource, isGitUrl } from '../pipeline/sources.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';

const project = (cfg: Config) => cfg.qaProject ?? cfg.root;
const appName = (cfg: Config, dir: string) => cfg.project.app?.name ?? path.basename(dir);
const ctx = (cfg: Config): Context => ({
  appRepo: cfg.root,
  app: appName(cfg, cfg.root),
  version: pluginVersion(),
  now: new Date(),
});

function parse<T>(
  argv: string[],
  options: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }>,
  what: string,
) {
  try {
    return parseArgs({ args: argv, options, allowPositionals: true }) as unknown as {
      values: T;
      positionals: string[];
    };
  } catch (e) {
    throw new BlockedError(`${what}: ${(e as Error).message}`);
  }
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new BlockedError(`${file} is missing or isn't valid JSON. Run qam setup.`);
  }
}
const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

function printSteps(title: string, steps: Step[]) {
  const w = Math.max(...steps.map((s) => s.step.length));
  console.log(`${title}\n${steps.map((s) => `  ${s.status.padEnd(8)} ${s.step.padEnd(w)}  ${s.detail}`).join('\n')}`);
}

export function setup(cfg: Config, argv: string[], json: boolean): number {
  type V = {
    check?: boolean;
    'no-install'?: boolean;
    browsers?: string;
    app?: string;
    url?: string;
    source?: string;
    branch?: string;
    name?: string;
    'clone-to'?: string;
    'use-clone'?: string;
    entry?: string;
  };
  const { values: v } = parse<V>(
    argv,
    {
      check: { type: 'boolean' },
      'no-install': { type: 'boolean' },
      browsers: { type: 'string' },
      app: { type: 'string' },
      url: { type: 'string' },
      source: { type: 'string' },
      branch: { type: 'string' },
      name: { type: 'string' },
      'clone-to': { type: 'string' },
      'use-clone': { type: 'string' },
      entry: { type: 'string' },
    },
    'qam setup',
  );
  const browsers = v.browsers ?? 'chromium';
  if (!['chromium', 'all', 'none'].includes(browsers))
    throw new BlockedError('--browsers must be chromium, all or none.');
  if (v.url && !/^https?:\/\/\S+$/.test(v.url)) throw new BlockedError("--url must be the app's http(s) URL.");
  if ((v['clone-to'] || v['use-clone'] || v.branch || v.name) && !v.source)
    throw new BlockedError('--branch, --name, --clone-to and --use-clone go with --source.');
  const dir = project(cfg);
  const opts: SetupOptions = {
    check: !!v.check,
    install: !v['no-install'],
    browsers: browsers as SetupOptions['browsers'],
  };
  const steps = setupProject(dir, opts);
  // a config that isn't valid JSON blocks setup before anything writes to it
  const broken = steps.some((s) => s.status === 'failed');
  const notes: string[] = [];
  const warnings: string[] = [];
  const dsmFile = path.join(dir, 'config', 'dsm-config.json');
  const qamFile = path.join(dir, 'config', 'qamaster.json');

  if (broken) {
    if (v.app || v.url || v.source || v.entry)
      steps.push({ step: 'app and sources', status: 'skipped', detail: 'fix the failed steps first' });
  } else if (v.app || v.url) {
    if (opts.check) steps.push({ step: 'app', status: 'skipped', detail: '--check changes nothing' });
    else {
      const q = readJson(qamFile);
      const app = (q.app as Record<string, unknown>) ?? {};
      q.app = { ...app, name: v.app ?? app.name ?? path.basename(cfg.root), ...(v.url ? { url: v.url } : {}) };
      writeJson(qamFile, q);
      steps.push({
        step: 'app',
        status: 'updated',
        detail: `config/qamaster.json app ${(q.app as { name: string }).name}`,
      });
    }
  }
  if (!broken && v.url && !opts.check) {
    const d = readJson(dsmFile);
    d.application = { ...((d.application as object) ?? {}), base_url: v.url };
    writeJson(dsmFile, d);
    steps.push({ step: 'app URL', status: 'updated', detail: `application.base_url ${v.url}` });
  }
  if (!broken && v.source) {
    if (opts.check && isGitUrl(v.source) && v['clone-to']) {
      steps.push({ step: 'code source', status: 'skipped', detail: `--check doesn't clone ${v.source}` });
    } else {
      const checked = checkSource(
        { source: v.source, branch: v.branch, name: v.name, cloneTo: v['clone-to'], useClone: v['use-clone'] },
        dir,
      );
      notes.push(...checked.notes);
      warnings.push(...checked.warnings);
      if (opts.check) steps.push({ step: 'code source', status: 'ok', detail: `${checked.repo.name}: checked` });
      else {
        const d = readJson(dsmFile);
        const repos = ((d.repositories as { name: string }[]) ?? []).filter((r) => r.name !== checked.repo.name);
        d.repositories = [...repos, checked.repo];
        writeJson(dsmFile, d);
        steps.push({
          step: 'code source',
          status: checked.cloned ? 'created' : 'updated',
          detail: `repositories[] ${checked.repo.name} -> ${checked.repo.path}${checked.repo.branch ? ` (${checked.repo.branch})` : ''}`,
        });
      }
    }
  }
  let entries: ReturnType<typeof add> | null = null;
  if (!broken && v.entry && !opts.check)
    entries = add(
      ctx(cfg),
      v.entry
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );

  const failed = steps.some((s) => s.status === 'failed');
  const missing = steps.some((s) => s.status === 'missing');
  // ready only when Playwright is really there: --no-install leaves it out (AQE said ready)
  const skipped = steps.some((s) => s.step === 'npm install' && s.status === 'skipped');
  const result = failed ? 'blocked' : missing || skipped ? 'incomplete' : 'ready';
  if (json) console.log(JSON.stringify({ result, project: dir, steps, notes, warnings, entries }));
  else {
    printSteps(`QAMaster setup: ${result}\nProject: ${dir}\n`, steps);
    for (const n of notes) console.log(`Note: ${n}`);
    for (const w of warnings) console.log(`Warning: ${w}`);
    if (entries) {
      for (const r of entries.installed) console.log(`Installed ${r.id} for ${r.entries.join(', ')}`);
      for (const id of entries.already) console.log(`Already installed: ${id}`);
      for (const e of entries.coming) console.log(`Coming in ${e.available}: ${e.label} (${e.how})`);
    } else if (!opts.check) {
      console.log(
        `\nEntry points: tick the tools your team uses, e.g. qam setup --entry claude-code. Available: ${ENTRY_POINTS.map((e) => `${e.id} (${e.available})`).join(', ')}.`,
      );
    }
  }
  return failed || (opts.check && missing) ? 2 : 0;
}

export function pipeline(cfg: Config, argv: string[], json: boolean): number {
  const { values: v, positionals } = parse<{
    url?: string;
    source?: string;
    app?: string;
    channels?: string;
    note?: string;
  }>(
    argv,
    {
      url: { type: 'string' },
      source: { type: 'string' },
      app: { type: 'string' },
      channels: { type: 'string' },
      note: { type: 'string' },
    },
    'qam pipeline',
  );
  const [cmd = 'status', a1, a2] = positionals;
  const dir = project(cfg);
  if (cmd === 'start') start(dir, v);
  else if (cmd === 'mark') mark(dir, a1, a2, v.note);
  else if (cmd === 'reset') reset(dir, a1);
  else if (!['status', 'next'].includes(cmd))
    throw new BlockedError('Use qam pipeline start | status | next | mark <stage> <status> | reset [<stage>].');
  const st = status(dir, cfg.root, cfg.project.app?.name ?? null);
  if (cmd === 'next') {
    const n = st.stages.find((r) => r.stage === st.next);
    if (json)
      console.log(
        JSON.stringify(
          n ? { next: n.stage, title: n.title, status: n.status, evidence: n.evidence, how: n.how } : { next: null },
        ),
      );
    else
      console.log(
        n
          ? `Next: ${n.title} (${n.status})\nEvidence: ${n.evidence}\nHow: ${n.how}`
          : 'Every stage is done. Run qam report all after new runs.',
      );
    return 0;
  }
  if (json) console.log(JSON.stringify(st));
  else process.stdout.write(table(st));
  return 0;
}

export function doctor(cfg: Config, _argv: string[], json: boolean): number {
  const dir = project(cfg);
  const checks: { check: string; ok: boolean; detail: string }[] = [];
  const dsmFile = path.join(dir, 'config', 'dsm-config.json');
  const dsm = fs.existsSync(dsmFile) ? readJson(dsmFile) : null;
  checks.push({
    check: 'config/qamaster.json',
    ok: cfg.qaProject !== null,
    detail: cfg.qaProject ? 'valid' : 'missing: run qam setup',
  });
  checks.push({ check: 'config/dsm-config.json', ok: !!dsm, detail: dsm ? 'present' : 'missing: run qam setup' });
  const app = (dsm?.application as { base_url?: string } | undefined) ?? {};
  const repos = (dsm?.repositories as { name: string; path: string; branch?: string }[] | undefined) ?? [];
  if (dsm && !app.base_url && !repos.length)
    checks.push({ check: 'app', ok: false, detail: 'no URL and no code source: run qam setup --url … --source …' });
  for (const r of repos) {
    try {
      const c = checkSource({ source: r.path, branch: r.branch, name: r.name }, dir);
      checks.push({
        check: `source ${r.name}`,
        ok: true,
        detail: [...c.notes, ...c.warnings].join(' ') || `${r.path}${r.branch ? ` (${r.branch})` : ''}`,
      });
    } catch (e) {
      if (!(e instanceof BlockedError)) throw e;
      checks.push({ check: `source ${r.name}`, ok: false, detail: e.message });
    }
  }
  const pw = fs.existsSync(path.join(dir, 'node_modules', 'playwright', 'package.json'));
  checks.push({
    check: 'Playwright',
    ok: pw || !app.base_url,
    detail: pw ? 'installed' : app.base_url ? 'not installed: run qam setup' : 'not needed without an app URL',
  });
  for (const i of verify(ctx(cfg)))
    checks.push({ check: `integration ${i.id}`, ok: !i.problem, detail: i.problem ?? 'working' });
  checks.push({ check: 'test case store', ok: true, detail: 'checked once the ADO adapter is built (step 4)' });
  const ok = checks.every((c) => c.ok);
  fs.mkdirSync(path.join(dir, QAMASTER_DIR), { recursive: true });
  const record = path.join(dir, QAMASTER_DIR, 'doctor.json');
  let prev = {}; // doctor's own record: one that can't be read is rewritten
  try {
    prev = JSON.parse(fs.readFileSync(record, 'utf8'));
  } catch {}
  writeJson(record, { ...prev, at: new Date().toISOString(), ok, checks });
  if (json) console.log(JSON.stringify({ result: ok ? 'pass' : 'blocked', checks }));
  else {
    const w = Math.max(...checks.map((c) => c.check.length));
    console.log(
      `QAMaster doctor: ${ok ? 'all good' : 'needs attention'}\n${checks.map((c) => `  ${c.ok ? 'ok    ' : 'FIX   '} ${c.check.padEnd(w)}  ${c.detail}`).join('\n')}`,
    );
  }
  return ok ? 0 : 2;
}

export function integrations(cfg: Config, argv: string[], json: boolean): number {
  const { values: v, positionals } = parse<{ all?: boolean }>(argv, { all: { type: 'boolean' } }, 'qam integrations');
  const [cmd = 'list', ...rest] = positionals;
  const c = ctx(cfg);
  if (cmd === 'list') {
    if (v.all) {
      const all = installs();
      if (json) console.log(JSON.stringify({ result: 'pass', repos: all }));
      else
        console.log(
          Object.entries(all)
            .map(([repo, r]) => `${repo} (${r.app}): ${r.integrations.join(', ')}`)
            .join('\n') || 'No repos on this machine have QAMaster integrations.',
        );
      return 0;
    }
    const recs = list(c.appRepo);
    if (json) console.log(JSON.stringify({ result: 'pass', integrations: recs, entry_points: ENTRY_POINTS }));
    else {
      console.log(
        recs.length
          ? recs
              .map(
                (r) => `${r.id}  ${r.kind} for ${r.entries.join(', ')} (v${r.version}, ${r.installed_at.slice(0, 10)})`,
              )
              .join('\n')
          : 'No integrations in this repo.',
      );
      console.log(`\nEntry points: ${ENTRY_POINTS.map((e) => `${e.id} (${e.available})`).join(', ')}`);
    }
    return 0;
  }
  if (cmd === 'add') {
    if (!rest.length)
      throw new BlockedError(
        `Name the entry points: qam integrations add <${ENTRY_POINTS.map((e) => e.id).join('|')}>…`,
      );
    const r = add(c, rest);
    if (json) console.log(JSON.stringify({ result: 'pass', ...r }));
    else {
      for (const x of r.installed) console.log(`Installed ${x.id} for ${x.entries.join(', ')}`);
      for (const id of r.already) console.log(`Already installed: ${id}`);
      for (const e of r.coming) console.log(`Coming in ${e.available}: ${e.label} (${e.how})`);
    }
    return 0;
  }
  if (cmd === 'remove') {
    if (rest.length !== 1)
      throw new BlockedError(
        'Name one integration ID: qam integrations remove <id> (qam integrations list shows them).',
      );
    const r = remove(c, rest[0]);
    console.log(json ? JSON.stringify({ result: 'pass', removed: r.id }) : `Removed ${r.id}`);
    return 0;
  }
  if (cmd === 'verify') {
    const r = verify(c);
    const ok = r.every((x) => !x.problem);
    if (json) console.log(JSON.stringify({ result: ok ? 'pass' : 'blocked', integrations: r }));
    else
      console.log(
        r.length
          ? r.map((x) => `${x.problem ? 'FIX' : 'ok '} ${x.id}${x.problem ? `: ${x.problem}` : ''}`).join('\n')
          : 'No integrations in this repo.',
      );
    return ok ? 0 : 2;
  }
  throw new BlockedError('Use qam integrations list [--all] | add <entry…> | remove <id> | verify.');
}
