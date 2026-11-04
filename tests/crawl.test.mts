import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import { build } from '../plugin/src/dsm/build.mts';
import {
  blocks,
  type CrawlApp,
  isBrowserClosedError,
  isSignInPage,
  mergeIncremental,
  progressLine,
  Routes,
} from '../plugin/src/dsm/crawl-rules.mts';
import type { UiModel } from '../plugin/src/shared/models.mts';
import { tmpDir } from './tmp.mts';

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
  const authDir = tmpDir('qam-auth-');
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
  const authDir = tmpDir('qam-auth-');
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

// From the Toolshop run (T1): /account/profile has a change-password form, and it was taken for a sign-in page.
test('0.3.2 T1: a page with several password fields (change password) is not a sign-in page, off the sign-in route', () => {
  const one = { password: true, passwords: 1, userOnly: false, otp: false, message: '' };
  const change = { ...one, passwords: 2 };
  assert.equal(isSignInPage(change, '/account/profile', '/auth/login'), false, 'current + new password');
  assert.equal(
    isSignInPage({ ...one, passwords: 3 }, '/account/profile', null),
    false,
    'also before the route is known',
  );
  assert.equal(
    isSignInPage(one, '/account/profile', '/auth/login'),
    true,
    'one password field: session expired, form shown in place',
  );
  assert.equal(isSignInPage(change, '/auth/login', '/auth/login'), true, 'on the sign-in route it still is');
  assert.equal(isSignInPage(change, '/sign-in', null), true, 'a route named like sign-in');
});

// ---- 0.4.0: forms without a <form> tag, a closed browser, 503, and the ETA

test('0.4.0 S6: the progress line shows pages queued and the minutes left from the average time per page', () => {
  assert.equal(
    progressLine({
      done: 39,
      queued: 87,
      maxPages: 300,
      elapsedMs: 39 * 6000,
      route: '/account/profile',
      detail: '200',
    }),
    '39/87 queued, ~5 min left /account/profile 200',
  );
  assert.match(
    progressLine({ done: 2, queued: 10, maxPages: 5, elapsedMs: 2000, route: '/a', detail: '200' }),
    /^2\/5 queued, ~1 min left \/a 200$/,
    'never queues past max_pages, and under a minute reads ~1',
  );
  assert.equal(
    progressLine({ done: 5, queued: 5, maxPages: 5, elapsedMs: 9000, route: '/z', detail: '200' }),
    '5/5 queued /z 200',
    'nothing left, no estimate',
  );
});

test('0.4.0 S5: a closed browser, page or context is recognised', () => {
  assert.equal(isBrowserClosedError(new Error('page.goto: Target page, context or browser has been closed')), true);
  assert.equal(isBrowserClosedError(new Error('browserContext.newPage: Browser has been closed')), true);
  assert.equal(isBrowserClosedError(new Error('page.goto: net::ERR_CONNECTION_REFUSED')), false);
});

test('0.4.0 K1: inputs outside a <form> reach the screen map as a form', { timeout: 60_000 }, async () => {
  const model = await crawler({ start_paths: ['/loose'], max_pages: 3 }).crawl({ baseUrl: urls.ui });
  const forms = model.pages.find((p) => p.route === '/loose')?.forms ?? [];
  assert.equal(forms.length, 1, 'one form for the loose inputs');
  assert.equal(forms[0].fields?.length, 3, 'search, quantity and sort');
  const dsm = build(model, null, { project: 'x' });
  const node = dsm.page.nodes.find((n) => n.id === '/loose');
  assert.equal(node?.counts.field, 3);
  assert.equal(node?.forms[0].fields.length, 3);
  assert.ok(dsm.element.nodes.some((n) => n.kind === 'field' && n.label === 'Search'));
});

test('0.4.0 K1: a page that needs sign-in and no .env.dsm warns once', { timeout: 60_000 }, async () => {
  const lines: string[] = [];
  const c = new PlaywrightCrawler({
    app: { base_url: urls.ui, settle_ms: 100, start_paths: ['/public'], max_pages: 4, login: { mode: 'auto' } },
    projectDir: ROOT,
    authDir: null,
    credentials: {},
    log: (l) => lines.push(l),
  });
  await c.crawl({ baseUrl: urls.ui });
  const warnings = lines.filter((l) => /sign-in.*\.env\.dsm/.test(l));
  assert.equal(warnings.length, 1, lines.join('\n'));
});

test('0.4.0: a page that answers 503 is retried with a back-off, and gives up after the cap', {
  timeout: 60_000,
}, async () => {
  const lines: string[] = [];
  const crawl = (path: string) =>
    new PlaywrightCrawler({
      app: { base_url: urls.ui, settle_ms: 50, max_pages: 1, start_paths: [path], login: { mode: 'none' } },
      projectDir: ROOT,
      authDir: null,
      credentials: {},
      retry503Ms: [10, 10, 10],
      log: (l) => lines.push(l),
    }).crawl({ baseUrl: urls.ui });
  const recovered = (await crawl('/flaky?key=a&fail=2')).pages[0];
  assert.equal(recovered.status, 200, 'two 503s, then the page');
  assert.match(lines.join('\n'), /503.*retry 1\/3/);
  const gaveUp = (await crawl('/flaky?key=b&fail=9')).pages[0];
  assert.equal(gaveUp.status, 503, 'still 503 after 3 retries, recorded as it is');
  assert.deepEqual(await writes(), [], 'read-only throughout');
});

// Playwright from a temp project whose chromium closes its first browser when /settings is opened, as the real one
// did after a sign-in timeout.
function closingPlaywright(): string {
  const dir = tmpDir('qam-pw-');
  const real = createRequire(path.join(ROOT, 'package.json')).resolve('playwright');
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  fs.mkdirSync(path.join(dir, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'node_modules/playwright/index.js'),
    `const real = require(${JSON.stringify(real)}); let launches = 0;
module.exports = { ...real, chromium: { launch: async (o) => { const b = await real.chromium.launch(o);
  if (++launches > 1) return b;
  const newContext = b.newContext.bind(b);
  b.newContext = async (...a) => { const c = await newContext(...a); const newPage = c.newPage.bind(c);
    c.newPage = async () => { const p = await newPage(); const goto = p.goto.bind(p);
      p.goto = async (u, ...r) => { if (/\\/settings/.test(u)) await b.close(); return goto(u, ...r); }; return p; };
    return c; };
  return b; } } };`,
  );
  return dir;
}

test('0.4.0 S5: a browser that closes mid-crawl is restarted, signed in again, and the queue carries on', {
  timeout: 120_000,
}, async () => {
  const lines: string[] = [];
  const model = await new PlaywrightCrawler({
    app: { base_url: urls.ui, settle_ms: 100, route_normalization: NORMALISE, login: { mode: 'auto' } },
    projectDir: closingPlaywright(),
    authDir: null,
    credentials: { username: 'qa@example.test', password: 'qa-password' },
    log: (l) => lines.push(l),
  }).crawl({ baseUrl: urls.ui });
  const byRoute = new Map(model.pages.map((p) => [p.route, p]));
  assert.equal(byRoute.get('/settings')?.error, null, 'the page that met the closed browser was crawled again');
  assert.ok(byRoute.has('/orders/:id') && byRoute.has('/notifications'), 'and the rest of the queue');
  assert.equal(model.browser_restarts, 1);
  assert.match(lines.join('\n'), /browser closed.*restart 1\/2/);
  assert.deepEqual(await writes(), [], 'still read-only after the restart (Q15)');
  assert.equal(build(model, null, { project: 'x' }).crawl.browser_restarts, 1);
});
