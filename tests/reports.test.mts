/** Reports and feedback (0.4.0): inputs on disk -> self-contained HTML and feedback JSON, through the real CLI. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { propose } from '../plugin/src/feedback/feedback.mts';
import { buildReports } from '../plugin/src/reports/build.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import type { Plan, Verdict } from '../plugin/src/shared/models.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HEAD = 'abcdef0123456789abcdef0123456789abcdef01';

const tc = (id: number, title: string) => ({ id, title, url: `https://ado.test/${id}`, tags: [], automatedTest: null });
const plan: Plan = {
  id: 'p1',
  createdAt: '2026-11-04T10:00:00Z',
  change: { base: 'b'.repeat(40), head: HEAD, branch: 'feat/cart', files: [{ path: 'site/cart.js', status: 'M' }] },
  items: [
    { testCase: tc(1, 'Add to cart'), reasons: [], selected: true },
    { testCase: tc(2, 'Checkout total'), reasons: [], selected: true },
    { testCase: tc(3, 'Flaky coupon'), reasons: [], selected: true },
  ],
  notRun: [
    { testCase: tc(4, 'Manual refund'), why: 'no automated test', broken: false },
    { testCase: tc(5, 'Gone script'), why: 'bdd:@TC-5 is not in the test root', broken: true },
  ],
  gaps: [{ screen: '/cart', files: ['site/cart.js'], why: 'no published test case visits this screen' }],
  catalogSize: 5,
  otherGroups: {},
  approvedBy: 'ada@example.test',
};
const verdict: Verdict = {
  result: 'fail',
  head: HEAD,
  planId: 'p1',
  reasons: ['TC2 failed.', 'TC5: bdd:@TC-5 is not in the test root.'],
  warnings: ['TC3 is flaky: failed, then passed on retry.'],
  results: [
    { testCaseId: 1, status: 'passed', durationS: 1.2, testIds: ['a'], evidence: [] },
    {
      testCaseId: 2,
      status: 'failed',
      durationS: 3,
      error: 'Expected total 10, got 12 <script>',
      testIds: ['b'],
      evidence: ['.qamaster/evidence/x/b.png'],
    },
    { testCaseId: 3, status: 'flaky', durationS: 2, testIds: ['c'], evidence: [] },
  ],
};
const runCases = [
  {
    id: 'TC-CART-001',
    title: 'Add item',
    priority: 'P1',
    steps: [{ screen: '/cart', action: 'Click Add', expected: 'Item shown' }],
  },
  {
    id: 'TC-CART-002',
    title: 'Old page',
    steps: [
      { screen: '/old-page', action: 'Open', expected: 'Opens' },
      { screen: '/cart', leads_to: '/gone', action: 'Go', expected: 'x' },
    ],
  },
];

function write(dir: string, file: string, data: unknown) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data));
}

/** One folder serving as app repo and QA project. `with` picks the inputs that exist. */
function project(withs: ('verdict' | 'runs' | 'dsm')[] = ['verdict', 'runs', 'dsm']): string {
  const dir = tmpDir('qam-reports-');
  write(dir, 'config/qamaster.json', {});
  if (withs.includes('verdict')) {
    write(dir, `.qamaster/verdicts/${HEAD}.json`, verdict);
    write(dir, '.qamaster/plans/p1.json', plan);
  }
  if (withs.includes('runs')) {
    write(dir, 'testgen/output/run1/testcases.json', runCases);
    write(dir, '.qamaster/ledger.json', {
      store: 'File store',
      entries: [
        {
          localId: 'TC-CART-001',
          trackerId: 1,
          hash: 'h',
          ownedTags: [],
          smokeDeclined: false,
          publishedAt: 'x',
          trackerRev: 1,
        },
      ],
    });
  }
  if (withs.includes('dsm'))
    write(dir, 'dsm/dsm.json', {
      generated_at: '2026-11-04T09:00:00Z',
      stats: { pages: 2, page_relations: 1, elements: 3, element_relations: 0, cycles: 0, flags: {}, density: 0 },
      page: {
        nodes: [
          { id: '/cart', label: 'Cart', module: 'cart', flags: [], fan_in: 1, fan_out: 0 },
          { id: '/orphan', label: 'Orphan', module: 'misc', flags: ['orphan'], fan_in: 0, fan_out: 0 },
        ],
      },
    });
  return dir;
}
const cfg = (dir: string) => loadConfig(dir, {});
const qam = (dir: string, ...args: string[]) => spawnSync(QAM, ['--repo', dir, ...args], { encoding: 'utf8' });
const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, 'reports/output', f), 'utf8');

