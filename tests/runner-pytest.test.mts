/**
 * The pytest runner and its shim (0.3.0 B6), ported from CheckMaster's tests/test_pytest_runner.py and
 * test_pytest_plugin.py, against real pytest. pytest comes from uv's cache (`uv run --offline --with pytest`), so the
 * test needs no network; it is skipped when uv or a cached pytest isn't there. Retries are the gate's now, so the
 * runner runs once.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { PytestRunner } from '../plugin/src/adapters/runner-pytest.mts';
import { tmpDir } from './tmp.mts';

const PYTEST = ['uv', 'run', '--offline', '--no-project', '--with', 'pytest', 'python', '-m', 'pytest'];
const skip =
  spawnSync(PYTEST[0], [...PYTEST.slice(1, -2), '-c', 'import pytest'], { encoding: 'utf8' }).status !== 0 &&
  'no cached pytest for uv';

const TESTS = `
import pytest

def test_pass():
    pass

def test_fail():
    assert False, "always broken"

@pytest.mark.skip(reason="not today")
def test_skip():
    pass

@pytest.mark.parametrize("n", [1, 2])
def test_cart(n):
    pass
`;
const FAKE_PLAYWRIGHT = `
import os
import pytest

def pytest_addoption(parser):
    parser.addoption("--output", default="test-results")
    for name in ("--screenshot", "--video", "--tracing"):
        parser.addoption(name, default="off")

@pytest.fixture
def output_path(pytestconfig, request):
    name = request.node.nodeid.replace("/", "-").replace("::", "-").replace(".", "-")
    return os.path.join(os.path.abspath(pytestconfig.getoption("--output")), name)
`;
const EVIDENCE_TESTS = `
from pathlib import Path

def shoot(output_path):
    Path(output_path).mkdir(parents=True)
    (Path(output_path) / "test-failed-1.png").write_bytes(b"png")

def test_passes(output_path):
    shoot(output_path)

def test_breaks(output_path, pytestconfig):
    shoot(output_path)
    assert pytestconfig.getoption("--screenshot") == "only-on-failure"
    assert False, "cart total is wrong"
`;

function suite(files: Record<string, string>) {
  const root = tmpDir('qam-pytest-');
  for (const [f, text] of Object.entries(files)) fs.writeFileSync(path.join(root, f), text);
  return { root, runner: new PytestRunner(PYTEST) };
}

test('collected lists every test, parametrized variants included, as pytest:<node id>', { skip }, async () => {
  const { root, runner } = suite({ 'test_suite.py': TESTS });
  assert.deepEqual(await runner.collected(root), [
    'pytest:test_suite.py::test_pass',
    'pytest:test_suite.py::test_fail',
    'pytest:test_suite.py::test_skip',
    'pytest:test_suite.py::test_cart[1]',
    'pytest:test_suite.py::test_cart[2]',
  ]);
});

test('run runs only the selection and gives one result per test case', { skip }, async () => {
  const { root, runner } = suite({ 'test_suite.py': TESTS });
  const selection = new Map([
    [1, ['pytest:test_suite.py::test_pass']],
    [2, ['pytest:test_suite.py::test_fail']],
    [3, ['pytest:test_suite.py::test_skip']],
    [4, ['pytest:test_suite.py::test_cart[1]', 'pytest:test_suite.py::test_cart[2]']],
    [5, []],
  ]);
  const results = new Map((await runner.run(selection, root, path.join(root, 'ev'))).map((r) => [r.testCaseId, r]));
  assert.deepEqual(Object.fromEntries([...results].map(([id, r]) => [id, r.status])), {
    1: 'passed',
    2: 'failed',
    3: 'skipped',
    4: 'passed',
    5: 'not_run',
  });
  assert.match(results.get(2)?.error ?? '', /always broken/);
  assert.deepEqual(results.get(4)?.testIds, [
    'pytest:test_suite.py::test_cart[1]',
    'pytest:test_suite.py::test_cart[2]',
  ]);
});

test('a failed test carries its Playwright evidence, relative to the test root', { skip }, async () => {
  const { root, runner } = suite({
    'playwright.py': FAKE_PLAYWRIGHT,
    'conftest.py': 'pytest_plugins = ["playwright"]\n',
    'test_cart.py': EVIDENCE_TESTS,
  });
  const selection = new Map([
    [1, ['pytest:test_cart.py::test_passes']],
    [2, ['pytest:test_cart.py::test_breaks']],
  ]);
  const results = await runner.run(selection, root, path.join(root, '.qamaster', 'evidence', 'attempt-1'));
  assert.deepEqual(results[0].evidence, []);
  assert.equal(results[1].status, 'failed');
  assert.deepEqual(results[1].evidence, ['.qamaster/evidence/attempt-1/test_cart-py-test_breaks/test-failed-1.png']);
});

test('pytest failing to start or crashing blocks, with its output', { skip }, async () => {
  const { root } = suite({ 'test_suite.py': 'import nothing_here\n' });
  await assert.rejects(new PytestRunner(PYTEST).collected(root), /pytest exited with code [24].*nothing_here/s);
  await assert.rejects(new PytestRunner(['no-such-pytest']).collected(root), /Couldn't start the test runner/);
});

// From the clean Docker run (F2): a browser that isn't installed failed every case; now it blocks with the command.
test('0.3.1 F2: a missing Playwright browser blocks the run with the install command', { skip }, async () => {
  const { root, runner } = suite({
    'test_ui.py':
      'def test_ui():\n    raise RuntimeError("BrowserType.launch: Executable doesn\'t exist at /x/chromium_headless_shell-1248/chrome-linux/headless_shell")\n',
  });
  await assert.rejects(
    runner.run(new Map([[1, ['pytest:test_ui.py::test_ui']]]), root, path.join(root, 'ev')),
    /Playwright's browser isn't installed .* Run python3 -m playwright install chromium there/,
  );
});

// From the clean Docker run (F5): uv fetched Python and the wheels during qam plan; now a missing environment blocks.
test('0.3.1 F5: with uv.lock and no environment, the runner blocks with uv sync and downloads nothing', {
  skip,
}, async () => {
  const root = tmpDir('qam-pytest-uv-');
  fs.writeFileSync(
    path.join(root, 'pyproject.toml'),
    '[project]\nname = "p"\nversion = "0"\nrequires-python = ">=3.14"\ndependencies = ["pytest==9.1.1"]\n',
  );
  const lock = spawnSync('uv', ['lock', '--offline', '-q'], { cwd: root, encoding: 'utf8' });
  assert.equal(lock.status, 0, lock.stderr);
  fs.writeFileSync(path.join(root, 'test_a.py'), 'def test_a():\n    pass\n');
  await assert.rejects(new PytestRunner().collected(root), /isn't set up\. Run uv sync there \(it downloads Python/);
  assert.equal(
    fs.existsSync(path.join(root, '.venv', 'lib')) &&
      fs.readdirSync(path.join(root, '.venv', 'lib')).length > 0 &&
      fs.existsSync(path.join(root, '.venv', 'bin', 'pytest')),
    false,
    'pytest was not installed',
  );
});

// F3: a missing tool says how to install it.
test('0.3.1 F3: a missing uv or python3 names how to install it', async () => {
  const root = tmpDir('qam-pytest-tools-');
  await assert.rejects(new PytestRunner(['/nonexistent/uv']).collected(root), /uv isn't installed .*docs\.astral\.sh/);
  await assert.rejects(new PytestRunner(['/nonexistent/python3']).collected(root), /python3 isn't installed/);
});

// From the 0.3.1 Docker re-run: with the project's Python missing, uv's own error came through raw.
test('0.3.1 F5: a missing Python for the project says to run uv sync', async () => {
  const bin = tmpDir('qam-fake-uv-');
  const uv = path.join(bin, 'uv');
  fs.writeFileSync(
    uv,
    "#!/bin/sh\necho 'error: No interpreter found for Python 3.12 in managed installations or search path' >&2\necho \"hint: A managed Python download is available for Python 3.12, but Python downloads are set to 'never'\" >&2\nexit 2\n",
  );
  fs.chmodSync(uv, 0o755);
  await assert.rejects(
    new PytestRunner([uv, 'run', '--no-sync', 'pytest']).collected(tmpDir('qam-pytest-nopy-')),
    /isn't set up\. Run uv sync there \(it downloads Python and the test dependencies\)/,
  );
});
