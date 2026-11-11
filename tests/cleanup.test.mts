/**
 * 0.8.0 item 10 (Q58, D20): a script undoes its test data. src/cleanup.ts has no Playwright import, so the engine's tests
 * drive it from a copy named .mts (the framework folder is CommonJS); the fixture is checked end to end under real
 * Playwright against an app that refuses to delete one record (skipped when the packages or Chromium aren't there).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { FRAMEWORK, installedFramework, write } from './framework-e2e.mts';
import { tmpDir } from './tmp.mts';

type Result = { label: string; ok: boolean; error?: string };
const copy = path.join(tmpDir('qam-cleanup-'), 'cleanup.mts');
fs.copyFileSync(path.join(FRAMEWORK, 'src/cleanup.ts'), copy);
const { createCleanup } = (await import(copy)) as {
  createCleanup(): {
    add(label: string, undo: () => unknown): void;
    run(): Promise<Result[]>;
    describe(r: Result[]): string;
  };
};

test('undos run newest first, once, and a second run has nothing left', async () => {
  const c = createCleanup();
  const order: string[] = [];
  c.add('first', () => order.push('first'));
  c.add('second', async () => order.push('second'));
  const r = await c.run();
  assert.deepEqual(order, ['second', 'first']);
  assert.deepEqual(r, [
    { label: 'second', ok: true },
    { label: 'first', ok: true },
  ]);
  assert.equal(c.describe(r), '');
  assert.deepEqual(await c.run(), []);
});

test('an undo that throws or rejects is reported with its label and reason, and the rest still run', async () => {
  const c = createCleanup();
  const ran: string[] = [];
  c.add('todo "A"', () => ran.push('A'));
  c.add('todo "B"', () => {
    throw new Error('DELETE /todos/2 answered 500');
  });
  c.add('todo "C"', () => Promise.reject('plain string'));
  const r = await c.run();
  assert.deepEqual(ran, ['A'], 'the undo after a failure still ran');
  assert.equal(
    c.describe(r),
    'left data on the test account: todo "C", todo "B"\n  todo "C": plain string\n  todo "B": DELETE /todos/2 answered 500',
  );
});

const APP_SERVER = `
const http = require('node:http');
const items = new Map(); let next = 1;
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/api/items') {
      const id = next++; items.set(id, JSON.parse(body).name); return res.end(JSON.stringify({ id }));
    }
    const m = /^\\/api\\/items\\/(\\d+)$/.exec(req.url);
    if (req.method === 'DELETE' && m) {
      if (items.get(Number(m[1])) === 'stuck') { res.statusCode = 409; return res.end('{}'); }
      items.delete(Number(m[1])); return res.end('{}');
    }
    if (req.url === '/api/items') return res.end(JSON.stringify([...items.values()]));
    res.end('<p>app</p>');
  });
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
`;

test('end to end: the cleanup fixture undoes what a step created; an undo that fails fails the case with cleanup.json', async (t) => {
  const dir = installedFramework('qam-cleanup-e2e-');
  if (!dir) return t.skip('@playwright/test, playwright-bdd or Chromium not available offline');
  const server = spawn(process.execPath, ['-e', APP_SERVER], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => server.kill());
  const [port] = (await once(server.stdout, 'data')).map((d: Buffer) => d.toString().trim());
  write(dir, {
    'app.json': JSON.stringify({ name: 'Shop', webUrl: `http://127.0.0.1:${port}` }),
    'steps/pages/items.page.steps.ts': `import { Given } from '../../src/fixtures';
Given('I create an item {string}', async ({ page, cleanup }, name: string) => {
  await page.goto('/');
  const made = await page.request.post('/api/items', { data: { name } });
  const { id } = await made.json();
  cleanup.add('item "' + name + '"', async () => {
    const gone = await page.request.delete('/api/items/' + id);
    if (!gone.ok()) throw new Error('DELETE /api/items/' + id + ' answered ' + gone.status());
  });
});
`,
    'features/web/items.feature': `@web
Feature: Items

  @TC-1
  Scenario: Creates one and undoes it
    Given I create an item "tidy"

  @TC-2
  Scenario: Creates one it cannot undo
    Given I create an item "stuck"
`,
  });
  const { PlaywrightBddRunner } = await import('../plugin/src/adapters/runner-bdd.mts');
  const [tidy, stuck] = await new PlaywrightBddRunner().run(
    new Map([
      [1, ['bdd:@TC-1']],
      [2, ['bdd:@TC-2']],
    ]),
    dir,
    path.join(dir, 'evidence'),
  );
  assert.equal(tidy.status, 'passed', tidy.error);
  assert.equal(stuck.status, 'failed');
  assert.match(stuck.error ?? '', /left data on the test account: item "stuck"/);
  assert.match(stuck.error ?? '', /DELETE \/api\/items\/\d+ answered 409/);
  const file = stuck.evidence.find((e) => path.basename(e).startsWith('cleanup'));
  assert.ok(file, `cleanup.json in the evidence: ${stuck.evidence.join(', ')}`);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')).map((r: Result) => [r.label, r.ok]),
    [['item "stuck"', false]],
  );
  const left = await (await fetch(`http://127.0.0.1:${port}/api/items`)).json();
  assert.deepEqual(left, ['stuck'], 'the undone one is gone; the one that could not be undone is what is left');
});