test('all builds the six reports as self-contained HTML', () => {
  const dir = project();
  const run = buildReports(cfg(dir), 'all');
  assert.deepEqual(run.written.map((w) => path.basename(w.file)).sort(), [
    'defect-report.html',
    'dsm-report.html',
    'root-cause-analysis-report.html',
    'test-case-report.html',
    'test-execution-report.html',
    'test-summary-report.html',
  ]);
  assert.equal(run.missing.length, 0);
  for (const w of run.written) {
    const html = fs.readFileSync(w.file, 'utf8');
    assert.match(html, /prefers-color-scheme: ?dark/);
    assert.match(html, /name="viewport"/);
    assert.doesNotMatch(html, /<script[^>]*\ssrc=|<link[^>]*href=|fetch\(|XMLHttpRequest|@import|url\(http/);
  }
});

test('the test summary shows every outcome, escapes errors and links evidence', () => {
  const dir = project();
  buildReports(cfg(dir), 'summary');
  const html = read(dir, 'test-summary-report.html');
  for (const word of [
    'Passed',
    'Failed',
    'Flaky',
    'BROKEN',
    'Manual',
    'Manual refund',
    'Gone script',
    'Checkout total',
  ])
    assert.ok(html.includes(word), word);
  assert.ok(html.includes('Expected total 10, got 12 &#60;script&#62;'));
  assert.ok(!html.includes('<script>Expected'));
  assert.match(html, /href="file:\/\/[^"]*b\.png"/);
  assert.ok(html.includes('No feedback saved'));
});

test('missing inputs are named: no verdict blocks summary, defects and execution; the others still build', () => {
  const dir = project(['runs']);
  const r = qam(dir, 'report', 'summary');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No verdict yet/);
  const all = qam(dir, '--json', 'report', 'all');
  assert.equal(all.status, 0);
  const out = JSON.parse(all.stdout);
  assert.deepEqual(
    out.written.map((w: { type: string }) => w.type),
    ['test-cases'],
  );
  assert.deepEqual(
    out.missing.map((m: { type: string }) => m.type),
    ['summary', 'execution', 'defects', 'root-cause', 'dsm'],
  );
  assert.equal(qam(dir, 'report', 'dsm').status, 2);
  assert.equal(qam(dir, 'report', 'manual').status, 0);
  assert.equal(qam(dir, 'report', 'nonsense').status, 2);
  assert.equal(qam(project([]), 'report', 'all').status, 2);
});

test('feedback proposes gaps, stale cases, BROKEN links and defect drafts', () => {
  const dir = project();
  const fb = propose({
    verdict,
    plan,
    runs: [{ run: 'run1', cases: runCases }],
    ledger: new Map([['TC-CART-002', 2]]),
    screens: ['/cart'],
    now: new Date('2026-11-04T12:00:00Z'),
  });
  assert.deepEqual(
    fb.gaps.map((g) => g.screen),
    ['/cart'],
  );
  assert.deepEqual(
    fb.stale.map((s) => [s.localId, s.missing]),
    [['TC-CART-002', ['/gone', '/old-page']]],
  );
  assert.deepEqual(
    fb.broken.map((b) => b.testCaseId),
    [5],
  );
  assert.equal(fb.defects.length, 1);
  const d = fb.defects[0];
  assert.equal(d.testCaseId, 2);
  assert.match(d.title, /Checkout total fails on abcdef01/);
  assert.match(d.actual, /got 12/);
  assert.deepEqual(d.evidence, ['.qamaster/evidence/x/b.png']);
  assert.equal(d.steps.length, 2);
  assert.ok(fb.proposal.length === 4);
  assert.equal(dir.length > 0, true);
});

test('without a DSM or plan, feedback says what it could not check', () => {
  const fb = propose({ verdict, plan: null, runs: [], ledger: new Map(), screens: null });
  assert.equal(fb.notes.length, 2);
  assert.deepEqual(fb.stale, []);
  assert.equal(fb.defects.length, 1);
});

test('qam feedback writes reports/data JSON, picks a verdict by sha, and the summary shows it', () => {
  const dir = project();
  const r = qam(dir, 'feedback');
  assert.equal(r.status, 0, r.stderr);
  const file = path.join(dir, `reports/data/feedback-${HEAD}.json`);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).head, HEAD);
  assert.equal(qam(dir, 'feedback', 'abcdef01', '--json').status, 0);
  const miss = qam(dir, 'feedback', 'deadbeef');
  assert.equal(miss.status, 2);
  assert.match(miss.stderr, /No verdict for commit deadbeef/);
  buildReports(cfg(dir), 'summary');
  const html = read(dir, 'test-summary-report.html');
  assert.ok(html.includes('Feedback: proposals only'));
  assert.ok(html.includes('/old-page'));
  assert.equal(qam(project([]), 'feedback').status, 2);
});

test('the onboarding stage turns done once a test summary report exists', () => {
  const dir = project();
  const status = () => JSON.parse(qam(dir, '--json', 'pipeline', 'status').stdout);
  const stage = (s: { stages?: { stage: string; status: string }[] }) => s.stages?.find((x) => x.stage === 'reports');
  const before = stage(status());
  buildReports(cfg(dir), 'summary');
  const after = stage(status());
  assert.equal(before?.status, 'pending');
  assert.equal(after?.status, 'done');
});
