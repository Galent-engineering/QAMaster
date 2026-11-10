/**
 * 0.6.0 item 2 (Q52, R25): the push hook blocks from the app clone. The claude-hooks record and the gate's verdicts are in
 * the QA project that recorded the clone; the hook finds it through the home index, and takes the repo from a `cd` or
 * `git -C` in the command, not only the session's folder.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pushDirs } from '../plugin/hooks/pre-push.mts';
import { tmpDir } from './tmp.mts';

const HOOK = path.resolve(import.meta.dirname, '..', 'plugin/hooks/pre-push.mts');

function git(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A QA project that recorded `clone` and holds the claude-hooks record; a home index listing it; a bare remote. */
function world(record = true) {
  const home = tmpDir('qam-home-');
  const qa = tmpDir('qam-qa-');
  const clone = tmpDir('qam-clone-');
  const remote = tmpDir('qam-remote-');
  git(remote, 'init', '-q', '--bare', '-b', 'main');
  git(clone, 'init', '-q', '-b', 'main');
  git(clone, 'commit', '-q', '--allow-empty', '-m', 'init');
  git(clone, 'remote', 'add', 'origin', remote);
  write(path.join(qa, 'config/qamaster.json'), '{}');
  write(
    path.join(qa, 'config/dsm-config.json'),
    JSON.stringify({ repositories: [{ name: 'shop', path: path.relative(qa, clone) }] }),
  );
  if (record)
    write(
      path.join(qa, '.qamaster/integrations.json'),
      JSON.stringify({ integrations: [{ id: 'claude-hooks:Shop', kind: 'claude-hooks' }] }),
    );
  write(
    path.join(home, 'installs.json'),
    JSON.stringify({ repos: { [qa]: { app: 'Shop', integrations: ['claude-hooks:Shop'], updated_at: 'x' } } }),
  );
  return { home, qa, clone };
}
const hook = (home: string, cwd: string, command: string) =>
  spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }),
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: home },
  });
function verdict(w: { qa: string; clone: string }, result: string, dir = path.join(w.qa, '.qamaster/gate/shop')) {
  const head = git(w.clone, 'rev-parse', 'HEAD');
  write(path.join(dir, 'verdicts', `${head}-p1.json`), JSON.stringify({ result, reasons: ['TC9 failed.'] }));
}

test('a push from the app clone is blocked with no verdict in the QA project, and allowed with a passing one', () => {
  const w = world();
  const blocked = hook(w.home, w.clone, 'git push');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Run \/qamaster:check first/);
  verdict(w, 'pass');
  assert.equal(hook(w.home, w.clone, 'git push').status, 0);
  // then one real push to the bare remote
  assert.equal(spawnSync('git', ['-C', w.clone, 'push', '-q', 'origin', 'main']).status, 0);
});

test('a failing verdict in the QA project blocks with its reason; one for an older commit does not count', () => {
  const w = world();
  verdict(w, 'fail');
  const r = hook(w.home, w.clone, 'git push');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is FAIL: TC9 failed\./);
  fs.rmSync(path.join(w.qa, '.qamaster/gate'), { recursive: true });
  verdict(w, 'pass');
  git(w.clone, 'commit', '-q', '--allow-empty', '-m', 'more');
  assert.equal(hook(w.home, w.clone, 'git push').status, 2);
});

test('an empty commit with no verdict is blocked', () => {
  const w = world();
  verdict(w, 'pass');
  assert.equal(hook(w.home, w.clone, 'git push').status, 0);
  git(w.clone, 'commit', '-q', '--allow-empty', '-m', 'trigger the build');
  const r = hook(w.home, w.clone, 'git push origin main');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /hasn't passed for/);
});

test('the repo comes from a cd or git -C in the command, not only the session folder', () => {
  const w = world();
  const elsewhere = tmpDir('qam-else-');
  for (const command of [
    `git -C ${w.clone} push`,
    `cd ${w.clone} && git push`,
    `cd "${w.clone}"; git push -u origin HEAD`,
  ])
    assert.equal(hook(w.home, elsewhere, command).status, 2, command);
  verdict(w, 'pass');
  for (const command of [`git -C ${w.clone} push`, `cd ${w.clone} && git push`])
    assert.equal(hook(w.home, elsewhere, command).status, 0, command);
  // a relative cd, and a -C relative to an earlier cd
  assert.equal(hook(w.home, path.dirname(w.clone), `cd ${path.basename(w.clone)} && git push`).status, 0);
  assert.equal(hook(w.home, path.dirname(w.clone), `git -C ${path.basename(w.clone)} push`).status, 0);
  // a cd to a folder that doesn't exist leaves the session's folder in force
  assert.equal(hook(w.home, w.clone, 'cd nowhere && git push').status, 0);
});

test('a verdict left in the clone by an older version still counts; other repos and unrecorded clones are never blocked', () => {
  const w = world();
  const head = git(w.clone, 'rev-parse', 'HEAD');
  write(path.join(w.clone, '.qamaster/verdicts', `${head}.json`), JSON.stringify({ result: 'pass', reasons: [] }));
  assert.equal(hook(w.home, w.clone, 'git push').status, 0);
  const unrelated = tmpDir('qam-unrelated-');
  git(unrelated, 'init', '-q', '-b', 'main');
  git(unrelated, 'commit', '-q', '--allow-empty', '-m', 'init');
  assert.equal(hook(w.home, unrelated, 'git push').status, 0);
  // a QA project that never recorded the claude-hooks integration gates nothing
  const bare = world(false);
  assert.equal(hook(bare.home, bare.clone, 'git push').status, 0);
});

test('pushDirs: the folder each push runs in', () => {
  const a = tmpDir('qam-dirs-');
  for (const d of ['b', 'c']) fs.mkdirSync(path.join(a, d));
  const [b, c] = [path.join(a, 'b'), path.join(a, 'c')];
  assert.deepEqual(pushDirs('git push', a), [a]);
  assert.deepEqual(pushDirs('git status && git push', a), [a]);
  assert.deepEqual(pushDirs(`git -C ${b} push`, a), [b]);
  assert.deepEqual(pushDirs('git -C b -C ../c push', a), [c]);
  assert.deepEqual(pushDirs(`cd ${b} && git push && cd ${c} && git push`, a), [b, c]);
  assert.deepEqual(pushDirs(`(cd ${b}; git push)`, a), [b]);
  assert.deepEqual(pushDirs('echo git push', a), []);
});
