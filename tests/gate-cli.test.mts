/**
 * qam plan / approve / run / check (0.3.0 D1) through the real CLI: a git repo with a feature branch, the `file` store
 * holding the plan's test cases with pytest links, and real pytest. pytest comes from uv's cache through a small uv
 * project (`uv lock --offline`), so the test needs no network; it is skipped when that isn't possible.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { buildStore } from '../plugin/src/adapters/registry.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');

function sh(dir: string, cmd: string, ...args: string[]) {
  return spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
}
function git(dir: string, ...args: string[]) {
  const r = sh(dir, 'git', '-c', 'user.name=Ada', '-c', 'user.email=ada@example.test', ...args);
  assert.equal(r.status, 0, r.stderr);
}
function write(dir: string, files: Record<string, string>) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}

/** An app repo with its own tests, a QA config and a file store, on a feature branch that changes the cart. */
async function shop(): Promise<string | null> {
  const dir = tmpDir('qam-gate-cli-');
  write(dir, {
    'pyproject.toml':
      '[project]\nname = "shop"\nversion = "0"\nrequires-python = ">=3.14"\ndependencies = ["pytest==9.1.1"]\n',
    'site/cart.js': 'export const total = 1;\n',
    'site/login.js': 'export const login = 1;\n',
    'tests/test_cart.py': 'def test_add():\n    assert True\n',
    'tests/test_login.py': 'def test_login():\n    assert True\n',
    'config/qamaster.json': JSON.stringify({ app: { name: 'Shop' } }),
    '.gitignore': '.venv/\n__pycache__/\n.qamaster/\n.pytest_cache/\n',
  });
  // the project's own environment, as a user sets it up (the runner never downloads: Q41)
  if (sh(dir, 'uv', 'lock', '--offline', '--quiet').status !== 0) return null;
  if (sh(dir, 'uv', 'sync', '--offline', '--quiet').status !== 0) return null;
  const store = buildStore(loadConfig(dir, { QAMASTER_STORE: 'file' }));
  await store.ensureSuite('Cart');
  for (const [title, tags, link] of [
    ['Cart total', ['cart', 'path:site/cart.js'], 'pytest:tests/test_cart.py::test_add'],
    ['Login', ['login', 'smoke'], 'pytest:tests/test_login.py::test_login'],
    ['Cart by hand', ['cart', 'path:site/cart.js'], null],
  ] as const) {
    const made = await store.create({ title, addTags: [...tags], ...(link ? { automatedTest: link } : {}) });
    await store.addToSuite(made.id, 'Cart');
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'ada@example.test');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'switch', '-q', '-c', 'feature/cart');
  write(dir, { 'site/cart.js': 'export const total = 2;\n' });
  git(dir, 'commit', '-qam', 'cart total');
  return dir;
}

function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME, QAMASTER_STORE: 'file' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('plan, approve, run: the cart change selects its case and smoke, runs them in pytest, and records a pass', async (t) => {
  const dir = await shop();
  if (!dir) return t.skip('uv cannot lock pytest offline here');
  const plan = qam(dir, 'plan');
  assert.equal(plan.status, 3, plan.err);
  assert.match(plan.out, /QAMaster plan (\w+) for feature\/cart vs main \(1 file changed\)/);
  assert.match(
    plan.out,
    /Selected \(2 of 3 test cases\)\n\s+\[x\] TC\d+\s+Cart total\s+covers site\/cart\.js\n\s+\[x\] TC\d+\s+Login\s+smoke set/,
  );
  assert.match(plan.out, /Not run\n\s+TC\d+\s+Cart by hand\s+manual \(no automated test\)/);
  const id = /plan (\w+) for/.exec(plan.out)?.[1] ?? '';

  assert.match(qam(dir, 'run', id).err, /isn't approved/);
  const approved = qam(dir, 'approve', id);
  assert.equal(approved.status, 0, approved.err);
  assert.match(approved.out, /Approved by ada@example\.test/);

  const run = qam(dir, 'run', id);
  assert.equal(run.status, 0, run.out + run.err);
  assert.match(run.out, /Verdict: PASS \(2 of 2 test cases passed\.\)/);
  const head = sh(dir, 'git', 'rev-parse', 'HEAD').stdout.trim();
  const verdict = JSON.parse(fs.readFileSync(path.join(dir, '.qamaster/verdicts', `${head}-${id}.json`), 'utf8'));
  assert.equal(verdict.result, 'pass');
});

test('check --yes plans, approves and runs; a failing test fails it with the error', async (t) => {
  const dir = await shop();
  if (!dir) return t.skip('uv cannot lock pytest offline here');
  write(dir, { 'tests/test_cart.py': 'def test_add():\n    assert 1 == 2, "cart total is wrong"\n' });
  git(dir, 'commit', '-qam', 'break the cart test');
  const r = qam(dir, 'check', '--yes');
  assert.equal(r.status, 1, r.err);
  assert.match(r.out, /Verdict: FAIL \(TC\d+ failed\.\)/);
  assert.match(r.out, /cart total is wrong/);
  assert.equal(qam(dir, 'check').status, 3, 'without --yes check stops at the plan');
});

test('a new commit voids the plan before it runs', async (t) => {
  const dir = await shop();
  if (!dir) return t.skip('uv cannot lock pytest offline here');
  const id = /plan (\w+) for/.exec(qam(dir, 'plan').out)?.[1] ?? '';
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'more');
  const r = qam(dir, 'approve', id);
  assert.equal(r.status, 2);
  assert.match(r.err, /HEAD moved/);
});

