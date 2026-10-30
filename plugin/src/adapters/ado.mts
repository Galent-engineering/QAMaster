/**
 * Azure DevOps Boards and Test Plans over the REST API (api-version 7.1). Ported from CheckMaster's adapters/ado.py,
 * on fetch instead of httpx, behind QAMaster's TestCaseStore and RequirementSource (base.mts).
 *
 * Settings, from the app repo's .env or the shell (Q16): QAMASTER_ADO_ORG, QAMASTER_ADO_PROJECT, optional
 * QAMASTER_ADO_PLAN and QAMASTER_ADO_TEAM. Auth: QAMASTER_ADO_TOKEN (a PAT) as Basic auth, else a token from `az login`.
 *
 * Fixes on CheckMaster (docs/porting-step3.md, step 4; each reproduced in tests/fixtures/ado/cm-runs.json):
 *   1. update is guarded by the work item's rev and merges tags into the current ones, so it can't undo someone's change
 *   2. two plans named like the repo block instead of one being picked silently
 *   3, 4. plans and suites follow x-ms-continuationtoken, like test cases
 *   5. 429 and 503 wait for Retry-After (3 tries, at most 30 s each) before blocking
 *   6. Closed test cases left in a suite aren't in the plan
 * A bare Automated Test Name (CheckMaster wrote pytest node IDs without a prefix) reads as pytest:<node id> (Q9).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import {
  type Filter,
  type Item,
  type ItemChange,
  type ItemKind,
  type ItemStep,
  type Requirement,
  type RequirementQuery,
  retag,
  type TestCase,
} from '../shared/models.mts';
import type { RequirementSource, TestCaseStore } from './base.mts';

export const API_VERSION = '7.1';
/** Microsoft Entra resource ID for Azure DevOps, for a token from `az login`. */
export const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';
const BATCH = 200;
const TCM = 'Microsoft.VSTS.TCM.';
const TEST_CASE = 'Test Case';
/** Test artifacts other than test cases: never changed or deleted here. */
const TEST_ARTIFACTS = new Set(['Test Plan', 'Test Suite', 'Shared Steps', 'Shared Parameter']);
const PARENT = 'System.LinkTypes.Hierarchy-Reverse';
const CHILD = 'System.LinkTypes.Hierarchy-Forward';
const TESTS = 'Microsoft.VSTS.Common.TestedBy-Reverse'; // test case -> the requirement it tests
const TESTED_BY = 'Microsoft.VSTS.Common.TestedBy-Forward';
const RETIRED = 'Closed';
const SHOWN: Record<string, string> = {
  'Assigned To': 'System.AssignedTo',
  Priority: 'Microsoft.VSTS.Common.Priority',
  'Area Path': 'System.AreaPath',
  'Iteration Path': 'System.IterationPath',
};
const ITEM_FIELDS = ['System.WorkItemType', 'System.Title', 'System.State', 'System.Tags', `${TCM}AutomatedTestName`];
const REQ_FIELDS = [
  'System.WorkItemType',
  'System.Title',
  'System.State',
  'System.Tags',
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
  'Microsoft.VSTS.Common.Priority',
  'System.IterationPath',
  'System.AreaPath',
  'System.ChangedDate',
];
const WRITE_SCOPES = 'Work Items (Read & Write) and Test Management (Read & Write)';
const MAX_TRIES = 3;
const MAX_WAIT_S = 30;

// biome-ignore lint/suspicious/noExplicitAny: ADO's JSON is read field by field, as CheckMaster's dicts were
type Json = Record<string, any>;
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type AdoSettings = { organization: string; project: string; plan?: string; team?: string; repoName: string };

