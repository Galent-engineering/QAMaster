/**
 * The gate's RepoReader on a real git repository (0.3.0 B3), as CheckMaster's conftest `repo` fixture: a main branch
 * and a feature branch with one commit. Only committed changes since the merge base count.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { defaultBase, GitRepoReader } from '../plugin/src/adapters/git.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { tmpDir } from './tmp.mts';

function git(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function write(dir: string, file: string, text: string) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}
function repo() {
  const dir = tmpDir('qam-gate-git-');
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'shop/checkout/coupon.py', 'x = 1\n');
  write(dir, 'shop/cart/cart.py', 'y = 1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'switch', '-q', '-c', 'feature/coupons');
  write(dir, 'shop/checkout/coupon.py', 'x = 2\n');
  git(dir, 'mv', 'shop/cart/cart.py', 'shop/cart/basket.py');
  git(dir, 'commit', '-qam', 'coupons');
  return dir;
}

test('diff: the committed change from the merge base with the base branch, renames under their new path', async () => {
  const dir = repo();
  write(dir, 'shop/uncommitted.py', 'z\n'); // not committed: not in the change
  git(dir, 'switch', '-q', 'main');
  write(dir, 'shop/later-on-main.py', 'm\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'main moved on'); // not in the feature branch: not in the change
  git(dir, 'switch', '-q', 'feature/coupons');
  const r = new GitRepoReader(dir);
  const head = await r.head();
  const c = await r.diff('main', 'HEAD');
  assert.deepEqual([c.base, c.head, c.branch], ['main', head, 'feature/coupons']);
  assert.deepEqual(c.files, [
    { path: 'shop/cart/basket.py', status: 'R' },
    { path: 'shop/checkout/coupon.py', status: 'M' },
  ]);
  assert.equal(await r.readFile('HEAD', 'shop/checkout/coupon.py'), 'x = 2\n');
  assert.ok((await r.listTree('HEAD')).includes('shop/cart/basket.py'));
});

test('defaultBase is origin/HEAD, else main, else master; an unknown base blocks', async () => {
  const dir = repo();
  assert.equal(defaultBase(dir), 'main');
  await assert.rejects(
    new GitRepoReader(dir).diff('nope', 'HEAD'),
    (e) => e instanceof BlockedError && /nope/.test(e.message),
  );
  const bare = tmpDir('qam-gate-nogit-');
  assert.throws(() => defaultBase(bare), BlockedError);
});

test('a folder that is not a git repository, or has no commit, blocks with the next step (0.4.2 W13)', async () => {
  const plain = tmpDir('qam-gate-nogit-');
  const steps = /git init, commit the baseline, commit the change, then qam plan --base <baseline commit>/;
  await assert.rejects(new GitRepoReader(plain).head(), (e: Error) => {
    assert.ok(e instanceof BlockedError);
    assert.match(e.message, /isn't a git repository/);
    assert.match(e.message, steps);
    return true;
  });
  assert.throws(() => defaultBase(plain), /isn't a git repository/);
  const empty = tmpDir('qam-gate-nocommit-');
  git(empty, 'init', '-q', '-b', 'main');
  await assert.rejects(new GitRepoReader(empty).head(), (e: Error) => {
    assert.match(e.message, /has no commit yet/);
    assert.match(e.message, steps);
    return true;
  });
});
