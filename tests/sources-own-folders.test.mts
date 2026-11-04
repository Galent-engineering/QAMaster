/** 0.4.1 A11: QAMaster's own folders are not the app's uncommitted changes when the QA project is the app repo. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkSource, onlyOwnChanges, ownPaths } from '../plugin/src/pipeline/sources.mts';
import { tmpDir } from './tmp.mts';

function gitRepo(dir: string) {
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/App.jsx'), '<Route path="/home" component={Home} />\n');
  const g = (...a: string[]) =>
    assert.equal(spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a]).status, 0);
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-qm', 'init');
}

test("an uncommitted-changes warning ignores QAMaster's own folders when the source is the QA project", () => {
  const qa = tmpDir('qam-own-');
  gitRepo(qa);
  for (const f of [
    'dsm/index.html',
    'testgen/r.json',
    'testcases/a.csv',
    'reports/x.html',
    '.qamaster/ledger.json',
    'config/qamaster.json',
    'shop-web/f.feature',
  ]) {
    fs.mkdirSync(path.dirname(path.join(qa, f)), { recursive: true });
    fs.writeFileSync(path.join(qa, f), 'x');
  }
  const warn = () => checkSource({ source: '.' }, qa, ['shop-web']).warnings.join();
  assert.doesNotMatch(warn(), /uncommitted/);
  fs.writeFileSync(path.join(qa, 'src/New.jsx'), 'x');
  assert.match(warn(), /uncommitted changes/);
});

test("an AUT skill is QAMaster's own, an app config file is not", () => {
  const qa = tmpDir('qam-own-');
  gitRepo(qa);
  const put = (f: string) => {
    fs.mkdirSync(path.dirname(path.join(qa, f)), { recursive: true });
    fs.writeFileSync(path.join(qa, f), 'x');
  };
  put('.claude/skills/AUT_X/SKILL.md');
  put('config/qamaster.json');
  const warn = () => checkSource({ source: '.' }, qa, ['shop-web']).warnings.join();
  assert.doesNotMatch(warn(), /uncommitted/);
  put('config/app.yaml');
  assert.match(warn(), /uncommitted changes/);
});

test('a source that is another folder keeps every change as uncommitted', () => {
  const qa = tmpDir('qam-own-');
  const app = tmpDir('qam-own-app-');
  gitRepo(app);
  fs.mkdirSync(path.join(app, 'dsm'));
  fs.writeFileSync(path.join(app, 'dsm/a'), 'x');
  assert.match(checkSource({ source: app }, qa, ['shop-web']).warnings.join(), /uncommitted changes/);
});

test('a configured dsm output_dir is not an uncommitted change', () => {
  const qa = tmpDir('qam-own-');
  gitRepo(qa);
  fs.mkdirSync(path.join(qa, 'config'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), JSON.stringify({ output_dir: 'maps' }));
  fs.mkdirSync(path.join(qa, 'maps'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'maps/index.html'), 'x');
  assert.doesNotMatch(checkSource({ source: '.' }, qa, []).warnings.join(), /uncommitted/);
});

test('a renamed own file and a non-ASCII own path are not uncommitted changes', () => {
  const qa = tmpDir('qam-own-');
  fs.mkdirSync(path.join(qa, 'dsm'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'dsm/old name.html'), 'one');
  gitRepo(qa);
  spawnSync('git', ['-C', qa, 'mv', 'dsm/old name.html', 'dsm/new name.html']);
  fs.mkdirSync(path.join(qa, 'testcases'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'testcases/café.csv'), 'x');
  assert.doesNotMatch(checkSource({ source: '.' }, qa, []).warnings.join(), /uncommitted/);
});

test('onlyOwnChanges reads a non-ASCII own path', () => {
  const qa = tmpDir('qam-own-');
  gitRepo(qa);
  const g = (...a: string[]) =>
    spawnSync('git', ['-C', qa, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a], { encoding: 'utf8' });
  const from = g('rev-parse', 'HEAD').stdout.trim();
  fs.mkdirSync(path.join(qa, 'testcases'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'testcases/café.csv'), 'x');
  g('add', '-A');
  g('commit', '-qm', 'c');
  assert.equal(onlyOwnChanges(qa, from, 'HEAD', ownPaths(qa)), true);
});

test('tracked own files that were changed are not uncommitted changes either', () => {
  const qa = tmpDir('qam-own-');
  const files = ['dsm/state.json', 'dsm/index.html', '.claude/skills/AUT_X/SKILL.md', 'config/qamaster.json'];
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(qa, f)), { recursive: true });
    fs.writeFileSync(path.join(qa, f), 'one');
  }
  gitRepo(qa);
  for (const f of files) fs.writeFileSync(path.join(qa, f), 'two');
  const warn = () => checkSource({ source: '.' }, qa, []).warnings.join();
  assert.doesNotMatch(warn(), /uncommitted/);
  fs.writeFileSync(path.join(qa, 'src/App.jsx'), 'changed');
  assert.match(warn(), /uncommitted changes/);
});
