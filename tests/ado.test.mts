/**
 * The ADO adapter against recorded responses (tests/fixtures/ado, from CheckMaster's tests). First CheckMaster's 17
 * tests, ported before the code (CLAUDE.md), then one test per fix (docs/porting-step3.md, step 4), then the two contract
 * suites on an in-memory ADO (tests/fake-ado.mts).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { AdoClient, AdoRequirements, type AdoSettings, AdoTestCases, authHeader } from '../plugin/src/adapters/ado.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { requirementSourceContract, testCaseStoreContract } from './contracts.mts';
import { FakeAdo } from './fake-ado.mts';

const FIX = path.join(import.meta.dirname, 'fixtures/ado');
const BASE = 'https://dev.azure.com/org/Shop/_apis';
const ORG = 'https://dev.azure.com/org/_apis';
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));

type Route = { method: string; url: string; params?: Record<string, string>; reply: () => Response };
type Call = { method: string; url: URL; body: string | undefined; headers: Record<string, string> };

/** A fake fetch that answers only the routes it was given, like respx: anything else fails the test. */
class Mock {
  routes: Route[] = [];
  calls: Call[] = [];
  on(
    method: string,
    url: string,
    body: unknown,
    opts: { params?: Record<string, string>; status?: number; headers?: Record<string, string> } = {},
  ) {
    // the most specific route wins, as with respx: later routes with params first
    this.routes.unshift({
      method,
      url,
      params: opts.params,
      reply: () =>
        new Response(body === null ? null : JSON.stringify(body), {
          status: opts.status ?? 200,
          headers: opts.headers,
        }),
    });
    return this;
  }
  /** A route that answers each call with the next response in turn (the last one repeats). */
  seq(method: string, url: string, replies: { status: number; body?: unknown; headers?: Record<string, string> }[]) {
    let n = 0;
    this.routes.unshift({
      method,
      url,
      reply: () => {
        const r = replies[Math.min(n++, replies.length - 1)];
        return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
          status: r.status,
          headers: r.headers,
        });
      },
    });
    return this;
  }
  /** Calls to one route, newest last. */
  to(method: string, url: string): Call[] {
    return this.calls.filter(
      (c) => c.method === method && `${c.url.origin}${decodeURIComponent(c.url.pathname)}` === url,
    );
  }
  fetch = async (raw: string, init: RequestInit) => {
    const url = new URL(raw);
    const call = {
      method: init.method ?? 'GET',
      url,
      body: init.body as string | undefined,
      headers: init.headers as Record<string, string>,
    };
    this.calls.push(call);
    const route = this.routes.find(
      (r) =>
        r.method === call.method &&
        r.url === `${url.origin}${decodeURIComponent(url.pathname)}` &&
        Object.entries(r.params ?? {}).every(([k, v]) => url.searchParams.get(k) === v),
    );
    if (!route) throw new Error(`unexpected request ${call.method} ${raw}`);
    return route.reply();
  };
}

const settings = (more: Partial<AdoSettings> = {}): AdoSettings => ({
  organization: 'org',
  project: 'Shop',
  repoName: 'shop-web',
  ...more,
});
const client = (m: Mock) =>
  new AdoClient(
    'org',
    'Shop',
    () => 'Basic test',
    m.fetch,
    async () => {},
  );
const store = (m: Mock, more: Partial<AdoSettings> = {}) => new AdoTestCases(client(m), settings(more));
const requirements = (m: Mock) => new AdoRequirements(client(m), settings());
const sent = (c: Call | undefined) => JSON.parse(c?.body ?? 'null');
const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

