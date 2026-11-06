/** 0.4.4 items 1-3 (fastapi-react-app R2, R3, R4): setup --help, the store setup chose, doctor's app URL and runner lines. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');
function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME, QAMASTER_STORE: '', QAMASTER_ADO_ORG: '', QAMASTER_ADO_PROJECT: '' },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

test('setup --help prints the setup usage and exits 0, not a parser error', () => {
  for (const flag of ['--help', '-h']) {
    const r = qam(tmpDir('qam-044-'), 'setup', flag);
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /usage: qam .*setup/);
    assert.match(r.out, /--url/);
    assert.match(r.out, /--source/);
    assert.equal(r.err, '');
  }
});

test('setup names the test case store it chose and how to change it', () => {
  const r = qam(tmpDir('qam-044-'), 'setup', '--no-install');
  assert.match(r.out, /Note: Test cases go to the local CSV file store\. To publish to Azure DevOps/);
  assert.match(r.out, /QAMASTER_STORE=ado/);
});

test('doctor shows the app URL and runner lines before the automation folder exists', () => {
  const dir = tmpDir('qam-044-');
  qam(dir, 'setup', '--no-install', '--app', 'Shop', '--url', 'http://127.0.0.1:9', '--source', dir);
  const out = qam(dir, 'doctor').out;
  assert.match(out, /runner +not set up yet.*qam pipeline next/);
  assert.match(out, /app URL +http:\/\/127\.0\.0\.1:9 .*not checked.*no runner yet/);
});
