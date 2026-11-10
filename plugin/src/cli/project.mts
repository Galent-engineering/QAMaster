/**
 * Project commands: setting a QA project up, the onboarding pipeline, health checks, and integrations.
 *
 *     qam setup [--check] [--no-install] [--browsers chromium|all|none] [--app NAME] [--url URL]
 *               [--source FOLDER|GIT-URL [--branch B] [--name N] [--clone-to DIR | --use-clone DIR]]
 *               [--entry claude-code,vscode,…]
 *     qam pipeline start [--url URL] [--source S] [--app NAME] [--channels web,api] | status | next | mark <stage> <status> [--note T] | reset [<stage>]
 *     qam doctor [--check-write]
 *     qam store [use ado|file]
 *     qam integrations list [--all] | add <entry…> | remove <id> | verify
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import tty from 'node:tty';
import { parseArgs } from 'node:util';
import { noProjectError } from '../adapters/ado.mts';
import type { TestCaseStore, WriteCheck } from '../adapters/base.mts';
import { withCache } from '../adapters/cache.mts';
import { buildStore, RUNNERS, STORES } from '../adapters/registry.mts';
import { findAppTests } from '../gate/apptests.mts';
import { linkRunner } from '../gate/select.mts';
import { registerQaProject, stateDirs } from '../gate/state.mts';
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
import { PLUGIN_ROOT, pluginVersion, type SetupOptions, type Step, setupProject } from '../pipeline/setup.mts';
import {
  checkSource,
  DEFAULT_EXCLUDE,
  type FolderChoice,
  folderChoices,
  isGitUrl,
  recordFolder,
  showChoices,
} from '../pipeline/sources.mts';
import { readLedger, switchLedger, writeLedger } from '../publish/ledger.mts';
import type { Config } from '../shared/config.mts';
import { azDefaults } from '../shared/env.mts';
import { BlockedError, NoPlanError, NoProjectError } from '../shared/errors.mts';
import { DEFAULT_PROJECT_CONFIG } from '../shared/schema.mts';
import { automationFolder, runnerRoot } from './gate.mts';

/** A character class only the ULID rule has, to tell whether a config has it. */
const ULID_MARK = '0-9A-HJKMNP-TV-Z';
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

/** One line from stdin, read synchronously (setup is synchronous). */
function readLine(prompt: string): string {
  process.stderr.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  while (fs.readSync(0, buf, 0, 1, null) === 1 && buf[0] !== 10) line += String.fromCharCode(buf[0]);
  return line.trim();
}

export type SetupIo = { tty: boolean; ask: (prompt: string) => string };
// not process.stdin.isTTY: touching process.stdin on a terminal makes fd 0 non-blocking (EAGAIN in readLine)
const REAL_IO: SetupIo = { tty: tty.isatty(0), ask: readLine };

/** Q47: asks which folder, showing the choices; a number picks one, anything else is taken as a typed path. */
function askFolder(io: SetupIo, choices: FolderChoice[], what: string): string {
  const answer = io.ask(`${what}\n${showChoices(choices)}\nChoose 1-${choices.length}, or type a path: `);
  const picked = /^\d+$/.test(answer) ? choices[Number(answer) - 1] : undefined;
  if (picked?.path) return picked.path;
  if (picked) return io.ask('Path to the code folder: ');
  if (!answer || /^\d+$/.test(answer))
    throw new BlockedError(`"${answer}" isn't one of the choices. Run qam setup again.`);
  return answer;
}

const SETUP_USAGE = `usage: qam [--repo PATH] setup [options]

Prepares the QA project: config, packages, browsers, launcher. Safe to re-run.

  --url <URL>           the running app's address
  --app <Name>          the app's name
  --source <folder|git URL>   where the app's code is; with --clone-to <new folder> or --use-clone <folder> for a git URL
  --branch <name>       the branch to read; --name <name> names the source
  --entry <ids>         entry points to install, comma separated (e.g. claude-code)
  --browsers <chromium|all|none>   browsers for the crawl (default chromium)
  --no-install          don't run npm install
  --check               report what is missing, change nothing
  --help                this text
`;

