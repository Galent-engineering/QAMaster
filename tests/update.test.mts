import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { impact, planCrawl, type State, type UpdateConfig, update } from '../plugin/src/dsm/update.mts';
import type { CodeModel, UiModel } from '../plugin/src/shared/models.mts';
import { FakeCrawler } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'plugin/bin/qam');
const POLYGLOT = path.join(ROOT, 'tests/fixtures/scan/polyglot');

function gitIn(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
}

/** A QA project whose DSM config points at a git copy of the polyglot fixture in ./app. */
function project(baseUrl = 'http://app.test/'): { qa: string; config: UpdateConfig; dir: string } {
  const qa = tmpDir('qam-update-');
  fs.cpSync(path.join(POLYGLOT, 'repo'), path.join(qa, 'app'), { recursive: true });
  gitIn(path.join(qa, 'app'), 'init', '-q', '-b', 'main');
  gitIn(path.join(qa, 'app'), 'add', '-A');
  gitIn(path.join(qa, 'app'), 'commit', '-qm', 'init');
  const config: UpdateConfig = JSON.parse(fs.readFileSync(path.join(POLYGLOT, 'dsm-config.json'), 'utf8'));
  config.repositories = config.repositories?.map((r) => ({ ...r, path: 'app' }));
  config.application = { ...config.application, base_url: baseUrl };
  fs.mkdirSync(path.join(qa, 'config'));
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), '{}');
  return { qa, config, dir: path.join(qa, 'dsm') };
}

const UI: UiModel = {
  generated_at: '2026-10-29T00:00:00.000Z',
  base_url: 'http://app.test/',
  mode: 'full',
  truncated: false,
  pages: [
    { route: '/settings', url: 'http://app.test/settings' },
    { route: '/projects', url: 'http://app.test/projects' },
  ],
  edges: [{ from: '/projects', to: '/settings', type: 'link' }],
  api_calls: [],
};

function commit(qa: string, file: string, text: string) {
  fs.appendFileSync(path.join(qa, 'app', file), text);
  gitIn(path.join(qa, 'app'), 'commit', '-qam', `change ${file}`);
}

test('impact returns screens, shared files and other files', () => {
  const code = {
    files: {
      'r:a.tsx': { owners: ['/Settings/'], confidence: 'direct' },
      'r:layout.tsx': { owners: [], confidence: 'shared' },
    },
  } as unknown as CodeModel;
  assert.deepEqual(impact(['r:a.tsx', 'r:layout.tsx', 'r:server/db.ts'], code), {
    screens: ['/settings'],
    shared: ['r:layout.tsx'],
    other: ['r:server/db.ts'],
  });
});

test('planCrawl: no URL, skipped, full and incremental', () => {
  const base = {
    baseUrl: 'http://app.test/',
    noCrawl: false,
    full: false,
    config: {} as UpdateConfig,
    state: { repos: {}, runs: 3, runs_since_full: 3 } as State,
    previousUi: UI,
    rewritten: false,
    impact: { screens: ['/settings'], shared: [], other: [] },
    newRoutes: ['/new', '/orders/:id'],
  };
  assert.equal(planCrawl({ ...base, baseUrl: null }).crawl, null);
  assert.equal(planCrawl({ ...base, noCrawl: true }).crawl, null);
  assert.equal(planCrawl({ ...base, rewritten: true }).crawl, 'full');
  assert.equal(planCrawl({ ...base, previousUi: null }).crawl, 'full');
  assert.equal(planCrawl({ ...base, config: { change_detection: { full_recrawl_every_runs: 4 } } }).crawl, 'full');
  assert.match(
    planCrawl({ ...base, impact: { ...base.impact, shared: ['r:layout.tsx'] } }).why,
    /shared files changed \(r:layout\.tsx\)/,
  );
  assert.deepEqual(planCrawl(base), {
    crawl: 'incremental',
    why: 're-crawled 1 impacted screen(s), 1 new route(s)',
    routes: ['/settings'],
    seeds: ['/new'],
  });
  const none = planCrawl({ ...base, impact: { screens: [], shared: [], other: [] }, newRoutes: [] });
  assert.match(none.why, /no screens mapped/);
});

