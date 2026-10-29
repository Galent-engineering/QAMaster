/**
 * qam setup: prepares a QA project. Safe to re-run: it only adds what's missing and never overwrites a file someone
 * edited. With `check`, it changes nothing and reports what's missing.
 *
 *   1. Prerequisites: Node.js 24+, npm, git 2.20+.
 *   2. Project link: .qamaster/plugin.json (the current plugin folder) and the launcher .qamaster/bin/qam.mjs with
 *      qam / qam.cmd shims, so terminals and CI keep working after plugin updates.
 *   3. Config files from plugin/templates/project/config/, where missing. Later features add their templates there.
 *   4. .gitignore lines for secrets, the saved session, locks and caches.
 *   5. package.json with Playwright, for the crawl.
 *   6. Deny rules in .claude/settings.json: Claude can't read .env* or the saved session (Q16).
 *   7. npm install and the browsers, unless skipped.
 * The app's URL and code sources (Q26) and the entry points (Q29) are added by the setup command around this.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { gitVersion } from './sources.mts';

export const PLUGIN_ROOT = path.resolve(import.meta.dirname, '../..');
export const TEMPLATES = path.join(PLUGIN_ROOT, 'templates', 'project', 'config');
export const PLAYWRIGHT_VERSION = '1.64.1';
export const LAUNCHER_VERSION = 1;
export const GITIGNORE_LINES = [
  'node_modules/',
  '.env',
  '.env.*',
  '!.env.example',
  'dsm/.lock',
  'dsm/.auth/',
  `${QAMASTER_DIR}/plugin.json`,
  `${QAMASTER_DIR}/*.tmp`,
  'reports/output/',
];
/** Claude Code permission rules: Claude can't read secret files or the saved session (Q16). */
export const DENY_RULES = ['Read(./.env)', 'Read(./.env.*)', 'Read(./dsm/.auth/**)'];

export type Step = {
  step: string;
  status: 'ok' | 'created' | 'updated' | 'missing' | 'skipped' | 'failed';
  detail: string;
};

export function pluginVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

const LAUNCHER = `#!/usr/bin/env node
// QAMaster project launcher (version ${LAUNCHER_VERSION}; written by qam setup, do not edit).
// Runs the qam command line of the plugin folder recorded in .qamaster/plugin.json, so it keeps working after
// plugin updates. Usage: node .qamaster/bin/qam.mjs <command> ...
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const marker = path.dirname(import.meta.dirname);
let root = process.env.QAMASTER_PLUGIN_ROOT;
if (!root) {
  try { root = JSON.parse(fs.readFileSync(path.join(marker, 'plugin.json'), 'utf8')).plugin_root; } catch { root = undefined; }
}
const cli = root ? path.join(root, 'src', 'cli', 'main.mts') : '';
if (!cli || !fs.existsSync(cli)) {
  process.stderr.write('QAMaster: the plugin folder in .qamaster/plugin.json was not found. Run qam setup again from Claude Code, or set QAMASTER_PLUGIN_ROOT.\\n');
  process.exit(2);
}
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
`;
const SHIMS: [string, string, number][] = [
  [
    'qam',
    '#!/usr/bin/env sh\n# QAMaster for terminals and CI (written by qam setup; do not edit).\nexec node "$(dirname "$0")/qam.mjs" "$@"\n',
    0o755,
  ],
  [
    'qam.cmd',
    '@echo off\r\nrem QAMaster for terminals and CI (written by qam setup; do not edit).\r\nnode "%~dp0qam.mjs" %*\r\n',
    0o644,
  ],
];

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[], cwd: string, timeout: number) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, shell: process.platform === 'win32' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