export function setup(cfg: Config, argv: string[], json: boolean, io: SetupIo = REAL_IO): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    if (json) console.log(JSON.stringify({ result: 'pass', usage: SETUP_USAGE }));
    else process.stdout.write(SETUP_USAGE);
    return 0;
  }
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
  // Q47: no folder for the app's code. A git URL with no place for it, or an app URL with no code source yet, asks where
  // (three choices); a script gets today's block, naming the flag, with the choices in the message and in --json
  const dsmPath = path.join(dir, 'config', 'dsm-config.json');
  let recorded = false;
  try {
    recorded = !!(JSON.parse(fs.readFileSync(dsmPath, 'utf8')).repositories ?? []).length;
  } catch {}
  const urlNoPlace = !!v.source && isGitUrl(v.source) && !v['clone-to'] && !v['use-clone'];
  const noFolder = !v.source && !!v.url && !recorded;
  let pending: FolderChoice[] | null = null;
  let chosen: string | null = null;
  if ((urlNoPlace || noFolder) && !v.check) {
    const choices = folderChoices(process.cwd());
    if (io.tty) {
      chosen = askFolder(
        io,
        choices,
        urlNoPlace ? `Where is the code of ${v.source}, or where should it be cloned?` : "Where is the app's code?",
      );
      if (urlNoPlace) {
        if (fs.existsSync(chosen) && fs.readdirSync(chosen).length) v['use-clone'] = chosen;
        else v['clone-to'] = chosen;
      } else v.source = chosen;
    } else if (urlNoPlace) {
      const message = `${v.source} is a git URL. Choose where its code is: --clone-to <new folder> to clone it, or --use-clone <folder> for an existing clone. Suggested folders:\n${showChoices(choices)}`;
      if (json) console.log(JSON.stringify({ result: 'blocked', reasons: [message], choices }));
      else console.error(`Blocked: ${message}`);
      return 2;
    } else pending = choices;
  }
  const opts: SetupOptions = {
    check: !!v.check,
    install: !v['no-install'],
    browsers: browsers as SetupOptions['browsers'],
  };
  // a source to read is checked before anything is written, so a blocked setup leaves the folder as it was. A clone is
  // a write, so it waits until the setup steps have passed (otherwise a broken config leaves an unrecorded clone)
  const source = {
    source: v.source ?? '',
    branch: v.branch,
    name: v.name,
    cloneTo: v['clone-to'],
    useClone: v['use-clone'],
  };
  const early = v.source && !v['clone-to'] ? checkSource(source, dir) : null;
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
    const checked = early ?? (opts.check ? null : checkSource(source, dir));
    if (!checked) {
      steps.push({ step: 'code source', status: 'skipped', detail: `--check doesn't clone ${v.source}` });
    } else {
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
      // cfg was loaded before this run wrote app.name, so name the integration from the file
      { ...ctx(cfg), app: (readJson(qamFile).app as { name?: string } | undefined)?.name ?? ctx(cfg).app },
      v.entry
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    );

  if (!opts.check)
    notes.push(
      cfg.store === 'ado'
        ? 'Test cases go to Azure DevOps (QAMASTER_STORE=ado). To use the local CSV file instead, run qam store use file.'
        : 'Test cases go to the local CSV file store. To publish to Azure DevOps instead, set QAMASTER_ADO_ORG and QAMASTER_ADO_PROJECT in .env, run qam store use ado (it sets QAMASTER_STORE=ado), then qam doctor; qam publish --to file,ado writes to both.',
    );
  if (pending)
    notes.push(`No code folder was given. Add --source <folder>, for example one of:\n${showChoices(pending)}`);
  const failed = steps.some((s) => s.status === 'failed');
  const missing = steps.some((s) => s.status === 'missing');
  // ready only when Playwright is really there: --no-install leaves it out (AQE said ready)
  const skipped = steps.some((s) => s.step === 'npm install' && s.status === 'skipped');
  const result = failed ? 'blocked' : missing || skipped ? 'incomplete' : 'ready';
  if (!failed && !opts.check && chosen) recordFolder(chosen);
  if (json)
    console.log(
      JSON.stringify({
        result,
        project: dir,
        steps,
        notes,
        warnings,
        entries,
        ...(pending ? { choices: pending } : {}),
      }),
    );
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

