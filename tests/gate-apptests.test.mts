/** 0.6.0 item 7 (R1, R4, R17): the app's own test suites are noticed, never run. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { findAppTests } from '../plugin/src/gate/apptests.mts';
import { tmpDir } from './tmp.mts';

function write(dir: string, files: Record<string, string>) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}

test('pytest, jest and vitest suites are found, with where and how many files', () => {
  const dir = tmpDir('qam-apptests-');
  write(dir, {
    'backend/tests/test_a.py': '',
    'backend/tests/test_b.py': '',
    'backend/tests/helpers.py': '',
    'frontend/package.json': JSON.stringify({ devDependencies: { vitest: '1' } }),
    'frontend/src/a.test.ts': '',
    'web/package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
    'web/src/b.spec.js': '',
    'web/node_modules/dep/c.test.js': '',
  });
  assert.deepEqual(findAppTests(dir), [
    'pytest: 2 test files in backend/tests',
    'vitest: 1 test file in frontend',
    'jest: 1 test file in web',
  ]);
});

test('no suite means an empty list; playwright specs without jest or vitest are not counted', () => {
  const dir = tmpDir('qam-apptests-');
  write(dir, {
    'e2e/package.json': JSON.stringify({ devDependencies: { '@playwright/test': '1' } }),
    'e2e/a.spec.ts': '',
    'src/app.py': '',
  });
  assert.deepEqual(findAppTests(dir), []);
  assert.deepEqual(findAppTests(path.join(dir, 'missing')), []);
});

test('the plan names the suites and how to gate one', async () => {
  const { renderPlan } = await import('../plugin/src/cli/gate.mts');
  const plan = {
    id: 'ab',
    change: { branch: 'f', base: 'main', head: 'x', files: [] },
    items: [],
    notRun: [],
    gaps: [],
    catalogSize: 0,
    otherGroups: {},
    appTests: ['shop: pytest: 2 test files in backend/tests'],
  } as unknown as Parameters<typeof renderPlan>[0];
  const text = renderPlan(plan);
  assert.match(text, /The app's own tests exist, and the gate doesn't run them\n {2}shop: pytest: 2 test files/);
  assert.match(text, /link a test case to it as pytest:<file>::<test>/);
});

test('pytest suites in sibling folders are each counted', () => {
  const dir = tmpDir('qam-apptests-');
  write(dir, {
    'api/tests/test_a.py': '',
    'backend/tests/test_b.py': '',
    'backend/tests/unit/test_c.py': '',
  });
  assert.deepEqual(findAppTests(dir), ['pytest: 1 test file in api/tests', 'pytest: 2 test files in backend/tests']);
});

test('a jest or vitest file is counted once, under the nearest package.json and one tool', () => {
  const dir = tmpDir('qam-apptests-');
  write(dir, {
    'package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
    'a.test.js': '',
    'packages/ui/package.json': JSON.stringify({ devDependencies: { jest: '29' } }),
    'packages/ui/b.test.js': '',
    'packages/ui/c.test.js': '',
    'both/package.json': JSON.stringify({ devDependencies: { jest: '29', vitest: '1' } }),
    'both/d.test.ts': '',
  });
  assert.deepEqual(findAppTests(dir), [
    'jest: 1 test file in .',
    'vitest: 1 test file in both',
    'jest: 2 test files in packages/ui',
  ]);
});