function prerequisites(): Step[] {
  const major = Number(process.versions.node.split('.')[0]);
  const npm = run('npm', ['--version'], process.cwd(), 20_000);
  const g = gitVersion();
  return [
    {
      step: 'Node.js',
      status: major >= 24 ? 'ok' : 'failed',
      detail: `v${process.versions.node}${major >= 24 ? '' : ': 24 or later is needed'}`,
    },
    { step: 'npm', status: npm.ok ? 'ok' : 'failed', detail: npm.ok ? npm.out : 'npm not found' },
    { step: 'git', status: g.problem ? 'failed' : 'ok', detail: g.problem ?? (g.version as string) },
  ];
}

/** The project link: plugin.json, the launcher and shims. Returns whether anything changed. */
function link(project: string, write: boolean): Step {
  const dir = path.join(project, QAMASTER_DIR);
  const pointerFile = path.join(dir, 'plugin.json');
  const pointer = readJson<{ plugin_root?: string; plugin_version?: string; launcher_version?: number }>(pointerFile);
  const files: [string, string, number][] = [
    [path.join(dir, 'bin', 'qam.mjs'), LAUNCHER, 0o755],
    ...SHIMS.map(([n, b, m]) => [path.join(dir, 'bin', n), b, m] as [string, string, number]),
  ];
  const stale =
    pointer?.plugin_root !== PLUGIN_ROOT ||
    pointer?.plugin_version !== pluginVersion() ||
    pointer?.launcher_version !== LAUNCHER_VERSION ||
    files.some(([f, body]) => !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== body);
  if (!stale)
    return { step: 'Project link', status: 'ok', detail: `${QAMASTER_DIR}/plugin.json and ${QAMASTER_DIR}/bin/qam` };
  if (!write)
    return {
      step: 'Project link',
      status: 'missing',
      detail: `${QAMASTER_DIR}/plugin.json or the launcher is missing or out of date`,
    };
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
  fs.writeFileSync(
    pointerFile,
    `${JSON.stringify({ _comment: 'Written by qam setup. Machine-specific: not committed.', plugin_root: PLUGIN_ROOT, plugin_version: pluginVersion(), launcher_version: LAUNCHER_VERSION, updated_at: new Date().toISOString() }, null, 2)}\n`,
  );
  for (const [f, body, mode] of files) fs.writeFileSync(f, body, { mode });
  return {
    step: 'Project link',
    status: pointer ? 'updated' : 'created',
    detail: `${QAMASTER_DIR}/plugin.json and ${QAMASTER_DIR}/bin/qam (terminals and CI: .qamaster/bin/qam help)`,
  };
}

function configs(project: string, write: boolean): Step[] {
  return fs
    .readdirSync(TEMPLATES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f): Step => {
      const target = path.join(project, 'config', f);
      if (fs.existsSync(target)) return { step: `config/${f}`, status: 'ok', detail: 'present (kept as is)' };
      if (!write) return { step: `config/${f}`, status: 'missing', detail: 'would be created from the template' };
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const text = fs.readFileSync(path.join(TEMPLATES, f), 'utf8');
      const data = JSON.parse(text);
      if (f === 'dsm-config.json') data.project = path.basename(project);
      fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
      return { step: `config/${f}`, status: 'created', detail: 'from the template; the app is never pre-set' };
    });
}