/** Every file of a plugin build, by relative path, with its hash (R27). */
function buildFiles(root: string, rel = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (['node_modules', '.git', '__pycache__', '.venv'].includes(e.name)) continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) for (const [k, v] of buildFiles(root, r)) out.set(k, v);
    else
      out.set(
        r,
        createHash('sha1')
          .update(fs.readFileSync(path.join(root, r)))
          .digest('hex'),
      );
  }
  return out;
}
/** What differs between two plugin builds, or null when either can't be read as a plugin. */
function compareBuilds(a: string, b: string): { version: string; differ: string[] } | null {
  try {
    const version = (root: string): string =>
      JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
    const [fa, fb] = [buildFiles(a), buildFiles(b)];
    const differ = [...new Set([...fa.keys(), ...fb.keys()])].filter((f) => fa.get(f) !== fb.get(f)).sort();
    return { version: version(a), differ };
  } catch {
    return null;
  }
}

export async function doctor(cfg: Config, argv: string[], jsonFlag: boolean): Promise<number> {
  // doctor used to ignore its argv, so a --json after the command must still work
  const { values: v } = parse<{ 'check-write'?: boolean; json?: boolean }>(
    argv,
    { 'check-write': { type: 'boolean' }, json: { type: 'boolean' } },
    'qam doctor',
  );
  const json = jsonFlag || !!v.json;
  const dir = project(cfg);
  // `state` and the plan fields are extra, only on the checks that have them
  const checks: {
    check: string;
    ok: boolean;
    detail: string;
    state?: WriteCheck['state'];
    plans?: { id: number; name: string }[];
    createName?: string;
    projects?: string[];
    suggestions?: string[];
  }[] = [];
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
  // pushed once the store says whether this project gates (a gate-only project needs no app URL or source)
  const noApp = !!dsm && !app.base_url && !repos.length;
  const auto = automationFolder(cfg);
  for (const r of repos) {
    try {
      const c = checkSource(
        { source: r.path, branch: r.branch, name: r.name },
        dir,
        auto ? [path.relative(dir, auto)] : [],
      );
      checks.push({
        check: `source ${r.name}`,
        ok: true,
        detail: [...c.notes, ...c.warnings].join(' ') || `${r.path}${r.branch ? ` (${r.branch})` : ''}`,
        ...(c.warnings.length ? { state: 'unknown' as const } : {}), // a warning shows as WARN, not ok (0.4.2 W5)
      });
    } catch (e) {
      if (!(e instanceof BlockedError)) throw e;
      checks.push({ check: `source ${r.name}`, ok: false, detail: e.message });
    }
  }
  // 0.4.1 A8: .qamaster/bin/qam runs the plugin recorded in .qamaster/plugin.json; another one than this is a second copy
  let recorded: unknown;
  try {
    recorded = JSON.parse(fs.readFileSync(path.join(dir, QAMASTER_DIR, 'plugin.json'), 'utf8')).plugin_root;
  } catch {} // no launcher written yet: nothing to compare
  if (typeof recorded === 'string') {
    const real = (p: string) => {
      try {
        return fs.realpathSync(p);
      } catch {
        return path.resolve(p);
      }
    };
    const other = real(recorded) !== real(PLUGIN_ROOT);
    // R27: say what the other build is, not only that it is another folder
    const cmp = other ? compareBuilds(recorded, PLUGIN_ROOT) : null;
    const detail = !other
      ? 'runs this plugin'
      : !cmp
        ? `${QAMASTER_DIR}/bin/qam runs ${recorded}, not the plugin running now (${PLUGIN_ROOT}): run qam setup again from the installed plugin.`
        : !cmp.differ.length
          ? `${QAMASTER_DIR}/bin/qam runs ${recorded}, another copy of this plugin with the same files (version ${cmp.version}); the plugin running now is ${PLUGIN_ROOT}. Run qam setup again from the installed plugin to use one copy.`
          : `${QAMASTER_DIR}/bin/qam runs ${recorded}, ${
              cmp.version === pluginVersion()
                ? `a second build of the same version (${cmp.version})`
                : `version ${cmp.version}, not the running ${pluginVersion()}`
            }: ${cmp.differ.length === 1 ? '1 file differs' : `${cmp.differ.length} files differ`} from the plugin running now (${PLUGIN_ROOT}), first ${cmp.differ.slice(0, 3).join(', ')}. Commands and skills come from one build and the launcher and gate from the other: run qam setup again from the installed plugin.`;
    checks.push({ check: 'launcher', ok: true, detail, ...(other ? { state: 'unknown' as const } : {}) });
  }
  // 0.6.0 (Q52): the gate's files moved to the QA project; the old ones are still read for one release, never deleted
  // the repo doctor runs in, and every recorded code source: `qam --repo <qa-project> doctor` is the usual way to run it
  const legacy = new Map<string, string>(); // old folder -> new one
  for (const repo of [cfg.root, ...repos.map((r) => path.resolve(dir, r.path))]) {
    const d = cfg.qaProject ? stateDirs(repo, cfg.qaProject) : null;
    if (d?.legacy) legacy.set(d.legacy, d.write);
  }
  for (const [from, to] of legacy) {
    const old = ['plans', 'verdicts', 'evidence', 'drafts.json'].filter((n) => fs.existsSync(path.join(from, n)));
    if (old.length)
      checks.push({
        check: 'gate files',
        ok: true,
        detail: `${from} still holds gate files from before 0.6.0 (${old.join(', ')}). They are read for this release; new ones go to ${to}. QAMaster never deletes them: delete those by hand when you no longer need them (keep integrations.json).`,
        state: 'unknown',
      });
  }
  // 0.6.0 (R1, R4, R17): the app's own tests exist, and the gate doesn't run them
  const gateRoot = path.resolve(cfg.testRoot);
  for (const r of repos) {
    const found = path.resolve(dir, r.path) === gateRoot ? [] : findAppTests(path.resolve(dir, r.path));
    if (found.length)
      checks.push({
        check: `app tests ${r.name}`,
        ok: true,
        detail: `${found.join('; ')}. They are not part of the gate; to gate one, link a test case to it as pytest:<file>::<test> in the test case store.`,
      });
  }
  // a config written by an older QAMaster keeps its values (setup never overwrites), so say which defaults moved on
  const qamFile = path.join(dir, 'config', 'qamaster.json');
  if (cfg.qaProject && dsm && fs.existsSync(qamFile)) {
    const stale: string[] = [];
    const depth = (readJson(qamFile).publish as { pathDepth?: unknown } | undefined)?.pathDepth;
    const def = DEFAULT_PROJECT_CONFIG.publish.pathDepth;
    if (depth !== undefined && depth !== def)
      stale.push(
        `publish.pathDepth is ${depth}, the default is now ${def}: set it in config/qamaster.json (fine if deliberate).`,
      );
    // 0.3.2 T2: ULIDs (26 characters, as in /product/01M6DMTD1S095QT6ATYWZ5E9MR) became a default rule
    const rules = (dsm.application as { route_normalization?: { pattern?: string }[] } | undefined)
      ?.route_normalization;
    if (Array.isArray(rules) && !rules.some((r) => r.pattern?.includes(ULID_MARK)))
      stale.push(
        `application.route_normalization has no rule for ULID IDs: add {"pattern": "/[0-9A-HJKMNP-TV-Z]{26}(?=/|$)", "replace": "/:id"} to config/dsm-config.json, or an app with ULID IDs gets a crawled page for every record (fine if it has none).`,
      );
    for (const r of repos as { name: string; exclude?: unknown }[]) {
      if (!Array.isArray(r.exclude)) continue;
      const lacks = DEFAULT_EXCLUDE.filter((e) => !(r.exclude as unknown[]).includes(e));
      if (lacks.length)
        stale.push(
          `source ${r.name}: exclude lacks ${lacks.join(', ')}: add to its exclude in config/dsm-config.json.`,
        );
    }
    checks.push({
      check: 'config defaults',
      ok: true,
      detail: stale.join('\n') || 'current',
      ...(stale.length ? { state: 'unknown' as const } : {}),
    });
  }
  const pw = fs.existsSync(path.join(dir, 'node_modules', 'playwright', 'package.json'));
  checks.push({
    check: 'Playwright',
    ok: pw || !app.base_url,
    detail: pw ? 'installed' : app.base_url ? 'not installed: run qam setup' : 'not needed without an app URL',
  });
  for (const i of verify(ctx(cfg)))
    checks.push({ check: `integration ${i.id}`, ok: !i.problem, detail: i.problem ?? 'working' });
  // the store, read-only: the plan and its test cases (the pipeline's store stage reads this record)
  let store: { ok: boolean; at: string; detail: string };
  let built: TestCaseStore | null = null;
  const storeCheck: (typeof checks)[number] = { check: 'test case store', ok: false, detail: '' };
  let linked: string[] = [];
  try {
    built = withCache(buildStore(cfg), project(cfg), true).store; // doctor reads live and refreshes the cache (Q34)
    const cases = await built.inPlan();
    linked = [...cases.values()].map((c) => c.automatedTest).filter((l): l is string => !!l);
    store = {
      ok: true,
      at: new Date().toISOString(),
      detail: `${built.where()}: ${cases.size} test case(s) in the plan`,
    };
  } catch (caught) {
    if (!(caught instanceof BlockedError)) throw caught;
    const e: BlockedError =
      !(caught instanceof NoProjectError) && cfg.store === 'ado' ? ((await noProjectError(cfg)) ?? caught) : caught;
    // the organization and a token but no project (0.4.1 A2): list the projects, pick none
    store = { ok: false, at: new Date().toISOString(), detail: e.message.replace(/\s+/g, ' ') };
    // the numbered plan choices and the project list keep their lines, and are also data for --json
    if (e instanceof NoPlanError) Object.assign(storeCheck, { plans: e.plans, createName: e.createName });
    if (e instanceof NoProjectError) Object.assign(storeCheck, { projects: e.projects, suggestions: e.suggestions });
    storeCheck.detail = e instanceof NoPlanError || e instanceof NoProjectError ? e.message : store.detail;
  }
  storeCheck.ok = store.ok;
  storeCheck.detail ||= store.detail;
  checks.push(storeCheck);
  // Q44: ADO settings (QAMaster's, or az defaults as a pair, R24) with the local file store means test cases never reach
  // Azure DevOps, which is easy to miss
  const az = azDefaults(cfg.env);
  if (
    (cfg.env.QAMASTER_ADO_ORG || cfg.env.QAMASTER_ADO_PROJECT || (az.organization && az.project)) &&
    !cfg.env.QAMASTER_STORE &&
    cfg.store === 'file'
  )
    checks.push({
      check: 'store setting',
      ok: true,
      detail:
        'Azure DevOps settings are set, but test cases go to the local CSV file. Run qam store use ado to publish to Azure DevOps.',
      state: 'unknown',
    });
  // the gate's prerequisites (F4): each runner the plan's links use, then the app the tests open
  const runners = new Set(linked.map((l) => linkRunner(l)).filter((n): n is string => !!n));
  if (automationFolder(cfg)) runners.add('playwright-bdd');
  if (noApp)
    checks.push(
      runners.size
        ? {
            check: 'app',
            ok: true,
            detail: 'no URL and no code source: the gate alone needs neither; the DSM and TestGen do',
            state: 'unknown',
          }
        : { check: 'app', ok: false, detail: 'no URL and no code source: run qam setup --url … --source …' },
    );
  for (const name of [...runners].sort()) {
    if (!Object.hasOwn(RUNNERS, name)) {
      checks.push({
        check: `runner ${name}`,
        ok: false,
        detail: `QAMaster has no ${name} runner: change those test cases' links`,
      });
      continue;
    }
    for (const c of (await RUNNERS[name](cfg).check?.(runnerRoot(cfg, name))) ?? [])
      checks.push({ check: `runner ${c.check}`, ok: c.ok, detail: c.detail });
  }
  const url = process.env.WEB_BASE_URL || cfg.project.app?.url || app.base_url;
  // before the automation folder exists these lines still show, so a missing step reads as "not yet", not as an absence
  if (!runners.size && !noApp) {
    checks.push({
      check: 'runner',
      ok: true,
      detail: 'not set up yet: the automation step creates it (qam pipeline next)',
      state: 'unknown',
    });
    checks.push({
      check: 'app URL',
      ok: true,
      detail: url
        ? `${url} not checked: no runner yet, so nothing opens it`
        : 'not set: run qam setup --url <the running app>',
      state: 'unknown',
    });
  }
  if (runners.size && url) {
    let answer: string | null = null;
    try {
      answer = `HTTP ${(await fetch(url, { signal: AbortSignal.timeout(5000) })).status}`;
    } catch {}
    checks.push({
      check: 'app URL',
      ok: !!answer,
      detail: answer
        ? `${url} answers (${answer})`
        : `${url} didn't answer: start the app, or set its URL (app.url in config/qamaster.json, or WEB_BASE_URL)`,
    });
  }
  let write: WriteCheck | null = null;
  if (v['check-write']) {
    const name = 'write access';
    if (!built)
      checks.push({ check: name, ok: false, detail: "not checked: the test case store isn't set up (see above)" });
    else if (!built.checkWrite) {
      write = {
        state: 'unknown',
        detail: "unknown: this store can't be asked. Its first write will tell.",
        area: null,
        missing: [],
        testCaseType: 'unknown',
      };
    } else {
      try {
        write = await built.checkWrite();
      } catch (e) {
        if (!(e instanceof BlockedError)) throw e;
        // the create flow reads write.state from --json, so a check that couldn't run still reports one
        const detail = e.message.replace(/\s+/g, ' ');
        write = { state: 'blocked', detail, area: null, missing: [], testCaseType: 'unknown' };
      }
    }
    if (write) checks.push({ check: name, ok: write.state !== 'blocked', detail: write.detail, state: write.state });
  }
  const ok = checks.every((c) => c.ok);
  fs.mkdirSync(path.join(dir, QAMASTER_DIR), { recursive: true });
  const record = path.join(dir, QAMASTER_DIR, 'doctor.json');
  let prev = {}; // doctor's own record: one that can't be read is rewritten
  try {
    prev = JSON.parse(fs.readFileSync(record, 'utf8'));
  } catch {}
  writeJson(record, { ...prev, at: new Date().toISOString(), ok, checks, store });
  registerQaProject(dir); // 0.7.1 item 12: the clones find this project through the home index
  if (json) console.log(JSON.stringify({ result: ok ? 'pass' : 'blocked', checks, ...(write ? { write } : {}) }));
  else {
    const w = Math.max(...checks.map((c) => c.check.length));
    const label = (c: (typeof checks)[number]) => (c.state === 'unknown' ? 'WARN  ' : c.ok ? 'ok    ' : 'FIX   ');
    // a detail of several lines (the plan choices, the write answer) keeps them under the detail column
    const indent = ' '.repeat(2 + 6 + 1 + w + 2);
    console.log(
      `QAMaster doctor: ${ok ? 'all good' : 'needs attention'}\n${checks.map((c) => `  ${label(c)} ${c.check.padEnd(w)}  ${c.detail.replace(/\n/g, `\n${indent}`)}`).join('\n')}`,
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

/**
 * qam store [use <name>] (R23): which store test cases go to. `use` writes QAMASTER_STORE in the QA project's .env,
 * so nobody edits it by hand, and moves the ledger with it: the IDs of the store left are parked under its name and
 * those of the store switched to come back, so bindings and links survive a switch there and back.
 */
export function store(cfg: Config, argv: string[], json: boolean): number {
  const known = Object.keys(STORES).sort();
  const [sub, name] = argv;
  const dir = project(cfg);
  if (!sub || sub === 'show') {
    const ledger = readLedger(dir);
    const where = buildStore(cfg).where();
    const parked = Object.entries(ledger?.other ?? {}).map(([n, es]) => ({ store: n, cases: es.length }));
    if (json) console.log(JSON.stringify({ result: 'pass', store: cfg.store, where, parked }));
    else {
      console.log(`Test cases go to ${where} (QAMASTER_STORE=${cfg.store}). Stores: ${known.join(', ')}.`);
      for (const p of parked) console.log(`Kept IDs for ${p.store}: ${p.cases} test case(s).`);
    }
    return 0;
  }
  if (sub !== 'use' || !name) throw new BlockedError(`Usage: qam store [use <${known.join('|')}>]`);
  if (!known.includes(name)) throw new BlockedError(`${name} isn't a store. Use one of: ${known.join(', ')}.`);
  const where = buildStore({ ...cfg, store: name }).where(); // blocks, saying what to set, when the store isn't set up
  const ledger = readLedger(dir);
  const now = ledger ? switchLedger(ledger, where) : null;
  if (ledger && now && now !== ledger) writeLedger(dir, now);
  // the line goes where one already is, else into the QA project's .env
  const files = [...new Set([path.join(dir, '.env'), path.join(cfg.root, '.env')])];
  const has = (f: string) =>
    /^\s*(export\s+)?QAMASTER_STORE\s*=/m.test(fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const edited = files.filter(has);
  for (const file of edited.length ? edited : [files[0]]) setEnvLine(file, 'QAMASTER_STORE', name);
  const shell =
    !edited.length && cfg.env.QAMASTER_STORE && cfg.env.QAMASTER_STORE !== name ? cfg.env.QAMASTER_STORE : null;
  const cases = now?.entries.length ?? 0;
  const lines = [
    `Test cases now go to ${where} (QAMASTER_STORE=${name} in .env).`,
    ...(ledger
      ? [`Its ledger has ${cases} test case(s)${now?.other ? `; kept for ${Object.keys(now.other).join(', ')}` : ''}.`]
      : []),
    ...(shell
      ? [`QAMASTER_STORE=${shell} is set in the shell and wins over .env: unset it for this to take effect.`]
      : []),
  ];
  if (json)
    console.log(
      JSON.stringify({ result: 'pass', store: name, where, cases, ...(shell ? { shellOverride: shell } : {}) }),
    );
  else console.log(lines.join('\n'));
  return 0;
}

/** Sets KEY=value in a .env file: the line is replaced where it is, else added; other lines are left as they are. */
function setEnvLine(file: string, key: string, value: string): void {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const line = new RegExp(`^(\\s*(?:export\\s+)?)${key}\\s*=.*$`, 'm');
  const next = line.test(text)
    ? text.replace(line, (_all, lead: string) => `${lead}${key}=${value}`)
    : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${key}=${value}\n`;
  fs.writeFileSync(file, next);
}
