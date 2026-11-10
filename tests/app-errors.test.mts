/**
 * Q53 (0.6.0 item 4): the playwright-bdd framework's fixture fails a passing case when the app answered 5xx or the
 * page threw. The recording lives in framework/playwright-bdd/src/app-errors.ts with no Playwright import, so a fake
 * page drives it here. The framework's folder is CommonJS (Playwright's config uses __dirname), so the file is loaded
 * from a copy named .mts.
 */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tmpDir } from './tmp.mts';

type AppError =
  | { kind: 'request'; method: string; url: string; status: number; body: string }
  | { kind: 'page'; message: string };
type Watch = { finish(): Promise<AppError[]>; describe(e: AppError[]): string };
const copy = path.join(tmpDir('qam-app-errors-'), 'app-errors.mts');
fs.copyFileSync(path.resolve(import.meta.dirname, '../plugin/framework/playwright-bdd/src/app-errors.ts'), copy);
const { parseAllow, watchApp } = (await import(copy)) as {
  parseAllow(raw: string | undefined): string[];
  watchApp(page: unknown, origins: string[], allow: string[]): Watch;
};

type Fake = { url: string; status: number; method?: string; body?: string };
const response = ({ url, status, method = 'GET', body = '' }: Fake) => ({
  url: () => url,
  status: () => status,
  request: () => ({ method: () => method }),
  text: async () => body,
});

function page() {
  const p = new EventEmitter();
  return Object.assign(p, {
    respond: (r: Fake) => p.emit('response', response(r)),
    throwError: (message: string) => p.emit('pageerror', new Error(message)),
  });
}

const APP = ['http://localhost:3000'];

test('a 5xx from the app origin is recorded with method, url, status and body', async () => {
  const p = page();
  const w = watchApp(p, APP, []);
  p.respond({ url: 'http://localhost:3000/api/orders?id=1', status: 500, method: 'POST', body: '{"detail":"boom"}' });
  const found = await w.finish();
  assert.equal(found.length, 1);
  assert.deepEqual(found[0], {
    kind: 'request',
    method: 'POST',
    url: 'http://localhost:3000/api/orders?id=1',
    status: 500,
    body: '{"detail":"boom"}',
  });
  assert.match(w.describe(found), /POST http:\/\/localhost:3000\/api\/orders\?id=1 answered 500/);
  assert.match(w.describe(found), /boom/);
});

test('4xx, 2xx and other origins are not recorded', async () => {
  const p = page();
  const w = watchApp(p, APP, []);
  p.respond({ url: 'http://localhost:3000/missing', status: 404 });
  p.respond({ url: 'http://localhost:3000/ok', status: 200 });
  p.respond({ url: 'https://analytics.example.com/t', status: 503 });
  assert.deepEqual(await w.finish(), []);
});

test('an uncaught page error is recorded with its message', async () => {
  const p = page();
  const w = watchApp(p, APP, []);
  p.throwError('Cannot read properties of undefined');
  const found = await w.finish();
  assert.deepEqual(found, [{ kind: 'page', message: 'Cannot read properties of undefined' }]);
  assert.match(w.describe(found), /Cannot read properties of undefined/);
});

test('allow-list strings match the url or the message; nothing is allowed by default', async () => {
  const p = page();
  const w = watchApp(p, APP, ['/api/telemetry', 'ResizeObserver loop']);
  p.respond({ url: 'http://localhost:3000/api/telemetry', status: 502 });
  p.respond({ url: 'http://localhost:3000/api/orders', status: 500 });
  p.throwError('ResizeObserver loop limit exceeded');
  p.throwError('real bug');
  const found = await w.finish();
  assert.deepEqual(
    found.map((e) => (e.kind === 'request' ? e.url : e.message)),
    ['http://localhost:3000/api/orders', 'real bug'],
  );
});

