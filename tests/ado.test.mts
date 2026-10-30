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
import {
  AdoClient,
  AdoRequirements,
  type AdoSettings,
  AdoTestCases,
  authHeader,
  CSS_NAMESPACE,
  parseSteps,
  stepsXml,
  WRITE_BITS,
} from '../plugin/src/adapters/ado.mts';
import { BlockedError, NoPlanError, NoProjectError } from '../plugin/src/shared/errors.mts';
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
    blocked(
      /^No test plan is named like this repo \('billing'\) in org\/Shop\. Choose one:\n {2}1\. .*'Shop Web'.*QAMASTER_ADO_PLAN=Shop Web.*\n {2}2\. .*'Regression'.*QAMASTER_ADO_PLAN=Regression.*\n {2}3\. Create a new plan.*'billing'/,
    ),
  );
});

test('plan choices: the existing plans are numbered, a new plan is the last choice, and the error carries both', async () => {
  const m = new Mock();
  mockPlan(m);
  await assert.rejects(store(m, { repoName: 'billing' }).plan(), (e) => {
    assert.ok(e instanceof NoPlanError);
    assert.deepEqual(e.plans, [
      { id: 1, name: 'Shop Web' },
      { id: 3, name: 'Regression' },
    ]);
    assert.equal(e.createName, 'billing');
    assert.match(e.message, /any name you type.*then set QAMASTER_ADO_PLAN=<that name>/s);
    assert.match(e.message, /another project needs QAMASTER_ADO_PROJECT changed first/);
    return true;
  });
  // a configured name that matches nothing: ensurePlan would create that name, so it is the default
  await assert.rejects(store(m, { repoName: 'billing', plan: 'Nope' }).plan(), (e) => {
    assert.ok(e instanceof NoPlanError);
    assert.equal(e.createName, 'Nope');
    assert.match(e.message, /^QAMASTER_ADO_PLAN='Nope' matches no test plan in org\/Shop\. Choose one:\n {2}1\. /);
    assert.match(e.message, /\n {2}3\. Create a new plan.*'Nope'/);
    return true;
  });
  // no plans at all: creating is the only choice
  const none = new Mock().on('GET', `${BASE}/testplan/plans`, { value: [] });
  await assert.rejects(store(none, { repoName: 'billing' }).plan(), (e) => {
    assert.ok(e instanceof NoPlanError);
    assert.deepEqual(e.plans, []);
    assert.match(e.message, /Choose one:\n {2}1\. Create a new plan/);
    return true;
  });
});

/** ADO's 404 for a project that doesn't exist (the usual error envelope; the message is TF200016's). */
const NO_PROJECT = {
  $id: '1',
  innerException: null,
  message:
    'TF200016: The following project does not exist: Shop. Verify that the name of the project is correct and that the project exists on the specified Azure DevOps Server.',
  typeName:
    'Microsoft.TeamFoundation.Core.WebApi.ProjectDoesNotExistWithNameException, Microsoft.TeamFoundation.Core.WebApi',
  typeKey: 'ProjectDoesNotExistWithNameException',
  errorCode: 0,
  eventId: 3000,
};

test('missing project: TF200016 lists the projects, closest first, and the ways out; the error carries them', async () => {
  const m = new Mock()
    .on('GET', `${BASE}/testplan/plans`, NO_PROJECT, { status: 404 })
    .on('GET', `${ORG}/projects`, fixture('projects.json'));
  await assert.rejects(store(m).plan(), (e) => {
    assert.ok(e instanceof NoProjectError);
    assert.deepEqual(e.projects, ['Fabrikam-Fiber', 'ShopWeb', 'Shap']);
    // a name containing 'Shop' first, then by edit distance
    assert.deepEqual(e.suggestions, ['ShopWeb', 'Shap', 'Fabrikam-Fiber']);
    assert.match(
      e.message,
      /^Azure DevOps project 'Shop' doesn't exist in org, or this token has no access to it\. Existing projects, closest first:\n/,
    );
    assert.match(e.message, /\n {2}ShopWeb\n {2}Shap\n {2}Fabrikam-Fiber\n/);
    assert.match(e.message, /QAMASTER_ADO_PROJECT=<one of them, or a new name>/);
    assert.match(e.message, /QAMASTER_STORE=file/);
    assert.match(e.message, /run `qam publish <run>`: its preview shows what --apply would create/);
    assert.doesNotMatch(e.message, /qam publish --apply/);
    return true;
  });
  assert.equal(m.to('GET', `${ORG}/projects`).length, 1);
});

