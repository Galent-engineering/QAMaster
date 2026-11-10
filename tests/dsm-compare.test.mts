import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build, type Dsm } from '../plugin/src/dsm/build.mts';
import type { UiModel, UiPage } from '../plugin/src/shared/models.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'bin/qam');

const page = (route: string, extra: Partial<UiPage> = {}): UiPage => ({
  route,
  url: `http://app.test${route}`,
  title: route,
  status: 200,
  elements: [{ key: `${route}::link:home`, kind: 'link', text: 'Home', visible: true, target: '/' }],
  ...extra,
});
const ui = (pages: UiPage[], at: string): UiModel => ({
  generated_at: at,
  base_url: 'http://app.test/',
  mode: 'full',
  truncated: false,
  pages,
  edges: pages.slice(1).map((p) => ({ from: '/', to: p.route, type: 'link', via: `/::link:${p.route}` })),
  api_calls: [],
});

/** A QA project whose dsm/ holds two earlier DSMs in history/ and a current dsm.json. */
function project(): { qa: string; dir: string; names: string[] } {
  const qa = tmpDir('qam-compare-');
  fs.mkdirSync(path.join(qa, 'config'));
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), JSON.stringify({ output_dir: 'dsm' }));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), '{}');
  const dir = path.join(qa, 'dsm');
  fs.mkdirSync(path.join(dir, 'history'), { recursive: true });
  const config = { project: 'x', application: { start_paths: ['/'] } };
  const at = (n: number) => new Date(Date.UTC(2026, 10, n));
  const first = build(ui([page('/'), page('/orders', { access: 'signed-in' })], at(1).toISOString()), null, config, {
    now: at(1),
  });
  const second = build(
    ui([page('/'), page('/orders', { access: 'public' }), page('/todo', { access: 'signed-in' })], at(2).toISOString()),
    null,
    config,
    { previous: first, now: at(2) },
  );
  const third = build(
    ui(
      [page('/'), page('/orders', { access: 'public' }), page('/todo', { access: 'signed-in' }), page('/profile')],
      at(3).toISOString(),
    ),
    null,
    config,
    { previous: second, now: at(3) },
  );
  const names = ['dsm-2026-11-01T000000_00-00.json', 'dsm-2026-11-02T000000_00-00.json'];
  fs.writeFileSync(path.join(dir, 'history', names[0]), JSON.stringify(first));
  fs.writeFileSync(path.join(dir, 'history', names[1]), JSON.stringify(second));
  fs.writeFileSync(path.join(dir, 'dsm.json'), JSON.stringify(third));
  return { qa, dir, names };
}

const qam = (qa: string, ...args: string[]) => spawnSync(QAM, ['--repo', qa, ...args], { encoding: 'utf8' });

test('item 5: with no argument qam dsm compare lists the history and the current DSM', () => {
  const { qa, names } = project();
  const r = qam(qa, 'dsm', 'compare');
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.match(lines[0], new RegExp(`^${names[0]}  2026-11-01.*2 screens`));
  assert.match(lines[1], new RegExp(`^${names[1]}  2026-11-02.*3 screens`));
  assert.match(lines[2], /^current {2}2026-11-03.*4 screens/);
  assert.match(lines[3], /Compare: qam dsm compare <older> \[<newer>\]/);
  const json = JSON.parse(qam(qa, '--json', 'dsm', 'compare').stdout);
  assert.deepEqual(
    json.history.map((h: { name: string }) => h.name),
    names,
  );
});

test('item 5: comparing two DSMs names the added screen, the access change and the new elements', () => {
  const { qa, names } = project();
  const r = qam(qa, 'dsm', 'compare', names[0], names[1]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Screens added \(1\)\n {2}\/todo/);
  assert.match(r.stdout, /\/orders: access signed-in -> public/);
  assert.match(r.stdout, /Elements added/);
  assert.ok(!/Screens removed/.test(r.stdout));
});

test('item 5: the newer DSM defaults to the current one, and a name may be its start', () => {
  const { qa } = project();
  const r = qam(qa, 'dsm', 'compare', 'dsm-2026-11-02');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /with the current DSM/);
  assert.match(r.stdout, /Screens added \(1\)\n {2}\/profile/);
  const json = JSON.parse(qam(qa, '--json', 'dsm', 'compare', 'dsm-2026-11-02', 'current').stdout);
  assert.deepEqual(json.nodes_added, ['/profile']);
});

test('item 5: two identical DSMs say so', () => {
  const { qa, names } = project();
  const r = qam(qa, 'dsm', 'compare', names[1], names[1]);
  assert.match(r.stdout, /No difference in screens, elements, relations or access/);
});

test('item 5: an unknown DSM, or no history, is blocked with what to do', () => {
  const { qa } = project();
  const unknown = qam(qa, 'dsm', 'compare', 'dsm-nothing');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /No DSM "dsm-nothing".*qam dsm compare with no argument/);
  const empty = tmpDir('qam-compare-');
  fs.mkdirSync(path.join(empty, 'config'));
  fs.writeFileSync(path.join(empty, 'config/dsm-config.json'), JSON.stringify({ output_dir: 'dsm' }));
  fs.writeFileSync(path.join(empty, 'config/qamaster.json'), '{}');
  assert.match(qam(empty, 'dsm', 'compare').stdout, /No history yet/);
  const one = qam(empty, 'dsm', 'compare', 'current');
  assert.equal(one.status, 2);
  assert.match(one.stderr, /dsm\.json|Run qam dsm run first/);
});

test('item 5: a DSM built before 0.7.0 (no access) is not reported as changed for that', () => {
  const config = { project: 'x', application: { start_paths: ['/'] } };
  const older = build(ui([page('/'), page('/orders')], '2026-11-01T00:00:00Z'), null, config);
  const newer = build(ui([page('/'), page('/orders', { access: 'public' })], '2026-11-02T00:00:00Z'), null, config, {
    previous: older,
  });
  const d = newer.diff as Exclude<Dsm['diff'], { first_run: true }>;
  assert.deepEqual(d.nodes_changed, []);
});
