/**
 * A fake for every adapter in plugin/src/adapters/base.mts (Q4), with a small shop as data. Fakes keep everything in
 * memory and record what was asked of them, so tests can check both results and calls.
 */
import type { Crawler, RepoReader, RequirementSource, Runner, TestCaseStore } from '../plugin/src/adapters/base.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import {
  type Change,
  type CrawlOptions,
  type Filter,
  type Item,
  type ItemChange,
  type ItemKind,
  type Requirement,
  type RequirementQuery,
  retag,
  type TestCase,
  type TestResult,
  type UiModel,
} from '../plugin/src/shared/models.mts';

export const PLAN = 'Shop / Web';

export function url(id: number): string {
  return `https://ado.test/${id}`;
}

export function item(id: number, kind: ItemKind, title: string, more: Partial<Item> = {}): Item {
  return {
    kind,
    id,
    rev: 1,
    type: { requirement: 'Issue', test_case: 'Test Case', other: 'Test Plan' }[kind],
    title,
    state: kind === 'requirement' ? 'To Do' : 'Design',
    url: url(id),
    tags: [],
    description: '',
    parent: null,
    children: [],
    steps: [],
    automatedTest: null,
    tests: [],
    testedBy: [],
    suites: [],
    fields: {},
    ...more,
  };
}

const CHECKOUT = ['checkout', 'checkout-coupon', 'path:shop/checkout/**'];

/** The test cases in the store. 503 is manual; 504 isn't in the plan; 701's scenario has two examples. */
export const TEST_CASES: Item[] = [
  item(501, 'test_case', 'Coupon applies', {
    tags: CHECKOUT,
    automatedTest: 'bdd:@TC-CHECKOUT-001',
    suites: [`${PLAN} / Checkout`],
    tests: [3],
    steps: [{ action: 'Apply SAVE10', expected: 'Total drops 10%' }],
  }),
  item(502, 'test_case', 'Expired coupon', {
    tags: CHECKOUT,
    automatedTest: 'bdd:@TC-CHECKOUT-002',
    suites: [`${PLAN} / Checkout`],
  }),
  item(503, 'test_case', 'Gift card coupon', { tags: ['checkout-coupon'], suites: [`${PLAN} / Checkout`] }),
  item(504, 'test_case', 'Draft: refund', { tags: ['payments'] }),
  item(601, 'test_case', 'Login', {
    tags: ['login', 'smoke'],
    automatedTest: 'bdd:@TC-LOGIN-001',
    suites: [`${PLAN} / Login`],
  }),
  item(701, 'test_case', 'Add to cart', {
    tags: ['cart', 'path:shop/cart/**'],
    automatedTest: 'pytest:tests/test_cart.py::test_add',
    suites: [`${PLAN} / Cart`],
  }),
  item(9, 'other', 'Shop'),
];

/** What the runner sees in the test root. */
export const COLLECTED = [
  'bdd:@TC-CHECKOUT-001',
  'bdd:@TC-CHECKOUT-002',
  'bdd:@TC-LOGIN-001',
  'pytest:tests/test_cart.py::test_add[1]',
  'pytest:tests/test_cart.py::test_add[2]',
  'pytest:tests/test_helpers.py::test_unlinked',
];

export const REQUIREMENT_ITEMS: Item[] = [
  item(3, 'requirement', 'Coupons', { tags: ['checkout'], testedBy: [501], fields: { Iteration: 'Sprint 24' } }),
  item(4, 'requirement', 'Cart', { fields: { Iteration: 'Sprint 25' } }),
];

function requirement(i: Item): Requirement {
  return {
    id: String(i.id),
    source: 'azure_devops',
    title: i.title,
    type: i.type,
    status: i.state,
    description: i.description,
    acceptance_criteria: [],
    sprint: i.fields.Iteration,
    labels: i.tags,
    url: i.url,
  };
}

function matches(i: Item, f: Filter): boolean {
  return (
    i.kind === f.kind &&
    (!f.type || i.type === f.type) &&
    (!f.state || i.state === f.state) &&
    (!f.tag || i.tags.some((t) => t.toLowerCase() === f.tag?.toLowerCase())) &&
    (!f.text || i.title.toLowerCase().includes(f.text.toLowerCase()))
  );
}

