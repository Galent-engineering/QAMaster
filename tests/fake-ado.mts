/**
 * An in-memory Azure DevOps behind fetch, for the contract suites (tests/contracts.mts) on the real ADO adapter. It
 * answers only the calls the adapter makes, the way the REST API does: work items with revs (a failed test on /rev is
 * a 412), WIQL for the clauses the adapter writes, plans, suites and their test cases. The error bodies (TF51011,
 * VS402612) and work/processconfiguration are hand-built from messages and shapes seen live, not recordings.
 */
import { createHash } from 'node:crypto';

type Json = Record<string, unknown>;
type WorkItem = { id: number; rev: number; fields: Record<string, unknown>; relations: { rel: string; url: string }[] };
type Suite = { id: number; name: string; suiteType: string; parentSuite?: { id: number }; members: Set<number> };

/** The CSS (area path) security namespace, which guards plans, suites and work items (live: securitynamespaces). */
export const CSS_NAMESPACE = '83e28ad4-2d72-4ceb-97b0-c7726d5502c3';

const ok = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status });

/** WIQL UNDER: the node itself or a descendant, never a sibling that shares a prefix. */
const isUnder = (path: string, node: string) => path === node || path.startsWith(`${node}\\`);

export class FakeAdo {
  readonly org = 'org';
  readonly project = 'Shop';
  items = new Map<number, WorkItem>();
  plans: { id: number; name: string; areaPath?: string; suites: Suite[] }[] = [];
  /** The process's requirement types, as work/processconfiguration and the RequirementCategory list them (Agile). */
  requirementTypes = ['User Story'];
  /** false: work/processconfiguration is refused (404), as for a token or process that can't read it. */
  processConfig = true;
  /** The area tree under the root, like iterations. */
  areas = ['Web'];
  /** Areas under an area, by its name under the root: { Web: ['Cart'] } makes Shop\\Web\\Cart. */
  subAreas: Record<string, string[]> = {};
  /** Permission bits a token is denied (a deny on a child area, say): permissions answers false for those. */
  denied = new Map<string, number>();
  /** Set: permissions answers with this status instead (401, 403, 404), as for a token that can't query them. */
  permissionStatus: number | null = null;
  /** false: the project's process has no Test Case type (the Basic process). */
  testCaseType = true;
  /** Set: workitemtypes answers with this status instead. */
  typeStatus: number | null = null;
  /** Every permissions call, in order: the bits asked about and the tokens. */
  permissionCalls: { bits: number; tokens: string[] }[] = [];
  /** The types in the bug category; a process may list a requirement type here too. */
  bugTypes = ['Bug'];
  /** The iteration tree under the root (live: classificationnodes/iterations without the 'Iteration' structure node). */
  iterations = ['Sprint 24'];
  /** The only team that exists; @CurrentIteration with another is the live 500 VS402612. */
  team = 'Shop Team';
  currentIteration = 'Shop\\Sprint 24';
  /** The organization's other projects, as projects lists them with this one. */
  otherProjects = ['Billing', 'Shop Web'];
  /** true: this project doesn't exist, so every project-level call is the 404 TF200016 (envelope hand-built). */
  missingProject = false;
  /** Set: projects answers with this status instead (403), as for a token without Project and Team (Read). */
  projectsStatus: number | null = null;
  /** The organization's processes (process/processes); a new project gets the default one. */
  processes = [
    { id: 'adcc42ab-9882-485e-a3ed-7678f01f66bc', name: 'Agile', type: 'system', isDefault: true },
    { id: '6b724908-ef14-45cf-84f8-768b5384da45', name: 'Scrum', type: 'system', isDefault: false },
  ];
  /** The body of every POST projects: the projects created. */
  createdProjects: Json[] = [];
  /** Set: POST projects answers with this status instead (403, as without "Create new projects"). */
  createStatus: number | null = null;
  /** What operations/{id} answers for a creation, poll by poll (the last repeats); succeeded makes the project exist. */
  operationStatuses = ['inProgress', 'succeeded'];
  /** 'METHOD path' of every call, to count them. */
  log: string[] = [];
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
    o: { tags?: string; test?: string; iteration?: string; criteria?: string; area?: string; state?: string } = {},
  ) {
    this.items.set(id, {
      id,
      rev: 1,
      fields: {
        'System.WorkItemType': type,
        'System.Title': title,
        'System.State': o.state ?? (type === 'Test Case' ? 'Design' : 'Active'),
        ...(o.area ? { 'System.AreaPath': o.area } : {}),
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
    this.log.push(`${method} ${p}`);
    if (method === 'GET' && url.pathname === `/${this.org}/_apis/projects`) {
      if (this.projectsStatus) return ok({ message: 'projects refused' }, this.projectsStatus);
      const names = this.missingProject ? this.otherProjects : [this.project, ...this.otherProjects];
      return ok({ count: names.length, value: names.map((name) => ({ name, state: 'wellFormed' })) });
    }
    const noProject = () =>
      ok(
        {
          $id: '1',
          innerException: null,
          message: `TF200016: The following project does not exist: ${this.project}. Verify that the name of the project is correct and that the project exists on the specified Azure DevOps Server.`,
          typeKey: 'ProjectDoesNotExistWithNameException',
        },
        404,
      );
    if (this.missingProject && url.pathname.startsWith(`/${this.org}/${this.project}/`)) return noProject();
    let m: RegExpMatchArray | null;
    if (method === 'GET' && p === `projects/${this.project}`)
      return this.missingProject ? noProject() : ok({ id: 'p-1', name: this.project, state: 'wellFormed' });
    if (method === 'GET' && p === 'process/processes')
      return ok({ count: this.processes.length, value: this.processes });
    if (method === 'POST' && p === 'projects') {
      if (this.createStatus) return ok({ message: 'create refused' }, this.createStatus);
      this.createdProjects.push(body);
      return ok({ id: 'op-1', status: 'queued', url: `https://dev.azure.com/${this.org}/_apis/operations/op-1` }, 202);
    }
    m = p.match(/^operations\/(.+)$/);
    if (method === 'GET' && m) {
      const status = this.operationStatuses.length > 1 ? this.operationStatuses.shift() : this.operationStatuses[0];
      if (status === 'succeeded') this.missingProject = false;
      return ok({ id: m[1], status, resultMessage: null, detailedMessage: null });
    }
    const planRef = (pl: { id: number; name: string; areaPath?: string; suites: Suite[] }) => ({
      id: pl.id,
      name: pl.name,
      areaPath: pl.areaPath ?? this.project,
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
      // a query-based suite's members come from its query: ADO refuses to remove one
      if (method === 'DELETE' && suite.suiteType === 'dynamicTestSuite')
        return ok({ message: 'Test cases cannot be removed from a query-based suite.' }, 400);
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
            suiteType: x.st.suiteType,
            plan: { id: x.pl.id, name: x.pl.name },
            project: { name: this.project },
          })),
      });
    }
    if (method === 'POST' && p === 'wit/wiql')
      return this.wiql(String(body.query), Number(url.searchParams.get('$top')));
    if (method === 'GET' && p === 'wit/workitems') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
      return ok({
        value: ids
          .map((id) => this.items.get(id) ?? null)
          .map((w) => (w ? { id: w.id, rev: w.rev, fields: w.fields } : null)),
      });
    }
    if (method === 'GET' && p === 'work/processconfiguration' && !this.processConfig)
      return ok({ message: 'The requested resource does not exist.' }, 404);
    if (method === 'GET' && p === 'work/processconfiguration') {
      const types = (names: string[]) => ({ workItemTypes: names.map((name) => ({ name, url: 'u' })) });
      return ok({
        taskBacklog: types(['Task']),
        requirementBacklog: types(this.requirementTypes),
        portfolioBacklogs: [types(['Feature']), types(['Epic'])],
        bugWorkItems: types(['Bug']),
      });
    }
    // live: Issue (the Agile impediment) sits in no category, hidden types in Microsoft.HiddenCategory
    const categories = [
      ['Microsoft.RequirementCategory', this.requirementTypes],
      ['Microsoft.TaskCategory', ['Task']],
      ['Microsoft.BugCategory', this.bugTypes],
      ['Microsoft.EpicCategory', ['Epic']],
      ['Microsoft.FeatureCategory', ['Feature']],
      ['Microsoft.TestCaseCategory', ['Test Case']],
      ['Microsoft.HiddenCategory', ['Code Review Request', 'Feedback Request']],
    ] as const;
    if (method === 'GET' && p === 'wit/workitemtypecategories')
      return ok({
        count: categories.length,
        value: categories.map(([referenceName, names]) => ({
          referenceName,
          name: referenceName,
          workItemTypes: names.map((name) => ({ name })),
          defaultWorkItemType: { name: names[0] },
        })),
      });
    if (method === 'GET' && p === 'wit/workitemtypecategories/Microsoft.RequirementCategory')
      return ok({ defaultWorkItemType: { name: this.requirementTypes[0] } });
    m = p.match(/^wit\/classificationnodes\/(iterations|areas)$/);
    if (method === 'GET' && m && m[1] === 'areas') {
      const depth = Number(url.searchParams.get('$depth') ?? 0);
      const node = (name: string, path: string[], children: string[], level: number): Json => {
        const own = children.length > 0;
        return {
          id: 10 + path.length,
          identifier: this.areaId(path.join('\\')),
          name,
          structureType: 'area',
          hasChildren: own,
          path: `\\${path.join('\\')}\\Area`,
          ...(own && level < depth
            ? {
                children: children.map((c) =>
                  node(c, [...path, c], path.length === 1 ? (this.subAreas[c] ?? []) : [], level + 1),
                ),
              }
            : {}),
        };
      };
      return ok(node(this.project, [this.project], this.areas, 0));
    }
    if (method === 'GET' && m) {
      return ok({
        name: this.project,
        structureType: 'iteration',
        hasChildren: this.iterations.length > 0,
        children: this.iterations.map((name) => ({ name, structureType: 'iteration' })),
      });
    }
    m = p.match(/^permissions\/([^/]+)\/(\d+)$/);
    if (method === 'GET' && m) {
      if (this.permissionStatus) return ok({ message: 'permissions refused' }, this.permissionStatus);
      if (m[1] !== CSS_NAMESPACE) return ok({ message: 'no such namespace' }, 404);
      const bits = Number(m[2]);
      const tokens = (url.searchParams.get('tokens') ?? '').split(',');
      this.permissionCalls.push({ bits, tokens });
      // like ADO: true only when every asked bit is allowed
      const value = tokens.map((t) => (bits & (this.denied.get(t) ?? 0)) === 0);
      return ok({ count: value.length, value });
    }
    if (method === 'GET' && p === `securitynamespaces/${CSS_NAMESPACE}`)
      return ok({
        count: 1,
        value: [
          {
            namespaceId: CSS_NAMESPACE,
            name: 'CSS',
            displayName: 'Area',
            separatorValue: ':',
            elementLength: -1,
            actions: [
              [16, 'WORK_ITEM_READ', 'View work items in this node'],
              [32, 'WORK_ITEM_WRITE', 'Edit work items in this node'],
              [64, 'MANAGE_TEST_PLANS', 'Manage test plans'],
              [128, 'MANAGE_TEST_SUITES', 'Manage test suites'],
            ].map(([bit, name, displayName]) => ({ bit, name, displayName })),
          },
        ],
      });
    if (method === 'GET' && p === 'wit/workitemtypes/Test Case') {
      if (this.typeStatus) return ok({ message: 'type refused' }, this.typeStatus);
      if (!this.testCaseType)
        return ok(
          {
            message: `VS402323: Work item type Test Case does not exist in project ${this.project} or you do not have permission to access it.`,
          },
          404,
        );
      return ok({ name: 'Test Case', referenceName: 'Microsoft.VSTS.WorkItemTypes.TestCase' });
    }
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

  /** The identifier ADO gives an area node (a GUID), made up from its path, for the permission token. */
  areaId(path: string): string {
    const h = createHash('md5').update(path.toLowerCase()).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

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

  /** The WIQL clauses the adapter writes, evaluated the way ADO does (CONTAINS ignores case, matches a whole tag). */
  private wiql(query: string, top: number): Response {
    const s = (re: RegExp) => query.match(re)?.[1]?.replace(/''/g, "'");
    const type = s(/\[System\.WorkItemType\] = '((?:[^']|'')*)'/);
    const list = query.match(/\[System\.WorkItemType\] (NOT IN|IN) \(((?:'(?:[^']|'')*'(?:, )?)+)\)/);
    const listed = list ? [...list[2].matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'")) : null;
    const tag = s(/\[System\.Tags\] CONTAINS '((?:[^']|'')*)'/)?.toLowerCase();
    const text = s(/\[System\.Title\] CONTAINS '((?:[^']|'')*)'/)?.toLowerCase();
    const state = s(/\[System\.State\] = '((?:[^']|'')*)'/);
    const notState = s(/\[System\.State\] <> '((?:[^']|'')*)'/);
    const under = s(/\[System\.IterationPath\] UNDER '((?:[^']|'')*)'/);
    const area = s(/\[System\.AreaPath\] UNDER '((?:[^']|'')*)'/);
    const macro = query.match(/\[System\.IterationPath\] = @CurrentIteration\('\[(.*?)\]\\(.*)'\)/);
    const bad = (what: string, path: string) =>
      ok(
        {
          $id: '1',
          innerException: null,
          message: `TF51011: The specified ${what} does not exist. The error is caused by \u00ab'${path}'\u00bb.`,
          typeName: 'Microsoft.TeamFoundation.WorkItemTracking.Server.ValidationException, Microsoft.TeamFoundation',
        },
        400,
      );
    const known = [this.project, ...this.iterations.map((i) => `${this.project}\\${i}`)];
    if (under && !known.includes(under)) return bad('iteration path', under);
    if (area && ![this.project, ...this.areas.map((a) => `${this.project}\\${a}`)].includes(area))
      return bad('area path', area);
    if (macro && macro[2].replace(/''/g, "'") !== this.team)
      return ok(
        {
          $id: '1',
          innerException: null,
          message: "VS402612: The macro '@CurrentIteration' is not supported without a team context.",
        },
        500,
      );
    const testsOnly = query.includes("IN GROUP 'Microsoft.TestCaseCategory'");
    const groupReqs = query.includes("IN GROUP 'Microsoft.RequirementCategory'");
    const workItems = [...this.items.values()]
      .filter((w) => {
        const f = w.fields;
        const t = String(f['System.WorkItemType']);
        if (type && t !== type) return false;
        if (testsOnly && t !== 'Test Case') return false;
        if (groupReqs && !this.requirementTypes.includes(t)) return false;
        if (listed && listed.includes(t) !== (list?.[1] === 'IN')) return false;
        if (
          tag &&
          !String(f['System.Tags'] ?? '')
            .toLowerCase()
            .split(';')
            .some((x) => x.trim() === tag)
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
        if (notState && f['System.State'] === notState) return false;
        if (area && !isUnder(String(f['System.AreaPath'] ?? this.project), area)) return false;
        if (under && !isUnder(String(f['System.IterationPath'] ?? ''), under)) return false;
        if (macro && !isUnder(String(f['System.IterationPath'] ?? ''), this.currentIteration)) return false;
        return true;
      })
      .sort((a, b) => a.id - b.id)
      .slice(0, top)
      .map((w) => ({ id: w.id }));
    return ok({ workItems });
  }
}
