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

const PREFIX = 'pytest:';
const SHIM_DIR = path.resolve(import.meta.dirname, '..', '..', 'runners', 'pytest');
const OK_EXIT = new Set([0, 1, 5]);

type Reported = { nodeid: string; outcome: string; duration: number; error: string | null; evidence?: string[] };

export class PytestRunner implements Runner {
  private readonly command?: string[];

  /** `command` overrides the uv / python choice (tests). */
  constructor(command?: string[]) {
    this.command = command;
  }

  private pytest(root: string, args: string[], want: string): string {
    const cmd =
      this.command ??
      (fs.existsSync(path.join(root, 'uv.lock')) ? ['uv', 'run', 'pytest'] : ['python3', '-m', 'pytest']);
    const env = { ...process.env, PYTHONPATH: [SHIM_DIR, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) };
    const r = spawnSync(cmd[0], [...cmd.slice(1), '-p', 'qamaster_pytest', ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().slice(-1500);
    if (r.error)
      throw new BlockedError(
        `Couldn't start the test runner \`${cmd.join(' ')}\` in ${root}: ${r.error.message}. Install it (uv sync, or pip's pytest in the project's environment), then run again.`,
      );
    if (r.status === null || !OK_EXIT.has(r.status))
      throw new BlockedError(`pytest exited with code ${r.status}:\n${tail}`);
    // exit 1 is also what `python -m pytest` gives when pytest isn't installed: then there is no report
    if (!fs.existsSync(want))
      throw new BlockedError(`pytest didn't run in ${root} (is it installed in the project's environment?):\n${tail}`);
    return fs.readFileSync(want, 'utf8');
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
