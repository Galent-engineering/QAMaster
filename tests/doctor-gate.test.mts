/**
 * qam doctor checks the gate's prerequisites (0.3.1 F4, from the clean Docker run): for each runner the plan's links
 * use, the tool starts and its browser launches, and the app's URL answers. A project that only gates no longer needs
 * an app URL. Real pytest from uv's cache; no downloads.
 */
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { buildStore } from '../plugin/src/adapters/registry.mts';
import { PlaywrightBddRunner } from '../plugin/src/adapters/runner-bdd.mts';
import { PytestRunner } from '../plugin/src/adapters/runner-pytest.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { tmpDir } from './tmp.mts';

const run = promisify(execFile);
const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');
const PYPROJECT =
  '[project]\nname = "p"\nversion = "0"\nrequires-python = ">=3.14"\ndependencies = ["pytest==9.1.1"]\n';

function uvProject(sync: boolean): string | null {
  const root = tmpDir('qam-doctor-py-');
  fs.writeFileSync(path.join(root, 'pyproject.toml'), PYPROJECT);
  fs.writeFileSync(path.join(root, 'test_a.py'), 'def test_a():\n    pass\n');
  if (spawnSync('uv', ['lock', '--offline', '-q'], { cwd: root }).status !== 0) return null;
  if (sync && spawnSync('uv', ['sync', '--offline', '-q'], { cwd: root }).status !== 0) return null;
  return root;
}

test('pytest check: the environment and pytest start; tests without Playwright need no browser', async (t) => {
  const root = uvProject(true);
  if (!root) return t.skip('uv cannot lock pytest offline here');
  const r = await new PytestRunner().check(root);
  assert.deepEqual(
    r.map((c) => [c.check, c.ok]),
    [
      ['pytest', true],
      ['pytest browser', true],
    ],
  );
  assert.match(r[0].detail, /1 test collected/);
  assert.match(r[1].detail, /no Playwright in these tests/);
});

test('pytest check: an environment that is not set up says to run uv sync, and checks no further', async (t) => {
  const root = uvProject(false);
  if (!root) return t.skip('uv cannot lock pytest offline here');
  const r = await new PytestRunner().check(root);
  assert.deepEqual(
    r.map((c) => [c.check, c.ok]),
    [['pytest', false]],
  );
  assert.match(r[0].detail, /Run uv sync there/);
});

test('playwright-bdd check: no packages in the folder says to run npm install', async () => {
  const r = await new PlaywrightBddRunner().check(tmpDir('qam-doctor-bdd-'));
  assert.deepEqual(
    r.map((c) => [c.check, c.ok]),
    [['playwright-bdd', false]],
  );
  assert.match(r[0].detail, /Run npm install there/);
});

test('doctor: runners from the store links, the app URL, and no FIX for a gate-only project without one', async (t) => {
  const root = uvProject(true);
  if (!root) return t.skip('uv cannot lock pytest offline here');
  fs.mkdirSync(path.join(root, 'config'));
  const server = http.createServer((_q, res) => res.end('ok')).listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    fs.writeFileSync(
      path.join(root, 'config/qamaster.json'),
      JSON.stringify({ app: { name: 'P', url: `http://127.0.0.1:${port}` } }),
    );
    const store = buildStore(loadConfig(root, { QAMASTER_STORE: 'file' }));
    await store.ensureSuite('P');
    const made = await store.create({ title: 'A', automatedTest: 'pytest:test_a.py::test_a' });
    await store.addToSuite(made.id, 'P');
    // async: the server lives in this process, and a synchronous spawn would stop it from answering
    const qam = async () =>
      (
        await run(QAM, ['--repo', root, 'doctor'], {
          env: { ...process.env, QAMASTER_HOME: HOME, QAMASTER_STORE: 'file' },
        }).catch((e: { stdout: string }) => e)
      ).stdout;
    const out = await qam();
    assert.match(out, /ok +runner pytest +.*1 test collected/);
    assert.match(out, /ok +app URL +http:\/\/127\.0\.0\.1:\d+ answers/);
    assert.doesNotMatch(out, /FIX +app +no URL and no code source/);
    server.close();
    await new Promise((done) => server.on('close', done));
    assert.match(await qam(), /FIX +app URL +http:\/\/127\.0\.0\.1:\d+ didn't answer/);
  } finally {
    server.close();
  }
});