function mockPlan(m: Mock) {
  m.on('GET', `${BASE}/testplan/plans`, fixture('plans.json'));
  m.on('GET', `${BASE}/testplan/Plans/1/suites`, fixture('suites.json'));
  m.on('GET', `${BASE}/wit/workitems`, fixture('workitems.json'));
}
function mockTestCase26(m: Mock) {
  m.on('GET', `${BASE}/wit/workitems/26`, fixture('testcase_26.json'));
  m.on('GET', `${ORG}/testplan/suites`, fixture('suites_of_26.json'), { params: { testCaseId: '26' } });
}
const requirement = (id: number, fields: Record<string, unknown> = {}) => ({
  id,
  rev: 1,
  fields: { 'System.WorkItemType': 'Issue', 'System.Title': 'Coupons', 'System.State': 'To Do', ...fields },
});

// ---- CheckMaster's tests, ported

test('cm: the plan named like the repo is found, ignoring case and spaces', async () => {
  const m = new Mock();
  mockPlan(m);
  assert.equal((await store(m).plan()).id, 1);
  assert.equal((await store(m, { plan: 'regression' }).plan()).id, 3);
});

test('cm: no matching plan is blocked, listing the plans seen', async () => {
  const m = new Mock();
  mockPlan(m);
  await assert.rejects(
    store(m, { repoName: 'billing' }).plan(),
    blocked(/plans: 'Shop Web', 'Regression'.*QAMASTER_ADO_PLAN/),
  );
});

test('cm: test cases read tags and the automation link, and skip missing items', async () => {
  const m = new Mock();
  mockPlan(m);
  m.on('GET', `${BASE}/testplan/Plans/1/Suites/2/TestCase`, {
    value: [501, 502, 404].map((id) => ({ workItem: { id } })),
  });
  const cases = await store(m).inPlan();
  assert.deepEqual(cases.get(501)?.tags, ['coupon', 'path:shop/checkout/**']);
  // CheckMaster's bare node ID reads as a pytest link (Q9)
  assert.equal(cases.get(501)?.automatedTest, 'pytest:tests/test_coupon.py::test_applies');
  assert.deepEqual([cases.get(502)?.tags, cases.get(502)?.automatedTest], [[], null]);
  assert.equal(cases.get(501)?.url, 'https://dev.azure.com/org/Shop/_workitems/edit/501');
  assert.ok(!cases.has(404));
  const params = m.to('GET', `${BASE}/wit/workitems`).at(-1)?.url.searchParams;
  assert.deepEqual([params?.get('ids'), params?.get('api-version')], ['501,502,404', '7.1']);
  assert.match(params?.get('fields') ?? '', /Microsoft\.VSTS\.TCM\.AutomatedTestName/);
});

test('cm: test cases in a suite follow continuation tokens', async () => {
  const m = new Mock();
  mockPlan(m);
  const url = `${BASE}/testplan/Plans/1/Suites/2/TestCase`;
  m.on('GET', url, fixture('suite_page1.json'), { headers: { 'x-ms-continuationtoken': 'next' } });
  m.on('GET', url, fixture('suite_page2.json'), { params: { continuationToken: 'next' } });
  const cases = await store(m).inPlan();
  assert.deepEqual(
    [...cases].map(([id, c]) => [id, c.title]),
    [
      [501, 'Coupon applies'],
      [502, 'Expired coupon'],
    ],
  );
});

