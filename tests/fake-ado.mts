/**
 * An in-memory Azure DevOps behind fetch, for the contract suites (tests/contracts.mts) on the real ADO adapter. It
 * answers only the calls the adapter makes, the way the REST API does: work items with revs (a failed test on /rev is
 * a 412), WIQL for the clauses the adapter writes, plans, suites and their test cases.
 */
type Json = Record<string, unknown>;
type WorkItem = { id: number; rev: number; fields: Record<string, unknown>; relations: { rel: string; url: string }[] };
type Suite = { id: number; name: string; suiteType: string; parentSuite?: { id: number }; members: Set<number> };

const ok = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status });

export class FakeAdo {
  readonly org = 'org';
  readonly project = 'Shop';
  items = new Map<number, WorkItem>();
  plans: { id: number; name: string; suites: Suite[] }[] = [];
  private nextId = 1000;

  /** `withPlan: false` starts with no test plan, for ensurePlan. */
  constructor(withPlan = true) {
    const root: Suite = { id: 10, name: 'Shop Web', suiteType: 'staticTestSuite', members: new Set() };
    const payments: Suite = {
      id: 11,
      name: 'Payments',
      suiteType: 'staticTestSuite',
      parentSuite: { id: 10 },
      members: new Set(),
    };
    if (withPlan) this.plans.push({ id: 1, name: 'Shop Web', suites: [root, payments] });
    this.add(501, 'Test Case', 'Coupon applies at checkout', {
      tags: 'coupon; path:shop/checkout/**',
      test: 'bdd:@TC-CHECKOUT-001',
    });
    this.add(504, 'Test Case', 'Gift card balance shows', { tags: 'giftcard' });
    this.add(3, 'User Story', 'Coupons at checkout', {
      iteration: 'Shop\\Sprint 24',
      criteria: '<ul><li>SAVE10 takes 10% off</li></ul>',
    });
    payments.members.add(501);
  }

  add(
    id: number,
    type: string,
    title: string,
    o: { tags?: string; test?: string; iteration?: string; criteria?: string } = {},
  ) {
    this.items.set(id, {
      id,
      rev: 1,
      fields: {
        'System.WorkItemType': type,
        'System.Title': title,
        'System.State': type === 'Test Case' ? 'Design' : 'Active',
        ...(o.tags ? { 'System.Tags': o.tags } : {}),
        ...(o.test ? { 'Microsoft.VSTS.TCM.AutomatedTestName': o.test } : {}),
        ...(o.iteration ? { 'System.IterationPath': o.iteration } : {}),
        ...(o.criteria ? { 'Microsoft.VSTS.Common.AcceptanceCriteria': o.criteria } : {}),
      },
      relations: [],
    });
  }

