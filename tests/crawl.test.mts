import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import { blocks, type CrawlApp, isSignInPage, mergeIncremental, Routes } from '../plugin/src/dsm/crawl-rules.mts';
import type { UiModel } from '../plugin/src/shared/models.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const NORMALISE = [{ pattern: '/\\d+(?=/|$)', replace: '/:id' }];

// ---- the rules, without a browser

test('fix 3: after sign-in every write to any host is blocked, reads never are', () => {
  const app: CrawlApp = {};
  const write = (url: string) => ({ method: 'PATCH', url, frameRoute: '/notifications' });
  assert.equal(
    blocks(write('http://localhost:3001/notifications/1'), 'crawling', '/login', app),
    true,
    'API on another port',
  );
  assert.equal(blocks(write('https://other.example.test/x'), 'crawling', '/login', app), true, 'another host');
  assert.equal(blocks({ ...write('http://localhost:3001/x'), method: 'GET' }, 'crawling', '/login', app), false);
  assert.equal(blocks({ ...write('http://x/'), method: 'OPTIONS' }, 'crawling', '/login', app), false);
  const allow: CrawlApp = { safety: { allow_mutating_patterns: ['/api/search'] } };
  assert.equal(
    blocks({ method: 'POST', url: 'http://x/api/search', frameRoute: '/' }, 'crawling', '/login', allow),
    false,
  );
  assert.equal(blocks(write('http://x/'), 'crawling', '/login', { safety: { block_mutating_requests: false } }), false);
});

test('fix 2: signing in again allows writes only from the sign-in page', () => {
  const post = (frameRoute: string | null) => ({ method: 'POST', url: 'http://localhost:3001/login', frameRoute });
  assert.equal(blocks(post('/login'), 're-signing-in', '/login', {}), false);
  assert.equal(blocks(post('/settings'), 're-signing-in', '/login', {}), true, 'not from another page');
  assert.equal(blocks(post(null), 're-signing-in', '/login', {}), true, 'not from a worker');
  assert.equal(blocks(post('/login'), 're-signing-in', null, {}), true, 'not when the sign-in page is unknown');
  assert.equal(blocks(post('/anything'), 'signing-in', null, {}), false, 'the first sign-in is before the guard');
});

test('fix 1: an email field without a password is not a sign-in page', () => {
  const emailOnly = { password: false, userOnly: true, otp: false, message: '' };
  assert.equal(isSignInPage(emailOnly, '/settings', '/login'), false);
  assert.equal(isSignInPage(emailOnly, '/settings', null), false);
  assert.equal(isSignInPage(emailOnly, '/login', '/login'), true, 'two-step sign-in on the sign-in route');
  assert.equal(isSignInPage(emailOnly, '/account/sign-in', null), true, 'a route named like sign-in');
  assert.equal(isSignInPage({ ...emailOnly, userOnly: false, password: true }, '/anything', '/login'), true);
  assert.equal(isSignInPage({ ...emailOnly, userOnly: false }, '/login', '/login'), false, 'nothing to fill');
});

test('routes are normalised and filtered', () => {
  const r = new Routes({ route_normalization: NORMALISE, hash_routing: 'auto' }, 'http://localhost:4000/');
  assert.equal(r.routeOf('/orders/101/'), '/orders/:id');
  assert.equal(r.routeOf('/#/help'), '/#/help');
  assert.equal(r.hashRouting, true);
  assert.equal(r.allowed('/logout'), false, 'the default exclude list applies');
  assert.equal(r.allowed('http://elsewhere.test/'), false);
  assert.equal(r.allowed('mailto:x@example.test'), false);
  assert.equal(r.allowed('/orders/101'), true);
});

