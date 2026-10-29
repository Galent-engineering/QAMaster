import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { BLOCKED, COMMANDS, PASS } from '../plugin/src/cli/main.mts';

const QEM = path.resolve(import.meta.dirname, '../plugin/bin/qem');

function qem(...args: string[]) {
  const r = spawnSync(QEM, args, { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('help lists every command and exits 0', () => {
  const r = qem('help');
  assert.equal(r.code, PASS);
  for (const command of Object.keys(COMMANDS)) assert.match(r.out, new RegExp(`^  ${command} `, 'm'));
});

test('no command prints help and exits blocked', () => {
  const r = qem();
  assert.equal(r.code, BLOCKED);
  assert.match(r.out, /^usage: qem/m);
});

test('version prints the plugin manifest version', () => {
  const r = qem('--json', 'version');
  assert.equal(r.code, PASS);
  assert.match(JSON.parse(r.out).version, /^\d+\.\d+\.\d+$/);
});

test('a command not built yet is blocked with a reason', () => {
  const r = qem('--repo', '.', 'plan');
  assert.equal(r.code, BLOCKED);
  assert.equal(r.err.trim(), "Blocked: qem plan isn't built yet.");
});

test('an unknown command is blocked and points to help', () => {
  const r = qem('nope');
  assert.equal(r.code, BLOCKED);
  assert.match(r.err, /Unknown command "nope"\. Run qem help/);
});

test('--json reports blocked as JSON on stdout', () => {
  const r = qem('--json', 'check');
  assert.equal(r.code, BLOCKED);
  assert.deepEqual(JSON.parse(r.out), { result: 'blocked', reasons: ["qem check isn't built yet."] });
});

test('--repo without a path is blocked', () => {
  const r = qem('--repo');
  assert.equal(r.code, BLOCKED);
  assert.match(r.err, /--repo needs a path/);
});