/** A PAT from QAMASTER_ADO_TOKEN, else a token from the Azure CLI login. */
export function authHeader(env: Record<string, string | undefined>, az = defaultAz): string {
  const pat = env.QAMASTER_ADO_TOKEN;
  if (pat) return `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
  const token = az();
  if (!token)
    throw new BlockedError(
      'No Azure DevOps credentials. Set QAMASTER_ADO_TOKEN to a PAT with Work Items (Read) and Test Management (Read), or run `az login`.',
    );
  return `Bearer ${token}`;
}
function defaultAz(): string | null {
  const r = spawnSync(
    'az',
    ['account', 'get-access-token', '--resource', ADO_RESOURCE, '--query', 'accessToken', '-o', 'tsv'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

const sleep = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
/** A WIQL string literal. */
export const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
/** Ignore case, spaces and punctuation, so "ShopWeb" matches "Shop Web". */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export const splitTags = (value: unknown) =>
  String(value ?? '')
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);

/** HTML field text as plain lines. */
export function plain(html: string): string {
  const text = html
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Azure DevOps' Microsoft.VSTS.TCM.Steps format. Step IDs start at 2. Each step holds HTML (isformatted="true") inside
 * XML, so text is escaped twice, as ADO's editor writes it; once (as CheckMaster did) loses "Enter <username>".
 */
export function stepsXml(steps: ItemStep[]): string {
  const body = steps
    .map(
      (st, i) =>
        `<step id="${i + 2}" type="ActionStep">` +
        `<parameterizedString isformatted="true">${escapeXml(escapeHtml(st.action))}</parameterizedString>` +
        `<parameterizedString isformatted="true">${escapeXml(escapeHtml(st.expected))}</parameterizedString>` +
        '<description/></step>',
    )
    .join('');
  return `<steps id="0" last="${steps.length + 1}">${body}</steps>`;
}

/** Steps from Microsoft.VSTS.TCM.Steps. Shared step references are left out. */
export function parseSteps(xml: string): ItemStep[] {
  if (!xml.trim()) return [];
  return [...xml.matchAll(/<step\b[^>]*>([\s\S]*?)<\/step>/g)].map((m) => {
    const parts = [
      ...m[1].matchAll(/<parameterizedString\b[^>]*>([\s\S]*?)<\/parameterizedString>|<parameterizedString\b[^>]*\/>/g),
    ].map((p) => plain(unescapeXml(p[1] ?? '')));
    return { action: parts[0] ?? '', expected: parts[1] ?? '' };
  });
}

/** The automation link as QAMaster names it (Q9). CheckMaster wrote bare pytest node IDs. */
export function automationLink(name: unknown): string | null {
  const s = String(name ?? '').trim();
  if (!s) return null;
  return /^(bdd|pytest):/.test(s) ? s : `pytest:${s}`;
}

/** The Associated Automation fields for a link: bdd:@TC-… (playwright-bdd) or pytest:<node id>. */
export function automationFields(link: string): Record<string, string> {
  const [runner, id] = link.startsWith('bdd:') ? ['playwright-bdd', link] : ['pytest', link.replace(/^pytest:/, '')];
  return {
    [`${TCM}AutomatedTestName`]: link,
    [`${TCM}AutomatedTestStorage`]: runner === 'pytest' ? id.split('::')[0] : runner,
    [`${TCM}AutomatedTestType`]: runner,
    [`${TCM}AutomatedTestId`]: crypto.randomUUID(),
    [`${TCM}AutomationStatus`]: 'Automated',
  };
}

// ---- HTTP

type RequestOpts = { orgLevel?: boolean; params?: Record<string, string>; json?: unknown; patch?: unknown };

export class AdoClient {
  readonly organization: string;
  readonly project: string;
  private readonly base: string;
  private readonly orgBase: string;
  private readonly fetchImpl: Fetch;
  private readonly auth: () => string;
  private readonly wait: (ms: number) => Promise<void>;
  private header: string | null = null;
  private fields: Map<string, string> | null = null;

  constructor(
    organization: string,
    project: string,
    auth: () => string,
    fetchImpl: Fetch = fetch,
    wait: (ms: number) => Promise<void> = sleep,
  ) {
    this.organization = organization;
    this.project = project;
    this.auth = auth;
    this.fetchImpl = fetchImpl;
    this.wait = wait;
    this.orgBase = `https://dev.azure.com/${encodeURIComponent(organization)}/_apis`;
    this.base = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis`;
  }

  itemUrl(id: number): string {
    return `https://dev.azure.com/${encodeURIComponent(this.organization)}/${encodeURIComponent(this.project)}/_workitems/edit/${id}`;
  }
  /** The URL a work item link points at. */
  apiUrl(id: number): string {
    return `${this.orgBase}/wit/workItems/${id}`;
  }

  async request(method: string, path: string, opts: RequestOpts = {}): Promise<Response> {
    this.header ??= this.auth();
    const url = new URL(`${opts.orgLevel ? this.orgBase : this.base}/${path}`);
    for (const [k, v] of Object.entries({ ...opts.params, 'api-version': API_VERSION })) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: this.header };
    let body: string | undefined;
    if (opts.patch !== undefined) {
      headers['Content-Type'] = 'application/json-patch+json';
      body = JSON.stringify(opts.patch);
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }
    for (let attempt = 1; ; attempt++) {
      let resp: Response;
      try {
        resp = await this.fetchImpl(url.toString(), { method, headers, body, redirect: 'manual' });
      } catch (e) {
        throw new BlockedError(`Couldn't reach Azure DevOps: ${(e as Error).message}`);
      }
      // fix 5: ADO asks busy clients to slow down; a passing hiccup shouldn't block a push (CheckMaster blocked at once).
      // A 429 wasn't processed, so any call is retried; after a 503 a write may have landed, so only reads are
      const read = method === 'GET' || path === 'wit/wiql';
      if ((resp.status === 429 || (resp.status === 503 && read)) && attempt < MAX_TRIES) {
        const after = Number(resp.headers.get('retry-after'));
        await this.wait(Math.min(Number.isFinite(after) && after > 0 ? after : 2 ** attempt, MAX_WAIT_S) * 1000);
        continue;
      }
      if (resp.status === 503 && !read)
        throw new BlockedError(
          `Azure DevOps was unavailable (503) for ${method} ${path}; it may or may not have been applied. Check in Azure DevOps before trying again.`,
        );
      if (resp.status === 429 || resp.status === 503)
        throw new BlockedError(
          `Azure DevOps is throttling (${resp.status}) after ${MAX_TRIES} tries. Wait a minute and try again.`,
        );
      if (resp.status === 401 || resp.status === 203 || (resp.status >= 300 && resp.status < 400))
        throw new BlockedError(
          'Azure DevOps rejected the credentials (401). Check QAMASTER_ADO_TOKEN or run `az login`, then `qam doctor`.',
        );
      if (resp.status === 403)
        throw new BlockedError(
          `Azure DevOps refused ${method} ${path} (403). Changes need a token with ${WRITE_SCOPES}, and permission for this change in the project.`,
        );
      if (resp.status >= 400)
        throw new BlockedError(`Azure DevOps ${path} returned ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      return resp;
    }
  }

  async send(method: string, path: string, opts: RequestOpts = {}): Promise<Json | null> {
    const resp = await this.request(method, path, opts);
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }
  get = (path: string, params?: Record<string, string>) => this.send('GET', path, { params }) as Promise<Json>;

  /** Every page of a list: ADO returns the next page's token in x-ms-continuationtoken (fixes 3 and 4). */
  async pages(path: string, params: Record<string, string> = {}, orgLevel = false): Promise<Json[]> {
    const all: Json[] = [];
    let token: string | null = null;
    do {
      const resp = await this.request('GET', path, {
        orgLevel,
        params: token ? { ...params, continuationToken: token } : params,
      });
      const page = (await resp.json()) as Json;
      if (!Array.isArray(page.value)) throw new BlockedError(`Azure DevOps ${path} isn't a list (no "value" array).`);
      all.push(...page.value);
      token = resp.headers.get('x-ms-continuationtoken');
    } while (token);
    return all;
  }

  async wiql(query: string, top: number): Promise<number[]> {
    const found = (await this.send('POST', 'wit/wiql', { params: { $top: String(top) }, json: { query } })) as Json;
    return (found.workItems as Json[]).map((w) => w.id);
  }

  async item(id: number): Promise<Json> {
    try {
      return await this.get(`wit/workitems/${id}`, { $expand: 'relations' });
    } catch (e) {
      if (e instanceof BlockedError && / returned 404/.test(e.message))
        throw new BlockedError(`There's no work item ${id} in ${this.organization}/${this.project}.`);
      throw e;
    }
  }

  async workItems(ids: number[], fields: string[]): Promise<Json[]> {
    const items: Json[] = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const page = await this.get('wit/workitems', {
        ids: ids.slice(i, i + BATCH).join(','),
        fields: fields.join(','),
        errorPolicy: 'omit',
      });
      items.push(...(page.value as Json[]).filter(Boolean));
    }
    return items;
  }

  /** A field's reference name from its display or reference name, ignoring case. */
  async fieldRef(name: string): Promise<string> {
    if (!this.fields) {
      this.fields = new Map();
      for (const f of (await this.get('wit/fields')).value as Json[]) {
        this.fields.set(f.name.toLowerCase(), f.referenceName);
        this.fields.set(f.referenceName.toLowerCase(), f.referenceName);
      }
    }
    const ref = this.fields.get(name.toLowerCase());
    if (!ref) throw new BlockedError(`'${name}' isn't a field in ${this.project}.`);
    return ref;
  }

  /** The suites in this project that hold the test case (the API is org-wide). */
  async suitesOf(testCaseId: number): Promise<Json[]> {
    const found = (await this.send('GET', 'testplan/suites', {
      orgLevel: true,
      params: { testCaseId: String(testCaseId) },
    })) as Json;
    return (found.value as Json[]).filter((s) => s.project.name.toLowerCase() === this.project.toLowerCase());
  }
}

