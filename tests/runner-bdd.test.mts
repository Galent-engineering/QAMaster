/**
 * The playwright-bdd runner (0.3.0 C4) against Playwright's real JSON reports, recorded from a sample folder with
 * playwright-bdd 9 and Playwright 1.64.1 (tests/fixtures/bdd). A stub `npx` replays them, so the test needs no
 * packages; the live run is part of the end-to-end check.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PlaywrightBddRunner } from '../plugin/src/adapters/runner-bdd.mts';
import { tmpDir } from './tmp.mts';

const FIX = path.resolve(import.meta.dirname, 'fixtures/bdd');

/** A folder with node_modules/playwright-bdd and a stub npx that logs its arguments and replays a report. */
function folder(code = 1, runFixture = `${FIX}/run.json`, allowErrors: string[] = []) {
  const dir = tmpDir('qam-bdd-run-');
  fs.mkdirSync(path.join(dir, 'node_modules/playwright-bdd'), { recursive: true });
  const npx = path.join(dir, 'npx-stub.mjs');
  fs.writeFileSync(
    npx,
    `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(dir, 'env.log'))}, (process.env.QAMASTER_ALLOW_ERRORS ?? '-') + '\\n');
fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls.log'))}, JSON.stringify(args) + '\\n');
if (args[1] === 'bddgen') process.exit(0);
const list = args.includes('--list');
fs.copyFileSync(list ? ${JSON.stringify(FIX)} + '/list.json' : ${JSON.stringify(runFixture)}, process.env.PLAYWRIGHT_JSON_OUTPUT_NAME);
process.exit(list ? 0 : ${code});
`,
  );
  fs.chmodSync(npx, 0o755);
  const calls = () =>
    fs
      .readFileSync(path.join(dir, 'calls.log'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  const env = () => fs.readFileSync(path.join(dir, 'env.log'), 'utf8').trim().split('\n');
  return { dir, runner: new PlaywrightBddRunner(npx, allowErrors), calls, env };
}

test('collected: bddgen, then the list; every scenario tagged @TC-… is bdd:@TC-…', async () => {
  const { dir, runner, calls } = folder();
  assert.deepEqual(await runner.collected(dir), ['bdd:@TC-HOME-001', 'bdd:@TC-HOME-002']);
  assert.deepEqual(
    calls().map((a) => a.slice(1, 3)),
    [['bddgen'], ['playwright', 'test']],
  );
});

test('run: greps the selected tags, one result per case, with the error and evidence of the failed one', async () => {
  const { dir, runner, calls } = folder();
  const results = await runner.run(
    new Map([
      [1, ['bdd:@TC-HOME-001']],
      [2, ['bdd:@TC-HOME-002']],
      [3, ['bdd:@TC-HOME-099']],
    ]),
    dir,
    '/ev/attempt-1',
  );
  const run = calls().at(-1) ?? [];
  assert.ok(run.includes('--grep=(@TC-HOME-001|@TC-HOME-002|@TC-HOME-099)(?![\\w-])'), run.join(' '));
  assert.ok(run.includes('--output=/ev/attempt-1') && run.includes('--retries=0'));
  assert.deepEqual(
    results.map((r) => [r.testCaseId, r.status]),
    [
      [1, 'passed'],
      [2, 'failed'],
      [3, 'not_run'],
    ],
  );
  assert.match(results[1].error ?? '', /The home page shows a missing text\nError: expect\(locator\)\.toBeVisible\(\)/);
  assert.deepEqual(
    results[1].evidence.map((e) => path.basename(e)),
    ['test-failed-1.png', 'video.webm', 'trace.zip'],
  );
  assert.deepEqual(results[0].evidence, []);
});

test('no node_modules, or Playwright crashing, blocks with what to do', async () => {
  const bare = tmpDir('qam-bdd-bare-');
  await assert.rejects(
    new PlaywrightBddRunner().collected(bare),
    /playwright-bdd isn't installed in .*npm install there/,
  );
  const { dir, runner } = folder(2);
  await assert.rejects(
    runner.run(new Map([[1, ['bdd:@TC-HOME-001']]]), dir, '/ev'),
    /playwright test exited with code 2/,
  );
});

// From the clean Docker run (F2): a missing browser was reported as "new script failed"; now it blocks with the command.
test("0.3.1 F2: a scenario that couldn't launch the browser blocks the run with the install command", async () => {
  // the recorded report, with the failed scenario's error replaced by Playwright's missing-browser message
  const missing =
    "browserType.launch: Executable doesn't exist at /x/chromium_headless_shell-1248/chrome-linux/headless_shell";
  const swap = (o: unknown): unknown =>
    Array.isArray(o)
      ? o.map(swap)
      : o && typeof o === 'object'
        ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'message' ? missing : swap(v)]))
        : o;
  const report = JSON.stringify(swap(JSON.parse(fs.readFileSync(`${FIX}/run.json`, 'utf8'))));
  const variant = path.join(tmpDir('qam-bdd-fix-'), 'run.json');
  fs.writeFileSync(variant, report);
  assert.match(report, /Executable doesn't exist/);
  const { dir, runner } = folder(1, variant);
  await assert.rejects(
    runner.run(new Map([[2, ['bdd:@TC-HOME-002']]]), dir, '/ev'),
    /Playwright's browser isn't installed .* Run npx playwright install chromium there/,
  );
});

// Q53: the framework's fixture reads the gate's allow-list from QAMASTER_ALLOW_ERRORS, set for the run only
test('run: hands gate.allowErrors to the framework as JSON; nothing when none is set', async () => {
  const sel = new Map([[1, ['bdd:@TC-HOME-001']]]);
  const none = folder();
  await none.runner.run(sel, none.dir, '/ev');
  assert.equal(none.env().at(-1), '[]');
  const some = folder(1, `${FIX}/run.json`, ['/api/telemetry', 'ResizeObserver']);
  await some.runner.run(sel, some.dir, '/ev');
  assert.equal(some.env().at(-1), '["/api/telemetry","ResizeObserver"]');
  assert.equal(process.env.QAMASTER_ALLOW_ERRORS, undefined);
});

test('the registry gives the runner the project config allow-list', async () => {
  const { buildRunner } = await import('../plugin/src/adapters/registry.mts');
  const { loadConfig } = await import('../plugin/src/shared/config.mts');
  const qa = tmpDir('qam-bdd-allow-');
  fs.mkdirSync(path.join(qa, 'config'));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), JSON.stringify({ gate: { allowErrors: ['/health'] } }));
  const runner = buildRunner(loadConfig(qa, {})) as unknown as { allowErrors: string[] };
  assert.deepEqual(runner.allowErrors, ['/health']);
});
