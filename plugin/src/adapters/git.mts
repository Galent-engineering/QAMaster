/**
 * Reads the app's source for the repo scan. Read-only by construction: it only runs git commands that read.
 * Files come from origin/<branch>, else <branch>, else HEAD, so the scan sees committed code. A folder that isn't in a
 * git repository is read from disk instead.
 *
 * The folder may be a subfolder of a bigger repository (a monorepo's web/ app). Paths are listed and read relative to
 * it ("<ref>:./<path>"), so routes come out as the app sees them.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { RepoSnapshot } from '../dsm/scan.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Change } from '../shared/models.mts';
import type { RepoReader } from './base.mts';

export function git(dir: string, args: string[], input?: string): { ok: boolean; stdout: Buffer } {
  const r = spawnSync('git', ['-C', dir, ...args], { input, maxBuffer: 1024 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: r.stdout ?? Buffer.alloc(0) };
}

/** [ref, commit] for the first of origin/<branch>, <branch>, HEAD that exists; null when there is none. */
export function resolveRef(dir: string, branch: string): [string, string] | null {
  for (const ref of [`origin/${branch}`, branch, 'HEAD']) {
    const r = git(dir, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]);
    if (r.ok) return [ref, r.stdout.toString('utf8').trim()];
  }
  return null;
}

/** The text of every wanted file of `ref` up to `maxBytes`, with one `git cat-file --batch`. */
function readTree(dir: string, ref: string, want: (p: string) => boolean, maxBytes: number): Map<string, string> {
  const names = git(dir, ['ls-tree', '-r', '-z', '--name-only', ref])
    .stdout.toString('utf8')
    .split('\0')
    .filter((n) => n && !n.includes('\n') && want(n));
  const files = new Map<string, string>();
  if (!names.length) return files;
  const out = git(dir, ['cat-file', '--batch'], names.map((n) => `${ref}:./${n}\n`).join('')).stdout;
  let pos = 0;
  for (const n of names) {
    const nl = out.indexOf(0x0a, pos);
    if (nl < 0) break;
    const [, type, size] = out.subarray(pos, nl).toString('utf8').split(' ');
    pos = nl + 1;
    if (type !== 'blob') continue; // "<name> missing": no content follows
    const end = pos + Number(size);
    if (Number(size) <= maxBytes) files.set(n, out.subarray(pos, end).toString('utf8'));
    pos = end + 1;
  }
  return files;
}

/** Files on disk, in path order, skipping .git and symlinked folders. Line endings become "\n". */
function readFolder(dir: string, want: (p: string) => boolean, maxBytes: number): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name !== '.git') walk(p);
      } else if (e.isFile() && want(p) && fs.statSync(path.join(dir, p)).size <= maxBytes) {
        files.set(p, fs.readFileSync(path.join(dir, p), 'utf8').replace(/\r\n?/g, '\n'));
      }
    }
  };
  walk('');
  return new Map([...files].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}

/** The repository's files for the scan, or null when `dir` doesn't exist. */
export function readRepo(
  dir: string,
  branch: string,
  want: (p: string) => boolean,
  maxBytes: number,
): RepoSnapshot | null {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const resolved = git(dir, ['rev-parse', '--git-dir']).ok ? resolveRef(dir, branch) : null;
  if (!resolved) return { ref: null, commit: null, files: readFolder(dir, want, maxBytes) };
  const [ref, commit] = resolved;
  return { ref, commit, files: readTree(dir, ref, want, maxBytes) };
}

/** What changed in one repository since the commit the last DSM build saw. Paths are relative to `dir`. */
export type RepoChange = {
  repo: string;
  branch: string;
  from: string | null;
  to: string | null;
  ref: string | null;
  files: string[];
  log: string[];
  error: string | null;
  rewritten?: boolean;
};

/**
 * Fetches `branch` from origin when asked and there is one (Q15 allows fetch), then compares its commit with `from`.
 * A `from` that no longer exists means history was rewritten.
 */