test('missing project: listing paged by continuation token; a refused listing falls back to a scope hint', async () => {
  const m = new Mock()
    .on('GET', `${BASE}/testplan/plans`, NO_PROJECT, { status: 404 })
    .on('GET', `${ORG}/projects`, { value: [{ name: 'A' }] }, { headers: { 'x-ms-continuationtoken': '1' } })
    .on('GET', `${ORG}/projects`, { value: [{ name: 'Shop2' }] }, { params: { continuationToken: '1' } });
  await assert.rejects(store(m).plan(), (e) => {
    assert.ok(e instanceof NoProjectError);
    assert.deepEqual(e.projects, ['A', 'Shop2']);
    assert.deepEqual(e.suggestions, ['Shop2', 'A']);
    return true;
  });
  const refused = new Mock()
    .on('GET', `${BASE}/testplan/plans`, NO_PROJECT, { status: 404 })
    .on('GET', `${ORG}/projects`, { message: 'no' }, { status: 403 });
  await assert.rejects(store(refused).plan(), (e) => {
    assert.ok(e instanceof NoProjectError);
    assert.deepEqual(e.projects, []);
    assert.match(e.message, /^Azure DevOps project 'Shop' doesn't exist in org/);
    assert.match(e.message, /Listing the organization's projects needs a token with Project and Team \(Read\)/);
    assert.match(e.message, /QAMASTER_STORE=file/);
    return true;
  });
  // a listing that fails for another reason says why, not that the token lacks a scope
  const broken = new Mock()
    .on('GET', `${BASE}/testplan/plans`, NO_PROJECT, { status: 404 })
    .on('GET', `${ORG}/projects`, { message: 'no list' });
  await assert.rejects(store(broken).plan(), (e) => {
    assert.ok(e instanceof NoProjectError);
    assert.match(e.message, /Couldn't list the organization's projects: Azure DevOps projects isn't a list/);
    assert.doesNotMatch(e.message, /Project and Team/);
    return true;
  });
  // an ordinary 404 (no TF200016) keeps its plain message and lists nothing
  const other = new Mock().on(
    'GET',
    `${BASE}/testplan/plans`,
    { message: 'The requested resource does not exist.' },
    { status: 404 },
  );
  await assert.rejects(store(other).plan(), (e) => !(e instanceof NoProjectError) && blocked(/returned 404/)(e));
  assert.equal(other.to('GET', `${ORG}/projects`).length, 0);
});

test("listProjects: every page of the organization's projects, with their names", async () => {
  const m = new Mock().on('GET', `${ORG}/projects`, fixture('projects.json'));
  assert.deepEqual(
    (await client(m).listProjects()).map((p) => p.name),
    ['Fabrikam-Fiber', 'ShopWeb', 'Shap'],
  );
});

/** A missing project 'Shop', the org's processes, and a creation that is queued, then in progress, then done. */
function mockNewProject(polls: { status: number; body?: unknown }[]) {
  const op = fixture('project-create.json');
  return new Mock()
    .on('GET', `${ORG}/projects/Shop`, NO_PROJECT, { status: 404 })
    .on('GET', `${ORG}/process/processes`, fixture('processes.json'))
    .on('POST', `${ORG}/projects`, op, { status: 202 })
    .seq('GET', `${ORG}/operations/${op.id}`, polls);
}

test('ensureProject: a dry run names the project, the default process and the plan, and writes nothing', async () => {
  const m = mockNewProject([]);
  assert.deepEqual(await store(m).ensureProject(true), { name: 'Shop', process: 'Agile', plan: 'shop-web' });
  assert.equal(m.to('POST', `${ORG}/projects`).length, 0);
  const exists = new Mock().on('GET', `${ORG}/projects/Shop`, { id: 'p', name: 'Shop', state: 'wellFormed' });
  assert.equal(await store(exists).ensureProject(), null, 'an existing project is left alone');
  assert.equal(exists.to('POST', `${ORG}/projects`).length, 0);
});

test('ensureProject: creates a private Git project with the default process, then polls the operation', async () => {
  const m = mockNewProject([
    { status: 200, body: { ...fixture('operation.json'), status: 'inProgress' } },
    { status: 200, body: fixture('operation.json') },
  ]);
  assert.deepEqual(await store(m).ensureProject(), { name: 'Shop', process: 'Agile', plan: 'shop-web' });
  const body = sent(m.to('POST', `${ORG}/projects`)[0]);
  assert.equal(body.name, 'Shop');
  assert.equal(body.visibility, 'private');
  assert.deepEqual(body.capabilities, {
    versioncontrol: { sourceControlType: 'Git' },
    processTemplate: { templateTypeId: 'adcc42ab-9882-485e-a3ed-7678f01f66bc' },
  });
  assert.equal(m.to('GET', `${ORG}/operations/066488b8-b14e-43d1-befc-a2e655266e2b`).length, 2);
});

test('ensureProject: a failed or endless creation, and a refused one (403), block with what to do', async () => {
  const failed = mockNewProject([
    { status: 200, body: { ...fixture('operation.json'), status: 'failed', resultMessage: 'The name is reserved.' } },
  ]);
  await assert.rejects(
    store(failed).ensureProject(),
    blocked(/couldn't create the project 'Shop'.*The name is reserved/),
  );
  const endless = mockNewProject([{ status: 200, body: { ...fixture('operation.json'), status: 'inProgress' } }]);
  await assert.rejects(
    store(endless).ensureProject(),
    blocked(/still creating the project 'Shop'.*_settings\/projects/),
  );
  const refused = mockNewProject([]).on('POST', `${ORG}/projects`, { message: 'denied' }, { status: 403 });
  await assert.rejects(store(refused).ensureProject(), blocked(/Create new projects/));
  // a token without the manage scope can get a 401, though the reads before it worked: not a login problem
  const unscoped = mockNewProject([]).on('POST', `${ORG}/projects`, { message: 'TF400813' }, { status: 401 });
  await assert.rejects(
    store(unscoped).ensureProject(),
    (e) => blocked(/Create new projects.*Read, write, & manage/)(e) && !/az login/.test((e as Error).message),
  );
});

test("ensureProject: a project that exists but this token can't see is named as such, not as a failed create", async () => {
  const taken = mockNewProject([]).on(
    'POST',
    `${ORG}/projects`,
    { message: 'TF200019: The following project already exists on the Azure DevOps Server: Shop.' },
    { status: 409 },
  );
  await assert.rejects(
    store(taken).ensureProject(),
    blocked(/'Shop' already exists in org.*no access.*QAMASTER_ADO_PROJECT/),
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

test('cm: find queries the whole project by the requirement types and filters', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/work/processconfiguration`, {
    requirementBacklog: { workItemTypes: [{ name: 'Issue' }] },
  });
  m.on('POST', `${BASE}/wit/wiql`, { workItems: [{ id: 3 }] }, { params: { $top: '1' } });
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
  assert.match(query, /\[System\.WorkItemType\] IN \('Issue'\)/);
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

// ---- found by the multi-agent review of this adapter (docs/porting-step3.md, step 4)

const suiteOf = (ado: FakeAdo, name: string, parent: number, suiteType = 'staticTestSuite') => {
  const st = {
    id: 900 + ado.plans[0].suites.length,
    name,
    suiteType,
    parentSuite: { id: parent },
    members: new Set<number>(),
  };
  ado.plans[0].suites.push(st);
  return st;
};

test('review A: a write that gets a 503 is not retried, since it may have landed; a read is', async () => {
  const m = new Mock();
  m.seq('POST', `${BASE}/wit/workitems/$Test Case`, [{ status: 503 }, { status: 200, body: { id: 26 } }]);
  await assert.rejects(
    store(m).create({ title: 'Cart total' }),
    blocked(/unavailable \(503\).*may or may not have been applied/),
  );
  assert.equal(m.to('POST', `${BASE}/wit/workitems/$Test Case`).length, 1, 'sent once: no duplicate test case');
  const r = new Mock();
  r.seq('GET', `${BASE}/testplan/plans`, [{ status: 503 }, { status: 200, body: fixture('plans.json') }]);
  assert.equal((await store(r).plan()).id, 1);
});

test('review B: a suite name shared by two static suites blocks, naming their paths; a path picks one', async () => {
  const ado = new FakeAdo();
  const checkout = suiteOf(ado, 'Checkout', 10);
  const cart = suiteOf(ado, 'Cart', 10);
  suiteOf(ado, 'Smoke', checkout.id);
  const cartSmoke = suiteOf(ado, 'Smoke', cart.id);
  const s = new AdoTestCases(...onFake(ado));
  await assert.rejects(
    s.addToSuite(504, 'Smoke'),
    blocked(/2 static suites .* named 'Smoke' \('Checkout\/Smoke', 'Cart\/Smoke'\)/),
  );
  await s.addToSuite(504, 'Cart/Smoke');
  assert.ok(cartSmoke.members.has(504));
});

test('review C: pages() can read org-level lists, and a response that is no list blocks', async () => {
  const m = new Mock();
  m.on('GET', `${ORG}/testplan/suites`, fixture('suites_of_26.json'), { params: { testCaseId: '26' } });
  assert.equal((await client(m).pages('testplan/suites', { testCaseId: '26' }, true)).length, 2);
  m.on('GET', `${BASE}/wit/workitems/26`, fixture('testcase_26.json'));
  await assert.rejects(client(m).pages('wit/workitems/26'), blocked(/isn't a list/));
});

test('review C: qam ado call drops a leading slash from the route', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-ado-'));
  try {
    const r = spawnSync(
      path.join(import.meta.dirname, '../plugin/bin/qam'),
      ['--repo', dir, 'ado', 'call', 'POST', '/testplan/plans'],
      {
        encoding: 'utf8',
      },
    );
    assert.match(r.stderr, /POST testplan\/plans changes Azure DevOps/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('review D: step text with <placeholders> survives the round trip, escaped twice as ADO writes it', () => {
  // the re-review found the apostrophe: written as &#x27; and read back literally
  const steps = [{ action: "Don't enter <username> or <password>", expected: 'Total is < $20 & tax, it\'s "final"' }];
  const xml = stepsXml(steps);
  assert.match(xml, /enter &amp;lt;username&amp;gt;/);
  assert.deepEqual(parseSteps(xml), steps);
});

test('review E: creating a test case in a missing suite blocks before anything is created', async () => {
  const ado = new FakeAdo();
  const before = ado.items.size;
  const s = new AdoTestCases(...onFake(ado));
  await assert.rejects(
    s.create({ title: 'Orphan?', suite: 'No such suite' }),
    blocked(/No static suite 'No such suite'/),
  );
  assert.equal(ado.items.size, before, 'no orphan test case');
  const made = await s.create({ title: 'In payments', suite: 'Payments' });
  assert.ok(ado.plans[0].suites[1].members.has(made.id));
});

test('review F: a requirement at the root iteration has no sprint', async () => {
  const ado = new FakeAdo();
  ado.add(7, 'User Story', 'Backlog item', { iteration: 'Shop' });
  const found = await new AdoRequirements(...onFake(ado)).requirements({ from: '2026-10-01', to: '2026-10-30' });
  assert.equal(found.find((x) => x.id === '7')?.sprint, undefined);
  assert.equal(found.find((x) => x.id === '3')?.sprint, 'Sprint 24');
});

test('review G: work item links encode the organization and project', () => {
  const c = new AdoClient('my org', 'My Project', () => 'Basic test', new Mock().fetch);
  assert.equal(c.itemUrl(5), 'https://dev.azure.com/my%20org/My%20Project/_workitems/edit/5');
});

test('review H: retiring leaves a query-based suite to its query, and says so', async () => {
  const ado = new FakeAdo();
  const query = suiteOf(ado, 'Open checkout cases', 10, 'dynamicTestSuite');
  query.members.add(501);
  const s = new AdoTestCases(...onFake(ado));
  const done = await s.retire(await s.show(501));
  assert.deepEqual(done, [
    'set State: Design -> Closed',
    'removed TC501 from suite Shop Web / Payments',
    'left in query-based suite Shop Web / Open checkout cases: its query decides (it leaves when the query excludes Closed)',
  ]);
});

// ---- the read path on a live Agile project (CheckMasterDemo): its requirements are Issues, which no category holds

const period = { from: '2026-10-01', to: '2026-10-30' };
const calls = (ado: FakeAdo) => (path: string) => ado.log.filter((l) => l === path).length;

test('read A: requirements and find use the process requirement types, resolved once', async () => {
  const ado = new FakeAdo();
  ado.add(15, 'Issue', 'An impediment');
  ado.add(16, 'Task', 'A task');
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements(period)).map((x) => x.id),
    ['3'],
  );
  assert.deepEqual(
    (await r.find({ kind: 'requirement' })).map((x) => x.id),
    [3],
  );
  assert.equal(calls(ado)('GET work/processconfiguration'), 1, 'types are cached per adapter');
});

test('read B: without process configuration the requirement category gives the types', async () => {
  const ado = new FakeAdo();
  ado.processConfig = false;
  ado.requirementTypes = ['Product Backlog Item'];
  ado.add(20, 'Product Backlog Item', 'PBI', { iteration: 'Shop\\Sprint 24' });
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements({ sprint: 'Sprint 24' })).map((x) => x.id),
    ['20'],
  );
});

test('read C: a project with none of those types shows the other non-test items, and says so', async () => {
  const ado = new FakeAdo();
  ado.items.delete(3);
  ado.add(15, 'Issue', 'An impediment');
  ado.add(16, 'Task', 'A task');
  ado.add(17, 'Bug', 'A bug');
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements(period)).map((x) => [x.id, x.type]),
    [['15', 'Issue']],
    'Task and Bug belong to other categories, so they are not requirements',
  );
  assert.deepEqual(
    (await r.find({ kind: 'requirement' })).map((x) => x.id),
    [15],
  );
  assert.match(r.notice ?? '', /No User Story .*other work items/);
});

test('read D: when no requirement type can be resolved it blocks, saying what to do', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/work/processconfiguration`, { message: 'gone' }, { status: 404 });
  m.on('GET', `${BASE}/wit/workitemtypecategories`, { value: [] });
  await assert.rejects(requirements(m).requirements(period), blocked(/requirement types .*Work Items \(Read\)/));
});

test('read E: an unknown sprint or module names the ones that exist, not the raw error', async () => {
  const ado = new FakeAdo();
  const r = new AdoRequirements(...onFake(ado));
  await assert.rejects(r.requirements({ sprint: 'Nope' }), (e) => {
    assert.ok(e instanceof BlockedError);
    assert.match(e.message, /'Nope'.*isn't an iteration/);
    assert.match(e.message, /Shop\\Sprint 24/);
    assert.doesNotMatch(e.message, /\$id|typeName/);
    return true;
  });
  await assert.rejects(r.requirements({ ...period, module: 'Nope' }), blocked(/'Nope'.*isn't an area.*known: Shop/s));
});

test('read E2: if the list of sprints cannot be read, the parsed message still shows', async () => {
  const m = new Mock();
  m.on('GET', `${BASE}/work/processconfiguration`, { requirementBacklog: { workItemTypes: [{ name: 'Issue' }] } });
  m.on(
    'POST',
    `${BASE}/wit/wiql`,
    { message: 'TF51011: The specified iteration path does not exist.' },
    { status: 400 },
  );
  m.on('GET', `${BASE}/wit/classificationnodes/iterations`, {}, { status: 403 });
  await assert.rejects(
    requirements(m).requirements({ sprint: 'Nope' }),
    blocked(/^Azure DevOps .*TF51011: The specified/),
  );
});

test('read F: the current sprint needs a real team, and the error says how to set it', async () => {
  const ado = new FakeAdo();
  const ok = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await ok.requirements({ currentSprint: true })).map((x) => x.id),
    ['3'],
  );
  ado.team = 'Other Team';
  await assert.rejects(
    new AdoRequirements(...onFake(ado)).requirements({ currentSprint: true }),
    blocked(/QAMASTER_ADO_TEAM/),
  );
  assert.equal(
    (await new AdoRequirements(...onFake(ado, { team: 'Other Team' })).requirements({ currentSprint: true })).length,
    1,
  );
});

test('read G: a tag filter matches a whole tag, as WIQL CONTAINS does', async () => {
  const s = new AdoTestCases(...onFake(new FakeAdo()));
  assert.equal((await s.find({ kind: 'test_case', tag: 'coup' })).length, 0);
  assert.equal((await s.find({ kind: 'test_case', tag: 'COUPON' })).length, 1);
});

// ---- review round: failures on the resolution calls, the caches, and the fallback clause

const PC = `${BASE}/work/processconfiguration`;
const CATS = `${BASE}/wit/workitemtypecategories`;
const WIQL = `${BASE}/wit/wiql`;

test('review R1: a 401 or a missing login on the resolution calls reaches the user, not a scope hint', async () => {
  const m = new Mock();
  m.on('GET', PC, { message: 'no' }, { status: 401 });
  m.on('GET', CATS, { message: 'no' }, { status: 401 });
  await assert.rejects(requirements(m).requirements(period), (e) => {
    assert.ok(e instanceof BlockedError);
    assert.match(e.message, /rejected the credentials/);
    assert.doesNotMatch(e.message, /Work Items \(Read\)/);
    return true;
  });
  const none = new AdoRequirements(
    new AdoClient(
      'org',
      'Shop',
      () => {
        throw new BlockedError('No Azure DevOps credentials. Run `az login`.');
      },
      new Mock().fetch,
      async () => {},
    ),
    settings(),
  );
  await assert.rejects(none.requirements(period), blocked(/^No Azure DevOps credentials/));
});

test('review R2: throttling and a dropped network on the resolution calls are not reported as a scope problem', async () => {
  const m = new Mock();
  m.on('GET', PC, null, { status: 429, headers: { 'retry-after': '0' } });
  await assert.rejects(requirements(m).requirements(period), blocked(/throttling/));
  const down = new AdoRequirements(
    new AdoClient(
      'org',
      'Shop',
      () => 'Basic test',
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => {},
    ),
    settings(),
  );
  await assert.rejects(down.requirements(period), blocked(/Couldn't reach Azure DevOps/));
});

test('review R3: a 403 on a read says Read, and a 401 on processconfiguration is not skipped to the category list', async () => {
  const m = new Mock();
  m.on('GET', PC, { message: 'no' }, { status: 403 });
  m.on('GET', CATS, { message: 'no' }, { status: 403 });
  await assert.rejects(requirements(m).requirements(period), (e) => {
    assert.ok(e instanceof BlockedError);
    assert.match(e.message, /work\/processconfiguration.*Work Items \(Read\)/s);
    assert.doesNotMatch(e.message, /Read & Write/);
    return true;
  });
  const m2 = new Mock();
  m2.on('GET', PC, { message: 'no' }, { status: 401 });
  await assert.rejects(requirements(m2).requirements(period), blocked(/rejected the credentials/));
  assert.equal(m2.to('GET', CATS).length, 0, 'a 401 is not a reason to try the next source');
});

test('review R4: a 403 on processconfiguration falls through to the category list', async () => {
  const ado = new FakeAdo();
  ado.processConfig = false;
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements(period)).map((x) => x.id),
    ['3'],
  );
  const m = new Mock();
  m.on('GET', PC, { message: 'no' }, { status: 403 });
  m.on('GET', CATS, {
    value: [{ referenceName: 'Microsoft.RequirementCategory', workItemTypes: [{ name: 'Issue' }] }],
  });
  m.on('POST', WIQL, { workItems: [] });
  assert.deepEqual(await requirements(m).requirements(period), []);
});

test('review R5: a 403 on the category list in the fallback keeps the test artifacts exclusion; any other failure propagates', async () => {
  const mk = (status: number) => {
    const m = new Mock();
    m.on('GET', PC, { requirementBacklog: { workItemTypes: [{ name: 'User Story' }] } });
    m.on('GET', CATS, { message: 'x' }, { status });
    m.seq('POST', WIQL, [
      { status: 200, body: { workItems: [] } },
      { status: 200, body: { workItems: [{ id: 9 }] } },
      { status: 200, body: { workItems: [] } },
    ]);
    return m;
  };
  const m = mk(403);
  await requirements(m).requirements(period);
  const queries = m.to('POST', WIQL).map((c) => JSON.parse(c.body ?? '{}').query as string);
  assert.match(queries[1], /NOT IN \('Shared Parameter', 'Shared Steps', 'Test Case', 'Test Plan', 'Test Suite'\)/);
  await assert.rejects(requirements(mk(429)).requirements(period), blocked(/throttling/));
});

test('review R6: a failed category fetch is not cached, and a retry fetches again', async () => {
  const m = new Mock();
  m.on('GET', PC, { requirementBacklog: { workItemTypes: [{ name: 'User Story' }] } });
  m.seq('GET', CATS, [
    { status: 503 },
    { status: 503 },
    { status: 503 },
    { status: 200, body: { value: [{ referenceName: 'Microsoft.BugCategory', workItemTypes: [{ name: 'Bug' }] }] } },
  ]);
  m.seq('POST', WIQL, [
    { status: 200, body: { workItems: [] } },
    { status: 200, body: { workItems: [] } },
    { status: 200, body: { workItems: [{ id: 9 }] } },
    { status: 200, body: { workItems: [] } },
  ]);
  const r = requirements(m);
  await assert.rejects(r.requirements(period), blocked(/unavailable|throttling/));
  await r.requirements(period);
  assert.ok(m.to('GET', CATS).length >= 4, 'fetched again after the failure');
  const last = m.to('POST', WIQL).map((c) => JSON.parse(c.body ?? '{}').query as string);
  assert.ok(
    last.some((qy) => /NOT IN \(.*'Bug'.*\)/.test(qy)),
    'the retry knew the Bug category',
  );
});

test('review R7: a failure on processconfiguration or on the probe is not remembered', async () => {
  const m = new Mock();
  m.seq('GET', PC, [
    { status: 429, headers: { 'retry-after': '0' } },
    { status: 429, headers: { 'retry-after': '0' } },
    { status: 429, headers: { 'retry-after': '0' } },
    { status: 200, body: { requirementBacklog: { workItemTypes: [{ name: 'Issue' }] } } },
  ]);
  m.seq('POST', WIQL, [{ status: 200, body: { workItems: [{ id: 5 }] } }]);
  m.on('GET', `${BASE}/wit/workitems`, {
    value: [
      { id: 5, rev: 1, fields: { 'System.WorkItemType': 'Issue', 'System.Title': 't', 'System.State': 'Active' } },
    ],
  });
  const r = requirements(m);
  await assert.rejects(r.requirements(period), blocked(/throttling/));
  assert.equal((await r.requirements(period)).length, 1, 'the second call on the same adapter succeeds');
  const p = new Mock();
  p.on('GET', PC, { requirementBacklog: { workItemTypes: [{ name: 'Issue' }] } });
  p.on('GET', CATS, { value: [] });
  p.seq('POST', WIQL, [
    { status: 400, body: { message: 'boom' } },
    { status: 200, body: { workItems: [] } },
  ]);
  const r2 = requirements(p);
  await assert.rejects(r2.requirements(period), blocked(/boom/));
  await r2.requirements(period);
  assert.equal(
    p.to('POST', WIQL).filter((c) => c.url.searchParams.get('$top') === '1').length,
    3,
    'the probe ran again',
  );
});

test('read A2: each cache is hit once, the probe and the category list too', async () => {
  const ado = new FakeAdo();
  ado.items.delete(3);
  ado.add(15, 'Issue', 'An impediment');
  const r = new AdoRequirements(...onFake(ado));
  await r.requirements(period);
  await r.find({ kind: 'requirement' });
  await r.requirements(period);
  assert.equal(calls(ado)('GET work/processconfiguration'), 1);
  assert.equal(calls(ado)('GET wit/workitemtypecategories'), 1);
  assert.equal(calls(ado)('POST wit/wiql'), 2 + 3, 'two probes, then one list per call');
});

test('read C2: a project with no work items at all stays on the process types, with no notice', async () => {
  const ado = new FakeAdo();
  ado.items.delete(3);
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(await r.requirements(period), []);
  assert.equal(r.notice, undefined);
  ado.add(17, 'Bug', 'A bug');
  assert.deepEqual(await new AdoRequirements(...onFake(ado)).find({ kind: 'requirement' }), []);
});

test('read C3: a type on the requirement backlog that another category also lists is not excluded', async () => {
  const m = new Mock();
  m.on('GET', PC, { requirementBacklog: { workItemTypes: [{ name: 'User Story' }, { name: 'Bug' }] } });
  const cat = (referenceName: string, ...names: string[]) => ({
    referenceName,
    workItemTypes: names.map((name) => ({ name })),
  });
  m.on('GET', CATS, {
    value: [
      cat('Microsoft.RequirementCategory', 'User Story', 'Bug'),
      cat('Microsoft.BugCategory', 'Bug'),
      cat('Microsoft.TaskCategory', 'Task'),
    ],
  });
  m.seq('POST', WIQL, [
    { status: 200, body: { workItems: [] } },
    { status: 200, body: { workItems: [{ id: 9 }] } },
    { status: 200, body: { workItems: [] } },
  ]);
  await requirements(m).requirements(period);
  const notIn =
    m
      .to('POST', WIQL)
      .map((c) => JSON.parse(c.body ?? '{}').query as string)
      .find((qy) => /NOT IN/.test(qy)) ?? '';
  assert.match(notIn, /'Task'/);
  assert.doesNotMatch(notIn, /'Bug'/, 'Bug is a requirement type here, so the other categories do not exclude it');
  const ado = new FakeAdo();
  ado.items.delete(3);
  ado.requirementTypes = ['User Story', 'Bug'];
  ado.bugTypes = ['Bug'];
  ado.add(17, 'Bug', 'A bug on the backlog');
  ado.add(18, 'Issue', 'An impediment');
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.find({ kind: 'requirement' })).map((x) => x.id),
    [17],
    'own types find the Bug, so no fallback',
  );
  // with no Bug or User Story item, the fallback runs: Bug is a requirement type here, so it is not in NOT IN
  ado.items.delete(17);
  ado.add(17, 'Task', 't');
  const r2 = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r2.find({ kind: 'requirement' })).map((x) => x.id),
    [18],
  );
});

test('read C4: one stray or Removed User Story does not hide the Issues, and creating one stays consistent', async () => {
  const ado = new FakeAdo();
  ado.items.delete(3);
  for (const id of [15, 16, 17]) ado.add(id, 'Issue', `Issue ${id}`);
  ado.add(30, 'User Story', 'Gone', { state: 'Removed' });
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.find({ kind: 'requirement' })).map((x) => x.id),
    [15, 16, 17],
    'a Removed story is not a requirement',
  );
  assert.match(r.notice ?? '', /No User Story/);
  ado.items.delete(30);
  await r.create({ title: 'New story' });
  assert.equal(r.notice, undefined, 'the notice is dropped once the project has a story');
  assert.deepEqual(
    (await r.find({ kind: 'requirement' })).map((x) => x.title),
    ['New story'],
    'the same adapter answers as a new one would',
  );
  assert.deepEqual(
    (await new AdoRequirements(...onFake(ado)).find({ kind: 'requirement' })).map((x) => x.title),
    ['New story'],
  );
});

