/**
 * 0.4.1 doctor items, in process on the in-memory ADO (tests/fake-ado.mts): A2 (no project: list them) and A8 (the
 * launcher points at another plugin). Same set-up as tests/doctor-ado.test.mts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { AdoClient, AdoTestCases } from '../plugin/src/adapters/ado.mts';
import { RUNNERS, STORES } from '../plugin/src/adapters/registry.mts';
import { doctor } from '../plugin/src/cli/project.mts';
import { setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { FakeAdo } from './fake-ado.mts';
import './tmp.mts'; // a temp QAMASTER_HOME: doctor writes the home index

const REAL_STORE = STORES.ado;
RUNNERS['playwright-bdd'] = () => ({ collected: async () => [], run: async () => [], check: async () => [] });
afterEach(() => {
  STORES.ado = REAL_STORE;
});

function project(ado: FakeAdo, env: Record<string, string>, fakeStore = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-doctor-041-'));
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  const cfg = loadConfig(dir, { ...env });
  if (fakeStore)
    STORES.ado = () =>
      new AdoTestCases(
        new AdoClient(
          'org',
          'Shop',
          () => 'Basic t',
          ado.fetch,
          async () => {},
        ),
        { organization: 'org', project: 'Shop', repoName: 'shop-web' },
      );
  return { dir, cfg };
}

async function run(cfg: ReturnType<typeof loadConfig>, json = false) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    await doctor(cfg, [], json);
    return lines.join('\n');
  } finally {
    console.log = log;
  }
}
const check = async (cfg: ReturnType<typeof loadConfig>, name: string) =>
  JSON.parse(await run(cfg, true)).checks.find((x: { check: string }) => x.check === name);

test('A2: with the org and a token but no project, the projects are listed, sorted, and none is picked', async () => {
  const ado = new FakeAdo();
  ado.otherProjects = ['Zeta', 'Billing', 'Shop Web'];
  const { cfg } = project(ado, { QAMASTER_STORE: 'ado', QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_TOKEN: 't' }, false);
  const before = globalThis.fetch;
  globalThis.fetch = ado.fetch as typeof fetch;
  try {
    const c = await check(cfg, 'test case store');
    assert.equal(c.ok, false);
    assert.match(c.detail, /QAMASTER_ADO_PROJECT isn't set/);
    assert.match(c.detail, /\n {2}Billing\n {2}Shop\n {2}Shop Web\n {2}Zeta\n/);
    assert.deepEqual(c.suggestions, ['Billing', 'Shop', 'Shop Web', 'Zeta']);
    assert.equal(c.projects.length, 4);
    assert.match(c.detail, /QAMASTER_ADO_PROJECT=<one of them>/);
    assert.doesNotMatch(c.detail, /doesn't exist/);
  } finally {
    globalThis.fetch = before;
  }
});

test('A8: WARN when the launcher points at a plugin other than the one running, never FIX', async () => {
  const { cfg, dir } = project(new FakeAdo(), { QAMASTER_STORE: 'file' });
  const ptr = path.join(dir, '.qamaster/plugin.json');
  const same = await check(cfg, 'launcher');
  assert.equal(same.ok, true);
  assert.equal(same.state, undefined);
  const p = JSON.parse(fs.readFileSync(ptr, 'utf8'));
  fs.writeFileSync(ptr, JSON.stringify({ ...p, plugin_root: '/elsewhere/QAMaster/plugin' }));
  const other = await check(cfg, 'launcher');
  assert.equal(other.ok, true);
  assert.equal(other.state, 'unknown');
  assert.match(other.detail, /\/elsewhere\/QAMaster\/plugin/);
  assert.match(other.detail, /run qam setup again from the installed plugin/);
  assert.match(await run(cfg), /WARN +launcher/);
  fs.rmSync(ptr);
  assert.equal(await check(cfg, 'launcher'), undefined);
});