function gitignore(project: string, write: boolean): Step {
  const file = path.join(project, '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return { step: '.gitignore', status: 'ok', detail: 'entries present' };
  if (!write) return { step: '.gitignore', status: 'missing', detail: missing.join(', ') };
  fs.writeFileSync(
    file,
    `${text}${text && !text.endsWith('\n') ? '\n' : ''}# QAMaster: secrets, the saved session, locks, machine-specific files\n${missing.join('\n')}\n`,
  );
  return { step: '.gitignore', status: text ? 'updated' : 'created', detail: missing.join(', ') };
}

function packageJson(project: string, write: boolean): Step {
  const file = path.join(project, 'package.json');
  const exists = fs.existsSync(file);
  const pkg = exists
    ? readJson<Record<string, unknown>>(file)
    : {
        name: `${path
          .basename(project)
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')}-qa`,
        private: true,
        engines: { node: '>=24' },
      };
  if (!pkg)
    return {
      step: 'package.json',
      status: 'failed',
      detail: "package.json isn't valid JSON: fix it and run qam setup again",
    };
  const deps = { ...((pkg.dependencies as object) ?? {}), ...((pkg.devDependencies as object) ?? {}) } as Record<
    string,
    string
  >;
  if (deps.playwright || deps['@playwright/test'])
    return { step: 'package.json', status: 'ok', detail: 'Playwright listed' };
  if (!write)
    return { step: 'package.json', status: 'missing', detail: `Playwright ${PLAYWRIGHT_VERSION} would be added` };
  pkg.devDependencies = { ...((pkg.devDependencies as object) ?? {}), playwright: PLAYWRIGHT_VERSION };
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return {
    step: 'package.json',
    status: exists ? 'updated' : 'created',
    detail: `Playwright ${PLAYWRIGHT_VERSION} for the crawl`,
  };
}

function denyRules(project: string, write: boolean): Step {
  const file = path.join(project, '.claude', 'settings.json');
  const settings = (fs.existsSync(file) ? readJson<Record<string, unknown>>(file) : {}) ?? null;
  if (!settings)
    return {
      step: '.claude/settings.json',
      status: 'failed',
      detail: "isn't valid JSON: fix it and run qam setup again",
    };
  const perms = (settings.permissions as { deny?: string[] } | undefined) ?? {};
  const missing = DENY_RULES.filter((r) => !(perms.deny ?? []).includes(r));
  if (!missing.length)
    return { step: '.claude/settings.json', status: 'ok', detail: 'Claude may not read .env* or dsm/.auth/' };
  if (!write) return { step: '.claude/settings.json', status: 'missing', detail: `deny rules ${missing.join(', ')}` };
  settings.permissions = { ...perms, deny: [...(perms.deny ?? []), ...missing] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return { step: '.claude/settings.json', status: 'updated', detail: `added deny rules ${missing.join(', ')} (Q16)` };
}

function install(
  project: string,
  write: boolean,
  opts: { install: boolean; browsers: 'chromium' | 'all' | 'none' },
): Step[] {
  const installed = fs.existsSync(path.join(project, 'node_modules', 'playwright', 'package.json'));
  if (!write || !opts.install) {
    return [
      {
        step: 'npm install',
        status: installed ? 'ok' : write ? 'skipped' : 'missing',
        detail: installed ? 'Playwright installed' : 'run qam setup without --no-install',
      },
    ];
  }
  const r = run('npm', ['install', '--no-audit', '--no-fund'], project, 900_000);
  const steps: Step[] = [
    { step: 'npm install', status: r.ok ? 'ok' : 'failed', detail: r.out.split('\n').slice(-2).join(' ') },
  ];
  if (r.ok && opts.browsers !== 'none') {
    const list = opts.browsers === 'all' ? ['chromium', 'firefox', 'webkit'] : ['chromium'];
    const b = run('npx', ['--no-install', 'playwright', 'install', ...list], project, 1_800_000);
    steps.push({
      step: 'Playwright browsers',
      status: b.ok ? 'ok' : 'failed',
      detail: b.ok ? list.join(', ') : b.out.split('\n').slice(-2).join(' '),
    });
  }
  return steps;
}

export type SetupOptions = { check: boolean; install: boolean; browsers: 'chromium' | 'all' | 'none' };

/** Runs (or, with `check`, inspects) every step for the QA project. */
export function setupProject(project: string, opts: SetupOptions): Step[] {
  const write = !opts.check;
  fs.mkdirSync(project, { recursive: true });
  return [
    ...prerequisites(),
    link(project, write),
    ...configs(project, write),
    gitignore(project, write),
    packageJson(project, write),
    denyRules(project, write),
    ...install(project, write, opts),
  ];
}