test('cm: bad credentials are blocked with the fix', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/testplan/plans`, null, { status: 401 });
  await assert.rejects(store(m).plan(), blocked(/qam doctor/));
});

test('cm: a PAT is Basic auth', () => {
  assert.equal(authHeader({ QAMASTER_ADO_TOKEN: 'secret' }), 'Basic OnNlY3JldA==');
});

test('cm: no PAT and no az login is blocked', () => {
  assert.throws(() => authHeader({}, () => null), blocked(/az login/));
});

test('cm: find queries the whole project by category and filters', async () => {
  const m = new Mock();
  m.on('POST', `${BASE}/wit/wiql`, { workItems: [{ id: 3 }] });
  m.on('GET', `${BASE}/wit/workitems`, { value: [requirement(3)] });
  const found = await requirements(m).find({ kind: 'requirement', tag: "cou'pon", text: 'SAVE', limit: 10 });
  assert.deepEqual(
    found.map((i) => [i.id, i.kind, i.title]),
    [[3, 'requirement', 'Coupons']],
  );
  const wiql = m.to('POST', `${BASE}/wit/wiql`).at(-1);
  const query = sent(wiql).query;
  assert.match(query, /\[System\.TeamProject\] = 'Shop'/);
  assert.match(query, /\[System\.WorkItemType\] NOT IN \('Shared Parameter', 'Shared Steps', 'Test Case'/);
  assert.match(query, /\[System\.Tags\] CONTAINS 'cou''pon'/);
  assert.match(query, /\[System\.Title\] CONTAINS 'SAVE'/);
  assert.equal(wiql?.url.searchParams.get('$top'), '10');
});

test('cm: show reads links, steps, fields and the suites in this project', async () => {
  const m = new Mock();
  mockTestCase26(m);
  const tc = await store(m).show(26);
  assert.deepEqual([tc.kind, tc.parent, tc.tests], ['test_case', 2, [12]]);
  assert.deepEqual(tc.tags, ['cart', 'path:site/cart.js']);
  assert.deepEqual(tc.steps, [
    { action: 'Add a mug', expected: 'Total is $20.00' },
    { action: 'Add a T-shirt', expected: '' },
  ]);
  assert.deepEqual(tc.fields, { 'Assigned To': 'Ada Lovelace', Priority: '2' });
  assert.deepEqual(tc.suites, ['Shop Web / Cart']);
});

test("cm: a new requirement gets the project's usual type", async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/wit/workitemtypecategories/Microsoft.RequirementCategory`, {
    defaultWorkItemType: { name: 'Issue' },
  });
  m.on('POST', `${BASE}/wit/workitems/$Issue`, { id: 40 });
  m.on('GET', `${BASE}/wit/workitems/40`, requirement(40));
  assert.equal((await requirements(m).create({ title: 'Coupons' })).type, 'Issue');
});

test('cm: create sends fields and links as JSON Patch', async () => {
  const m = new Mock();
  m.on('POST', `${BASE}/wit/workitems/$Issue`, { id: 40 });
  m.on('GET', `${BASE}/wit/workitems/40`, requirement(40));
  await requirements(m).create({
    type: 'Issue',
    title: 'Coupons',
    description: 'a < b\nc',
    addTags: ['Q4'],
    parent: 3,
  });
  const call = m.to('POST', `${BASE}/wit/workitems/$Issue`).at(-1);
  assert.equal(call?.headers['Content-Type'], 'application/json-patch+json');
  assert.deepEqual(sent(call), [
    { op: 'add', path: '/fields/System.Title', value: 'Coupons' },
    { op: 'add', path: '/fields/System.Description', value: 'a &lt; b<br>c' },
    { op: 'add', path: '/fields/System.Tags', value: 'Q4' },
    {
      op: 'add',
      path: '/relations/-',
      value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/3' },
    },
  ]);
});

