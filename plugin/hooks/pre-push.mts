/**
 * PreToolUse hook on Bash: blocks `git push` until QAMaster's verdict for HEAD passes (Q14). Ported from CheckMaster's
 * hooks/pre_push.py. Standard library only, so it starts fast on every Bash call. Only repos where the claude-hooks
 * integration is recorded (.qamaster/integrations.json, written by qam setup --entry claude-code) are gated; every
 * other repo, the QA project included, is never blocked. It never drafts or runs anything: that is /qamaster:check.
 *
 * Exit 0 allows; exit 2 blocks, with the reason on stderr.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

/** The reason to block, or null to allow. */
export function check(event: { tool_input?: { command?: string }; cwd?: string }): string | null {
  if (!isPush(event.tool_input?.command ?? '')) return null;
  const root = git(event.cwd || '.', 'rev-parse', '--show-toplevel');
  if (!root || !gated(root)) return null;
  const head = git(root, 'rev-parse', 'HEAD');
  if (!head) return null; // no commits yet: nothing to check
  try {
    const v = JSON.parse(fs.readFileSync(path.join(root, '.qamaster', 'verdicts', `${head}.json`), 'utf8'));
    if (v.result === 'pass') return null;
    return `QAMaster's verdict for ${head.slice(0, 8)} is ${String(v.result ?? 'unknown').toUpperCase()}: ${(v.reasons ?? []).join(' ')} Fix it and run /qamaster:check again.`;
  } catch {
    return `QAMaster hasn't passed for ${head.slice(0, 8)}. Run /qamaster:check first: it plans the tests this change touches, waits for your approval, and runs them.`;
  }
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
