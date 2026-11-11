/** 0.7.2 items 1-7: status shows the plugin, a failed gate run is not done, doctor counts warnings, --help, org-only error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { main } from '../plugin/src/cli/main.mts';
import { doctor, pipeline } from '../plugin/src/cli/project.mts';
import { status, table } from '../plugin/src/pipeline/pipeline.mts';
import { PLUGIN_ROOT, pluginVersion, setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { FakeAdo } from './fake-ado.mts';
import { tmpDir } from './tmp.mts';

const put = (dir: string, f: string, body = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
  fs.writeFileSync(path.join(dir, f), body);
};
async function capture(fn: () => unknown, stream: 'log' | 'error' = 'log') {
  const lines: string[] = [];
  const orig = console[stream];
  const write = process.stdout.write;
  console[stream] = (...a: unknown[]) => void lines.push(a.join(' '));
  process.stdout.write = ((s: string) => void lines.push(s)) as unknown as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    console[stream] = orig;
    process.stdout.write = write;
  }
  return lines.join('\n');
}
const verdict = (dir: string, result: string, statuses: string[]) =>
  put(
    dir,
    '.qamaster/verdicts/v.json',
    JSON.stringify({ head: 'abcdef123456', result, results: statuses.map((s) => ({ status: s })) }),
  );
const stage = (dir: string, id: string) => status(dir, dir, 'shop').stages.find((s) => s.stage === id);

test('1: status prints the plugin version and root', async () => {
  const dir = tmpDir('qam-s072-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  const out = await capture(() => pipeline(loadConfig(dir), ['status'], false));
  assert.match(out, new RegExp(`Plugin: ${pluginVersion().replace(/\./g, '\\.')} \\(${PLUGIN_ROOT}\\)`));
  assert.match(table(status(dir, dir, null)), /^QAMaster pipeline/);
  const json = JSON.parse(await capture(() => pipeline(loadConfig(dir), ['status'], true)));
  assert.equal(json.plugin.root, PLUGIN_ROOT);
});

test('2: a failed latest verdict is not done and says attention', () => {
  const dir = tmpDir('qam-s072-');
  verdict(dir, 'fail', ['passed', 'failed', 'failed']);
  const s = stage(dir, 'first-gate');
  assert.notEqual(s?.status, 'done');
  assert.equal(s?.evidence, 'attention: last run FAIL (1 of 3 passed (abcdef12))');
  verdict(dir, 'pass', ['passed', 'flaky']);
  assert.equal(stage(dir, 'first-gate')?.status, 'done');
});

test('3: published cases with no automation: next says automate', () => {
  const dir = tmpDir('qam-s072-');
  put(dir, 'testgen/output/r1/published.json', '{}');
  assert.match(stage(dir, 'first-gate')?.how ?? '', /automate \(or the gate will run 0 cases\)/);
  put(dir, 'Shop/features/a.feature', '@TC-A-001\nFeature: A');
  assert.equal(stage(dir, 'first-gate')?.how, 'Run qam check --all.');
});

test('4 and 5: doctor counts warnings and warns on a vanished plugin_root', async () => {
  const dir = tmpDir('qam-s072-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  const ptr = path.join(dir, '.qamaster/plugin.json');
  const p = JSON.parse(fs.readFileSync(ptr, 'utf8'));
  fs.writeFileSync(ptr, JSON.stringify({ ...p, plugin_root: '/no/such/plugin' }));
  const cfg = loadConfig(dir, { QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop' });
  const out = await capture(() => doctor(cfg, [], false));
  assert.match(out, /WARN +launcher +.*\/no\/such\/plugin, which no longer exists/);
  // the store mismatch is first in the list
  assert.match(out, /^QAMaster doctor: .*, \d+ warnings?\n {2}WARN +store setting/);
});

test('6: --help for any subcommand, and a bad flag is one Blocked line', async () => {
  const help = await capture(() => main(['app', 'create', '--help']));
  assert.match(help, /^qam app: /);
  const err = await capture(async () => assert.equal(await main(['app', 'create', '--bogus']), 2), 'error');
  assert.match(err, /^Blocked: qam app: Unknown option '--bogus'/);
  assert.doesNotMatch(err, /ERR_PARSE_ARGS|\n/);
});

test('7: org set, no project: the error lists the projects, and still prints when listing fails', async () => {
  const dir = tmpDir('qam-s072-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  put(dir, '.env', 'QAMASTER_ADO_ORG=org\nQAMASTER_ADO_TOKEN=t\n');
  const ado = new FakeAdo();
  ado.otherProjects = ['Zeta', 'Billing'];
  const before = globalThis.fetch;
  try {
    globalThis.fetch = ado.fetch as typeof fetch;
    const err = await capture(
      async () => assert.equal(await main(['--repo', dir, 'ado', 'call', 'GET', 'x']), 2),
      'error',
    );
    assert.match(err, /QAMASTER_ADO_PROJECT isn't set/);
    assert.match(err, /\n {2}Billing\n {2}Shop\n {2}Zeta\n/);
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const down = await capture(
      async () => assert.equal(await main(['--repo', dir, 'ado', 'call', 'GET', 'x']), 2),
      'error',
    );
    assert.match(down, /^Blocked: .*QAMASTER_ADO_PROJECT/);
  } finally {
    globalThis.fetch = before;
  }
});