test('read H: a valid module filters by area; an area of the tree is known', async () => {
  const ado = new FakeAdo();
  ado.add(40, 'User Story', 'In web', { area: 'Shop\\Web', iteration: 'Shop\\Sprint 24' });
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements({ sprint: 'Sprint 24', module: 'Web' })).map((x) => x.id),
    ['40'],
  );
  await assert.rejects(r.requirements({ ...period, module: 'Nope' }), blocked(/known: Shop, Shop\\Web/));
});

test('read H2: a module copied from the hint, with the project in front, works as it is', async () => {
  const ado = new FakeAdo();
  ado.add(41, 'User Story', 'In web', { area: 'Shop\\Web', iteration: 'Shop\\Sprint 24' });
  const r = new AdoRequirements(...onFake(ado));
  for (const module of ['Shop\\Web', 'Web'])
    assert.deepEqual(
      (await r.requirements({ sprint: 'Sprint 24', module })).map((x) => x.id),
      ['41'],
      module,
    );
  assert.deepEqual(
    (await r.requirements({ sprint: 'Sprint 24', module: 'Shop' })).map((x) => x.id),
    ['3', '41'],
    'the project alone is the whole tree',
  );
  await assert.rejects(r.requirements({ ...period, module: 'Shop\\Nope' }), blocked(/known: Shop, Shop\\Web/));
});

