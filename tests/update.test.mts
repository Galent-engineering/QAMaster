import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { blockedWarning, impact, planCrawl, type State, type UpdateConfig, update } from '../plugin/src/dsm/update.mts';
import type { CodeModel, UiModel } from '../plugin/src/shared/models.mts';
import { FakeCrawler } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'bin/qam');
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

test('the blocked-writes warning names each request, most frequent first, at most five (0.4.2 W4)', () => {
  const ga = { method: 'POST', url: 'https://www.google-analytics.com/collect?v=1&t=pageview' };
  const list = [ga, ga, ga, { method: 'PUT', url: 'http://localhost:8080/api/x' }];
  assert.equal(
    blockedWarning(list),
    '4 write request(s) blocked during the crawl: POST https://www.google-analytics.com/collect (3), PUT http://localhost:8080/api/x; if a page needs one to render, add it to safety.allow_mutating_patterns',
  );
  const many = Array.from({ length: 7 }, (_, i) => ({ method: 'POST', url: `http://h/p${i}` }));
  assert.match(blockedWarning(many), /POST http:\/\/h\/p4, and 2 more;/);
});

// ---- 0.7.0 items 12 and 13

test('item 12: routesPlan crawls the routes the globs match, and blocks a glob that matches none', async () => {
  const { routesPlan } = await import('../plugin/src/dsm/update.mts');
  const prev = {
    ...UI,
    pages: [
      { route: '/todo', url: 'x' },
      { route: '/todo/:id', url: 'x' },
      { route: '/users', url: 'x' },
    ],
  } as UiModel;
  const plan = routesPlan(['/todo*', '/users'], 'http://app.test/', false, prev, ['/settings']);
  assert.deepEqual(plan, {
    crawl: 'incremental',
    why: 'crawled 2 route(s) matching --routes',
    routes: ['/todo', '/users'],
    seeds: [],
  });
  assert.deepEqual(routesPlan(['/todo/**'], 'http://app.test/', false, prev, []).routes, ['/todo/:id']);
  assert.deepEqual(
    routesPlan(['/settings'], 'http://app.test/', false, prev, ['/settings']).routes,
    ['/settings'],
    'a code route',
  );
  assert.throws(() => routesPlan(['/nothing*'], 'http://app.test/', false, prev, []), {
    name: 'BlockedError',
    message: /matches no route\. Routes known so far: \/todo, \/todo\/:id, \/users/,
  });
  assert.throws(() => routesPlan(['/todo'], 'http://app.test/', false, null, []), /Run qam dsm run first/);
  assert.throws(() => routesPlan(['/todo'], null, false, prev, []), /needs application\.base_url/);
  assert.throws(() => routesPlan(['/todo'], 'http://app.test/', true, prev, []), /--no-crawl/);
});

test('item 12: run --routes crawls only those routes and merges them into the last DSM', async () => {
  const { qa, config, dir } = project();
  const crawler = new FakeCrawler(UI);
  await update(qa, dir, config, () => crawler, { mode: 'run', fetch: false });
  const second = new FakeCrawler({
    ...UI,
    mode: 'incremental',
    pages: [{ route: '/settings', url: 'http://app.test/settings' }],
  });
  const r = await update(qa, dir, config, () => second, { mode: 'run', fetch: false, routes: ['/set*'] });
  assert.equal(r.status, 'updated');
  assert.equal(second.crawls.length, 1);
  assert.deepEqual(second.crawls[0].routes, ['/settings']);
  assert.ok(second.crawls[0].previous, 'merged into the last crawl');
  assert.deepEqual(second.crawls[0].seeds, []);
  assert.match(r.crawl ?? '', /crawled 1 route\(s\) matching --routes/);
  await assert.rejects(
    update(qa, dir, config, () => second, { mode: 'run', fetch: false, routes: ['/zzz'] }),
    /matches no route/,
  );
  assert.ok(!fs.existsSync(path.join(dir, '.lock')), 'a blocked run releases the lock');
});

test('item 12: the CLI takes globs after --routes, and only for run', () => {
  const { qa } = project('');
  const qam = (...args: string[]) => spawnSync(QAM, ['--repo', qa, ...args], { encoding: 'utf8' });
  const noPrev = qam('dsm', 'run', '--routes', '/settings', '/orders/*', '--no-fetch');
  assert.equal(noPrev.status, 2);
  assert.match(noPrev.stderr, /needs application\.base_url/);
  assert.match(qam('dsm', 'run', '/settings').stderr, /Routes go after --routes/);
  assert.match(qam('dsm', 'refresh', '--routes', '/x').stderr, /--routes and --estimate are for qam dsm run/);
  assert.match(qam('dsm', 'run', '--routes', '/x', '--estimate').stderr, /cannot be used with --routes/);
});

