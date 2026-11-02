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
