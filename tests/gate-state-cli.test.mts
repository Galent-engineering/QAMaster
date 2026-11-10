/**
 * 0.6.0 item 1 (Q52, R22) through the real CLI: a QA project that recorded the app clone keeps its plans, verdicts and
 * evidence; the clone gets nothing; reports in the QA project see the verdict; files from before 0.6.0 are still read.
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

/** An app clone on a feature branch, and the QA project that recorded it (and a home index listing the QA project). */
async function world(): Promise<{ clone: string; qa: string; home: string } | null> {
  const clone = tmpDir('qam-clone-');
  const qa = tmpDir('qam-qa-');
  const home = tmpDir('qam-home-');
  write(clone, {
    'pyproject.toml':
      '[project]\nname = "shop"\nversion = "0"\nrequires-python = ">=3.14"\ndependencies = ["pytest==9.1.1"]\n',
    'site/cart.js': 'export const total = 1;\n',
    'tests/test_cart.py': 'def test_add():\n    assert True\n',
    '.gitignore': '.venv/\n__pycache__/\n.qamaster/\n.pytest_cache/\n',
  });
  if (sh(clone, 'uv', 'lock', '--offline', '--quiet').status !== 0) return null;
  if (sh(clone, 'uv', 'sync', '--offline', '--quiet').status !== 0) return null;
  write(qa, {
    'config/qamaster.json': JSON.stringify({ app: { name: 'Shop' } }),
    'config/dsm-config.json': JSON.stringify({ repositories: [{ name: 'shop', path: path.relative(qa, clone) }] }),
  });
  write(home, {
    'installs.json': JSON.stringify({
      repos: { [qa]: { app: 'Shop', integrations: ['claude-hooks:Shop'], updated_at: 'x' } },
    }),
  });
  const store = buildStore(loadConfig(qa, { QAMASTER_STORE: 'file' }));
  await store.ensureSuite('Cart');
  const made = await store.create({
    title: 'Cart total',
    addTags: ['cart', 'path:site/cart.js'],
    automatedTest: 'pytest:tests/test_cart.py::test_add',
  });
  await store.addToSuite(made.id, 'Cart');
  git(clone, 'init', '-q', '-b', 'main');
  git(clone, 'add', '-A');
  git(clone, 'commit', '-qm', 'init');
  git(clone, 'switch', '-q', '-c', 'feature/cart');
  write(clone, { 'site/cart.js': 'export const total = 2;\n' });
  git(clone, 'commit', '-qam', 'cart total');
  return { clone, qa, home };
}

const qam = (home: string, dir: string, ...args: string[]) => {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: home, QAMASTER_STORE: 'file' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
};

test('qam check from a recorded clone writes nothing there; the QA project holds the verdict and reports see it', async (t) => {
  const w = await world();
  if (!w) return t.skip('uv cannot lock pytest offline here');
  const run = qam(w.home, w.clone, 'check', '--yes');
  assert.equal(run.status, 0, run.out + run.err);
  assert.ok(!fs.existsSync(path.join(w.clone, '.qamaster')), 'the clone has no .qamaster/');
  const head = sh(w.clone, 'git', 'rev-parse', 'HEAD').stdout.trim();
  const gateDir = path.join(w.qa, '.qamaster', 'gate', 'shop');
  const verdicts = fs.readdirSync(path.join(gateDir, 'verdicts')).filter((f) => f.startsWith(head));
  assert.equal(verdicts.length, 1);
  assert.ok(fs.readdirSync(path.join(gateDir, 'plans')).length >= 1);
  // the QA project's own git status stays clean of gate files
  const rep = qam(w.home, w.qa, 'report', 'all');
  assert.equal(rep.status, 0, rep.out + rep.err);
  assert.doesNotMatch(rep.out + rep.err, /No verdict yet/);
  const status = qam(w.home, w.qa, '--json', 'pipeline', 'status');
  assert.match(status.out, /latest: pass, 1 of 1 passed/);
});

test('a plan and a verdict left in the clone by an older version are still read, and doctor names the folder', async (t) => {
  const w = await world();
  if (!w) return t.skip('uv cannot lock pytest offline here');
  assert.equal(qam(w.home, w.clone, 'check', '--yes').status, 0);
  // move the new files to where 0.5.x kept them
  fs.cpSync(path.join(w.qa, '.qamaster', 'gate', 'shop'), path.join(w.clone, '.qamaster'), { recursive: true });
  fs.rmSync(path.join(w.qa, '.qamaster', 'gate'), { recursive: true });
  const plan = fs.readdirSync(path.join(w.clone, '.qamaster', 'plans')).find((f) => f.endsWith('.json')) ?? '';
  const approve = qam(w.home, w.clone, 'approve', plan.replace('.json', ''));
  assert.equal(approve.status, 0, approve.out + approve.err);
  // the new plan was written to the QA project, the old one untouched
  assert.ok(fs.existsSync(path.join(w.qa, '.qamaster', 'gate', 'shop', 'plans', plan)));
  const doc = qam(w.home, w.clone, 'doctor', '--json');
  assert.match(doc.out, /gate files/);
  assert.match(doc.out, /delete/);
});

test("a verdict only in the clone's old .qamaster/ shows in report all and pipeline status run from the QA project", async (t) => {
  const w = await world();
  if (!w) return t.skip('uv cannot lock pytest offline here');
  assert.equal(qam(w.home, w.clone, 'check', '--yes').status, 0);
  fs.cpSync(path.join(w.qa, '.qamaster', 'gate', 'shop'), path.join(w.clone, '.qamaster'), { recursive: true });
  fs.rmSync(path.join(w.qa, '.qamaster', 'gate'), { recursive: true });
  const rep = qam(w.home, w.qa, 'report', 'all');
  assert.equal(rep.status, 0, rep.out + rep.err);
  assert.doesNotMatch(rep.out + rep.err, /No verdict yet/);
  const status = qam(w.home, w.qa, '--json', 'pipeline', 'status');
  assert.match(status.out, /latest: pass, 1 of 1 passed/);
});

test('0.6.0 item 14: qam plan --all selects every case with a script, and says why', async (t) => {
  const w = await world();
  if (!w) return t.skip('uv cannot lock pytest offline here');
  const plan = qam(w.home, w.clone, 'plan', '--base', 'feature/cart', '--all');
  assert.equal(plan.status, 3, plan.err);
  assert.match(plan.out, /\(0 files changed\)/);
  assert.match(plan.out, /\[x\] TC\d+\s+Cart total\s+every case with a script \(--all\)/);
});

test('0.6.0 item 14: --all belongs to qam plan and check; approve, run and automate refuse it', async (t) => {
  const w = await world();
  if (!w) return t.skip('uv cannot lock pytest offline here');
  for (const command of ['approve', 'run', 'automate']) {
    const r = qam(w.home, w.clone, command, 'ab12', '--all');
    assert.equal(r.status, 2, `${command}: ${r.out}${r.err}`);
    assert.match(r.err, new RegExp(`qam ${command}: Unknown option '--all'`));
  }
});