test('item 13: the estimate names the routes, the pages and the minutes from the last crawl, and crawls nothing', async () => {
  const { estimate } = await import('../plugin/src/dsm/update.mts');
  const { qa, config, dir } = project('');
  const crawler = new FakeCrawler(UI);
  const noPast = estimate(qa, dir, config);
  assert.equal(noPast.basis, 'default');
  assert.ok(noPast.routes.includes('/settings'), 'the routes come from the code scan');
  assert.ok(noPast.minutes >= 1);
  assert.ok(!fs.existsSync(path.join(dir, 'ui-model.json')), 'nothing was written');

  fs.mkdirSync(dir, { recursive: true });
  const timed = {
    ...UI,
    timing: { elapsed_ms: 8 * 90_000, pages: 8, concurrency: 3, settle_waits: 8, settle_ms: 4000 },
  };
  fs.writeFileSync(path.join(dir, 'ui-model.json'), JSON.stringify(timed));
  const past = estimate(qa, dir, config);
  assert.deepEqual(
    [past.basis, past.pages, past.minutes, past.seconds_per_page, past.concurrency],
    ['last crawl', 8, 12, 90, 3],
  );
  // crawl.concurrency changed since that crawl: the pace is scaled to the tabs a crawl would use now
  const one = estimate(qa, dir, { ...config, application: { ...config.application, crawl: { concurrency: 1 } } });
  assert.deepEqual([one.minutes, one.seconds_per_page, one.concurrency], [36, 270, 1]);

  const qam = (...args: string[]) => spawnSync(QAM, ['--repo', qa, ...args], { encoding: 'utf8' });
  const r = qam('dsm', 'run', '--estimate');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Routes from the code scan: \d+/);
  assert.match(
    r.stdout,
    /Expected: about 8 pages, about 12 min at 3 tabs, 90 s a page \(from the last crawl's timings\)\./,
  );
  assert.match(r.stdout, /Nothing was crawled\./);
  assert.ok(!fs.existsSync(path.join(dir, 'dsm.json')), 'no DSM was built either');
  assert.equal(crawler.crawls.length, 0);
});

test('item 13: many sibling pages differing only in an ID-like segment name the route_normalization rule', async () => {
  const { idHints } = await import('../plugin/src/dsm/crawl-rules.mts');
  const slugs = ['a1b2c3d4', 'e5f6a7b8', 'c9d0e1f2', 'a3b4c5d6', 'e7f8a9b0', 'c1d2e3f4'];
  const hints = idHints([
    '/',
    '/boards',
    ...slugs.map((s) => `/boards/${s}`),
    ...slugs.map((s) => `/boards/${s}/edit`),
  ]);
  assert.equal(hints.length, 2, 'one for /boards/<id>, one for /boards/<id>/edit');
  assert.match(hints[0], /6 pages differ only in an ID-like segment \(\/boards\/a1b2c3d4 \.\.\.\)/);
  assert.match(hints[0], /"pattern": "\/\[0-9a-fA-F\]\{8\}\(\?=\/\|\$\)", "replace": "\/:id"/);
  assert.match(hints[0], /application\.route_normalization/);
  const words = ['red', 'green', 'blue', 'amber', 'violet', 'orange'];
  assert.deepEqual(idHints(words.map((w) => `/colors/${w}`)), [], 'words are not IDs');
  assert.deepEqual(idHints(slugs.slice(0, 3).map((s) => `/boards/${s}`)), [], 'three siblings are not many');
  assert.deepEqual(
    idHints(slugs.map((s) => `/boards/${s.length}${s.slice(0, 3)}`.replace('/', '/:'))),
    [],
    'a normalised segment is not an ID',
  );
});

test('item 13: an update that crawls many ID-shaped siblings warns with the rule', async () => {
  const { qa, config, dir } = project();
  const slugs = ['a1b2c3d4', 'e5f6a7b8', 'c9d0e1f2', 'a3b4c5d6', 'e7f8a9b0'];
  const model = {
    ...UI,
    pages: [...UI.pages, ...slugs.map((s) => ({ route: `/projects/${s}`, url: `http://app.test/projects/${s}` }))],
  };
  const r = await update(qa, dir, config, () => new FakeCrawler(model), { mode: 'run', fetch: false });
  assert.ok(
    r.warnings.some((w) => /5 pages differ only in an ID-like segment.*route_normalization/.test(w)),
    r.warnings.join('\n'),
  );
});
