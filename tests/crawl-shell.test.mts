import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { dropShellPages, PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import type { UiEdge, UiPage } from '../plugin/src/shared/models.mts';

const ROOT = path.resolve(import.meta.dirname, '..');

const page = (route: string, by: string, names: string[], extra: Partial<UiPage> = {}): UiPage => ({
  route,
  url: `http://x${route}`,
  discovered_by: by,
  elements: names.map((n) => ({ key: `${route}::button:${n}`, kind: 'button', text: n })),
  forms: [],
  error: null,
  ...extra,
});
const edge = (from: string, to: string): UiEdge => ({ from, to, type: 'link', via: null, label: '' });

// ---- the rule, without a browser

test('dropShellPages drops code-seeded routes that show the start page', () => {
  const pages = [
    page('/', 'start', ['Connect', 'Disconnect']),
    page('/a', 'code-seed', ['Disconnect', 'Connect']),
    page('/b', 'code-seed', ['Connect', 'Disconnect']),
    page('/about', 'code-seed', ['Contact']),
  ];
  const edges = [edge('/', '/about'), edge('/a', '/about'), edge('/', '/b')];
  const out = dropShellPages(pages, edges, '/');
  assert.deepEqual(
    out.pages.map((p) => p.route),
    ['/', '/about'],
  );
  assert.deepEqual(out.edges, [edge('/', '/about')]);
  assert.deepEqual(out.dropped, ['/a', '/b']);
});

test('dropShellPages keeps what is not a plain code-seeded copy', () => {
  const same = ['Connect'];
  const pages = [
    page('/', 'start', same),
    page('/linked', 'link', same), // found by a link, not seeded from code
    page('/err', 'code-seed', same, { error: 'boom' }),
    page('/moved', 'code-seed', same, { redirect_to: '/' }),
    page('/other', 'code-seed', ['Other']),
  ];
  const out = dropShellPages(pages, [], '/');
  assert.equal(out.pages.length, 5);
  assert.deepEqual(out.dropped, []);
});

test('dropShellPages compares form field labels, and never an empty signature', () => {
  const form = (label: string) => [{ key: 'f', fields: [{ key: 'k', label }] }];
  const pages = [
    page('/', 'start', ['Go'], { forms: form('Registry URL') }),
    page('/x', 'code-seed', ['Go'], { forms: form('Other label') }),
    page('/y', 'code-seed', ['Go'], { forms: form('Registry URL') }),
  ];
  assert.deepEqual(dropShellPages(pages, [], '/').dropped, ['/y']);
  const empty = [page('/', 'start', []), page('/z', 'code-seed', [])];
  assert.deepEqual(dropShellPages(empty, [], '/').dropped, []);
});

test('dropShellPages does nothing without a start page', () => {
  const pages = [page('/a', 'code-seed', ['Connect'])];
  assert.deepEqual(dropShellPages(pages, [], '/').dropped, []);
});

// ---- a real crawl of tests/fixtures/crawl/spa-shell.mjs

let server: ChildProcess;
let ui: string;

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'tests/fixtures/crawl/spa-shell.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  ui = (
    await new Promise<{ ui: string }>((resolve) => server.stdout?.once('data', (d) => resolve(JSON.parse(String(d)))))
  ).ui;
});
after(() => server.kill());

test('a single-page app answering 200 for every path crawls to its real screens', { timeout: 120_000 }, async () => {
  const lines: string[] = [];
  const seeds = ['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h', '/i', '/j', '/about'];
  const model = await new PlaywrightCrawler({
    app: { base_url: ui, settle_ms: 100, login: { mode: 'auto' } },
    projectDir: ROOT,
    authDir: null,
    credentials: {},
    log: (l) => lines.push(l),
  }).crawl({ baseUrl: ui, seeds });
  assert.deepEqual(
    model.pages.map((p) => p.route),
    ['/', '/about'],
  );
  assert.ok(
    lines.some((l) => /dropped 10 code-seeded route\(s\) that show the start page's elements/.test(l)),
    lines.join('\n'),
  );
});
