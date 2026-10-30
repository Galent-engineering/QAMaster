/**
 * Where the app's code comes from (Q26): a local folder, or a git URL that is cloned into a folder the person chose
 * or matched to an existing clone. Every source is checked before anything depends on it: git's version, access with
 * the person's own git credentials, the branch, a full (not shallow) history, and uncommitted changes.
 *
 * Cloning is the one write to the source side (Q15 amendment), and only when asked with a folder.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RepoConfig } from '../dsm/scan.mts';
import { BlockedError } from '../shared/errors.mts';

/** The oldest git QAMaster supports: every git command it runs (ls-tree -z, cat-file --batch, diff --relative) is older. */
export const MIN_GIT = [2, 20];

export const DEFAULT_EXCLUDE = [
  'node_modules/',
  'dist/',
  'build/',
  'bin/',
  'obj/',
  '.git/',
  'vendor/',
  'packages/',
  'wwwroot/lib/',
  '*.min.js',
  '*.spec.ts',
  '*.test.*',
  // test code and its harness pages never define the app's screens (a Cypress harness page became a screen). Not
  // tests/ or test/: apps have real screens there (an exam's app/tests/page.tsx), nor *.cy.*: cy is also Welsh
  'cypress/',
  'e2e/',
  '__tests__/',
  '*.cy.[jt]s',
  '*.cy.[jt]sx',
  // copies of the app's own routers kept as data (Juice Shop's data/static/codefixes/: 489 routes instead of 48)
  'codefixes/',
];

export type SourceSpec = {
  source: string; // a folder, or a git URL (https, ssh or git@)
  branch?: string;
  name?: string;
  cloneTo?: string; // for a URL: clone into this folder
  useClone?: string; // for a URL: an existing clone of it
};

export type CheckedSource = { repo: RepoConfig; notes: string[]; warnings: string[]; cloned: boolean };

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' }; // never prompt for a password: use the person's own credentials

function git(args: string[], cwd?: string) {
  const r = spawnSync('git', cwd ? ['-C', cwd, ...args] : args, { encoding: 'utf8', env: GIT_ENV, timeout: 120_000 });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? r.error?.message ?? '').trim() };
}

export const isGitUrl = (s: string) => /^(https?:\/\/|ssh:\/\/|git@|file:\/\/)/.test(s);

/** git's version, or a message saying what's wrong. */
export function gitVersion(): { version: string | null; problem: string | null } {
  const r = git(['--version']);
  if (!r.ok) return { version: null, problem: 'git is not installed. Install git 2.20 or later.' };
  const m = /(\d+)\.(\d+)/.exec(r.out);
  const ok = m && (Number(m[1]) > MIN_GIT[0] || (Number(m[1]) === MIN_GIT[0] && Number(m[2]) >= MIN_GIT[1]));
  return { version: r.out, problem: ok ? null : `${r.out} is too old. Install git ${MIN_GIT.join('.')} or later.` };
}

/** The same remote, written different ways: trailing ".git" and "/" ignored, user part ignored, case of the host ignored. */
export function sameRemote(a: string, b: string): boolean {
  const norm = (u: string) => {
    let s = u
      .trim()
      .replace(/\.git$/, '')
      .replace(/\/+$/, '');
    const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(s);
    if (scp) s = `ssh://${scp[1]}/${scp[2]}`;
    try {
      const x = new URL(s);
      return `${x.hostname.toLowerCase()}${x.pathname.replace(/\.git$/, '')}`;
    } catch {
      return s;
    }
  };
  return norm(a) === norm(b);
}

const nameOf = (s: string) =>
  path.basename(s.replace(/\.git$/, '').replace(/\/+$/, '')).replace(/[^\w.-]+/g, '-') || 'app';