// ---- requirements and test cases

/** A work item's revision; a recorded response may leave it out. */
const revOf = (w: Json): number => w.rev ?? 0;
const kindOf = (type: string): ItemKind =>
  type === TEST_CASE ? 'test_case' : TEST_ARTIFACTS.has(type) ? 'other' : 'requirement';

class AdoItems {
  protected readonly client: AdoClient;
  protected readonly settings: AdoSettings;
  constructor(client: AdoClient, settings: AdoSettings) {
    this.client = client;
    this.settings = settings;
  }

  where(): string {
    return `Azure DevOps ${this.client.organization}/${this.client.project}`;
  }
  url(id: number): string {
    return this.client.itemUrl(id);
  }

  /** Requirements or test cases in the whole project, filtered, by ID. */
  protected async findKind(kind: ItemKind, filter: Filter): Promise<Item[]> {
    const where = [`[System.TeamProject] = ${q(this.client.project)}`];
    if (filter.type) where.push(`[System.WorkItemType] = ${q(filter.type)}`);
    else if (kind === 'test_case') where.push("[System.WorkItemType] IN GROUP 'Microsoft.TestCaseCategory'");
    else {
      // any work item that isn't a test artifact: processes differ in which types hold requirements
      const tests = [TEST_CASE, ...TEST_ARTIFACTS].sort().map(q).join(', ');
      where.push(`[System.WorkItemType] NOT IN (${tests})`);
    }
    if (filter.state) where.push(`[System.State] = ${q(filter.state)}`);
    if (filter.tag) where.push(`[System.Tags] CONTAINS ${q(filter.tag)}`);
    if (filter.text) where.push(`[System.Title] CONTAINS ${q(filter.text)}`);
    const ids = await this.client.wiql(
      `SELECT [System.Id] FROM workitems WHERE ${where.join(' AND ')} ORDER BY [System.Id]`,
      filter.limit ?? 50,
    );
    return ids.length ? (await this.client.workItems(ids, ITEM_FIELDS)).map((w) => this.toItem(w)) : [];
  }

