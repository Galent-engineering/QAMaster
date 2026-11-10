/**
 * The gate's plan, approve and run (0.3.0 B4, B5), ported from CheckMaster's tests/test_pipeline.py, against the fakes.
 * New here: the runner is picked for each case from its link's prefix (Q38), retries live in the gate around any
 * runner, approval is bound to the QA project's commit too (Q22), and the DSM selects and reports gaps.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Runner } from '../plugin/src/adapters/base.mts';
import { approve, type Gate, makePlan, runPlan } from '../plugin/src/gate/gate.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { TestResult } from '../plugin/src/shared/models.mts';
import { CHANGE, FakeRepoReader, FakeRunner, FakeStore, item, PLAN, TEST_CASES } from './fakes.mts';

function gate(more: Partial<Gate> & { failing?: Set<number> } = {}) {
  const bdd = new FakeRunner(undefined, more.failing);
  const pytest = new FakeRunner(undefined, more.failing);
  const runners: Record<string, Runner> = { 'playwright-bdd': bdd, pytest };
  const g: Gate = {
    store: new FakeStore(),
    repo: new FakeRepoReader(),
    runner: (name) => runners[name] ?? null,
    root: (name) => `/tests/${name}`,
    retries: 1,
    ...more,
  };
  return { g, bdd, pytest };
}
const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

test('plan selects by path and smoke, and offers the other groups', async () => {
  const plan = await makePlan(gate().g, 'main', {});
  assert.equal(plan.change.branch, 'feature/coupons');
  assert.deepEqual(
    plan.items.map((i) => i.testCase.id),
    [501, 502, 601],
  );
  assert.deepEqual(plan.notRun, []);
  assert.deepEqual(plan.otherGroups, { cart: ['Add to cart'], 'checkout-coupon': ['Gift card coupon'] });
  assert.equal(plan.catalogSize, 5);
});

test('a requested group adds its cases with the reason', async () => {
  const plan = await makePlan(gate().g, 'main', { cart: 'cart total uses the coupon' });
  assert.deepEqual(
    plan.items.map((i) => i.testCase.id),
    [501, 502, 601, 701],
  );
  assert.deepEqual(plan.items[3].reasons, [{ kind: 'group', detail: 'cart: cart total uses the coupon' }]);
  assert.ok(!('cart' in plan.otherGroups));
});

test('run requires approval', async () => {
  const { g } = gate();
  const plan = await makePlan(g, 'main', {});
  await assert.rejects(runPlan(g, plan, '/ev'), blocked(/isn't approved/));
});

test('approve edits by ID and group; run sends each case to the runner its link names', async () => {
  const { g, bdd, pytest } = gate({ failing: new Set([502]) });
  let plan = await makePlan(g, 'main', {});
  plan = await approve(g, plan, 'ada@example.test', ['cart'], ['TC502']);
  const verdict = await runPlan(g, plan, '/ev');
  assert.deepEqual(
    bdd.ran.map((r) => [Object.fromEntries(r.selection), r.root, r.evidence]),
    [[{ 501: ['bdd:@TC-CHECKOUT-001'], 601: ['bdd:@TC-LOGIN-001'] }, '/tests/playwright-bdd', '/ev/attempt-1']],
  );
  assert.deepEqual(
    pytest.ran.map((r) => Object.fromEntries(r.selection)),
    [{ 701: ['pytest:tests/test_cart.py::test_add[1]', 'pytest:tests/test_cart.py::test_add[2]'] }],
  );
  assert.equal(verdict.result, 'pass');
  assert.deepEqual(plan.items.at(-1)?.reasons, [{ kind: 'added', detail: 'ada@example.test' }]);
  assert.equal(plan.approvedBy, 'ada@example.test');
});

test('a failing test fails the verdict', async () => {
  const { g } = gate({ failing: new Set([502]) });
  const plan = await approve(g, await makePlan(g, 'main', {}), 'ada', [], []);
  assert.equal((await runPlan(g, plan, '/ev')).result, 'fail');
});

test('a renamed test is BROKEN and fails the check', async () => {
  const store = new FakeStore(
    TEST_CASES.map((c) => (c.id === 502 ? { ...c, automatedTest: 'bdd:@TC-CHECKOUT-OLD' } : c)),
  );
  const { g } = gate({ store });
  const plan = await approve(g, await makePlan(g, 'main', {}), 'ada', [], []);
  const verdict = await runPlan(g, plan, '/ev');
  assert.equal(verdict.result, 'fail');
  assert.match(verdict.reasons[0], /TC502: its test bdd:@TC-CHECKOUT-OLD isn't in the test root/);
});

test('approval is bound to HEAD and to the QA project commit', async () => {
  const { g } = gate({ testsHead: () => 'qa-1' });
  const plan = await makePlan(g, 'main', {});
  assert.equal(plan.testsHead, 'qa-1');
  const moved = { ...g, repo: new FakeRepoReader({ ...CHANGE, head: 'c'.repeat(40) }) };
  await assert.rejects(approve(moved, plan, 'ada', [], []), blocked(/HEAD moved/));
  await assert.rejects(approve({ ...g, testsHead: () => 'qa-2' }, plan, 'ada', [], []), blocked(/QA project moved/));
});

test('approve rejects bad edits', async () => {
  const { g } = gate();
  const plan = await makePlan(g, 'main', {});
  for (const [add, remove, re] of [
    [['503'], [], /no automated test/],
    [[], ['999'], /not in plan/],
    [['payments'], [], /neither a test case ID nor a group/],
  ] as const)
    await assert.rejects(approve(g, structuredClone(plan), 'ada', [...add], [...remove]), blocked(re));
});

test('adding a case with no bound script says how to bind it (0.4.2 W19)', async () => {
  const { g } = gate();
  const plan = await makePlan(g, 'main', {});
  await assert.rejects(
    approve(g, plan, 'ada', ['503'], []),
    blocked(
      /If its script exists, bind it: qam plan --tag <its group>, qam automate <that plan> --done, then approve that plan\./,
    ),
  );
});

test('a failed test is retried once; failed then passed is flaky, with both attempts kept apart', async () => {
  let calls = 0;
  const flaky: Runner = {
    collected: async () => ['bdd:@TC-CHECKOUT-001', 'bdd:@TC-CHECKOUT-002', 'bdd:@TC-LOGIN-001'],
    run: async (selection, _root, evidence) => {
      calls++;
      return [...selection].map(
        ([testCaseId, testIds]): TestResult => ({
          testCaseId,
          status: testCaseId === 501 && evidence.endsWith('attempt-1') ? 'failed' : 'passed',
          durationS: 0,
          testIds,
          evidence: testCaseId === 501 && evidence.endsWith('attempt-1') ? ['shot.png'] : [],
          ...(testCaseId === 501 && evidence.endsWith('attempt-1') ? { error: 'Timeout waiting for #total' } : {}),
        }),
      );
    },
  };
  const { g } = gate({ runner: (name) => (name === 'playwright-bdd' ? flaky : null) });
  const plan = await approve(g, await makePlan(g, 'main', {}), 'ada', [], []);
  const verdict = await runPlan(g, plan, '/ev');
  assert.equal(calls, 2);
  assert.equal(verdict.result, 'pass');
  assert.equal(verdict.results.find((r) => r.testCaseId === 501)?.status, 'flaky');
  assert.deepEqual(verdict.results.find((r) => r.testCaseId === 501)?.evidence, ['shot.png']);
  assert.equal(
    verdict.results.find((r) => r.testCaseId === 501)?.error,
    'Timeout waiting for #total',
    'F10: the first error is kept',
  );
});

test('a selected case whose runner QAMaster does not have blocks the plan (Q38)', async () => {
  const store = new FakeStore([
    ...TEST_CASES,
    item(801, 'test_case', 'Cypress', {
      tags: ['path:shop/checkout/**'],
      automatedTest: 'cypress:checkout.cy.ts',
      suites: [`${PLAN} / Checkout`],
    }),
  ]);
  await assert.rejects(makePlan(gate({ store }).g, 'main', {}), blocked(/No cypress runner.*TC801/));
});

test('the DSM selects the cases on impacted screens and reports screens no case visits', async () => {
  const { g } = gate({
    dsm: () => ({
      cases: new Map([[701, ['/cart']]]),
      gaps: [{ screen: '/checkout/review', files: ['shop/checkout/coupon.ts'], why: 'no test case visits it' }],
    }),
  });
  const plan = await makePlan(g, 'main', {});
  assert.deepEqual(plan.items.find((i) => i.testCase.id === 701)?.reasons, [{ kind: 'dsm', detail: '/cart' }]);
  assert.equal(plan.gaps[0].screen, '/checkout/review');
});

// The DSM selector's own mapping (settled 2026-11-02): changed files -> owned screens -> published cases on them.
test('dsmCases: changed files map to screens, then to published cases; a screen no case visits is a gap', async () => {
  const { dsmCases } = await import('../plugin/src/gate/dsm.mts');
  const code = {
    files: {
      'shop:src/cart/Cart.tsx': { owners: ['/cart'] },
      'shop:src/checkout/Review.tsx': { owners: ['/checkout/review'] },
      'shop:src/shared/money.ts': { owners: [] },
    },
  } as never;
  const r = dsmCases({
    files: ['web/src/cart/Cart.tsx', 'web/src/checkout/Review.tsx', 'web/src/shared/money.ts', 'README.md'],
    appRoot: '/app',
    repos: [{ name: 'shop', dir: '/app/web' }],
    code,
    cases: [
      { localId: 'TC-CART-001', screens: ['/cart/', '/checkout'] },
      { localId: 'TC-CART-002', screens: ['/cart'] }, // never published: not in the ledger
      { localId: 'TC-HOME-001', screens: ['/'] },
    ],
    ledger: new Map([
      ['TC-CART-001', 701],
      ['TC-HOME-001', 9],
    ]),
  });
  assert.deepEqual([...r.cases], [[701, ['/cart']]]);
  assert.deepEqual(r.gaps, [
    {
      screen: '/checkout/review',
      files: ['web/src/checkout/Review.tsx'],
      why: 'no published test case visits this screen',
    },
  ]);
});

// Q39: the drafted scripts bind the plan; any edit after that voids the approval, and a new script's failure is labelled.
test('a plan bound to drafted scripts refuses approval when they changed, and labels a new script that failed', async () => {
  let folder = 'h1';
  const { g } = gate({ failing: new Set([502]), scriptsHash: () => folder });
  const plan = { ...(await makePlan(g, 'main', {})), scriptsHash: 'h1', newScripts: [502] };
  folder = 'h2';
  await assert.rejects(
    approve(g, structuredClone(plan), 'ada', [], []),
    blocked(/scripts changed since they were recorded/),
  );
  folder = 'h1';
  const approved = await approve(g, plan, 'ada', [], []);
  const v = await runPlan(g, approved, '/ev');
  assert.equal(v.result, 'fail');
  assert.match(v.reasons.join(' '), /TC502 failed: new script failed: check the script or the app\./);
});

test('0.6.0 item 14: all plans every case with a bound script, whatever the change touches', async () => {
  const { g } = gate({ repo: new FakeRepoReader({ ...CHANGE, files: [] }) });
  const none = await makePlan(g, 'main', {});
  assert.deepEqual(
    none.items.map((i) => i.testCase.id),
    [601], // the smoke case only
  );
  const plan = await makePlan(g, 'main', {}, { all: true });
  assert.deepEqual(
    plan.items.map((i) => [i.testCase.id, i.selected, i.reasons[0].kind]),
    [
      [501, true, 'all'],
      [502, true, 'all'],
      [601, true, 'all'],
      [701, true, 'all'],
    ],
  );
  // 503 is manual: it has no script to run, so it is not part of the plan
  assert.deepEqual(plan.notRun, []);
});

test('0.6.0 item 7: the plan says the app has its own tests and that the gate does not run them', async () => {
  const { g } = gate({ appTests: () => ['pytest in api/tests (4 files)'] });
  assert.deepEqual((await makePlan(g, 'main', {})).appTests, ['pytest in api/tests (4 files)']);
  assert.equal((await makePlan(gate().g, 'main', {})).appTests, undefined);
});