export function changesSince(
  dir: string,
  repo: string,
  branch: string,
  from: string | null,
  fetch: boolean,
): RepoChange {
  const rec: RepoChange = { repo, branch, from, to: null, ref: null, files: [], log: [], error: null };
  if (!fs.existsSync(dir)) return { ...rec, error: `path not found: ${dir}` };
  if (fetch && git(dir, ['remote']).stdout.toString('utf8').split(/\s+/).includes('origin')) {
    const r = spawnSync('git', ['-C', dir, 'fetch', '--quiet', 'origin', branch], { encoding: 'utf8' });
    if (r.status !== 0) rec.error = `fetch failed: ${(r.stderr || '').trim().slice(0, 300)}`;
  }
  const resolved = resolveRef(dir, branch);
  if (!resolved) return rec;
  [rec.ref, rec.to] = resolved;
  if (!from || from === rec.to) return rec;
  if (!git(dir, ['cat-file', '-e', `${from}^{commit}`]).ok) {
    return {
      ...rec,
      rewritten: true,
      error: `previous commit ${from.slice(0, 10)} no longer exists (history rewritten): full rebuild`,
    };
  }
  // --relative: paths relative to the app's folder, as the code model keys them, even inside a monorepo
  rec.files = git(dir, ['diff', '--name-only', '--relative', from, rec.to])
    .stdout.toString('utf8')
    .split('\n')
    .filter(Boolean);
  rec.log = git(dir, ['log', '--format=%h %an: %s', '-n', '50', `${from}..${rec.to}`, '--', '.'])
    .stdout.toString('utf8')
    .split('\n')
    .filter(Boolean);
  return rec;
}

// the gate compares two commits, so a folder with no git history needs both (0.4.2 W13)
const FIRST_COMMITS =
  'The gate compares a change with a base commit: git init, commit the baseline, commit the change, then qam plan --base <baseline commit>.';

/** git's answer as text, or a BlockedError with what it said. */
function gitText(dir: string, args: string[]): string {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new BlockedError("git isn't installed: install git 2.20 or later, then run again.");
  if (r.status !== 0) {
    const err = (r.stderr || '').trim();
    if (/not a git repository/i.test(err)) throw new BlockedError(`${dir} isn't a git repository. ${FIRST_COMMITS}`);
    if (/ambiguous argument 'HEAD'/.test(err)) throw new BlockedError(`${dir} has no commit yet. ${FIRST_COMMITS}`);
    throw new BlockedError(`git ${args.join(' ')} failed in ${dir}: ${err}`);
  }
  return r.stdout;
}

/** The branch a change is compared with when --base isn't given: origin/HEAD, else main, else master. */
export function defaultBase(dir: string): string {
  if (!git(dir, ['rev-parse', '--git-dir']).ok)
    throw new BlockedError(`${dir} isn't a git repository. ${FIRST_COMMITS}`);
  for (const ref of ['origin/HEAD', 'main', 'master'])
    if (git(dir, ['rev-parse', '--verify', '--quiet', ref]).ok) return ref;
  throw new BlockedError(`Couldn't find a base branch (origin/HEAD, main or master) in ${dir}. Pass --base <branch>.`);
}

/** The gate's view of the app repo (ported from CheckMaster's git.py). Only reads. */
export class GitRepoReader implements RepoReader {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** The committed change from the merge base of `base` and `head` up to `head`; a rename keeps its new path. */
  async diff(base: string, head: string): Promise<Change> {
    const from = gitText(this.dir, ['merge-base', base, head]).trim();
    const files = gitText(this.dir, ['diff', '--name-status', '-M', from, head])
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [status, ...paths] = line.split('\t');
        return { path: paths[paths.length - 1], status: status[0] };
      });
    return {
      base,
      head: gitText(this.dir, ['rev-parse', head]).trim(),
      branch: gitText(this.dir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      files,
    };
  }

  async readFile(ref: string, file: string): Promise<string> {
    return gitText(this.dir, ['show', `${ref}:${file}`]);
  }

  async listTree(ref: string): Promise<string[]> {
    return gitText(this.dir, ['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);
  }

  async head(): Promise<string> {
    return gitText(this.dir, ['rev-parse', 'HEAD']).trim();
  }
}
