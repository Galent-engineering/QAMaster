/**
 * The push hook (0.3.0 D2), ported from CheckMaster's tests/test_pre_push_hook.py. QAMaster gates a repo only when
 * the claude-hooks integration is recorded in its .qamaster/integrations.json (settled 2026-11-02), so the QA
 * project, which also has .qamaster/ (ledger, cache), is never blocked.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmpDir } from './tmp.mts';

const HOOK = path.resolve(import.meta.dirname, '..', 'plugin/hooks/pre-push.mts');

function git(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function repo(record = true) {
  const dir = tmpDir('qam-hook-');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(dir, '.qamaster'));
  if (record)
    fs.writeFileSync(
      path.join(dir, '.qamaster/integrations.json'),
      JSON.stringify({ integrations: [{ id: 'claude-hooks:Shop', kind: 'claude-hooks' }] }),
    );
  return dir;
}
function hook(cwd: string, command: string) {
  const event = { tool_name: 'Bash', tool_input: { command }, cwd };
  return spawnSync(process.execPath, [HOOK], { input: JSON.stringify(event), encoding: 'utf8' });
}
function verdict(dir: string, result: string) {
  const head = git(dir, 'rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, '.qamaster/verdicts'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, `.qamaster/verdicts/${head}.json`),
    JSON.stringify({ result, reasons: ['TC502 failed.'] }),
  );
}

test('a push without a verdict is blocked, in every way of writing it', () => {
  const dir = repo();
  for (const command of [
    'git push',
    'git push origin main',
    'cd x && git push -u origin HEAD',
    'git -C . push',
    'GIT_TRACE=1 git push',
    '/usr/bin/git push --force-with-lease',
  ]) {
    const r = hook(dir, command);
    assert.equal(r.status, 2, command);
    assert.match(r.stderr, /Run \/qamaster:check first/, command);
  }
});

test('other commands pass through', () => {
  const dir = repo();
  for (const command of ['git status', "git commit -m 'push the fix'", 'echo git push', 'git log --grep push', 'ls'])
    assert.equal(hook(dir, command).status, 0, command);
});

test('a passing verdict for HEAD allows the push; a failing one blocks with its reason', () => {
  const dir = repo();
  verdict(dir, 'pass');
  assert.equal(hook(dir, 'git push').status, 0);
  verdict(dir, 'fail');
  const r = hook(dir, 'git push');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is FAIL: TC502 failed\./);
});

test('a verdict for an older commit does not count', () => {
  const dir = repo();
  verdict(dir, 'pass');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'more');
  assert.equal(hook(dir, 'git push').status, 2);
});

test('repos without the claude-hooks record are never blocked: the QA project, and repos never set up', () => {
  assert.equal(hook(repo(false), 'git push').status, 0, '.qamaster/ alone (a QA project) is not gated');
  assert.equal(hook(tmpDir('qam-hook-nogit-'), 'git push').status, 0);
});

test('a broken event never blocks', () => {
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

// From the clean Docker run (F11): without git a gated repo's push was allowed silently. Q14: still allow, but say so.
test('0.3.1 F11: in a gated repo without git, the push is allowed with a note', () => {
  const dir = repo();
  const event = { tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: dir };
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent' },
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /QAMaster couldn't check this push: git isn't available/);
});

test('0.6.0 R28: every verdict for a commit is kept, and the newest one decides', () => {
  const dir = repo();
  const head = git(dir, 'rev-parse', 'HEAD');
  const vdir = path.join(dir, '.qamaster/verdicts');
  fs.mkdirSync(vdir, { recursive: true });
  const put = (name: string, result: string, when: number) => {
    const f = path.join(vdir, name);
    fs.writeFileSync(f, JSON.stringify({ result, reasons: ['TC502 failed.'] }));
    fs.utimesSync(f, when, when);
  };
  put(`${head}-plan1.json`, 'pass', 1000);
  put(`${head}-plan2.json`, 'fail', 2000);
  assert.equal(hook(dir, 'git push').status, 2, 'the newer fail decides');
  put(`${head}-plan3.json`, 'pass', 3000);
  assert.equal(hook(dir, 'git push').status, 0, 'the newer pass decides');
  put(`${head}.json`, 'fail', 4000); // a verdict written by 0.5.0 or earlier still counts
  assert.equal(hook(dir, 'git push').status, 2);
});