// ---- qam doctor --check-write: can this user write plans, suites and test cases? Only GETs are ever sent.

const NODE = 'vstfs:///Classification/Node/';
const writeCheck = (ado: FakeAdo, more: Partial<AdoSettings> = {}) =>
  new AdoTestCases(...onFake(ado, more)).checkWrite();
const onlyReads = (ado: FakeAdo) =>
  assert.ok(
    ado.log.length > 0 && ado.log.every((l) => l.startsWith('GET ')),
    `a write was sent: ${ado.log.filter((l) => !l.startsWith('GET ')).join(', ')}`,
  );

test('write check: Azure DevOps says the user holds the permissions, from one combined query, and only GETs are sent', async () => {
  const ado = new FakeAdo();
  const r = await writeCheck(ado);
  assert.deepEqual([r.state, r.area, r.missing, r.testCaseType], ['allowed', 'Shop', [], 'present']);
  assert.deepEqual(ado.permissionCalls, [{ bits: 224, tokens: [`${NODE}${ado.areaId('Shop')}`] }]);
  assert.match(
    r.detail,
    /^Azure DevOps says your user holds Manage test plans, Manage test suites and Edit work items/,
  );
  assert.match(r.detail, /area 'Shop'/);
  assert.match(r.detail, /licence.*not checked/i);
  assert.match(r.detail, /Test Management \(Read & Write\).*Work Items \(Read & Write\).*first write/s);
  onlyReads(ado);
});

