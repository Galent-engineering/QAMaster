/**
 * The pytest runner (Q20): runs the user's pytest suite with QAMaster's shim (plugin/runners/pytest/qamaster_pytest.py)
 * loaded through `-p`, so the tests need no markers and nothing is installed into the user's environment. Ported from
 * CheckMaster's pytest_runner.py. Test IDs carry the `pytest:` prefix (Q9). Retries are the gate's, so it runs once.
 *
 * `uv run pytest` when the test root has uv.lock, else `python3 -m pytest`. pytest's exit codes 0 (all passed),
 * 1 (some failed) and 5 (nothing collected) are results; anything else, or no report, blocks with pytest's output.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';
import type { TestResult, TestStatus } from '../shared/models.mts';
import type { Runner } from './base.mts';
import { setupProblem } from './runner-setup.mts';

const PREFIX = 'pytest:';
const SHIM_DIR = path.resolve(import.meta.dirname, '..', '..', 'runners', 'pytest');
const OK_EXIT = new Set([0, 1, 5]);
const UV = ['uv', 'run', '--no-sync', 'pytest'];
/** Starts Chromium through the tests' own Playwright, if they use it; prints "none" when they don't. */
const BROWSER_PROBE = [
  'import sys',
  'try:',
  '    from playwright.sync_api import sync_playwright',
  'except ImportError:',
  '    print("none")',
  '    sys.exit(0)',
  'with sync_playwright() as p:',
  '    p.chromium.launch().close()',
  'print("ok")',
].join('\n');

/** What to do when the runner's command itself is missing (Q41, F3). */
function notStarted(tool: string, root: string, why: string): string {
  const name = path.basename(tool);
  if (name === 'uv')
    return `uv isn't installed (the project in ${root} uses uv.lock). Install it (https://docs.astral.sh/uv/getting-started/installation/), run uv sync there, then run again.`;
  if (name === 'python3' || name === 'python')
    return `python3 isn't installed. Install Python 3, then pytest in the project's environment in ${root} (python3 -m pip install pytest), then run again.`;
  return `Couldn't start the test runner \`${tool}\` in ${root}: ${why}.`;
}

type Reported = { nodeid: string; outcome: string; duration: number; error: string | null; evidence?: string[] };

export class PytestRunner implements Runner {
  private readonly command?: string[];

  private uv(root: string): boolean {
    return !this.command && fs.existsSync(path.join(root, 'uv.lock'));
  }

  /** `command` overrides the uv / python choice (tests). */
  constructor(command?: string[]) {
    this.command = command;
  }

