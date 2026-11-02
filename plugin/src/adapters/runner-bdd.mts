/**
 * The playwright-bdd runner (Q20, tech.md Runners), in the automation folder with its own node_modules:
 *   collected()  `bddgen`, then `playwright test --list --reporter=json`; each scenario's @TC tag gives bdd:@TC-<id>
 *   run()        `playwright test --grep <the selected tags> --reporter=json --output <evidence> --retries 0`
 * Retries are the gate's. A test case passes only if every scenario tagged with it passed, in every project. The
 * screenshot, video and trace of a failed scenario come from the JSON reporter's attachments.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';
import type { TestResult, TestStatus } from '../shared/models.mts';
import type { Runner } from './base.mts';

const PREFIX = 'bdd:@';
const OK_EXIT = new Set([0, 1]);

type Result = { status: string; duration: number; error?: { message?: string }; attachments?: { path?: string }[] };
type Spec = { title: string; tags?: string[]; tests: { results: Result[] }[] };
type Suite = { specs?: Spec[]; suites?: Suite[] };

const specs = (s: Suite): Spec[] => [...(s.specs ?? []), ...(s.suites ?? []).flatMap(specs)];
/** A spec's TC tags, with the @ Playwright drops from tags. */
const tcTags = (s: Spec) => (s.tags ?? []).map((t) => t.replace(/^@/, '')).filter((t) => t.startsWith('TC-'));
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips the ANSI colours from Playwright's errors
const plain = (t: string) => t.replace(/\x1b\[[0-9;]*m/g, '');

export class PlaywrightBddRunner implements Runner {
  /** `npx` overrides the command (tests). */
  private readonly npx: string;

  constructor(npx = 'npx') {
    this.npx = npx;
  }

  private exec(root: string, args: string[], json?: string): string {
    if (!fs.existsSync(path.join(root, 'node_modules', 'playwright-bdd')))
      throw new BlockedError(
        `playwright-bdd isn't installed in ${root}. Run npm install there (it downloads @playwright/test and playwright-bdd from the npm registry), then run again.`,
      );
    const r = spawnSync(this.npx, ['--no-install', ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, ...(json ? { PLAYWRIGHT_JSON_OUTPUT_NAME: json } : {}) },
    });
    const tail = plain(`${r.stdout ?? ''}\n${r.stderr ?? ''}`)
      .trim()
      .slice(-1500);
    if (r.error) throw new BlockedError(`Couldn't start ${this.npx} in ${root}: ${r.error.message}`);
    if (r.status === null || !OK_EXIT.has(r.status))
      throw new BlockedError(`${args.slice(0, 2).join(' ')} exited with code ${r.status}:\n${tail}`);
    if (json && !fs.existsSync(json)) throw new BlockedError(`Playwright wrote no report in ${root}:\n${tail}`);
    return json ? fs.readFileSync(json, 'utf8') : '';
  }

  private report(root: string, args: string[]): Suite[] {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-bdd-'));
    try {
      this.exec(root, ['bddgen']);
      return (
        JSON.parse(this.exec(root, ['playwright', 'test', ...args, '--reporter=json'], path.join(tmp, 'r.json'))) as {
          suites: Suite[];
        }
      ).suites;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  async collected(root: string): Promise<string[]> {
    return [
      ...new Set(
        this.report(root, ['--list'])
          .flatMap(specs)
          .flatMap(tcTags)
          .map((t) => PREFIX + t),
      ),
    ];
  }

  async run(selection: Map<number, string[]>, root: string, evidence: string): Promise<TestResult[]> {
    const tags = [...new Set([...selection.values()].flat().map((id) => id.slice(PREFIX.length)))];
    const all = tags.length
      ? this.report(root, [
          `--grep=(${tags.map((t) => `@${t}`).join('|')})(?![\\w-])`,
          `--output=${evidence}`,
          '--retries=0',
        ]).flatMap(specs)
      : [];
    return [...selection].map(([testCaseId, ids]) => {
      const wanted = new Set(ids.map((id) => id.slice(PREFIX.length)));
      const results = all
        .filter((s) => tcTags(s).some((t) => wanted.has(t)))
        .flatMap((s) => s.tests.map((t) => ({ s, r: t.results.at(-1) })));
      return aggregate(testCaseId, results, ids);
    });
  }
}

function aggregate(testCaseId: number, results: { s: Spec; r: Result | undefined }[], ids: string[]): TestResult {
  const ran = results.filter((x): x is { s: Spec; r: Result } => !!x.r);
  if (!ran.length)
    return {
      testCaseId,
      status: 'not_run',
      durationS: 0,
      error: 'No scenario ran for this test case.',
      testIds: [],
      evidence: [],
    };
  const statuses = new Set(ran.map((x) => x.r.status));
  const failed = ran.filter((x) => ['failed', 'timedOut', 'interrupted'].includes(x.r.status));
  const status: TestStatus = failed.length
    ? 'failed'
    : statuses.size === 1 && statuses.has('skipped')
      ? 'skipped'
      : 'passed';
  const errors = failed.map((x) => `${x.s.title}\n${plain(x.r.error?.message ?? 'failed')}`);
  return {
    testCaseId,
    status,
    durationS: Math.round(ran.reduce((n, x) => n + x.r.duration, 0) / 10) / 100,
    ...(errors.length ? { error: errors.join('\n\n') } : {}),
    testIds: ids,
    evidence: failed.flatMap((x) =>
      (x.r.attachments ?? []).map((a) => a.path).filter((p): p is string => !!p && !p.endsWith('.md')),
    ),
  };
}