/** Items in memory, shared by the fake store and fake requirement source. `writes` records each change. */
class FakeItems {
  items: Map<number, Item>;
  writes: string[] = [];

  constructor(items: Item[]) {
    this.items = new Map(items.map((i) => [i.id, structuredClone(i)]));
  }

  where(): string {
    return `Fake store, plan ${PLAN}`;
  }

  url(id: number): string {
    return url(id);
  }

  async find(filter: Filter): Promise<Item[]> {
    return [...this.items.values()].filter((i) => matches(i, filter)).slice(0, filter.limit ?? 50);
  }

  async show(id: number): Promise<Item> {
    const found = this.items.get(id);
    if (!found) throw new BlockedError(`No work item ${id}.`);
    return structuredClone(found);
  }

  protected async add(kind: ItemKind, change: ItemChange): Promise<Item> {
    const id = Math.max(...this.items.keys()) + 1;
    const created = item(id, kind, change.title ?? '', change.type ? { type: change.type } : {});
    this.items.set(id, created);
    this.writes.push(`create ${id}`);
    return this.update(created, change);
  }

  async update(read: Item, change: ItemChange): Promise<Item> {
    const stored = this.items.get(read.id);
    if (!stored) throw new BlockedError(`No work item ${read.id}.`);
    if (stored.rev !== read.rev) {
      throw new BlockedError(`Work item ${read.id} changed since it was read (rev ${read.rev} → ${stored.rev}).`);
    }
    if (change.title !== undefined) stored.title = change.title;
    if (change.description !== undefined) stored.description = change.description;
    if (change.state !== undefined) stored.state = change.state;
    if (change.parent !== undefined) stored.parent = change.parent;
    if (change.steps !== undefined) stored.steps = change.steps;
    if (change.automatedTest !== undefined) stored.automatedTest = change.automatedTest;
    for (const r of change.requirements ?? []) if (!stored.tests.includes(r)) stored.tests.push(r);
    Object.assign(stored.fields, change.fields);
    stored.tags = retag(stored.tags, change.addTags, change.removeTags);
    stored.rev += 1;
    this.writes.push(`update ${read.id}`);
    return this.show(read.id);
  }

  async retire(read: Item): Promise<string[]> {
    if (read.kind === 'other') throw new BlockedError(`#${read.id} is a ${read.type}, not something to retire.`);
    const stored = await this.show(read.id);
    this.writes.push(`retire ${read.id}`);
    if (read.kind === 'requirement') {
      this.items.delete(read.id);
      return [`Moved ${read.id} to the Recycle Bin`];
    }
    await this.update(stored, { state: 'Closed' });
    return [`Set ${read.id} to Closed`];
  }
}

export class FakeStore extends FakeItems implements TestCaseStore {
  hasPlan = true;
  suites = new Map([['payments', 1]]); // suite name (lower case) -> id
  constructor(items: Item[] = TEST_CASES) {
    super(items);
  }

  async ensurePlan(): Promise<{ id: number; name: string; created: boolean }> {
    const created = !this.hasPlan;
    if (created) this.writes.push(`plan ${PLAN}`);
    this.hasPlan = true;
    return { id: 1, name: PLAN, created };
  }

  async ensureSuite(name: string): Promise<{ id: number; name: string; created: boolean }> {
    const known = this.suites.get(name.toLowerCase());
    if (known) return { id: known, name, created: false };
    const id = this.suites.size + 1;
    this.suites.set(name.toLowerCase(), id);
    this.writes.push(`create suite ${name}`);
    return { id, name, created: true };
  }

  async inPlan(): Promise<Map<number, TestCase>> {
    const cases = [...this.items.values()].filter(
      (i) => i.kind === 'test_case' && i.suites.some((s) => s.startsWith(PLAN)),
    );
    return new Map(
      cases.map((i) => [
        i.id,
        { id: i.id, title: i.title, url: i.url, tags: [...i.tags], automatedTest: i.automatedTest },
      ]),
    );
  }

  create(change: ItemChange): Promise<Item> {
    return this.add('test_case', change);
  }