test('run builds everything; refresh rebuilds only after a commit, re-crawling what changed', async () => {
  const { qa, config, dir } = project();
  const crawler = new FakeCrawler(UI);
  const first = await update(qa, dir, config, () => crawler, { mode: 'run', fetch: false });
  assert.equal(first.status, 'updated');
  assert.equal(crawler.crawls.length, 1);
  assert.ok(crawler.crawls[0].seeds?.includes('/settings'), 'code routes seed the full crawl');
  for (const f of ['dsm.json', 'index.html', 'CHANGES.md', 'state.json', 'ui-model.json', 'code-model.json']) {
    assert.ok(fs.existsSync(path.join(dir, f)), f);
  }
  assert.ok(!fs.existsSync(path.join(dir, '.lock')), 'the lock is released');

  const dsmBefore = fs.readFileSync(path.join(dir, 'dsm.json'), 'utf8');
  const quiet = await update(qa, dir, config, () => crawler, { mode: 'refresh', fetch: false });
  assert.equal(quiet.status, 'no-change');
  assert.equal(fs.readFileSync(path.join(dir, 'dsm.json'), 'utf8'), dsmBefore, 'nothing rewritten');

  commit(qa, 'react/src/Settings.jsx', '// tweak\n');
  const one = await update(qa, dir, config, () => crawler, { mode: 'refresh', fetch: false });
  assert.deepEqual(one.impact, { screens: ['/settings'], shared: [], other: [] });
  assert.equal(crawler.crawls.at(-1)?.routes?.join(), '/settings', 'only the impacted screen is re-crawled');
  assert.ok(crawler.crawls.at(-1)?.previous, 'and merged into the previous crawl');
  assert.match(
    fs.readFileSync(path.join(dir, 'CHANGES.md'), 'utf8'),
    /## Screens impacted by the code change\n- \/settings/,
  );

  commit(qa, 'angular/src/app/shared/header.component.html', '<!-- layout -->\n');
  const shared = await update(qa, dir, config, () => crawler, { mode: 'refresh', fetch: false });
  assert.deepEqual(shared.impact?.shared, ['polyglot:angular/src/app/shared/header.component.html']);
  assert.match(shared.crawl ?? '', /full crawl: shared files changed/);
  assert.equal(crawler.crawls.at(-1)?.routes, undefined, 'a shared change re-crawls everything');
  assert.match(
    fs.readFileSync(path.join(dir, 'CHANGES.md'), 'utf8'),
    /Shared files changed \(may affect every screen\)/,
  );

  const state: State = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(state.runs, 3);
  assert.equal(state.runs_since_full, 0);
  assert.equal(fs.readdirSync(path.join(dir, 'history')).length, 2, 'one snapshot per rebuild over an earlier DSM');
});

test('without a URL the matrix is built from code only; a running update is not repeated', async () => {
  const { qa, config, dir } = project('');
  const crawler = new FakeCrawler(UI);
  const r = await update(qa, dir, config, () => crawler, { mode: 'run', fetch: false });
  assert.equal(crawler.crawls.length, 0);
  assert.match(r.warnings.join(), /base_url is not set: code-only matrix/);

  fs.writeFileSync(path.join(dir, '.lock'), '1');
  assert.equal((await update(qa, dir, config, () => crawler, { mode: 'run', fetch: false })).status, 'skipped');
});

test('a sign-in problem stops the update and keeps the previous DSM', async () => {
  const { qa, config, dir } = project();
  await update(qa, dir, config, () => new FakeCrawler(UI), { mode: 'run', fetch: false });
  const before = fs.readFileSync(path.join(dir, 'dsm.json'), 'utf8');
  const { BlockedError } = await import('../plugin/src/shared/errors.mts');
  const failing = {
    crawl: async () => {
      throw new BlockedError('no username');
    },
  };
  await assert.rejects(
    update(qa, dir, config, () => failing, { mode: 'run', fetch: false }),
    /no username/,
  );
  assert.equal(fs.readFileSync(path.join(dir, 'dsm.json'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

test('qam dsm impact and changes', async () => {
  const { qa, config, dir } = project('');
  await update(qa, dir, config, () => new FakeCrawler(UI), { mode: 'run', fetch: false });
  const qam = (...args: string[]) => spawnSync(QAM, ['--repo', qa, ...args], { encoding: 'utf8' });

  const r = qam(
    '--json',
    'dsm',
    'impact',
    'app/react/src/Settings.jsx',
    'app/angular/src/app/shared/header.component.html',
    'README.md',
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), {
    result: 'pass',
    screens: ['/settings'],
    shared: ['polyglot:angular/src/app/shared/header.component.html'],
    other: ['README.md'],
  });

  assert.match(qam('dsm', 'changes', '--no-fetch').stdout, /polyglot \(main\): no new commits/);
  commit(qa, 'flask/app.py', '# tweak\n');
  assert.match(
    qam('dsm', 'changes', '--no-fetch').stdout,
    /polyglot \(main\): \w{8}\.\.\w{8}, 1 changed file\n {2}\w+ t: change flask\/app\.py/,
  );
});
