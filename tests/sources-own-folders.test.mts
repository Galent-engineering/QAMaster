/** 0.4.1 A11: QAMaster's own folders are not the app's uncommitted changes when the QA project is the app repo. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { checkSource } from '../plugin/src/pipeline/sources.mts';
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
