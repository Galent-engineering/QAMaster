/**
 * Q53 (0.6.0 item 4): the playwright-bdd framework's fixture fails a passing case when the app answered 5xx or the
 * page threw. The recording lives in framework/playwright-bdd/src/app-errors.ts with no Playwright import, so a fake
 * page drives it here.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { parseAllow, watchApp } from '../plugin/framework/playwright-bdd/src/app-errors.ts';

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