// From the clean Docker run (F1): without git the gate crashed with a TypeError and exit 1.
test('0.3.1 F1: without git the gate blocks with how to install it', () => {
  const dir = tmpDir('qam-nogit-');
  write(dir, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Shop' } }) });
  const main = path.resolve(import.meta.dirname, '..', 'plugin/src/cli/main.mts');
  const r = spawnSync(process.execPath, [main, '--repo', dir, 'plan', '--base', 'main'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent', QAMASTER_HOME: HOME, QAMASTER_STORE: 'file' },
  });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /git isn't installed: install git 2\.20 or later, then run again/);
});

// From the clean Docker run (F6): doctor rewrote the tracked .qamaster/doctor.json, and the next plan blocked.
test('0.3.1 F6: a changed .qamaster/doctor.json in the QA project does not block the plan', async (t) => {
  const dir = await shop();
  if (!dir) return t.skip('uv cannot lock pytest offline here');
  const qa = tmpDir('qam-qa-');
  write(qa, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Shop' } }), '.qamaster/doctor.json': '{}' });
  for (const a of [
    ['init', '-q', '-b', 'main'],
    ['add', '-A'],
    ['commit', '-qm', 'qa'],
  ])
    git(qa, ...a);
  fs.writeFileSync(path.join(qa, '.qamaster/doctor.json'), '{"store":{"ok":true}}');
  fs.writeFileSync(path.join(dir, '.env'), `QAMASTER_TEST_ROOT=${qa}\n`);
  const r = qam(dir, 'plan');
  assert.doesNotMatch(r.err, /uncommitted changes/);
});

// From the clean Docker run (F7), Q42: the gate's local files stay out of the app repo's commits.
test('0.3.1 F7: after plan, approve and run, git status in the app repo shows none of the gate files', async (t) => {
  const dir = await shop();
  if (!dir) return t.skip('uv cannot lock pytest offline here');
  // an app repo whose .gitignore knows nothing of QAMaster
  fs.writeFileSync(path.join(dir, '.gitignore'), '.venv/\n__pycache__/\n.pytest_cache/\n');
  git(dir, 'commit', '-qam', 'plain gitignore');
  fs.writeFileSync(path.join(dir, '.env'), 'QAMASTER_STORE=file\n');
  const plan = qam(dir, 'check', '--yes');
  assert.equal(plan.status, 0, plan.out + plan.err);
  const status = sh(dir, 'git', 'status', '--porcelain', '--untracked-files=all').stdout;
  assert.doesNotMatch(status, /\.qamaster\/(plans|verdicts|evidence)|\.env/, status);
  const exclude = fs.readFileSync(path.join(dir, '.git/info/exclude'), 'utf8');
  assert.match(exclude, /# QAMaster: this clone's own gate files \(Q42\)\n\.qamaster\/plans\/\n/);
  qam(dir, 'check', '--yes');
  assert.equal(fs.readFileSync(path.join(dir, '.git/info/exclude'), 'utf8'), exclude, 'added once');
});