  async show(id: number): Promise<Item> {
    const item = this.toItem(await this.client.item(id));
    if (item.kind === 'test_case')
      item.suites = (await this.client.suitesOf(id)).map((s) => `${s.plan.name} / ${s.name}`);
    return item;
  }

  protected async createKind(kind: ItemKind, change: ItemChange): Promise<Item> {
    const type = change.type ?? (kind === 'test_case' ? TEST_CASE : await this.defaultRequirementType());
    // the suite is found first: a missing one used to leave an orphan test case that a retry then duplicated
    const suite = change.suite ? await this.suiteMembers(change.suite) : null;
    const created = (await this.client.send('POST', `wit/workitems/$${encodeURIComponent(type)}`, {
      patch: await this.ops(null, change, []),
    })) as Json;
    if (suite) await this.client.send('POST', suite, { json: [{ workItem: { id: created.id } }] });
    return this.show(created.id);
  }

  async update(read: Item, change: ItemChange): Promise<Item> {
    // fix 1: CheckMaster wrote over someone else's newer change. Refuse when the item moved since it was read, merge
    // tags into the current tags, and guard the write with a test on /rev for a change that lands in between
    const current = await this.client.item(read.id);
    if (revOf(current) !== read.rev) throw this.changed(read, revOf(current));
    const ops = await this.ops(this.toItem(current), change, current.relations ?? []);
    if (ops.length) {
      try {
        await this.client.send('PATCH', `wit/workitems/${read.id}`, {
          patch: [{ op: 'test', path: '/rev', value: read.rev }, ...ops],
        });
      } catch (e) {
        const now = await this.client.item(read.id).catch(() => null);
        if (now && revOf(now) !== read.rev) throw this.changed(read, revOf(now));
        throw e;
      }
    }
    if (change.suite) await this.addToSuite(read.id, change.suite);
    return this.show(read.id);
  }

