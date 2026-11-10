import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import { build } from '../plugin/src/dsm/build.mts';
import { type CrawlApp, DEFAULT_CONCURRENCY } from '../plugin/src/dsm/crawl-rules.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const NORMALISE = [{ pattern: '/\\d+(?=/|$)', replace: '/:id' }];

let todo: ChildProcess;
let ui: string;

before(async () => {
  todo = spawn(process.execPath, [path.join(ROOT, 'tests/fixtures/crawl/todo-app.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  ui = (
    await new Promise<{ ui: string }>((resolve) => todo.stdout?.once('data', (d) => resolve(JSON.parse(String(d)))))
  ).ui;
});
after(() => todo.kill());

function crawler(app: CrawlApp) {
  return new PlaywrightCrawler({
    app: { base_url: ui, settle_ms: 100, route_normalization: NORMALISE, login: { mode: 'auto' }, ...app },
    projectDir: ROOT,
    authDir: null,
    credentials: { username: 'qa@example.test', password: 'qa-password' }, // the fixture's test account
  });
}

test('0.7.0 D4: three tabs is the default, and 1 is the one-page-at-a-time crawl', () => {
  assert.equal(DEFAULT_CONCURRENCY, 3);
});

// item 11: whatever the tabs' timing, pages, elements and relations come out the same
test('item 11: the fixture crawled with concurrency 1 and 3 gives the same dsm.json', {
  timeout: 240_000,
}, async () => {
  const now = new Date('2026-11-10T00:00:00Z');
  const one = await crawler({ crawl: { concurrency: 1 } }).crawl({ baseUrl: ui, now, seeds: ['/profile', '/todo'] });
  const three = await crawler({ crawl: { concurrency: 3 } }).crawl({ baseUrl: ui, now, seeds: ['/profile', '/todo'] });
  assert.equal(one.timing?.concurrency, 1);
  assert.equal(three.timing?.concurrency, 3);
  const strip = (m: typeof one) => ({ ...m, timing: undefined });
  assert.deepEqual(strip(three), strip(one), 'the crawl is the same');
  assert.deepEqual(
    build(three, null, { project: 'x', application: { start_paths: ['/'] } }, { now }),
    build(one, null, { project: 'x', application: { start_paths: ['/'] } }, { now }),
  );
  assert.ok(one.pages.length >= 6, 'and it is a real crawl');
});

// item 10: count the waits, not the clock
test('item 10: a page that is quiet is settled before settle_ms, one that changes in steps is waited for', {
  timeout: 120_000,
}, async () => {
  const cap = 2500;
  const model = await crawler({
    settle_ms: cap,
    start_paths: ['/slow', '/about'],
    max_pages: 2,
    login: { mode: 'none' },
    crawl: { concurrency: 1 },
  }).crawl({ baseUrl: ui });
  const slow = model.pages.find((p) => p.route === '/slow');
  const steps = (slow?.elements ?? []).filter((e) => /^Step \d$/.test(e.text ?? ''));
  assert.equal(steps.length, 5, 'the page grows for 400 ms in steps of 80 ms; all five are seen');
  const timing = model.timing;
  assert.ok(timing && timing.settle_waits >= 2);
  assert.ok(
    timing.settle_ms < timing.settle_waits * cap,
    `waited ${timing.settle_ms} ms in ${timing.settle_waits} settles, under the ${cap} ms cap each`,
  );
});

test('item 10: a page whose DOM never stops changing is still settled, at the settle_ms cap', {
  timeout: 120_000,
}, async () => {
  const model = await crawler({ settle_ms: 400, start_paths: ['/busy'], max_pages: 1, login: { mode: 'none' } }).crawl({
    baseUrl: ui,
  });
  assert.equal(model.pages[0].error, null);
  assert.ok(model.pages[0].elements?.length);
});