test('cm: creating a test case sets steps, the automation link and the suite', async () => {
  const m = new Mock();
  m.on('POST', `${BASE}/wit/workitems/$Test Case`, { id: 26 });
  m.on('GET', `${BASE}/testplan/plans`, fixture('plans.json'));
  m.on('GET', `${BASE}/testplan/Plans/1/suites`, {
    value: [
      { id: 2, name: 'Shop Web' },
      { id: 5, name: 'Cart', suiteType: 'staticTestSuite', parentSuite: { id: 2 } },
    ],
  });
  const members = `${BASE}/testplan/Plans/1/Suites/5/TestCase`;
  m.on('GET', members, { value: [] });
  m.on('POST', members, { value: [] });
  mockTestCase26(m);
  await store(m).create({
    title: 'Cart total',
    steps: [{ action: 'Add a mug', expected: 'Total is $20.00' }],
    automatedTest: 'pytest:tests/test_cart.py::test_total',
    requirements: [12],
    suite: 'cart',
  });
  const ops = sent(m.to('POST', `${BASE}/wit/workitems/$Test Case`).at(-1)) as { path: string; value: unknown }[];
  const fields = Object.fromEntries(ops.filter((o) => o.path.startsWith('/fields')).map((o) => [o.path, o.value]));
  assert.match(String(fields['/fields/Microsoft.VSTS.TCM.Steps']), /Add a mug/);
  // QAMaster writes the runner prefix (Q9); CheckMaster wrote the bare node ID
  assert.equal(fields['/fields/Microsoft.VSTS.TCM.AutomatedTestName'], 'pytest:tests/test_cart.py::test_total');
  assert.equal(fields['/fields/Microsoft.VSTS.TCM.AutomatedTestStorage'], 'tests/test_cart.py');
  assert.equal(fields['/fields/Microsoft.VSTS.TCM.AutomationStatus'], 'Automated');
  assert.equal((ops.at(-1)?.value as { rel: string } | undefined)?.rel, 'Microsoft.VSTS.Common.TestedBy-Reverse');
  assert.deepEqual(sent(m.to('POST', members).at(-1)), [{ workItem: { id: 26 } }]);
});

test('cm: update merges tags and replaces the parent (now guarded by the rev)', async () => {
  const m = new Mock();
  mockTestCase26(m);
  m.on('PATCH', `${BASE}/wit/workitems/26`, { id: 26 });
  const s = store(m);
  const item = await s.show(26);
  await s.update(item, { addTags: ['CART', 'Q4'], parent: 7, requirements: [12] });
  assert.deepEqual(sent(m.to('PATCH', `${BASE}/wit/workitems/26`).at(-1)), [
    { op: 'test', path: '/rev', value: 0 },
    { op: 'add', path: '/fields/System.Tags', value: 'cart; path:site/cart.js; Q4' },
    { op: 'remove', path: '/relations/1' },
    {
      op: 'add',
      path: '/relations/-',
      value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/7' },
    },
  ]);
});

test('cm: retiring a requirement only moves it to the Recycle Bin', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/wit/workitems/3`, requirement(3));
  m.on('DELETE', `${BASE}/wit/workitems/3`, { id: 3 });
  const r = requirements(m);
  assert.match((await r.retire(await r.show(3)))[0], /Recycle Bin/);
  assert.equal(m.to('DELETE', `${BASE}/wit/workitems/3`).at(-1)?.url.searchParams.has('destroy'), false);
});

test('cm: retiring a test case closes it and takes it out of its suites, never deleting it', async () => {
  const m = new Mock();
  mockTestCase26(m);
  m.on('PATCH', `${BASE}/wit/workitems/26`, { id: 26 });
  m.on('DELETE', `${BASE}/testplan/Plans/1/Suites/5/TestCase`, null, { status: 204 });
  const s = store(m);
  const done = await s.retire(await s.show(26));
  assert.deepEqual(done, ['set State: Design -> Closed', 'removed TC26 from suite Shop Web / Cart']);
  assert.deepEqual(sent(m.to('PATCH', `${BASE}/wit/workitems/26`).at(-1)), [
    { op: 'test', path: '/rev', value: 0 },
    { op: 'add', path: '/fields/System.State', value: 'Closed' },
  ]);
  assert.equal(
    m.to('DELETE', `${BASE}/testplan/Plans/1/Suites/5/TestCase`).at(-1)?.url.searchParams.get('testIds'),
    '26',
  );
  // the mock fails on any request it wasn't given, so the work item itself was never DELETEd
});

test('cm: test plans and suites are never deleted', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/wit/workitems/9`, requirement(9, { 'System.WorkItemType': 'Test Plan' }));
  const r = requirements(m);
  await assert.rejects(r.retire(await r.show(9)), blocked(/doesn't delete test plans/));
});