  async retire(read: Item): Promise<string[]> {
    if (read.kind === 'other')
      throw new BlockedError(
        `#${read.id} is a ${read.type}. QAMaster doesn't delete test plans, suites or shared steps; use Azure Test Plans.`,
      );
    if (read.kind === 'requirement') {
      await this.client.send('DELETE', `wit/workitems/${read.id}`); // never destroy=true: it goes to the Recycle Bin
      return [`moved #${read.id} to the Recycle Bin`];
    }
    // Azure DevOps can't undo a test case deleted through the API, so a test case is closed and taken out of its suites
    const done: string[] = [];
    if (read.state !== RETIRED) {
      const current = await this.client.item(read.id);
      if (revOf(current) !== read.rev) throw this.changed(read, revOf(current));
      await this.client.send('PATCH', `wit/workitems/${read.id}`, {
        patch: [
          { op: 'test', path: '/rev', value: read.rev },
          { op: 'add', path: '/fields/System.State', value: RETIRED },
        ],
      });
      done.push(`set State: ${read.state} -> ${RETIRED}`);
    }
    for (const s of await this.client.suitesOf(read.id)) {
      if (s.suiteType === 'dynamicTestSuite') {
        done.push(
          `left in query-based suite ${s.plan.name} / ${s.name}: its query decides (it leaves when the query excludes Closed)`,
        );
        continue;
      }
      await this.client.send('DELETE', `testplan/Plans/${s.plan.id}/Suites/${s.id}/TestCase`, {
        params: { testIds: String(read.id) },
      });
      done.push(`removed TC${read.id} from suite ${s.plan.name} / ${s.name}`);
    }
    return done.length ? done : [`nothing: TC${read.id} is already ${RETIRED} and in no suite`];
  }

  /** Adds a test case to a static suite of the plan, by name or path. */
  async addToSuite(caseId: number, suite: string): Promise<void> {
    const base = await this.suiteMembers(suite);
    const members = new Set((await this.client.pages(base)).map((c) => c.workItem.id));
    if (!members.has(caseId)) await this.client.send('POST', base, { json: [{ workItem: { id: caseId } }] });
  }