  async addToSuite(caseId: number, suite: string): Promise<void> {
    const stored = this.items.get(caseId);
    if (!stored) throw new BlockedError(`No test case ${caseId}.`);
    if (!this.suites.has(suite.toLowerCase()))
      throw new BlockedError(`No static suite '${suite}' in test plan '${PLAN}'.`);
    const name = `${PLAN} / ${suite}`;
    if (!stored.suites.includes(name)) stored.suites.push(name);
    this.writes.push(`suite ${caseId} ${suite}`);
  }
}

export class FakeRequirements extends FakeItems implements RequirementSource {
  constructor(items: Item[] = REQUIREMENT_ITEMS) {
    super(items);
  }

  async requirements(q: RequirementQuery): Promise<Requirement[]> {
    if (!('sprint' in q)) throw new BlockedError('The fake requirement source only knows named sprints.');
    return [...this.items.values()]
      .filter((i) => i.kind === 'requirement' && i.fields.Iteration === q.sprint)
      .filter((i) => !q.module || i.tags.includes(q.module.toLowerCase()))
      .map(requirement);
  }

  create(change: ItemChange): Promise<Item> {
    return this.add('requirement', change);
  }
}

/** Passes every selected test case except those in `failing`. `ran` records each selection. */
export class FakeRunner implements Runner {
  ran: { selection: Map<number, string[]>; root: string; evidence: string }[] = [];

  private readonly tests: string[];
  private readonly failing: Set<number>;

  constructor(tests: string[] = COLLECTED, failing: Set<number> = new Set()) {
    this.tests = tests;
    this.failing = failing;
  }

  async collected(_root: string): Promise<string[]> {
    return [...this.tests];
  }

  async run(selection: Map<number, string[]>, root: string, evidence: string): Promise<TestResult[]> {
    this.ran.push({ selection, root, evidence });
    return [...selection].map(([testCaseId, testIds]) => ({
      testCaseId,
      status: this.failing.has(testCaseId) ? 'failed' : 'passed',
      durationS: 0,
      testIds,
      evidence: [],
      ...(this.failing.has(testCaseId) ? { error: 'assertion failed' } : {}),
    }));
  }
}

export const HEAD = 'b'.repeat(40);

export const CHANGE: Change = {
  base: 'a'.repeat(40),
  head: HEAD,
  branch: 'feature/coupons',
  files: [{ path: 'shop/checkout/coupon.ts', status: 'M' }],
};

/** A repository at one commit: `files` maps paths to contents. */
export class FakeRepoReader implements RepoReader {
  private readonly change: Change;
  private readonly files: Record<string, string>;

  constructor(change: Change = CHANGE, files: Record<string, string> = { 'shop/checkout/coupon.ts': 'export {};\n' }) {
    this.change = change;
    this.files = files;
  }

  async diff(base: string, head: string): Promise<Change> {
    return { ...structuredClone(this.change), base, head };
  }

  async readFile(_ref: string, path: string): Promise<string> {
    if (!(path in this.files)) throw new BlockedError(`${path} isn't in the repository.`);
    return this.files[path];
  }

  async listTree(_ref: string): Promise<string[]> {
    return Object.keys(this.files).sort();
  }

  async head(): Promise<string> {
    return this.change.head;
  }
}

export const UI_MODEL: UiModel = {
  generated_at: '2026-10-29T00:00:00.000Z',
  base_url: 'https://shop.example.test/',
  mode: 'full',
  truncated: false,
  pages: [
    { route: '/', url: 'https://shop.example.test/' },
    { route: '/checkout', url: 'https://shop.example.test/checkout' },
  ],
  edges: [{ from: '/', to: '/checkout', type: 'link' }],
  api_calls: [{ method: 'GET', path: '/api/cart' }],
};

/** Returns `model` for every crawl. `crawls` records the options. */
export class FakeCrawler implements Crawler {
  crawls: CrawlOptions[] = [];

  private readonly model: UiModel;

  constructor(model: UiModel = UI_MODEL) {
    this.model = model;
  }

  async crawl(opts: CrawlOptions): Promise<UiModel> {
    this.crawls.push(opts);
    return structuredClone(this.model);
  }
}