test('write check: the bits are the live CSS ones (securitynamespaces) and the namespace is the area one', async () => {
  const ns = (await new AdoClient('org', 'Shop', () => 'Basic t', new FakeAdo().fetch).get(
    `securitynamespaces/${CSS_NAMESPACE}`,
  )) as { value: { actions: { bit: number; displayName: string }[] }[] };
  for (const w of WRITE_BITS)
    assert.ok(
      ns.value[0].actions.some((a) => a.bit === w.bit && a.displayName === w.name),
      `${w.bit} ${w.name}`,
    );
  assert.deepEqual(
    WRITE_BITS.map((w) => w.bit),
    [64, 128, 32],
  );
});

test("write check: a plan under a child area is checked with the child's own token, ancestors colon-joined", async () => {
  const ado = new FakeAdo();
  ado.areas = ['Web'];
  ado.subAreas = { Web: ['Cart'] };
  ado.plans[0].areaPath = 'Shop\\Web\\Cart';
  const child = [ado.areaId('Shop'), ado.areaId('Shop\\Web'), ado.areaId('Shop\\Web\\Cart')]
    .map((id) => `${NODE}${id}`)
    .join(':');
  ado.denied.set(child, 64); // a deny on the child area only: the root says yes
  const r = await writeCheck(ado);
  assert.equal(ado.permissionCalls[0].tokens[0], child);
  assert.deepEqual([r.state, r.area, r.missing], ['blocked', 'Shop\\Web\\Cart', ['Manage test plans']]);
  assert.match(r.detail, /area 'Shop\\Web\\Cart'/);
  onlyReads(ado);
  // and a deny on the root alone does not touch the child's own answer
  const other = new FakeAdo();
  other.areas = ['Web'];
  other.subAreas = { Web: ['Cart'] };
  other.plans[0].areaPath = 'Shop\\Web\\Cart';
  other.denied.set(`${NODE}${other.areaId('Shop')}`, 224);
  const o = await writeCheck(other);
  assert.deepEqual(
    [o.state, o.missing],
    ['blocked', ['Edit work items in this node']],
    'only the work-item right is read at the root',
  );
});