  /** The test-case route of one static suite, by its path or (when unique) its name. */
  private async suiteMembers(suite: string): Promise<string> {
    const plan = await this.plan();
    const suites = await this.client.pages(`testplan/Plans/${plan.id}/suites`);
    const byId = new Map(suites.map((s) => [s.id, s]));
    const pathOf = (s: Json) => {
      const names: string[] = [];
      for (let cur = s; cur.parentSuite && byId.has(cur.parentSuite.id); cur = byId.get(cur.parentSuite.id) as Json)
        names.push(cur.name);
      return names.reverse().join('/');
    };
    const wanted = suite
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean)
      .join('/')
      .toLowerCase();
    const statics = suites.filter((s) => s.suiteType === 'staticTestSuite');
    const byPath = statics.filter((s) => pathOf(s).toLowerCase() === wanted);
    const found = byPath.length ? byPath : statics.filter((s) => s.name.toLowerCase() === wanted);
    if (found.length > 1)
      throw new BlockedError(
        `${found.length} static suites in test plan '${plan.name}' are named '${suite}' (${found.map((s) => `'${pathOf(s)}'`).join(', ')}). Give the suite's path.`,
      );
    if (!found.length) {
      const names = suites
        .map(pathOf)
        .filter(Boolean)
        .map((n) => `'${n}'`);
      throw new BlockedError(
        `No static suite '${suite}' in test plan '${plan.name}' (suites: ${names.join(', ') || 'none'}).`,
      );
    }
    return `testplan/Plans/${plan.id}/Suites/${found[0].id}/TestCase`;
  }

  /** The test plan named like the repo (case, spaces and punctuation ignored), or QAMASTER_ADO_PLAN. */
  async plan(): Promise<Json> {
    const [found, plans] = await this.findPlan();
    if (found) return found;
    const where = `${this.client.organization}/${this.client.project}`;
    const names = plans.map((p) => `'${p.name}'`).join(', ') || 'none';
    const how = this.settings.plan
      ? `QAMASTER_ADO_PLAN='${this.settings.plan}' matches no test plan`
      : `No test plan is named like this repo ('${this.settings.repoName}')`;
    throw new BlockedError(
      `${how} in ${where} (plans: ${names}). Rename the plan, or set QAMASTER_ADO_PLAN=<plan name> in the repo's .env.`,
    );
  }

  /** The one plan matching the name, or null, and every plan seen. Two matches block. */
  private async findPlan(): Promise<[Json | null, Json[]]> {
    const plans = await this.client.pages('testplan/plans');
    const wanted = this.settings.plan || this.settings.repoName;
    const found = plans.filter((p) => key(p.name) === key(wanted));
    // fix 2: CheckMaster silently took the first of two matching plans, so the gate could read the wrong one
    if (found.length > 1)
      throw new BlockedError(
        `${found.length} test plans in ${this.client.organization}/${this.client.project} match '${wanted}' (${found.map((p) => `'${p.name}' #${p.id}`).join(', ')}). Set QAMASTER_ADO_PLAN=<exact plan name> in the repo's .env.`,
      );
    return [found[0] ?? null, plans];
  }

  /** The plan, created with the configured or repo name when there is none. Publish calls it only with --apply. */
  async ensurePlan(): Promise<{ id: number; name: string; created: boolean }> {
    const [found] = await this.findPlan();
    if (found) return { id: found.id, name: found.name, created: false };
    const name = this.settings.plan || this.settings.repoName;
    const made = (await this.client.send('POST', 'testplan/plans', { json: { name } })) as Json;
    return { id: made.id, name: made.name, created: true };
  }

  /** A static suite of the plan by name (case ignored), created under the root suite when missing. Publish --apply only. */
  async ensureSuite(name: string): Promise<{ id: number; name: string; created: boolean }> {
    const plan = await this.plan();
    const suites = await this.client.pages(`testplan/Plans/${plan.id}/suites`);
    const found = suites.find((s) => s.suiteType === 'staticTestSuite' && s.name.toLowerCase() === name.toLowerCase());
    if (found) return { id: found.id, name: found.name, created: false };
    const root = plan.rootSuite?.id ?? suites.find((s) => !s.parentSuite)?.id;
    if (!root) throw new BlockedError(`Test plan '${plan.name}' has no root suite to add '${name}' under.`);
    const made = (await this.client.send('POST', `testplan/Plans/${plan.id}/suites`, {
      json: { suiteType: 'staticTestSuite', name, parentSuite: { id: root } },
    })) as Json;
    return { id: made.id, name: made.name, created: true };
  }

  private async defaultRequirementType(): Promise<string> {
    return (await this.client.get('wit/workitemtypecategories/Microsoft.RequirementCategory')).defaultWorkItemType.name;
  }

  private changed(read: Item, now: number): BlockedError {
    return new BlockedError(
      `#${read.id} changed in Azure DevOps since you read it (rev ${read.rev} -> ${now}). Read it again, then make your change.`,
    );
  }

  protected toItem(w: Json): Item {
    const f = w.fields as Json;
    const type = String(f['System.WorkItemType']);
    const relations = (w.relations ?? []) as Json[];
    const linked = (rel: string) =>
      relations
        .filter((r) => r.rel === rel)
        .map((r) => Number(String(r.url).slice(String(r.url).lastIndexOf('/') + 1)));
    const parent = linked(PARENT);
    const fields: Record<string, string> = {};
    for (const [label, ref] of Object.entries(SHOWN)) {
      const v = f[ref];
      if (v !== undefined && v !== null && v !== '') fields[label] = String(typeof v === 'object' ? v.displayName : v);
    }
    return {
      kind: kindOf(type),
      id: w.id,
      rev: revOf(w),
      type,
      title: f['System.Title'] ?? '',
      state: f['System.State'] ?? '',
      url: this.client.itemUrl(w.id),
      tags: splitTags(f['System.Tags']),
      description: plain(String(f['System.Description'] ?? '')),
      parent: parent[0] ?? null,
      children: linked(CHILD),
      steps: parseSteps(String(f[`${TCM}Steps`] ?? '')),
      automatedTest: automationLink(f[`${TCM}AutomatedTestName`]),
      tests: linked(TESTS),
      testedBy: linked(TESTED_BY),
      suites: [],
      fields,
    };
  }

  /** The json-patch for a change. `add` on a field sets it, whether or not it has a value. */
  private async ops(item: Item | null, change: ItemChange, relations: Json[]): Promise<Json[]> {
    const fields: Record<string, unknown> = {};
    if (change.title !== undefined) fields['System.Title'] = change.title;
    if (change.description !== undefined)
      fields['System.Description'] = escapeHtml(change.description).replace(/\n/g, '<br>');
    if (change.state !== undefined) fields['System.State'] = change.state;
    if (change.addTags?.length || change.removeTags?.length)
      fields['System.Tags'] = retag(item?.tags ?? [], change.addTags, change.removeTags).join('; ');
    if (change.steps !== undefined) fields[`${TCM}Steps`] = stepsXml(change.steps);
    if (change.automatedTest !== undefined && change.automatedTest !== item?.automatedTest)
      Object.assign(fields, automationFields(automationLink(change.automatedTest) as string));
    for (const [name, value] of Object.entries(change.fields ?? {})) fields[await this.client.fieldRef(name)] = value;
    const ops: Json[] = Object.entries(fields).map(([k, v]) => ({ op: 'add', path: `/fields/${k}`, value: v }));
    const link = (rel: string, id: number) => ({
      op: 'add',
      path: '/relations/-',
      value: { rel, url: this.client.apiUrl(id) },
    });
    if (change.parent !== undefined && item?.parent !== change.parent) {
      // remove the old parent first, from the highest index down so indexes stay valid
      const old = relations.map((r, i) => [r, i] as const).filter(([r]) => r.rel === PARENT);
      ops.push(...old.reverse().map(([, i]) => ({ op: 'remove', path: `/relations/${i}` })));
      ops.push(link(PARENT, change.parent));
    }
    const tested = new Set(item?.tests ?? []);
    for (const r of new Set(change.requirements ?? [])) if (!tested.has(r)) ops.push(link(TESTS, r));
    return ops;
  }
}

