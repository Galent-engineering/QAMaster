/**
 * PreToolUse hook on Bash: blocks `git push` until QAMaster's verdict for HEAD passes (Q14). Ported from CheckMaster's
 * hooks/pre_push.py. Standard library only, so it starts fast on every Bash call. Only repos where the claude-hooks
 * integration is recorded (.qamaster/integrations.json, written by qam setup --entry claude-code) are gated, and so is
 * an app clone that a gated QA project recorded as a code source, which is where its verdicts are kept (Q52); every
 * other repo is never blocked. The repo comes from a `cd` or `git -C` in the command, else the session's folder. It never
 * drafts or runs anything: that is /qamaster:check.
 *
 * Exit 0 allows; exit 2 blocks, with the reason on stderr.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordingProject, stateDirs } from '../src/gate/state.mts';

/** git options that take a separate value, e.g. `git -C repo push`. */
const WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);

/** Splits a shell segment into words, honouring quotes; null when the quotes don't close. */
function words(segment: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let has = false;
  for (const ch of segment) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (quote) return null;
  if (cur || has) out.push(cur);
  return out;
}

export function isPush(command: string): boolean {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const w = words(segment);
    if (!w) continue;
    while (w.length && w[0].includes('=') && !w[0].startsWith('-')) w.shift(); // leading VAR=value
    if (!w.length || path.basename(w[0]) !== 'git') continue;
    let i = 1;
    while (i < w.length && w[i].startsWith('-')) i += WITH_VALUE.has(w[i]) ? 2 : 1;
    if (w[i] === 'push') return true;
  }
  return false;
}

/** The folder each push in a command line runs in: `cd X` earlier on the line, then any `git -C X`, in order. */
export function pushDirs(command: string, cwd: string): string[] {
  const out: string[] = [];
  let cur = path.resolve(cwd);
  const into = (base: string, to: string) => path.resolve(base, to.replace(/^~(?=\/|$)/, os.homedir()));
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const w = words(segment.trim().replace(/^\(+|\)+$/g, ''));
    if (!w) continue;
    while (w.length && w[0].includes('=') && !w[0].startsWith('-')) w.shift(); // leading VAR=value
    if (w[0] === 'cd' && w[1]) {
      const to = into(cur, w[w[1] === '--' ? 2 : 1] ?? '');
      if (fs.existsSync(to)) cur = to; // a folder that isn't there leaves the session's in force
      continue;
    }
    if (!w.length || path.basename(w[0]) !== 'git') continue;
    let dir = cur;
    let i = 1;
    while (i < w.length && w[i].startsWith('-')) {
      if (w[i] === '-C' && w[i + 1] !== undefined) dir = into(dir, w[i + 1]);
      i += WITH_VALUE.has(w[i]) ? 2 : 1;
    }
    if (w[i] === 'push') out.push(dir);
  }
  return out;
}

function git(cwd: string, ...args: string[]): string | null {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function gated(root: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, '.qamaster', 'integrations.json'), 'utf8'));
    return (data.integrations ?? []).some((i: { kind?: string }) => i.kind === 'claude-hooks');
  } catch {
    return false;
  }
}

/** The reason to block one push in `dir`, or null to allow. */
function judge(dir: string): string | null {
  const root = git(dir, 'rev-parse', '--show-toplevel');
  if (!root) return null;
  // gated by its own record, or by the QA project that recorded it (Q52); the verdicts are where that project keeps them
  const rec = recordingProject(root);
  if (!gated(root) && !(rec && gated(rec.project))) return null;
  const head = git(root, 'rev-parse', 'HEAD');
  if (!head) return null; // no commits yet: nothing to check
  try {
    // every run keeps its own verdict (<head>-<plan>.json; <head>.json before 0.6.0): the newest one decides
    const newest = stateDirs(root, rec?.project ?? null)
      .read.flatMap((d) => {
        const dir = path.join(d, 'verdicts');
        try {
          return fs
            .readdirSync(dir)
            .filter((f) => f === `${head}.json` || (f.startsWith(`${head}-`) && f.endsWith('.json')))
            .map((f) => ({ file: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }));
        } catch {
          return []; // no verdicts folder here
        }
      })
      .sort((a, b) => b.t - a.t)[0];
    if (!newest) throw new Error('no verdict');
    const v = JSON.parse(fs.readFileSync(newest.file, 'utf8'));
    if (v.result === 'pass') return null;
    return `QAMaster's verdict for ${head.slice(0, 8)} is ${String(v.result ?? 'unknown').toUpperCase()}: ${(v.reasons ?? []).join(' ')} Fix it and run /qamaster:check again.`;
  } catch {
    return `QAMaster hasn't passed for ${head.slice(0, 8)}. Run /qamaster:check first: it plans the tests this change touches, waits for your approval, and runs them.`;
  }
}

/** The reason to block, or null to allow. */
export function check(event: { tool_input?: { command?: string }; cwd?: string }): string | null {
  for (const dir of pushDirs(event.tool_input?.command ?? '', event.cwd || '.')) {
    const reason = judge(dir);
    if (reason) return reason;
  }
  return null;
}

/** A gated repo at or above `cwd`, found without git (for the note when git is missing). */
function gatedByFiles(cwd: string): boolean {
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    if (gated(dir)) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

if (import.meta.main) {
  let reason: string | null = null;
  try {
    const event = JSON.parse(fs.readFileSync(0, 'utf8'));
    reason = check(event);
    // Q14: a push the hook can't judge is allowed, but never silently (F11)
    const push = isPush(event.tool_input?.command ?? '');
    if (!reason && push && spawnSync('git', ['--version']).error && gatedByFiles(event.cwd || '.'))
      process.stderr.write("QAMaster couldn't check this push: git isn't available.\n");
  } catch {
    reason = null; // a hook that can't read its event never blocks
  }
  if (reason) {
    process.stderr.write(`${reason}\n`);
    process.exitCode = 2;
  }
}