test('cm: a refused write names the scopes it needs', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/wit/workitems/3`, requirement(3));
  m.on('PATCH', `${BASE}/wit/workitems/3`, null, { status: 403 });
  const r = requirements(m);
  await assert.rejects(r.update(await r.show(3), { state: 'Doing' }), blocked(/Work Items \(Read & Write\)/));
});

// ---- the contracts, on the real adapter against an in-memory ADO

const onFake = (ado: FakeAdo, more: Partial<AdoSettings> = {}) => {
  const c = new AdoClient(
    'org',
    'Shop',
    () => 'Basic test',
    ado.fetch,
    async () => {},
  );
  return [c, settings({ repoName: 'Shop Web', ...more })] as const;
};
testCaseStoreContract('ado adapter', {
  make: () => new AdoTestCases(...onFake(new FakeAdo())),
  inPlan: 501,
  notInPlan: 504,
  missing: 999,
});
requirementSourceContract('ado adapter', {
  make: () => new AdoRequirements(...onFake(new FakeAdo())),
  sprint: 'Sprint 24',
  inSprint: '3',
  missing: 999,
});

// ---- one test per fix, each the matching case in tests/fixtures/ado/cm-runs.json, which CheckMaster got wrong

test('fix 1: an update refuses an item someone changed since it was read, and keeps their tag', async () => {
  const ado = new FakeAdo();
  const s = new AdoTestCases(...onFake(ado));
  const stale = await s.show(501);
  await s.update(await s.show(501), { addTags: ['flaky'] }); // someone else
  await assert.rejects(
    s.update(stale, { addTags: ['Q4'] }),
    blocked(/#501 changed in Azure DevOps since you read it \(rev 1 -> 2\)/),
  );
  assert.deepEqual((await s.show(501)).tags, ['coupon', 'path:shop/checkout/**', 'flaky']);
});

test('fix 1: a change landing between the read and the write is caught by the test on /rev', async () => {
  const ado = new FakeAdo();
  const racing = async (url: string, init: RequestInit) => {
    if (init.method === 'PATCH') (ado.items.get(501) as { rev: number }).rev += 1; // someone else, just before ours
    return ado.fetch(url, init);
  };
  const s = new AdoTestCases(
    new AdoClient(
      'org',
      'Shop',
      () => 'Basic test',
      racing,
      async () => {},
    ),
    settings({ repoName: 'Shop Web' }),
  );
  await assert.rejects(
    s.update(await s.show(501), { title: 'Mine' }),
    blocked(/changed in Azure DevOps since you read it \(rev 1 -> 2\)/),
  );
  assert.equal((await s.show(501)).title, 'Coupon applies at checkout', 'nothing written');
});

test('fix 2: two plans named like the repo block, naming both', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/testplan/plans`, {
    value: [
      { id: 1, name: 'Shop Web' },
      { id: 7, name: 'shop-web' },
    ],
  });
  await assert.rejects(
    store(m, { repoName: 'ShopWeb' }).plan(),
    blocked(/2 test plans .* match 'ShopWeb' \('Shop Web' #1, 'shop-web' #7\).*QAMASTER_ADO_PLAN/),
  );
});

test('fix 3: the plan on the second page of plans is found', async () => {
  const m = new Mock();
  m.on(
    'GET',
    `${BASE}/testplan/plans`,
    { value: [{ id: 1, name: 'Billing' }] },
    { headers: { 'x-ms-continuationtoken': 'p2' } },
  );
  m.on(
    'GET',
    `${BASE}/testplan/plans`,
    { value: [{ id: 9, name: 'Shop Web' }] },
    { params: { continuationToken: 'p2' } },
  );
  assert.equal((await store(m).plan()).id, 9);
});

