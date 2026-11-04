/** 0.4.1 A11 (DSM staleness ignores QAMaster's own commits) and A14 (the first gate run counts tests that ran). */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { status } from '../plugin/src/pipeline/pipeline.mts';
import { tmpDir } from './tmp.mts';

const put = (dir: string, f: string, body = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), body);
};
const git = (dir: string, ...a: string[]) =>
  spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a], { encoding: 'utf8' });
const head = (dir: string) => git(dir, 'rev-parse', 'HEAD').stdout.trim();
const commit = (dir: string, ...files: string[]) => {
  for (const f of files) put(dir, f, `y${Math.random()}`);
  git(dir, 'add', '-A');
  assert.equal(git(dir, 'commit', '-qm', 'c').status, 0);
};
const stage = (project: string, appRepo: string, id: string) =>
  status(project, appRepo, 'Shop').stages.find((s) => s.stage === id) as { status: string; evidence: string };

function qaProject() {
  const dir = tmpDir('qam-p041-');
  git(dir, 'init', '-q', '-b', 'main');
  put(dir, 'src/a.py', 'a');
  put(dir, 'config/dsm-config.json', JSON.stringify({ repositories: [{ name: 'app', path: '.', branch: 'main' }] }));
  commit(dir);
  put(dir, 'dsm/dsm.json', JSON.stringify({ generated_at: 'now', stats: { pages: 1, page_relations: 0 } }));
  put(dir, 'dsm/state.json', JSON.stringify({ repos: { app: { commit: head(dir) } } }));
  return dir;
}

test("commits of QAMaster's own files leave the DSM stage fresh; app code makes it stale", () => {
  const qa = qaProject();
  commit(qa, 'dsm/x', 'Shop/f.feature', '.claude/skills/AUT_A/SKILL.md');
  assert.equal(stage(qa, qa, 'dsm').status, 'done');
  commit(qa, 'src/a.py');
  const s = stage(qa, qa, 'dsm');
  assert.equal(s.status, 'stale');
  assert.match(s.evidence, /new commits in app/);
});

test('a separate app repo with a commit under dsm/ is still stale', () => {
  const qa = tmpDir('qam-p041-');
  const app = tmpDir('qam-p041-app-');
  git(app, 'init', '-q', '-b', 'main');
  commit(app, 'src/a.py');
  put(qa, 'config/dsm-config.json', JSON.stringify({ repositories: [{ name: 'app', path: app, branch: 'main' }] }));
  put(qa, 'dsm/dsm.json', JSON.stringify({ generated_at: 'now' }));
  put(qa, 'dsm/state.json', JSON.stringify({ repos: { app: { commit: head(app) } } }));
  commit(app, 'dsm/x');
  assert.equal(stage(qa, qa, 'dsm').status, 'stale');
});

function verdict(dir: string, name: string, v: object, age: number) {
  const f = path.join(dir, '.qamaster/verdicts', `${name}.json`);
  put(dir, `.qamaster/verdicts/${name}.json`, JSON.stringify(v));
  const t = new Date(Date.now() - age * 1000);
  fs.utimesSync(f, t, t);
}
const v = (result: string, statuses: string[]) => ({
  head: 'abcdef1234567890',
  result,
  results: statuses.map((s) => ({ status: s })),
});

test('first gate run: a 0-of-0 pass has not run any test case', () => {
  const dir = tmpDir('qam-p041-');
  verdict(dir, 'a', v('pass', []), 0);
  const s = stage(dir, dir, 'first-gate');
  assert.equal(s.status, 'pending');
  assert.match(s.evidence, /no test case has run yet/);
  assert.match(s.evidence, /1 verdict\(s\) ran 0 test cases/);
});

test('first gate run: a pass newer than a 0-of-0 is done', () => {
  const dir = tmpDir('qam-p041-');
  verdict(dir, 'a', v('pass', []), 100);
  verdict(dir, 'b', v('pass', ['passed', 'flaky']), 0);
  const s = stage(dir, dir, 'first-gate');
  assert.equal(s.status, 'done');
  assert.match(s.evidence, /latest: pass, 2 of 2 passed \(abcdef12\)/);
});

test('first gate run: the newest ran verdict is reported, a fail included', () => {
  const dir = tmpDir('qam-p041-');
  verdict(dir, 'a', v('pass', ['passed']), 100);
  verdict(dir, 'b', v('fail', [...Array(5).fill('passed'), ...Array(15).fill('failed')]), 0);
  const s = stage(dir, dir, 'first-gate');
  assert.equal(s.status, 'done');
  assert.match(s.evidence, /latest: fail, 5 of 20 passed/);
});