  fetch = async (raw: string, init: RequestInit): Promise<Response> => {
    const url = new URL(raw);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const p = decodeURIComponent(url.pathname)
      .replace(`/${this.org}/${this.project}/_apis/`, '')
      .replace(`/${this.org}/_apis/`, '');
    let m: RegExpMatchArray | null;
    const planRef = (pl: { id: number; name: string; suites: Suite[] }) => ({
      id: pl.id,
      name: pl.name,
      rootSuite: { id: pl.suites[0].id, name: pl.name },
    });
    if (method === 'GET' && p === 'testplan/plans') return ok({ value: this.plans.map(planRef) });
    if (method === 'POST' && p === 'testplan/plans') {
      const id = this.nextId++;
      const pl = { id, name: String(body.name), suites: [] as Suite[] };
      pl.suites.push({ id: this.nextId++, name: pl.name, suiteType: 'staticTestSuite', members: new Set() });
      this.plans.push(pl);
      return ok(planRef(pl));
    }
    m = p.match(/^testplan\/Plans\/(\d+)\/suites$/);
    if (m) {
      const pl = this.plans.find((x) => x.id === Number(m?.[1]));
      if (!pl) return ok({ message: 'no plan' }, 404);
      if (method === 'GET') return ok({ value: pl.suites.map(({ members: _, ...st }) => st) });
      if (method === 'POST') {
        const st: Suite = {
          id: this.nextId++,
          name: String(body.name),
          suiteType: String(body.suiteType),
          parentSuite: body.parentSuite,
          members: new Set(),
        };
        pl.suites.push(st);
        const { members: _, ...out } = st;
        return ok(out);
      }
    }
    const allSuites = this.plans.flatMap((pl) => pl.suites.map((st) => ({ pl, st })));
    m = p.match(/^testplan\/Plans\/\d+\/Suites\/(\d+)\/TestCase$/);
    if (m) {
      const suite = allSuites.find((x) => x.st.id === Number(m?.[1]))?.st;
      if (!suite) return ok({ message: 'no suite' }, 404);
      if (method === 'GET') return ok({ value: [...suite.members].map((id) => ({ workItem: { id } })) });
      if (method === 'POST') for (const w of body as { workItem: { id: number } }[]) suite.members.add(w.workItem.id);
      if (method === 'DELETE')
        for (const id of (url.searchParams.get('testIds') ?? '').split(',')) suite.members.delete(Number(id));
      return ok({ value: [] });
    }
    if (method === 'GET' && p === 'testplan/suites') {
      const id = Number(url.searchParams.get('testCaseId'));
      return ok({
        value: allSuites
          .filter((x) => x.st.members.has(id))
          .map((x) => ({
            id: x.st.id,
            name: x.st.name,
            plan: { id: x.pl.id, name: x.pl.name },
            project: { name: this.project },
          })),
      });
    }
    if (method === 'POST' && p === 'wit/wiql')
      return ok({ workItems: this.wiql(String(body.query), Number(url.searchParams.get('$top'))) });
    if (method === 'GET' && p === 'wit/workitems') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
      return ok({
        value: ids
          .map((id) => this.items.get(id) ?? null)
          .map((w) => (w ? { id: w.id, rev: w.rev, fields: w.fields } : null)),
      });
    }
    if (method === 'GET' && p === 'wit/workitemtypecategories/Microsoft.RequirementCategory')
      return ok({ defaultWorkItemType: { name: 'User Story' } });
    m = p.match(/^wit\/workitems\/(\d+)$/);
    if (m) {
      const w = this.items.get(Number(m[1]));
      if (!w) return ok({ message: `TF401232: Work item ${m[1]} does not exist` }, 404);
      if (method === 'GET') return ok(w);
      if (method === 'DELETE') {
        this.items.delete(w.id);
        return ok({ id: w.id });
      }
      if (method === 'PATCH') return this.patch(w, body);
    }
    m = p.match(/^wit\/workitems\/\$(.+)$/);
    if (method === 'POST' && m) {
      const id = this.nextId++;
      this.add(id, m[1], '');
      const w = this.items.get(id) as WorkItem;
      w.rev = 0;
      return this.patch(w, body);
    }
    return ok({ message: `fake ADO: unexpected ${method} ${p}` }, 400);
  };

  private patch(w: WorkItem, ops: Json[]): Response {
    for (const op of ops) {
      if (op.op === 'test' && op.path === '/rev' && op.value !== w.rev)
        return ok({ message: 'TF26071: This work item has been changed by someone else since you opened it.' }, 412);
    }
    for (const op of ops) {
      const path = String(op.path);
      if (op.op === 'add' && path.startsWith('/fields/')) w.fields[path.slice(8)] = op.value;
      if (op.op === 'add' && path === '/relations/-') w.relations.push(op.value as WorkItem['relations'][number]);
      if (op.op === 'remove' && path.startsWith('/relations/')) w.relations.splice(Number(path.slice(11)), 1);
    }
    w.rev += 1;
    return ok(w);
  }

  /** The WIQL clauses the adapter writes, evaluated the way ADO does (CONTAINS ignores case). */
  private wiql(query: string, top: number): { id: number }[] {
    const s = (re: RegExp) => query.match(re)?.[1]?.replace(/''/g, "'");
    const type = s(/\[System\.WorkItemType\] = '((?:[^']|'')*)'/);
    const tag = s(/\[System\.Tags\] CONTAINS '((?:[^']|'')*)'/)?.toLowerCase();
    const text = s(/\[System\.Title\] CONTAINS '((?:[^']|'')*)'/)?.toLowerCase();
    const state = s(/\[System\.State\] = '((?:[^']|'')*)'/);
    const under = s(/\[System\.IterationPath\] UNDER '((?:[^']|'')*)'/);
    const testsOnly = query.includes("IN GROUP 'Microsoft.TestCaseCategory'");
    const reqsOnly = query.includes('NOT IN (') || query.includes("IN GROUP 'Microsoft.RequirementCategory'");
    return [...this.items.values()]
      .filter((w) => {
        const f = w.fields;
        const t = String(f['System.WorkItemType']);
        if (type && t !== type) return false;
        if (testsOnly && t !== 'Test Case') return false;
        if (reqsOnly && t === 'Test Case') return false;
        if (
          tag &&
          !String(f['System.Tags'] ?? '')
            .toLowerCase()
            .includes(tag)
        )
          return false;
        if (
          text &&
          !String(f['System.Title'] ?? '')
            .toLowerCase()
            .includes(text)
        )
          return false;
        if (state && f['System.State'] !== state) return false;
        if (under && !String(f['System.IterationPath'] ?? '').startsWith(under)) return false;
        return true;
      })
      .sort((a, b) => a.id - b.id)
      .slice(0, top)
      .map((w) => ({ id: w.id }));
  }
}