  private pytest(root: string, args: string[], want: string): string {
    const cmd = this.command ?? (this.uv(root) ? UV : ['python3', '-m', 'pytest']);
    // --no-sync and no Python downloads: a missing environment blocks with uv sync instead of downloading (Q41)
    const env = {
      ...process.env,
      UV_PYTHON_DOWNLOADS: 'never',
      PYTHONPATH: [SHIM_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    };
    const r = spawnSync(cmd[0], [...cmd.slice(1), '-p', 'qamaster_pytest', ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-1500);
    if (r.error) throw new BlockedError(notStarted(cmd[0], root, r.error.message));
    // uv --no-sync with no environment yet: uv made an empty one and can't find pytest in it
    if (cmd[0] === 'uv' && /Failed to spawn: `?pytest/.test(tail))
      throw new BlockedError(
        `The project's test environment in ${root} isn't set up. Run uv sync there (it downloads Python and the test dependencies), then run again.`,
      );
    if (r.status === null || !OK_EXIT.has(r.status))
      throw new BlockedError(`pytest exited with code ${r.status}:\n${tail}`);
    // exit 1 is also what `python -m pytest` gives when pytest isn't installed: then there is no report
    if (!fs.existsSync(want))
      throw new BlockedError(
        /No module named pytest/.test(tail)
          ? `pytest isn't installed in the project's environment in ${root}. Run uv add --dev pytest (uv), or python3 -m pip install pytest in that environment, then run again.`
          : `pytest didn't run in ${root}:\n${tail}`,
      );
    return fs.readFileSync(want, 'utf8');
  }

  /** For qam doctor: the environment and pytest start (collection), then Chromium launches if the tests use Playwright. */
  async check(root: string): Promise<{ check: string; ok: boolean; detail: string }[]> {
    let n: number;
    try {
      n = (await this.collected(root)).length;
    } catch (e) {
      if (!(e instanceof BlockedError)) throw e;
      return [{ check: 'pytest', ok: false, detail: e.message }];
    }
    const how = this.uv(root) ? 'uv run --no-sync pytest' : 'python3 -m pytest';
    const out = [{ check: 'pytest', ok: true, detail: `${how}: ${n} test${n === 1 ? '' : 's'} collected` }];
    const py = this.command
      ? [...this.command.slice(0, this.command.indexOf('-m') < 0 ? undefined : this.command.indexOf('-m'))]
      : this.uv(root)
        ? ['uv', 'run', '--no-sync', 'python']
        : ['python3'];
    const r = spawnSync(py[0], [...py.slice(1), '-c', BROWSER_PROBE], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, UV_PYTHON_DOWNLOADS: 'never' },
    });
    const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim();
    if (r.status === 0 && /^none$/m.test(text))
      out.push({ check: 'pytest browser', ok: true, detail: 'no Playwright in these tests: no browser needed' });
    else if (r.status === 0) out.push({ check: 'pytest browser', ok: true, detail: 'Chromium starts' });
    else
      out.push({
        check: 'pytest browser',
        ok: false,
        detail: setupProblem(text, 'python', root, this.uv(root)) ?? text.split('\n').slice(-3).join(' '),
      });
    return out;
  }

  async collected(root: string): Promise<string[]> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-pytest-'));
    try {
      const out = path.join(tmp, 'list.json');
      return (JSON.parse(this.pytest(root, ['--collect-only', '-q', `--qamaster-list=${out}`], out)) as string[]).map(
        (n) => PREFIX + n,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  async run(selection: Map<number, string[]>, root: string, evidence: string): Promise<TestResult[]> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-pytest-'));
    let tests: Reported[];
    try {
      const wanted = path.join(tmp, 'select.txt');
      fs.writeFileSync(
        wanted,
        [...selection.values()]
          .flat()
          .map((id) => id.slice(PREFIX.length))
          .join('\n'),
      );
      const out = path.join(tmp, 'report.json');
      tests = JSON.parse(
        this.pytest(
          root,
          [`--qamaster-select=${wanted}`, `--qamaster-report=${out}`, `--qamaster-evidence=${evidence}`],
          out,
        ),
      ).tests;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
    // a browser that isn't there, can't start, or finds no app is the machine's problem, not the tests' (Q41)
    const problem = setupProblem(tests.map((t) => t.error ?? '').join('\n'), 'python', root, this.uv(root));
    if (problem) throw new BlockedError(problem);
    return [...selection].map(([id, ids]) =>
      aggregate(
        id,
        tests.filter((t) => ids.includes(PREFIX + t.nodeid)),
        root,
      ),
    );
  }
}

/** A test case passes only if every test that automates it passed. */
function aggregate(testCaseId: number, tests: Reported[], root: string): TestResult {
  if (!tests.length)
    return {
      testCaseId,
      status: 'not_run',
      durationS: 0,
      error: 'No test ran for this test case.',
      testIds: [],
      evidence: [],
    };
  const outcomes = new Set(tests.map((t) => t.outcome));
  const status: TestStatus = outcomes.has('failed')
    ? 'failed'
    : outcomes.size === 1 && outcomes.has('skipped')
      ? 'skipped'
      : 'passed';
  const errors = tests.filter((t) => t.error).map((t) => `${t.nodeid}\n${t.error}`);
  return {
    testCaseId,
    status,
    durationS: Math.round(tests.reduce((s, t) => s + t.duration, 0) * 100) / 100,
    ...(errors.length ? { error: errors.join('\n\n') } : {}),
    testIds: tests.map((t) => PREFIX + t.nodeid),
    evidence: tests.flatMap((t) => (t.evidence ?? []).map((f) => path.relative(root, f).split(path.sep).join('/'))),
  };
}
