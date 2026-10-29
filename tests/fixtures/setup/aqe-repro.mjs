// Reproduces the AQE setup/pipeline problems in aqe-runs.json: node aqe-repro.mjs <absolute path to aqe.mts>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AQE = process.argv[2]; // .../autonomous-qe-0.2.0/tools/aqe.mts
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-repro-'));
const aqe = (dir, ...args) => {
  const r = spawnSync(process.execPath, [AQE, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, AQE_PROJECT_DIR: dir } });
  return { exit: r.status, out: (r.stdout + r.stderr).replaceAll(dir, '<project>').trim() };
};
const put = (dir, f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const stage = (dir, id) => JSON.parse(aqe(dir, 'pipeline', 'status', '--json').out).stages.find((s) => s.stage === id);
const fakePlaywright = (dir) => put(dir, 'node_modules/playwright/package.json', '{"name":"playwright","version":"1.64.1"}');
const runs = [];
const rec = (id, problem, command, result) => runs.push({ id, problem, command, ...result });

// 1. setup --check exits 1 when something is missing
{ const d = tmp(); const r = aqe(d, 'setup', '--check'); rec('check-exit', 'setup --check exits 1 ("fail") when something is missing', 'aqe setup --check (empty folder)', { exit: r.exit, first_line: r.out.split('\n')[0] }); }

// 2. setup --no-install says ready while Playwright is missing
{ const d = tmp(); const r = aqe(d, 'setup', '--no-install', '--json'); const j = JSON.parse(r.out);
  rec('no-install-ready', 'setup --no-install reports "ready" (exit 0) while Playwright is not installed', 'aqe setup --no-install --json (empty folder)',
    { exit: r.exit, status: j.status, npm_install: j.steps.find((s) => s.step === 'npm install') }); }

// 3. broken config is reported as ok, and the pipeline calls setup done
{ const d = tmp(); aqe(d, 'setup', '--no-install'); fakePlaywright(d); put(d, 'config/dsm-config.json', '{ "application": ');
  const r = aqe(d, 'setup', '--check', '--json'); const j = JSON.parse(r.out);
  rec('broken-config-ok', 'an existing config file that is not valid JSON is reported "present (kept as is)", and the setup stage is done',
    'aqe setup --no-install; break config/dsm-config.json; aqe setup --check --json; aqe pipeline status --json',
    { exit: r.exit, status: j.status, config_step: j.steps.find((s) => s.step === 'config/dsm-config.json'), setup_stage: stage(d, 'setup').status }); }

// 4. pipeline start replaces earlier inputs
{ const d = tmp(); aqe(d, 'pipeline', 'start', '--url', 'https://app.example.test', '--repo', d, '--app', 'Shop'); aqe(d, 'pipeline', 'start', '--url', 'https://app.example.test', '--repo', d, '--channels', 'web');
  const inputs = JSON.parse(read(d, '.autonomous-qe/state.json').replaceAll(d, '<project>')).inputs; delete inputs.started_at; delete inputs.repo_mcp;
  rec('start-replaces-inputs', 'a second pipeline start drops the app name recorded by the first', 'aqe pipeline start --url https://app.example.test --repo <project> --app Shop; aqe pipeline start --url https://app.example.test --repo <project> --channels web', { inputs_after: inputs }); }

// 5. a state.json that isn't valid JSON is silently replaced
{ const d = tmp(); put(d, '.autonomous-qe/state.json', '{"inputs":{"url":"https://app.example.test","app":"Shop"},"stages":{"gate":{"status":"done"');
  const r = aqe(d, 'pipeline', 'mark', 'reports', 'skipped');
  rec('corrupt-state-overwritten', 'a state.json that is not valid JSON (here cut off mid-write) is replaced by a new file without a word: inputs and marks are lost',
    'truncate .autonomous-qe/state.json; aqe pipeline mark reports skipped', { exit: r.exit, state_after: JSON.parse(read(d, '.autonomous-qe/state.json')).inputs ?? null }); }

// 6. reset of an unknown stage is accepted
{ const d = tmp(); const r = aqe(d, 'pipeline', 'reset', 'dsn'); rec('reset-unknown-stage', 'pipeline reset accepts an unknown stage (a typo) and does nothing', 'aqe pipeline reset dsn', { exit: r.exit }); }

// 7. mark <stage> done is accepted but has no effect
{ const d = tmp(); const r = aqe(d, 'pipeline', 'mark', 'dsm', 'done');
  rec('mark-done-ignored', 'pipeline mark dsm done exits 0 but the stage stays pending: evidence wins, and nothing says so', 'aqe pipeline mark dsm done (no dsm/dsm.json)', { exit: r.exit, dsm_stage: stage(d, 'dsm').status }); }

// 8. pipeline start accepts a repository that doesn't exist
{ const d = tmp(); const r = aqe(d, 'pipeline', 'start', '--url', 'https://app.example.test', '--repo', '/no/such/folder');
  rec('start-unchecked-repo', 'pipeline start records a repository path that does not exist', 'aqe pipeline start --url https://app.example.test --repo /no/such/folder', { exit: r.exit, recorded: JSON.parse(read(d, '.autonomous-qe/state.json')).inputs.repo }); }

// 9. a configured repository that can't be read: the DSM stays "done", nothing is said
{ const d = tmp(); aqe(d, 'setup', '--no-install');
  const cfg = JSON.parse(read(d, 'config/dsm-config.json')); cfg.repositories = [{ name: 'web', path: '/no/such/clone', branch: 'main' }]; put(d, 'config/dsm-config.json', JSON.stringify(cfg));
  put(d, 'dsm/dsm.json', JSON.stringify({ generated_at: '2026-10-29T04:47:50+00:00', stats: { pages: 1, page_relations: 0 } }));
  put(d, 'dsm/state.json', JSON.stringify({ repos: { web: { commit: 'abc' } } }));
  const s = stage(d, 'dsm');
  rec('dsm-unreadable-repo', 'the configured repository is gone, but the DSM stage is done with no warning (errors are swallowed)', 'config repository /no/such/clone; aqe pipeline status --json', { dsm_stage: s.status, evidence: s.evidence }); }

// 10. yarn-style workspaces object is replaced by an array (feature 8)
{ const d = tmp(); put(d, 'package.json', JSON.stringify({ name: 'qa', private: true, workspaces: { packages: ['apps/*'], nohoist: ['**/x'] }, devDependencies: { playwright: '1.64.1' } }));
  aqe(d, 'setup', '--no-install');
  rec('workspaces-object-lost', 'setup replaces a workspaces object ({packages, nohoist}) with an empty array', 'package.json with workspaces {packages:["apps/*"]}; aqe setup --no-install', { workspaces_after: JSON.parse(read(d, 'package.json')).workspaces }); }

console.log(JSON.stringify(runs, null, 2));