/** Checks a local folder; `branch` defaults to the folder's current branch. */
function checkFolder(dir: string, spec: SourceSpec, project: string): CheckedSource {
  const notes: string[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new BlockedError(
      `${dir} isn't a folder. Give the app's code folder, or a git URL with --clone-to or --use-clone.`,
    );
  }
  const rel = path.relative(project, dir) || '.';
  const repo: RepoConfig = {
    name: spec.name || nameOf(dir),
    path: rel,
    branch: spec.branch,
    fetch: true,
    include: [],
    exclude: [...DEFAULT_EXCLUDE],
  };
  if (!git(['rev-parse', '--git-dir'], dir).ok) {
    warnings.push(`${rel} isn't in git: it's read from disk, and the gate has no change history for it.`);
    repo.branch = undefined;
    return { repo, notes, warnings, cloned: false };
  }
  const branch = spec.branch || git(['rev-parse', '--abbrev-ref', 'HEAD'], dir).out || 'main';
  repo.branch = branch;
  const exists = (ref: string) => git(['rev-parse', '--verify', '-q', `${ref}^{commit}`], dir).ok;
  if (!exists(branch) && !exists(`origin/${branch}`)) {
    throw new BlockedError(
      `Branch "${branch}" doesn't exist in ${rel}, locally or on origin. Pass --branch with an existing branch.`,
    );
  }
  if (git(['rev-parse', '--is-shallow-repository'], dir).out === 'true') {
    throw new BlockedError(
      `${rel} is a shallow clone, so change detection can't see history. Run git fetch --unshallow there, or clone it fully.`,
    );
  }
  const prefix = git(['rev-parse', '--show-prefix'], dir).out;
  if (prefix)
    notes.push(
      `${rel} is the folder ${prefix.replace(/\/$/, '')} of a bigger repository; routes start at this folder.`,
    );
  if (git(['status', '--porcelain'], dir).out) {
    warnings.push(`${rel} has uncommitted changes. The scan reads committed code, so they won't show until committed.`);
  }
  return { repo, notes, warnings, cloned: false };
}

/** Checks a source and returns its entry for dsm-config.json. A URL with `cloneTo` is cloned (the one write). */
export function checkSource(spec: SourceSpec, project: string): CheckedSource {
  const v = gitVersion();
  if (v.problem) throw new BlockedError(v.problem);
  if (!isGitUrl(spec.source)) return checkFolder(path.resolve(project, spec.source), spec, project);

  const url = spec.source;
  if (!spec.cloneTo === !spec.useClone) {
    throw new BlockedError(
      `${url} is a git URL. Choose where its code is: --clone-to <new folder> to clone it, or --use-clone <folder> for an existing clone.`,
    );
  }
  if (spec.useClone) {
    const dir = path.resolve(project, spec.useClone);
    const origin = git(['remote', 'get-url', 'origin'], dir);
    if (!origin.ok)
      throw new BlockedError(`${dir} isn't a git clone with an origin. Clone ${url} there, or use --clone-to.`);
    if (!sameRemote(origin.out, url)) {
      throw new BlockedError(`${dir} is a clone of ${origin.out}, not ${url}. Point --use-clone at a clone of ${url}.`);
    }
    const checked = checkFolder(dir, { ...spec, name: spec.name || nameOf(url) }, project);
    checked.notes.unshift(`using the existing clone ${checked.repo.path} of ${url}`);
    return checked;
  }
  const dir = path.resolve(project, spec.cloneTo as string);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
    throw new BlockedError(
      `${dir} already has files. Choose an empty or new folder for --clone-to, or use --use-clone if it's already a clone.`,
    );
  }
  const heads = git(['ls-remote', '--heads', url]);
  if (!heads.ok) {
    throw new BlockedError(
      `Can't reach ${url} with your git credentials (${heads.err.split('\n')[0] || 'no access'}). Check the URL, or sign in to the host with git first.`,
    );
  }
  if (spec.branch && !heads.out.split('\n').some((l) => l.endsWith(`refs/heads/${spec.branch}`))) {
    throw new BlockedError(`${url} has no branch "${spec.branch}". Pass --branch with an existing branch.`);
  }
  const clone = git(['clone', ...(spec.branch ? ['--branch', spec.branch] : []), url, dir]);
  if (!clone.ok) throw new BlockedError(`Cloning ${url} failed: ${clone.err.split('\n').pop()}`);
  const checked = checkFolder(dir, { ...spec, name: spec.name || nameOf(url) }, project);
  checked.notes.unshift(`cloned ${url} into ${checked.repo.path}`);
  return { ...checked, cloned: true };
}
