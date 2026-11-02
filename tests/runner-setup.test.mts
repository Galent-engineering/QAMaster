/**
 * Runner setup problems (Q41; 0.3.1 F2): told apart from test failures, with the command that fixes them. The messages
 * are Playwright's own, as seen in the clean Docker run.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupProblem } from '../plugin/src/adapters/runner-setup.mts';

const MISSING = `BrowserType.launch: Executable doesn't exist at /home/node/.cache/ms-playwright/chromium_headless_shell-1248/chrome-linux/headless_shell
╔════╗
║ Looks like Playwright was just installed or updated. ║
║ Please run the following command to download new browsers: ║`;
const LIBS =
  'browserType.launch: Target page, context or browser has been closed\n/home/node/.cache/ms-playwright/chromium_headless_shell-1248/chrome-linux/headless_shell: error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file: No such file or directory';
const REFUSED = 'Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/#/about\nCall log:';

test('a missing browser names the install command for the runner', () => {
  assert.match(setupProblem(MISSING, 'node', '/qa/App') ?? '', /Run npx playwright install chromium there/);
  assert.match(setupProblem(MISSING, 'python', '/app', true) ?? '', /Run uv run playwright install chromium there/);
  assert.match(setupProblem(MISSING, 'python', '/app') ?? '', /python3 -m playwright install chromium/);
});

test('missing system libraries name the library and install-deps', () => {
  assert.match(
    setupProblem(LIBS, 'python', '/app') ?? '',
    /\(libglib-2\.0\.so\.0\)\. Run sudo npx playwright install-deps chromium/,
  );
});

test('a refused connection names the app URL', () => {
  assert.match(setupProblem(REFUSED, 'node', '/qa/App') ?? '', /The app at http:\/\/localhost:3000\/ didn't answer/);
});

test('a real assertion failure is not a setup problem', () => {
  assert.equal(
    setupProblem("Error: expect(locator).toHaveText(expected)\nExpected: '18.00'\nReceived: '16.00'", 'node', '/qa'),
    null,
  );
});
