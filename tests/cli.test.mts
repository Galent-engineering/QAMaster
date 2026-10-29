import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { BLOCKED, COMMANDS, PASS } from '../plugin/src/cli/main.mts';

const QAM = path.resolve(import.meta.dirname, '../plugin/bin/qam');

function qam(...args: string[]) {
  const r = spawnSync(QAM, args, { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('help lists every command and exits 0', () => {
  const r = qam('help');
  assert.equal(r.code, PASS);
  for (const command of Object.keys(COMMANDS)) assert.match(r.out, new RegExp(`^  ${command} `, 'm'));
});

test('no command prints help and exits blocked', () => {
  const r = qam();
  assert.equal(r.code, BLOCKED);
  assert.match(r.out, /^usage: qam/m);
});

test('version prints the plugin manifest version', () => {
  const r = qam('--json', 'version');
  assert.equal(r.code, PASS);
  assert.match(JSON.parse(r.out).version, /^\d+\.\d+\.\d+$/);
});

test('a command not built yet is blocked with a reason', () => {
  const r = qam('--repo', '.', 'plan');
  assert.equal(r.code, BLOCKED);
  assert.equal(r.err.trim(), "Blocked: qam plan isn't built yet.");
});

test('an unknown command is blocked and points to help', () => {
  const r = qam('nope');
  assert.equal(r.code, BLOCKED);
  assert.match(r.err, /Unknown command "nope"\. Run qam help/);
});

test('--json reports blocked as JSON on stdout', () => {
  const r = qam('--json', 'check');
  assert.equal(r.code, BLOCKED);
  assert.deepEqual(JSON.parse(r.out), { result: 'blocked', reasons: ["qam check isn't built yet."] });
});

test('--repo without a path is blocked', () => {
  const r = qam('--repo');
  assert.equal(r.code, BLOCKED);
  assert.match(r.err, /--repo needs a path/);
});
