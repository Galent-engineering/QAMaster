/**
 * The gate's selection (0.3.0 B2), ported from CheckMaster's tests/test_selection.py, with QAMaster's changes: links
 * carry their runner's prefix (Q9, Q38), a link with no prefix blocks, and a shared file selects through smoke and the
 * DSM, not its path tag (Q37).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidates, groups, linkRunner, matches, resolve, split } from '../plugin/src/gate/select.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { Change, Reason, TestCase } from '../plugin/src/shared/models.mts';

const url = (id: number) => `https://ado.test/${id}`;
const kase = (id: number, title: string, tags: string[], automatedTest: string | null = null): TestCase => ({
  id,
  title,
  url: url(id),
  tags,
  automatedTest,
});
const CHECKOUT = ['coupon', 'path:shop/checkout/**'];
const CATALOG = [
  kase(501, 'Coupon applies', CHECKOUT, 'pytest:tests/test_coupon.py::test_applies'),
  kase(502, 'Expired coupon', CHECKOUT, 'pytest:tests/test_coupon.py::test_expired'),
  kase(503, 'Gift card coupon', ['coupon']),
  kase(601, 'Login', ['login', 'smoke'], 'bdd:@TC-LOGIN-001'),
  kase(701, 'Add to cart', ['cart', 'path:shop/cart/**'], 'pytest:tests/test_cart.py::test_add'),
];
const CAT = new Map(CATALOG.map((c) => [c.id, c]));
const COLLECTED = [
  'pytest:tests/test_coupon.py::test_applies',
  'pytest:tests/test_coupon.py::test_expired',
  'bdd:@TC-LOGIN-001',
  'pytest:tests/test_cart.py::test_add[1]',
  'pytest:tests/test_cart.py::test_add[2]',
  'pytest:tests/test_helpers.py::test_unlinked',
];
const change = (...paths: string[]): Change => ({
  base: 'main',
  head: 'h',
  branch: 'b',
  files: paths.map((path) => ({ path, status: 'M' })),
});
const describe = (r: Map<number, Reason[]>) =>
  Object.fromEntries([...r].map(([id, rs]) => [id, rs.map((x) => `${x.kind} ${x.detail}`.trim())]));

test('glob: ** crosses folders, * and ? stay within one', () => {
  for (const [pattern, path, expected] of [
    ['shop/cart/**', 'shop/cart/a.py', true],
    ['shop/cart/**', 'shop/cart/sub/a.py', true],
    ['shop/cart/**', 'shop/cartx/a.py', false],
    ['**/*.html', 'index.html', true],
    ['**/*.html', 'site/pages/index.html', true],
    ['shop/*.py', 'shop/sub/a.py', false],
    ['shop/*', 'shop/a.py', true],
    ['shop/?.py', 'shop/a.py', true],
  ] as const)
    assert.equal(matches(pattern, path), expected, `${pattern} ~ ${path}`);
});

test('path tags, then smoke, then requested groups, in that order', () => {
  const r = candidates({ change: change('shop/cart/cart.py'), catalog: CAT, wanted: { login: 'sign-in form moved' } });
  assert.deepEqual(describe(r), {
    701: ['path shop/cart/**'],
    601: ['smoke', 'group login: sign-in form moved'],
  });
});

test('groups leave out rule tags', () => {
  assert.deepEqual(groups(CAT), { cart: [701], coupon: [501, 502, 503], login: [601] });
});

test('an unknown group is blocked, naming the real ones', () => {
  assert.throws(
    () => candidates({ change: change(), catalog: CAT, wanted: { payments: '' } }),
    (e) => e instanceof BlockedError && /Groups: cart, coupon, login/.test(e.message),
  );
});

test('resolve matches a test and its parametrized variants', () => {
  assert.deepEqual(resolve('pytest:tests/test_cart.py::test_add', COLLECTED), [
    'pytest:tests/test_cart.py::test_add[1]',
    'pytest:tests/test_cart.py::test_add[2]',
  ]);
  assert.deepEqual(resolve('pytest:tests/test_cart.py::test_ad', COLLECTED), []);
});

test('manual, missing and renamed tests go to Not run; a renamed one is BROKEN', () => {
  const catalog = new Map([...CAT, [801, kase(801, 'Old', ['coupon'], 'pytest:tests/test_old.py::test_gone')]]);
  const reasons = candidates({ change: change(), catalog, wanted: { coupon: '' } });
  reasons.set(999, reasons.get(501) ?? []);
  const { items, notRun } = split(reasons, catalog, COLLECTED, url);
  assert.deepEqual(
    items.map((i) => i.testCase.id),
    [601, 501, 502],
  );
  assert.deepEqual(
    notRun.map((n) => [n.testCase.id, n.broken]),
    [
      [503, false],
      [801, true],
      [999, false],
    ],
  );
  assert.match(notRun[1].why, /renamed or moved\?/);
  assert.equal(notRun[2].testCase.title, '(not found in the test case store)');
});

// Settled in the gate's Learn (2026-11-02): a link with no prefix blocks until it is relinked.
test('a selected case whose link has no runner prefix blocks, naming it', () => {
  const catalog = new Map([...CAT, [901, kase(901, 'Legacy', ['path:shop/cart/**'], 'tests/test_cart.py::test_add')]]);
  const reasons = candidates({ change: change('shop/cart/a.py'), catalog, wanted: {} });
  assert.throws(
    () => split(reasons, catalog, COLLECTED, url),
    (e) =>
      e instanceof BlockedError && /TC901.*no runner prefix.*pytest:tests\/test_cart\.py::test_add/s.test(e.message),
  );
});

test('linkRunner reads the prefix: bdd is playwright-bdd, and an unknown or missing prefix is null', () => {
  assert.deepEqual(linkRunner('pytest:tests/a.py::t'), 'pytest');
  assert.deepEqual(linkRunner('bdd:@TC-1'), 'playwright-bdd');
  assert.equal(linkRunner('tests/a.py::t'), null);
  assert.equal(linkRunner('cypress:spec'), 'cypress');
});

// Q37: a file whose glob covers more than gate.sharedShare of the plan selects through smoke and the DSM, not path.
test('a shared file selects no cases by path, and is reported with how many cases its tags cover', () => {
  const big = new Map(CAT);
  for (let i = 0; i < 6; i++) big.set(1000 + i, kase(1000 + i, `Env ${i}`, ['path:src/environments/*']));
  const shared: { file: string; cases: number }[] = [];
  const r = candidates({
    change: change('src/environments/environment.ts', 'shop/cart/x.py'),
    catalog: big,
    wanted: {},
    sharedShare: 0.3,
    shared,
  });
  assert.deepEqual(shared, [{ file: 'src/environments/environment.ts', cases: 6 }]);
  assert.deepEqual(describe(r), { 701: ['path shop/cart/**'], 601: ['smoke'] });
});

test('DSM reasons are added after smoke and before groups', () => {
  const r = candidates({
    change: change(),
    catalog: CAT,
    wanted: { cart: 'cart changed' },
    dsm: new Map([[502, ['/checkout']]]),
  });
  assert.deepEqual(describe(r), { 601: ['smoke'], 502: ['dsm /checkout'], 701: ['group cart: cart changed'] });
});