test('fix 4: test cases in a suite on the second page of suites are in the plan', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/testplan/plans`, fixture('plans.json'));
  const suites = `${BASE}/testplan/Plans/1/suites`;
  m.on('GET', suites, { value: [{ id: 2, name: 'Shop Web' }] }, { headers: { 'x-ms-continuationtoken': 's2' } });
  m.on('GET', suites, { value: [{ id: 3, name: 'Cart' }] }, { params: { continuationToken: 's2' } });
  m.on('GET', `${BASE}/testplan/Plans/1/Suites/2/TestCase`, { value: [{ workItem: { id: 501 } }] });
  m.on('GET', `${BASE}/testplan/Plans/1/Suites/3/TestCase`, { value: [{ workItem: { id: 502 } }] });
  m.on('GET', `${BASE}/wit/workitems`, fixture('workitems.json'));
  await store(m).inPlan();
  assert.equal(m.to('GET', `${BASE}/wit/workitems`).at(-1)?.url.searchParams.get('ids'), '501,502');
});

test('fix 5: a throttled call waits for Retry-After and tries again, then blocks after 3 tries', async () => {
  const waits: number[] = [];
  const make = (m: Mock) =>
    new AdoTestCases(
      new AdoClient(
        'org',
        'Shop',
        () => 'Basic test',
        m.fetch,
        async (ms) => void waits.push(ms),
      ),
      settings(),
    );
  const m = new Mock();
  m.seq('GET', `${BASE}/testplan/plans`, [
    { status: 429, headers: { 'Retry-After': '1' } },
    { status: 200, body: fixture('plans.json') },
  ]);
  assert.equal((await make(m).plan()).id, 1);
  assert.deepEqual(waits, [1000]);
  const busy = new Mock();
  busy.seq('GET', `${BASE}/testplan/plans`, [{ status: 503, headers: { 'Retry-After': '120' } }]);
  await assert.rejects(make(busy).plan(), blocked(/throttling \(503\) after 3 tries/));
  assert.deepEqual(waits, [1000, 30_000, 30_000], 'never more than 30 s');
});

test('fix 6: a Closed test case left in a suite is not in the plan', async () => {
  const m = new Mock();
  mockPlan(m);
  const items = fixture('workitems.json');
  items.value[0].fields['System.State'] = 'Closed';
  m.on('GET', `${BASE}/wit/workitems`, items);
  m.on('GET', `${BASE}/testplan/Plans/1/Suites/2/TestCase`, {
    value: [{ workItem: { id: 501 } }, { workItem: { id: 502 } }],
  });
  const cases = await store(m).inPlan();
  assert.deepEqual([...cases.keys()], [502]);
  assert.match(m.to('GET', `${BASE}/wit/workitems`).at(-1)?.url.searchParams.get('fields') ?? '', /System\.State/);
});

test('publish: ensurePlan creates the plan named like the repo once; ensureSuite adds a static suite under its root', async () => {
  const ado = new FakeAdo(false);
  const s = new AdoTestCases(...onFake(ado, { repoName: 'shop-web' }));
  await assert.rejects(s.plan(), blocked(/No test plan is named like this repo/));
  assert.deepEqual(await s.ensurePlan(), { id: 1000, name: 'shop-web', created: true });
  assert.equal((await s.ensurePlan()).created, false);
  const suite = await s.ensureSuite('Checkout');
  assert.equal(suite.created, true);
  const root = ado.plans[0].suites[0];
  assert.deepEqual(ado.plans[0].suites.at(-1)?.parentSuite, { id: root.id });
  await s.addToSuite(504, 'Checkout');
  assert.ok((await s.inPlan()).has(504));
});

test('qam ado call: a write needs --apply, and missing settings are named', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-ado-'));
  const qam = (...args: string[]) =>
    spawnSync(path.join(import.meta.dirname, '../plugin/bin/qam'), ['--repo', dir, ...args], { encoding: 'utf8' });
  try {
    const write = qam('ado', 'call', 'POST', 'testplan/plans');
    assert.equal(write.status, 2);
    assert.match(
      write.stderr,
      /changes Azure DevOps\. Show the person what it will change, and add --apply only after their yes/,
    );
    const read = qam('ado', 'call', 'GET', 'testplan/plans');
    assert.equal(read.status, 2);
    assert.match(read.stderr, /QAMASTER_ADO_ORG=<organization>/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