test('an incremental crawl replaces only the re-crawled routes', () => {
  const page = (route: string, title: string) => ({ route, url: `http://x${route}`, title });
  const previous = {
    pages: [page('/', 'old home'), page('/orders', 'orders')],
    edges: [
      { from: '/', to: '/orders', type: 'link', via: 'a' },
      { from: '/orders', to: '/', type: 'link', via: 'b' },
    ],
    api_calls: [{ method: 'GET', host: 'x', path: '/a' }],
  } as unknown as UiModel;
  const merged = mergeIncremental(previous, {
    pages: [page('/', 'new home')],
    edges: [],
    api_calls: [{ method: 'GET', host: 'x', path: '/b' }],
  });
  assert.deepEqual(
    merged.pages.map((p) => p.title),
    ['orders', 'new home'],
  );
  assert.deepEqual(
    merged.edges.map((e) => e.from),
    ['/orders'],
  );
  assert.deepEqual(merged.api_calls.map((c) => c.path).sort(), ['/a', '/b']);
});

// ---- a real crawl of tests/fixtures/crawl/app.mjs

let server: ChildProcess;
let urls: { ui: string; api: string };

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'tests/fixtures/crawl/app.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  urls = await new Promise((resolve) => server.stdout?.once('data', (d) => resolve(JSON.parse(String(d)))));
});
after(() => server.kill());

const writes = async () => (await fetch(`${urls.api}__writes`)).json();

function crawler(app: CrawlApp, authDir: string | null = null) {
  return new PlaywrightCrawler({
    app: { base_url: urls.ui, settle_ms: 100, route_normalization: NORMALISE, login: { mode: 'auto' }, ...app },
    projectDir: ROOT,
    authDir,
    credentials: { username: 'qa@example.test', password: 'qa-password' }, // the fixture's test account
  });
}

test('the crawl signs in, maps the app, and changes nothing', { timeout: 120_000 }, async () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-auth-'));
  const model = await crawler({}, authDir).crawl({ baseUrl: urls.ui });

  assert.deepEqual(await writes(), [], 'the API received no write');
  const blockedPaths = (model.blocked_requests ?? []).map((b) => `${b.method} ${new URL(b.url).pathname}`);
  assert.ok(blockedPaths.includes('PATCH /notifications/1'), 'Dismiss on the API port was blocked (fix 3)');

  const byRoute = new Map(model.pages.map((p) => [p.route, p]));
  const settings = byRoute.get('/settings');
  assert.ok(settings, 'the settings page was crawled');
  assert.equal(settings.error, null, 'and not mistaken for a sign-in page (fix 1)');
  assert.ok(byRoute.has('/orders/:id'));
  assert.equal(byRoute.get('/broken')?.status, 500);
  assert.equal(byRoute.get('/old-orders')?.redirect_to, '/orders');
  assert.ok(!byRoute.has('/login') && !byRoute.has('/logout'), 'never crawls the sign-in page or logs out');
  assert.equal(model.login?.login_route, '/login');
  assert.ok(
    model.edges.some((e) => e.type === 'opens'),
    'the Filters dialog was found',
  );

  const file = path.join(authDir, 'state.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'the session is saved owner-only (Q16)');
  assert.equal(fs.readFileSync(path.join(authDir, '.gitignore'), 'utf8'), '*\n');
  const again = await crawler({ max_pages: 2 }, authDir).crawl({ baseUrl: urls.ui });
  assert.equal(again.login?.session, 'reused');
  assert.deepEqual(await writes(), []);
});

test('with save_session false nothing is written to disk', { timeout: 60_000 }, async () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-auth-'));
  const model = await crawler({ max_pages: 2, login: { mode: 'auto', save_session: false } }, authDir).crawl({
    baseUrl: urls.ui,
  });
  assert.equal(model.login?.session, 'new');
  assert.deepEqual(fs.readdirSync(authDir), []);
});

test('a sign-in page without credentials or a terminal is blocked with the ways to sign in', {
  timeout: 60_000,
}, async () => {
  const c = new PlaywrightCrawler({
    app: { base_url: urls.ui, settle_ms: 100, login: { mode: 'auto' } },
    projectDir: ROOT,
    authDir: null,
    credentials: {},
  });
  await assert.rejects(c.crawl({ baseUrl: urls.ui }), {
    name: 'BlockedError',
    message: /no username.*--login-mode manual.*DSM_APP_USERNAME/,
  });
});
