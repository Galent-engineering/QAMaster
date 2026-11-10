/**
 * 0.6.0 doctor items, in process: 1 (old gate files in the app clone), 6 (R27, a second build of the same version) and
 * 7 (R1, R4, R17, the app's own tests). Same set-up as tests/doctor-041.test.mts, on the local file store.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RUNNERS } from '../plugin/src/adapters/registry.mts';
import { doctor } from '../plugin/src/cli/project.mts';
import { PLUGIN_ROOT, setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { tmpDir } from './tmp.mts';

RUNNERS['playwright-bdd'] = () => ({ collected: async () => [], run: async () => [], check: async () => [] });

function project(env: Record<string, string> = {}) {
  const dir = tmpDir('qam-doctor-060-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  return { dir, cfg: () => loadConfig(dir, { QAMASTER_STORE: 'file', ...env }) };
}
async function checks(cfg: ReturnType<typeof loadConfig>) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  try {
    await doctor(cfg, [], true);
    return JSON.parse(lines.join('\n')).checks as { check: string; ok: boolean; detail: string; state?: string }[];
  } finally {
    console.log = log;
  }
}
const find = async (cfg: ReturnType<typeof loadConfig>, name: string) =>
  (await checks(cfg)).find((c) => c.check === name);
const write = (dir: string, files: Record<string, string>) => {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
};

/** A copy of the running plugin, with the version changed or one file edited. */
function build(edit: (dir: string) => void) {
  const dir = tmpDir('qam-build-');
  fs.cpSync(PLUGIN_ROOT, dir, { recursive: true, filter: (s) => !s.includes('node_modules') });
  edit(dir);
  return dir;
}

test('R27: a launcher on another build of the same version names the files that differ', async () => {
  const { dir, cfg } = project();
  const running = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin/plugin.json'), 'utf8')).version;
  const other = build((d) => fs.appendFileSync(path.join(d, 'src/shared/errors.mts'), '// edited\n'));
  const ptr = path.join(dir, '.qamaster/plugin.json');
  fs.writeFileSync(ptr, JSON.stringify({ ...JSON.parse(fs.readFileSync(ptr, 'utf8')), plugin_root: other }));
  const c = await find(cfg(), 'launcher');
  assert.equal(c?.state, 'unknown');
  assert.match(
    c?.detail ?? '',
    new RegExp(`a second build of the same version \\(${running.replaceAll('.', '\\.')}\\)`),
  );
  assert.match(c?.detail ?? '', /1 file differs/);
  assert.match(c?.detail ?? '', /src\/shared\/errors\.mts/);
  assert.match(c?.detail ?? '', /run qam setup again from the installed plugin/);
});

test('R27: a launcher on a copy with the same files says so; another version says both versions', async () => {
  const { dir, cfg } = project();
  const ptr = path.join(dir, '.qamaster/plugin.json');
  const point = (root: string) =>
    fs.writeFileSync(ptr, JSON.stringify({ ...JSON.parse(fs.readFileSync(ptr, 'utf8')), plugin_root: root }));
  point(build(() => {}));
  assert.match((await find(cfg(), 'launcher'))?.detail ?? '', /another copy of this plugin with the same files/);
  point(
    build((d) => {
      const f = path.join(d, '.claude-plugin/plugin.json');
      fs.writeFileSync(f, JSON.stringify({ ...JSON.parse(fs.readFileSync(f, 'utf8')), version: '0.0.1' }));
    }),
  );
  assert.match((await find(cfg(), 'launcher'))?.detail ?? '', /version 0\.0\.1, not the running/);
});

test('R1: a code source with its own tests is listed, with how to gate one', async () => {
  const { dir, cfg } = project();
  const code = tmpDir('qam-code-');
  write(code, { 'api/tests/test_a.py': '', 'api/tests/test_b.py': '' });
  const dsm = path.join(dir, 'config/dsm-config.json');
  fs.writeFileSync(
    dsm,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(dsm, 'utf8')), repositories: [{ name: 'shop', path: code }] }),
  );
  const c = await find(cfg(), 'app tests shop');
  assert.equal(c?.ok, true);
  assert.match(c?.detail ?? '', /pytest: 2 test files in api\/tests/);
  assert.match(c?.detail ?? '', /not part of the gate/);
  assert.match(c?.detail ?? '', /pytest:<file>::<test>/);
  fs.rmSync(path.join(code, 'api'), { recursive: true });
  assert.equal(await find(cfg(), 'app tests shop'), undefined);
});

test('item 1: old gate files in the app clone are named, once the QA project keeps the new ones', async () => {
  const { dir, cfg } = project();
  const clone = tmpDir('qam-clone-');
  const home = tmpDir('qam-home-');
  write(clone, {
    '.qamaster/verdicts/a.json': '{}',
    '.qamaster/plans/p.json': '{}',
    '.qamaster/integrations.json': '{"integrations":[]}',
  });
  const dsm = path.join(dir, 'config/dsm-config.json');
  fs.writeFileSync(
    dsm,
    JSON.stringify({ ...JSON.parse(fs.readFileSync(dsm, 'utf8')), repositories: [{ name: 'shop', path: clone }] }),
  );
  write(home, {
    'installs.json': JSON.stringify({ repos: { [dir]: { app: 'Shop', integrations: [], updated_at: 'x' } } }),
  });
  const c = await find(loadConfig(clone, { QAMASTER_STORE: 'file', QAMASTER_HOME: home }), 'gate files');
  assert.equal(c?.state, 'unknown');
  assert.match(c?.detail ?? '', /plans, verdicts/);
  assert.ok(c?.detail.includes(path.join(clone, '.qamaster')));
  assert.match(c?.detail ?? '', /never deletes them/);
  assert.ok(c?.detail.includes(path.join(dir, '.qamaster', 'gate', 'shop')));
  void cfg;
});
