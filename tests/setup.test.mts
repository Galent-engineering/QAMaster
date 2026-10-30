/**
 * Feature 4 goldens and fixes. AQE's own outputs sit next to QAMaster's as *.aqe.json (tests/fixtures/setup/):
 * the steps and stages both have must agree, and every difference is listed here and in docs/porting-step3.md.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'plugin/bin/qam');
const FIX = path.join(ROOT, 'tests/fixtures/setup');
const tmp = () => tmpDir('qam-setup-');
const HOME = tmp();
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const json = (dir: string, ...args: string[]) => JSON.parse(qam(dir, '--json', ...args).out);
const playwright = (dir: string) => {
  fs.mkdirSync(path.join(dir, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules/playwright/package.json'), '{}');
};
type Step = { step: string; status: string; detail: string };
type Row = { stage: string; status: string };

/** QAMaster's setup output with machine-specific parts replaced, as in setup.aqe.json. */
function setupGolden(dir: string) {
  const r = json(dir, 'setup', '--no-install');
  for (const s of r.steps as Step[]) if (['Node.js', 'npm', 'git'].includes(s.step)) s.detail = '<version>';
  return { result: r.result, steps: r.steps };
}
/** A copy of the fixture project, with Playwright present. */
function fixtureProject() {
  const dir = tmp();
  fs.cpSync(path.join(FIX, 'pipeline/project'), dir, { recursive: true });
  playwright(dir);
  return dir;
}

test('golden: setup on an empty folder', () => {
  assert.deepEqual(setupGolden(tmp()), read(path.join(FIX, 'setup.expected.json')));
});

test('golden: setup agrees with AQE on every step both have', () => {
  const aqe = read(path.join(FIX, 'setup.aqe.json')) as { status: string; steps: Step[] };
  const ours = read(path.join(FIX, 'setup.expected.json')) as { result: string; steps: Step[] };
  // Intended differences: AQE calls a first-time link "updated"; QAMaster's fix 2 says "incomplete" while Playwright
  // isn't installed, where AQE says "ready".
  const intended: Record<string, [string, string]> = { 'Project link': ['updated', 'created'] };
  for (const a of aqe.steps) {
    const q = ours.steps.find((s) => s.step === a.step);
    if (!q) continue; // AQE-only: its v2/v3 config templates
    assert.deepEqual([a.status, q.status], intended[a.step] ?? [a.status, a.status], a.step);
  }
  assert.deepEqual([aqe.status, ours.result], ['ready', 'incomplete']);
});

test('golden: pipeline status on the fixture project', () => {
  const st = json(fixtureProject(), 'pipeline', 'status');
  const expected = read(path.join(FIX, 'pipeline/status.expected.json'));
  assert.deepEqual(
    st.stages.map((r: Row & { evidence: string }) => [r.stage, r.status, r.evidence]),
    expected.stages.map((r: Row & { evidence: string }) => [r.stage, r.status, r.evidence]),
  );
  assert.equal(st.next, expected.next);
});

test('golden: pipeline agrees with AQE on every stage both have', () => {
  const aqe = read(path.join(FIX, 'pipeline/status.aqe.json')) as { stages: Row[] };
  const ours = read(path.join(FIX, 'pipeline/status.expected.json')) as { stages: Row[] };
  const same: Record<string, string> = {
    setup: 'setup',
    dsm: 'dsm',
    'aut-skills': 'knowledge',
    requirements: 'requirements',
    'test-cases': 'test-cases',
    'app-folder': 'app-folder',
    locators: 'locators',
    scripts: 'scripts',
    gate: 'script-gate',
    reports: 'reports',
  };
  for (const [a, q] of Object.entries(same)) {
    assert.equal(
      ours.stages.find((r) => r.stage === q)?.status,
      aqe.stages.find((r) => r.stage === a)?.status,
      `${a} -> ${q}`,
    );
  }
});

// One test per fix; each failed on the first build (tests/fixtures/setup/aqe-runs.json has AQE's runs).

test('fix 1: setup --check blocks (exit 2) when something is missing', () => {
  assert.equal(qam(tmp(), 'setup', '--check').status, 2);
});

test('fix 2: setup --no-install says incomplete, not ready, while Playwright is missing', () => {
  const dir = tmp();
  const r = qam(dir, 'setup', '--no-install');
  assert.equal(r.status, 0, 'the person asked to skip the install');
  assert.match(r.out, /QAMaster setup: incomplete/);
  playwright(dir);
  assert.match(qam(dir, 'setup', '--no-install').out, /QAMaster setup: ready/);
});