/** Test cases: every suite of one test plan, found by name, and the whole project for find. */
export class AdoTestCases extends AdoItems implements TestCaseStore {
  find(filter: Filter): Promise<Item[]> {
    return this.findKind('test_case', filter);
  }
  create(change: ItemChange): Promise<Item> {
    return this.createKind('test_case', change);
  }
  async inPlan(): Promise<Map<number, TestCase>> {
    const plan = await this.plan();
    const ids = new Set<number>();
    for (const suite of await this.client.pages(`testplan/Plans/${plan.id}/suites`)) {
      for (const c of await this.client.pages(`testplan/Plans/${plan.id}/Suites/${suite.id}/TestCase`))
        ids.add(c.workItem.id);
    }
    const cases = new Map<number, TestCase>();
    for (const w of await this.client.workItems([...ids], ITEM_FIELDS)) {
      const f = w.fields as Json;
      // fix 6: a test case closed by hand but left in a suite is retired; the gate must not select it
      if (f['System.State'] === RETIRED) continue;
      cases.set(w.id, {
        id: w.id,
        title: f['System.Title'],
        url: this.client.itemUrl(w.id),
        tags: splitTags(f['System.Tags']),
        automatedTest: automationLink(f[`${TCM}AutomatedTestName`]),
      });
    }
    return cases;
  }
}