test('review 1: Edit work items is checked where test cases land (the root area), the plan rights on the plan area', async () => {
  const setup = () => {
    const ado = new FakeAdo();
    ado.subAreas = { Web: ['Cart'] };
    ado.plans[0].areaPath = 'Shop\\Web';
    return ado;
  };
  const web = (a: FakeAdo) => `${NODE}${a.areaId('Shop')}:${NODE}${a.areaId('Shop\\Web')}`;
  const ado = setup();
  const ok = await writeCheck(ado);
  assert.equal(ok.state, 'allowed');
  assert.deepEqual(
    ado.permissionCalls.map((c) => [c.bits, c.tokens[0]]),
    [
      [192, web(ado)],
      [32, `${NODE}${ado.areaId('Shop')}`],
    ],
  );
  assert.match(
    ok.detail,
    /Manage test plans and Manage test suites on area 'Shop\\Web'.*Edit work items in this node on area 'Shop'/s,
  );
  // rights on the plan's area but not at the root: the first test-case create would be a 403
  const noRoot = setup();
  noRoot.denied.set(`${NODE}${noRoot.areaId('Shop')}`, 32);
  const r = await writeCheck(noRoot);
  assert.deepEqual([r.state, r.missing], ['blocked', ['Edit work items in this node']]);
  assert.match(r.detail, /lacks Edit work items in this node on area 'Shop'/);
  // a deny of 32 on the plan's area alone does not block: no test case lands there
  const noWeb = setup();
  noWeb.denied.set(web(noWeb), 32);
  assert.equal((await writeCheck(noWeb)).state, 'allowed');
  onlyReads(ado);
});