test('fix 3: a config file that is not valid JSON blocks setup and the setup stage, and is never overwritten', () => {
  const dir = tmp();
  qam(dir, 'setup', '--no-install');
  playwright(dir);
  const file = path.join(dir, 'config/dsm-config.json');
  fs.writeFileSync(file, '{ "application": ');
  const check = qam(dir, 'setup', '--check');
  assert.equal(check.status, 2);
  assert.match(check.out, /failed +config\/dsm-config\.json +isn't valid JSON: fix it/);
  const url = qam(dir, 'setup', '--no-install', '--url', 'https://shop.example.test/');
  assert.equal(url.status, 2);
  assert.match(url.out, /skipped +app and sources +fix the failed steps first/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ "application": ', 'kept as the person left it');
  const setupStage = json(dir, 'pipeline', 'status').stages[0];
  assert.deepEqual([setupStage.status, setupStage.evidence], ['pending', 'not valid JSON: config/dsm-config.json']);
});

test('fix 4: a later pipeline start adds to the inputs instead of replacing them', () => {
  const dir = tmp();
  qam(dir, 'pipeline', 'start', '--url', 'https://shop.example.test/', '--app', 'Shop', '--channels', 'web');
  const inputs = json(dir, 'pipeline', 'start', '--source', '.').inputs;
  assert.deepEqual(
    [inputs.url, inputs.app, inputs.source, inputs.channels],
    ['https://shop.example.test/', 'Shop', '.', ['web']],
  );
});

test('fix 5: a state.json that is not valid JSON blocks and is never replaced', () => {
  const dir = tmp();
  const file = path.join(dir, '.qamaster/state.json');
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, '{"inputs":{"url":"https://shop.example.test/"');
  for (const args of [['mark', 'reports', 'skipped'], ['start', '--url', 'https://x.test'], ['reset'], ['status']]) {
    const r = qam(dir, 'pipeline', ...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.err, /state\.json isn't valid JSON.*Fix it, or delete it/);
  }
  assert.equal(fs.readFileSync(file, 'utf8'), '{"inputs":{"url":"https://shop.example.test/"');
});

test('fix 6: pipeline reset of an unknown stage blocks', () => {
  const r = qam(tmp(), 'pipeline', 'reset', 'dsn');
  assert.equal(r.status, 2);
  assert.match(r.err, /There's no stage "dsn"/);
});

test('fix 7: pipeline mark <stage> done blocks and says what the evidence is', () => {
  const dir = tmp();
  const r = qam(dir, 'pipeline', 'mark', 'dsm', 'done');
  assert.equal(r.status, 2);
  assert.match(r.err, /done when its evidence is there.*dsm: no dsm\/dsm\.json yet.*Run qam dsm run/);
  assert.equal(fs.existsSync(path.join(dir, '.qamaster/state.json')), false, 'nothing recorded');
  assert.match(qam(dir, 'pipeline', 'mark', 'dsm', 'finished').err, /<pending\|in_progress\|failed\|skipped>/);
});

test('fix 8: pipeline start blocks a source folder that does not exist', () => {
  const r = qam(tmp(), 'pipeline', 'start', '--source', '/no/such/folder');
  assert.equal(r.status, 2);
  assert.match(r.err, /--source \/no\/such\/folder isn't a folder/);
});

test('fix 9: a configured repository that cannot be read makes the DSM stale, and says so', () => {
  const dir = fixtureProject();
  const file = path.join(dir, 'config/dsm-config.json');
  const cfg = read(file);
  cfg.repositories = [{ name: 'autonomousQeDemo', path: '/no/such/clone', branch: 'main' }];
  fs.writeFileSync(file, JSON.stringify(cfg));
  const dsm = json(dir, 'pipeline', 'status').stages.find((r: Row) => r.stage === 'dsm');
  assert.equal(dsm.status, 'stale');
  assert.match(dsm.evidence, /can't read autonomousQeDemo \(\/no\/such\/clone\): run qam doctor/);
});

test('fix 10: doctor rewrites its own record when it cannot be read, instead of crashing', () => {
  const dir = tmp();
  qam(dir, 'setup', '--no-install');
  fs.writeFileSync(path.join(dir, '.qamaster/doctor.json'), '{');
  const r = qam(dir, 'doctor');
  assert.equal(r.err, '');
  assert.equal(typeof read(path.join(dir, '.qamaster/doctor.json')).ok, 'boolean');
});

test('a stage marked skipped shows the mark, not the failed check it stopped', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.qamaster'));
  const failed = { store: { ok: false, at: '2026-10-30T00:00:00Z', detail: 'Azure DevOps returned 404' } };
  fs.writeFileSync(path.join(dir, '.qamaster/doctor.json'), JSON.stringify(failed));
  assert.equal(qam(dir, 'pipeline', 'mark', 'store', 'skipped', '--note', 'Local CSV for now').status, 0);
  const store = (json(dir, 'pipeline', 'status').stages as { stage: string }[]).find((s) => s.stage === 'store');
  assert.deepEqual(store, { ...store, status: 'skipped', evidence: 'marked skipped', note: 'Local CSV for now' });
  qam(dir, 'pipeline', 'mark', 'store', 'failed');
  const again = (json(dir, 'pipeline', 'status').stages as { stage: string; evidence: string }[]).find(
    (s) => s.stage === 'store',
  );
  assert.equal(again?.evidence, 'last check failed: Azure DevOps returned 404', 'a failed mark keeps the evidence');
});