/** Requirements: Azure Boards work items that aren't test artifacts, and a sprint's in AQE's shape (feature 6). */
export class AdoRequirements extends AdoItems implements RequirementSource {
  find(filter: Filter): Promise<Item[]> {
    return this.findKind('requirement', filter);
  }
  create(change: ItemChange): Promise<Item> {
    return this.createKind('requirement', change);
  }

  async requirements(query: RequirementQuery): Promise<Requirement[]> {
    const project = this.client.project;
    const where = [
      `[System.TeamProject] = ${q(project)}`,
      "[System.WorkItemType] IN GROUP 'Microsoft.RequirementCategory'",
    ];
    if ('sprint' in query) {
      where.push(
        `[System.IterationPath] UNDER ${q(query.sprint.includes('\\') ? query.sprint : `${project}\\${query.sprint}`)}`,
      );
    } else if ('currentSprint' in query) {
      const team = this.settings.team || `${project} Team`;
      where.push(
        `[System.IterationPath] = @CurrentIteration('[${project.replace(/'/g, "''")}]\\${team.replace(/'/g, "''")}')`,
      );
    } else {
      // date-only WIQL values mean midnight at the start of that day, so the end of the period is "before the next day"
      const next = new Date(Date.parse(`${query.to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      where.push(
        `(([System.CreatedDate] >= ${q(query.from)} AND [System.CreatedDate] < ${q(next)}) OR ([System.ChangedDate] >= ${q(query.from)} AND [System.ChangedDate] < ${q(next)}))`,
      );
    }
    if (query.module) where.push(`[System.AreaPath] UNDER ${q(`${project}\\${query.module}`)}`);
    const ids = await this.client.wiql(
      `SELECT [System.Id] FROM workitems WHERE ${where.join(' AND ')} ORDER BY [System.Id]`,
      1000,
    );
    if (!ids.length) return [];
    return (await this.client.workItems(ids, REQ_FIELDS)).map((w): Requirement => {
      const f = w.fields as Json;
      const iteration = String(f['System.IterationPath'] ?? '');
      const area = String(f['System.AreaPath'] ?? '');
      return {
        id: String(w.id),
        source: 'azure_devops',
        title: f['System.Title'] ?? '',
        type: f['System.WorkItemType'] ?? '',
        status: f['System.State'] ?? '',
        description: plain(String(f['System.Description'] ?? '')),
        acceptance_criteria: plain(String(f['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? ''))
          .split('\n')
          .map((l) => l.replace(/^[-*•]\s*/, '').trim())
          .filter(Boolean),
        sprint: iteration.includes('\\') ? iteration.slice(iteration.lastIndexOf('\\') + 1) : undefined, // the root is no sprint
        priority:
          f['Microsoft.VSTS.Common.Priority'] !== undefined ? String(f['Microsoft.VSTS.Common.Priority']) : undefined,
        module: area.includes('\\') ? area.slice(area.lastIndexOf('\\') + 1) : undefined,
        labels: splitTags(f['System.Tags']),
        url: this.client.itemUrl(w.id),
        updated: f['System.ChangedDate'],
      };
    });
  }
}

/** The settings for QAMASTER_STORE=ado and QAMASTER_REQUIREMENTS=ado. */
export function adoSettings(config: Config): AdoSettings {
  const organization = config.env.QAMASTER_ADO_ORG;
  const project = config.env.QAMASTER_ADO_PROJECT;
  if (!organization || !project)
    throw new BlockedError(
      `Don't know which Azure DevOps project to use. Add these lines to ${config.root}/.env:\n  QAMASTER_ADO_ORG=<organization>\n  QAMASTER_ADO_PROJECT=<project>`,
    );
  return {
    organization,
    project,
    plan: config.env.QAMASTER_ADO_PLAN || undefined,
    team: config.env.QAMASTER_ADO_TEAM || undefined,
    repoName: path.basename(config.root),
  };
}
const clientFor = (s: AdoSettings, config: Config) =>
  new AdoClient(s.organization, s.project, () => authHeader(config.env));
export const makeAdoStore = (config: Config) => {
  const s = adoSettings(config);
  return new AdoTestCases(clientFor(s, config), s);
};
export const makeAdoRequirements = (config: Config) => {
  const s = adoSettings(config);
  return new AdoRequirements(clientFor(s, config), s);
};