test('a long body is cut, and an unreadable body does not hide the error', async () => {
  const p = page();
  const w = watchApp(p, APP, []);
  p.respond({ url: 'http://localhost:3000/a', status: 500, body: 'x'.repeat(5000) });
  p.emit('response', {
    ...response({ url: 'http://localhost:3000/b', status: 500 }),
    text: async () => Promise.reject(new Error('gone')),
  });
  const [a, b] = await w.finish();
  assert.ok(a.kind === 'request' && a.body.length < 1100);
  assert.ok(b.kind === 'request' && b.body === '');
});

test('parseAllow reads a JSON list of strings; anything else is nothing allowed', () => {
  assert.deepEqual(parseAllow('["a","b"]'), ['a', 'b']);
  assert.deepEqual(parseAllow(undefined), []);
  assert.deepEqual(parseAllow('not json'), []);
  assert.deepEqual(parseAllow('[1,"a"]'), []);
});

// The plan's check, end to end: the real fixture under Playwright, run by QAMaster's runner against an app that answers
// 500 on one call. Needs @playwright/test and playwright-bdd in npm's cache (installed offline, never downloaded) and
// Chromium; skipped otherwise.
const FRAMEWORK = path.resolve(import.meta.dirname, '../plugin/framework/playwright-bdd');
const APP_SERVER = `
const http = require('node:http');
const page = (api) => '<p id="s">loading</p><script>fetch("' + api + '").then(() => { s.textContent = "loaded"; })</script>';
const server = http.createServer((req, res) => {
  if (req.url === '/boom') return res.end(page('/api/boom'));
  if (req.url === '/telemetry') return res.end(page('/api/telemetry'));
  if (req.url.startsWith('/api/')) { res.statusCode = 500; return res.end('boom detail'); }
  res.statusCode = 404; res.end();
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`;

function installedFramework(): string | null {
  const dir = tmpDir('qam-app-errors-e2e-');
  fs.cpSync(FRAMEWORK, dir, { recursive: true });
  const npm = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (npm.status !== 0) return null;
  const probe = "require('@playwright/test').chromium.launch().then((b) => b.close(), () => process.exit(1))";
  return spawnSync(process.execPath, ['-e', probe], { cwd: dir }).status === 0 ? dir : null;
}

test('end to end: a passing scenario fails on the app 500 with the request in the evidence; an allowed URL passes', async (t) => {
  const dir = installedFramework();
  if (!dir) return t.skip('@playwright/test, playwright-bdd or Chromium not available offline');
  const server = spawn(process.execPath, ['-e', APP_SERVER], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  const [port] = (await once(server.stdout, 'data')).map((d: Buffer) => d.toString().trim());
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify({ name: 'Shop', webUrl: `http://127.0.0.1:${port}` }));
  fs.writeFileSync(
    path.join(dir, 'features/web/home.feature'),
    `Feature: Home

  @TC-1 @web
  Scenario: The page that calls a failing API
    Given I open the path "/boom"
    Then I should see the text "loaded"

  @TC-2 @web
  Scenario: The page that calls an allowed failing API
    Given I open the path "/telemetry"
    Then I should see the text "loaded"
`,
  );
  const { PlaywrightBddRunner } = await import('../plugin/src/adapters/runner-bdd.mts');
  const evidence = path.join(dir, 'evidence');
  const [boom, telemetry] = await new PlaywrightBddRunner('npx', ['/api/telemetry']).run(
    new Map([
      [1, ['bdd:@TC-1']],
      [2, ['bdd:@TC-2']],
    ]),
    dir,
    evidence,
  );
  assert.equal(boom.status, 'failed');
  assert.match(boom.error ?? '', /The app reported an error during this case/);
  assert.match(boom.error ?? '', /GET http:\/\/127\.0\.0\.1:\d+\/api\/boom answered 500:\nboom detail/);
  const file = boom.evidence.find((e) => path.basename(e).startsWith('app-errors'));
  assert.ok(file, `app-errors.json in the evidence: ${boom.evidence.join(', ')}`);
  const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(recorded[0], {
    kind: 'request',
    method: 'GET',
    url: `http://127.0.0.1:${port}/api/boom`,
    status: 500,
    body: 'boom detail',
  });
  assert.equal(telemetry.status, 'passed', telemetry.error);
});