test('review 2: single-bit answers that all say yes, or are no boolean, are unknown, never "lacks everything"', async () => {
  const mk = (answers: Record<number, unknown>) => {
    const m = new Mock();
    m.on('GET', `${BASE}/testplan/plans`, { value: [{ id: 1, name: 'Shop Web', areaPath: 'Shop' }] });
    m.on('GET', `${BASE}/wit/classificationnodes/areas`, { identifier: 'r', name: 'Shop' });
    m.on('GET', `${BASE}/wit/workitemtypes/Test Case`, { name: 'Test Case' });
    for (const [bits, v] of Object.entries(answers))
      m.on('GET', `${ORG}/permissions/${CSS_NAMESPACE}/${bits}`, { count: 1, value: [v] });
    return store(m, { repoName: 'Shop Web' }).checkWrite();
  };
  const disagree = await mk({ 224: false, 64: true, 128: true, 32: true });
  assert.deepEqual([disagree.state, disagree.missing], ['unknown', []]);
  assert.match(disagree.detail, /^unknown: .*disagree/);
  const noBool = await mk({ 224: false, 64: true, 128: 'maybe', 32: true });
  assert.deepEqual([noBool.state, noBool.missing], ['unknown', []]);
  const some = await mk({ 224: false, 64: false, 128: 'maybe', 32: true });
  assert.deepEqual([some.state, some.missing], ['blocked', ['Manage test plans']]);
});

test('review 3: the unknown text names the first write that would tell: the plan POST only when there is no plan', async () => {
  const withPlan = new FakeAdo();
  withPlan.permissionStatus = 403;
  const a = await writeCheck(withPlan);
  assert.doesNotMatch(a.detail, /POST testplan\/plans/);
  assert.match(a.detail, /creating a suite or test case/);
  const noPlan = new FakeAdo(false);
  noPlan.permissionStatus = 403;
  assert.match(
    (await writeCheck(noPlan, { repoName: 'shop-web' })).detail,
    /POST testplan\/plans \(creating the plan\)/,
  );
});

test('review 4: a sprint equal to the project name queries UNDER the project, as the TF51011 hint lists it', async () => {
  const ado = new FakeAdo();
  ado.add(42, 'User Story', 'In sprint', { iteration: 'Shop\\Sprint 24' });
  const r = new AdoRequirements(...onFake(ado));
  assert.ok((await r.requirements({ sprint: 'Shop' })).some((x) => x.id === '42'));
  assert.ok((await r.requirements({ sprint: 'Shop\\Sprint 24' })).some((x) => x.id === '42'));
});

