/**
 * 0.8.0 item 20 (F4, R9): dsm.json records each pass of the crawl in run order, a skipped one with its reason, and a
 * signed-in pass skipped for want of a test account is one warning line in dsm run and CHANGES.md.
 */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import { build } from '../plugin/src/dsm/build.mts';
import { type CrawlApp, passWarnings } from '../plugin/src/dsm/crawl-rules.mts';
import { summary } from '../plugin/src/dsm/update.mts';
import type { CrawlPass, UiModel } from '../plugin/src/shared/models.mts';

const ROOT = path.resolve(import.meta.dirname, '..');

test('a skipped signed-in pass for want of an account is one warning line; a public app or --login-mode none is not', () => {
  const noAccount: CrawlPass[] = [
    { name: 'signed-out', pages: 4 },
    { name: 'signed-in', skipped: 'no test account (set APP_USER / APP_PASSWORD in the QA .env)' },
  ];
  const lines = passWarnings(noAccount);
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^the signed-in pass was skipped: no test account \(set APP_USER \/ APP_PASSWORD in the QA \.env\)/,
  );
  assert.match(lines[0], /screens behind the sign-in are not in this DSM/);
  assert.deepEqual(
    passWarnings([
      { name: 'signed-out', pages: 4 },
      { name: 'signed-in', skipped: 'login mode is none' },
    ]),
    [],
  );
  assert.deepEqual(
    passWarnings([
      { name: 'signed-out', pages: 4 },
      { name: 'signed-in', skipped: 'no sign-in was needed' },
    ]),
    [],
  );
  assert.deepEqual(
    passWarnings([
      { name: 'signed-out', pages: 2 },
      { name: 'signed-in', pages: 9 },
    ]),
    [],
  );
  assert.deepEqual(passWarnings(undefined), []);
});

test('dsm.json crawl.passes lists the passes in run order, and CHANGES.md carries the warning', () => {
  const passes: CrawlPass[] = [
    { name: 'signed-out', pages: 3 },
    { name: 'signed-in', skipped: 'no test account (set APP_USER / APP_PASSWORD in the QA .env)' },
  ];
  const ui = {
    generated_at: '',
    base_url: 'http://a',
    mode: 'full',
    truncated: false,
    pages: [],
    edges: [],
    api_calls: [],
    passes,
  } as UiModel;
  const dsm = build(ui, null, { project: 'app' }, { now: new Date('2026-11-11T00:00:00Z') });
  assert.deepEqual(dsm.crawl.passes, passes);
  const none = build({ ...ui, passes: undefined }, null, { project: 'app' }, { now: new Date('2026-11-11T00:00:00Z') });
  assert.equal('passes' in none.crawl, false, 'a crawl from before 0.8.0 has none');
  const change = {
    reason: 'full rebuild',
    crawl: 'full crawl',
    warnings: passWarnings(passes),
    commits: [],
    impacted_routes: [],
    shared_files: [],
    new_code_routes: [],
  };
  assert.match(summary(dsm, change), /> Warning: the signed-in pass was skipped: no test account/);
});

// ---- a real crawl of tests/fixtures/crawl/todo-app.mjs

let server: ChildProcess;
let ui: string;
before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'tests/fixtures/crawl/todo-app.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  ui = (
    await new Promise<{ ui: string }>((resolve) => server.stdout?.once('data', (d) => resolve(JSON.parse(String(d)))))
  ).ui;
});
after(() => server.kill());

const crawler = (app: CrawlApp, credentials: { username?: string; password?: string }) =>
  new PlaywrightCrawler({
    app: {
      base_url: ui,
      settle_ms: 100,
      login: { mode: 'auto', username_env: 'APP_USER', password_env: 'APP_PASSWORD' },
      ...app,
    },
    projectDir: ROOT,
    authDir: null,
    credentials,
  });

test('a crawl with no account records the signed-in pass as skipped, with the names to set', {
  timeout: 120_000,
}, async () => {
  const model = await crawler({ start_paths: ['/about'], max_pages: 6 }, {}).crawl({ baseUrl: ui });
  assert.equal(model.passes?.[0].name, 'signed-out');
  const first = (model.passes ?? [])[0] as { pages: number };
  assert.ok(first.pages > 0);
  const second = model.passes?.[1] as { name: string; skipped: string };
  assert.equal(second.name, 'signed-in');
  assert.match(second.skipped, /^no test account \(set APP_USER \/ APP_PASSWORD in the QA \.env\)/);
});

test('--login-mode none records the signed-in pass as skipped by choice', { timeout: 120_000 }, async () => {
  const model = await crawler({ max_pages: 4 }, {}).crawl({ baseUrl: ui, loginMode: 'none', seeds: ['/login'] });
  assert.deepEqual(model.passes?.[1], { name: 'signed-in', skipped: 'login mode is none' });
});

test('a crawl with the account records both passes with their page counts', { timeout: 180_000 }, async () => {
  const model = await crawler({ max_pages: 8 }, { username: 'qa@example.test', password: 'qa-password' }).crawl({
    baseUrl: ui,
  });
  assert.deepEqual(
    model.passes?.map((p) => p.name),
    ['signed-out', 'signed-in'],
  );
  for (const p of model.passes ?? []) assert.ok('pages' in p && p.pages > 0, p.name);
});
