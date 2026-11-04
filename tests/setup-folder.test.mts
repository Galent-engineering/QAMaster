/** 0.4.0: Q47 folder choices at setup, the doctor's store warning (Q44), and --app replacing the claude-hooks record (E4). */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { setup } from '../plugin/src/cli/project.mts';
import { folderChoices, recordFolder } from '../plugin/src/pipeline/sources.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'bin/qam');
const tmp = () => tmpDir('qam-folder-');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

function qam(home: string, dir: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, QAMASTER_HOME: home, ...env },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('Q47: the usual folder is the most chosen one, and is left out with no history', () => {
  const home = tmp();
  process.env.QAMASTER_HOME = home;
  assert.deepEqual(
    folderChoices('/here').map((c) => c.key),
    ['here', 'type'],
  );
  recordFolder('/a');
  recordFolder('/b');
  recordFolder('/b');
  const c = folderChoices('/here');
  assert.deepEqual(
    c.map((x) => x.key),
    ['here', 'usual', 'type'],
  );
  assert.equal(c[1].path, '/b');
  assert.deepEqual(read(path.join(home, 'folders.json')), { counts: { '/a': 1, '/b': 2 } });
});

test('Q47: a git URL with no place for it blocks with the flag and the suggestions, in text and in --json', () => {
  const home = tmp();
  const qa = tmp();
  fs.writeFileSync(path.join(home, 'folders.json'), JSON.stringify({ counts: { '/usual/app': 3 } }));
  const url = 'https://git.example.test/shop.git';
  const t = qam(home, qa, ['setup', '--no-install', '--source', url]);
  assert.equal(t.status, 2);
  assert.match(t.err, /--clone-to <new folder>.*--use-clone/);
  assert.match(t.err, /1\. this folder/);
  assert.match(t.err, /2\. the usual folder \(\/usual\/app\)/);
  assert.match(t.err, /3\. a path you type/);
  const j = JSON.parse(qam(home, qa, ['--json', 'setup', '--no-install', '--source', url]).out);
  assert.equal(j.result, 'blocked');
  assert.deepEqual(
    j.choices.map((c: { key: string }) => c.key),
    ['here', 'usual', 'type'],
  );
});

test('Q47: with an app URL and no code folder, a script still succeeds and lists the choices', () => {
  const home = tmp();
  const qa = tmp();
  const r = JSON.parse(qam(home, qa, ['--json', 'setup', '--no-install', '--url', 'https://shop.example.test/']).out);
  assert.notEqual(r.result, 'blocked');
  assert.equal(r.choices[0].key, 'here');
  assert.match(r.notes.join(), /Add --source/);
});

test('Q47: on a terminal, setup asks, uses the chosen folder, and records it', () => {
  const home = tmp();
  process.env.QAMASTER_HOME = home;
  const qa = tmp();
  const usual = tmp();
  recordFolder(usual);
  const prompts: string[] = [];
  const log = console.log;
  console.log = () => {};
  try {
    const code = setup(loadConfig(qa), ['--no-install', '--url', 'https://shop.example.test/'], false, {
      tty: true,
      ask: (p) => (prompts.push(p), '2'),
    });
    assert.equal(code, 0);
  } finally {
    console.log = log;
  }
  assert.match(prompts[0], /1\. this folder/);
  assert.match(prompts[0], new RegExp(`2\\. the usual folder \\(${usual.replace(/\//g, '\\/')}\\)`));
  const repos = read(path.join(qa, 'config/dsm-config.json')).repositories;
  assert.equal(fs.realpathSync(path.resolve(qa, repos[0].path)), fs.realpathSync(usual));
  assert.equal(read(path.join(home, 'folders.json')).counts[usual], 2);
});

test('Q44: doctor warns when Azure DevOps settings exist but the store is the local file', () => {
  const home = tmp();
  const qa = tmp();
  qam(home, qa, ['setup', '--no-install']);
  const w = qam(home, qa, ['doctor'], { QAMASTER_ADO_ORG: 'https://dev.azure.com/x', QAMASTER_STORE: '' });
  assert.match(w.out, /WARN +store setting +Azure DevOps settings are set, but test cases go to the local CSV file/);
  assert.match(w.out, /QAMASTER_STORE=ado/);
  const none = qam(home, qa, ['doctor'], { QAMASTER_ADO_ORG: '', QAMASTER_ADO_PROJECT: '' });
  assert.doesNotMatch(none.out, /store setting/);
  const set = qam(home, qa, ['doctor'], { QAMASTER_ADO_ORG: 'x', QAMASTER_STORE: 'file' });
  assert.doesNotMatch(set.out, /store setting/);
});

test('E4: setup with a new --app replaces the claude-hooks record', () => {
  const home = tmp();
  const qa = tmp();
  qam(home, qa, ['setup', '--no-install', '--app', 'Old', '--entry', 'claude-code']);
  qam(home, qa, ['setup', '--no-install', '--app', 'New', '--entry', 'claude-code']);
  const ids = read(path.join(qa, '.qamaster/integrations.json')).integrations.map((i: { id: string }) => i.id);
  assert.deepEqual(ids, ['claude-hooks:New']);
});