test('review 7: the plan choices list at most 20 plans, then say how many more, and the create choice stays last', async () => {
  const m = new Mock().on('GET', `${BASE}/testplan/plans`, {
    value: Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Plan ${i + 1}` })),
  });
  await assert.rejects(store(m, { repoName: 'billing' }).plan(), (e) => {
    assert.ok(e instanceof NoPlanError);
    assert.equal(e.plans.length, 25, 'the data keeps every plan');
    assert.match(e.message, /\n {2}20\. Use the plan 'Plan 20'/);
    assert.doesNotMatch(e.message, /Plan 21'/);
    assert.match(e.message, /and 5 more.*QAMASTER_ADO_PLAN=<exact plan name>/);
    assert.match(e.message, /\n {2}21\. Create a new plan/);
    return true;
  });
});

test('review 9: an unknown permission answer with a missing Test Case type leads with the certain answer', async () => {
  const ado = new FakeAdo();
  ado.permissionStatus = 403;
  ado.testCaseType = false;
  const r = await writeCheck(ado);
  assert.deepEqual([r.state, r.testCaseType, r.missing], ['blocked', 'missing', []]);
  const lines = r.detail.split('\n');
  assert.match(lines[0], /process has no Test Case work item type/);
  assert.match(lines[1], /^unknown: .*403/);
});

test('review 10: area paths and the project are matched without regard to case', async () => {
  const ado = new FakeAdo();
  ado.subAreas = { Web: ['Cart'] };
  ado.plans[0].areaPath = 'shop\\web\\CART';
  const r = await writeCheck(ado);
  assert.equal(r.state, 'allowed');
  const want = [ado.areaId('Shop'), ado.areaId('Shop\\Web'), ado.areaId('Shop\\Web\\Cart')]
    .map((id) => `${NODE}${id}`)
    .join(':');
  assert.equal(ado.permissionCalls[0].tokens[0], want);
});

test('write check: a missing permission is named, after the combined query says false', async () => {
  for (const [bit, name] of [
    [64, 'Manage test plans'],
    [128, 'Manage test suites'],
    [32, 'Edit work items in this node'],
  ] as const) {
    const ado = new FakeAdo();
    ado.denied.set(`${NODE}${ado.areaId('Shop')}`, bit);
    const r = await writeCheck(ado);
    assert.equal(r.state, 'blocked', name);
    assert.deepEqual(r.missing, [name]);
    assert.deepEqual(
      ado.permissionCalls.map((c) => c.bits),
      [224, 64, 128, 32],
      'the combined query first, the single bits only after a false',
    );
    assert.match(r.detail, new RegExp(`^Azure DevOps says your user lacks ${name} on area 'Shop' in org/Shop`));
    assert.match(r.detail, /project administrator.*QAMASTER_ADO_PROJECT/s);
    onlyReads(ado);
  }
  const two = new FakeAdo();
  two.denied.set(`${NODE}${two.areaId('Shop')}`, 128 + 32);
  assert.deepEqual((await writeCheck(two)).missing, ['Manage test suites', 'Edit work items in this node']);
});

test('write check: when the permissions call answers 403 or 404 the state is unknown, naming the first write that would tell; a 401 is rejected credentials', async () => {
  const rejected = new FakeAdo();
  rejected.permissionStatus = 401;
  await assert.rejects(writeCheck(rejected), /rejected the credentials/);
  for (const status of [403, 404]) {
    const ado = new FakeAdo();
    ado.permissionStatus = status;
    const r = await writeCheck(ado);
    assert.equal(r.state, 'unknown', String(status));
    assert.match(r.detail, /^unknown: /);
    assert.match(r.detail, /creating a suite or test case/);
    assert.match(r.detail, /Test Management \(Read & Write\).*Work Items \(Read & Write\)/s);
    assert.deepEqual(r.missing, []);
    onlyReads(ado);
  }
  const odd = new Mock();
  odd.on('GET', `${BASE}/testplan/plans`, { value: [{ id: 1, name: 'Shop Web', areaPath: 'Shop' }] });
  odd.on('GET', `${BASE}/wit/classificationnodes/areas`, { identifier: 'r', name: 'Shop' });
  odd.on('GET', `${BASE}/wit/workitemtypes/Test Case`, { name: 'Test Case' });
  odd.on('GET', `${ORG}/permissions/${CSS_NAMESPACE}/224`, { count: 1, value: ['maybe'] });
  assert.equal(
    (await store(odd, { repoName: 'Shop Web' }).checkWrite()).state,
    'unknown',
    'an answer that is no boolean',
  );
});

test("write check: an area that can't be resolved is said so, never replaced by the root", async () => {
  const gone = new FakeAdo();
  gone.plans[0].areaPath = 'Shop\\Gone';
  const r = await writeCheck(gone);
  assert.equal(r.state, 'unknown');
  assert.match(r.detail, /^unknown: .*can't find the area 'Shop\\Gone'/);
  assert.deepEqual(
    gone.permissionCalls.map((c) => c.bits),
    [32],
    'the plan rights were not asked about the root instead: only Edit work items, which is a root question anyway',
  );
  const elsewhere = new FakeAdo();
  elsewhere.plans[0].areaPath = 'Other\\Web';
  assert.equal((await writeCheck(elsewhere)).state, 'unknown');
  assert.deepEqual(
    elsewhere.permissionCalls.map((c) => c.bits),
    [32],
  );
  // a plan without an area path, and an area list this token can't read
  const m = new Mock();
  mockPlan(m);
  m.on('GET', `${BASE}/wit/workitemtypes/Test Case`, { name: 'Test Case' });
  m.on('GET', `${BASE}/wit/classificationnodes/areas`, { identifier: 'r', name: 'Shop' });
  m.on('GET', `${ORG}/permissions/${CSS_NAMESPACE}/32`, { count: 1, value: [true] });
  const noArea = await store(m, { repoName: 'Shop Web' }).checkWrite();
  assert.equal(noArea.state, 'unknown');
  assert.match(noArea.detail, /has no area path/);
  const m2 = new Mock();
  m2.on('GET', `${BASE}/testplan/plans`, { value: [{ id: 1, name: 'Shop Web', areaPath: 'Shop' }] });
  m2.on('GET', `${BASE}/wit/classificationnodes/areas`, {}, { status: 403 });
  m2.on('GET', `${BASE}/wit/workitemtypes/Test Case`, { name: 'Test Case' });
  const denied = await store(m2, { repoName: 'Shop Web' }).checkWrite();
  assert.equal(denied.state, 'unknown');
  assert.equal(m2.calls.filter((c) => c.url.pathname.includes('/permissions/')).length, 0);
});

test("write check: with no plan yet (the create case) the project's root area is checked, and it says so", async () => {
  const ado = new FakeAdo(false);
  const r = await writeCheck(ado, { repoName: 'shop-web' });
  assert.deepEqual([r.state, r.area], ['allowed', 'Shop']);
  assert.deepEqual(ado.permissionCalls[0].tokens, [`${NODE}${ado.areaId('Shop')}`]);
  assert.match(r.detail, /no plan yet.*root area/i);
  ado.denied.set(`${NODE}${ado.areaId('Shop')}`, 64);
  assert.deepEqual((await writeCheck(ado, { repoName: 'shop-web' })).missing, ['Manage test plans']);
  onlyReads(ado);
});

test('write check: a process without the Test Case type is reported apart from the permissions', async () => {
  const ado = new FakeAdo();
  ado.testCaseType = false;
  const r = await writeCheck(ado);
  assert.deepEqual([r.state, r.testCaseType, r.missing], ['blocked', 'missing', []]);
  assert.match(r.detail, /process has no Test Case work item type/);
  assert.match(r.detail, /Azure DevOps says your user holds/, 'the permissions result is still there');
  ado.denied.set(`${NODE}${ado.areaId('Shop')}`, 64);
  const both = await writeCheck(ado);
  assert.deepEqual([both.missing, both.testCaseType], [['Manage test plans'], 'missing']);
  // a type this token can't read is not "missing"
  const unreadable = new FakeAdo();
  unreadable.typeStatus = 403;
  const u = await writeCheck(unreadable);
  assert.deepEqual([u.state, u.testCaseType], ['allowed', 'unknown']);
  assert.match(u.detail, /couldn't check .*Test Case/);
});

test('write check: two plans matching the repo name block with their own message, not a guess', async () => {
  const ado = new FakeAdo();
  ado.plans.push({ ...ado.plans[0], id: 2 });
  await assert.rejects(writeCheck(ado), blocked(/2 test plans .* match/));
});

test('review R8: a non-JSON error body shows as it is, and long messages are cut at 300 characters', async () => {
  const html = new Mock();
  html.on('GET', `${BASE}/wit/workitems/1`, null, { status: 502 });
  const raw = new AdoClient(
    'org',
    'Shop',
    () => 'Basic t',
    async () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    async () => {},
  );
  await assert.rejects(raw.get('wit/workitems/1'), blocked(/502: <html>Bad Gateway<\/html>/));
  const long = (body: string) =>
    new AdoClient(
      'org',
      'Shop',
      () => 'Basic t',
      async () => new Response(body, { status: 400 }),
      async () => {},
    );
  for (const body of [JSON.stringify({ message: 'x'.repeat(1000) }), 'y'.repeat(1000)])
    await assert.rejects(long(body).get('wit/workitems/1'), (e) => {
      assert.ok(e instanceof BlockedError);
      assert.ok(e.message.length < 400, `message is ${e.message.length} long`);
      assert.match(e.message, /returned 400: [xy]{300}$/);
      return true;
    });
});

test('review 11: the fake UNDER filter respects path segments: Web does not reach Webshop', async () => {
  const ado = new FakeAdo();
  ado.areas = ['Web', 'Webshop'];
  ado.add(43, 'User Story', 'In webshop', { area: 'Shop\\Webshop', iteration: 'Shop\\Sprint 24' });
  ado.add(44, 'User Story', 'In web', { area: 'Shop\\Web', iteration: 'Shop\\Sprint 24' });
  const r = new AdoRequirements(...onFake(ado));
  assert.deepEqual(
    (await r.requirements({ sprint: 'Sprint 24', module: 'Web' })).map((x) => x.id),
    ['44'],
  );
});
