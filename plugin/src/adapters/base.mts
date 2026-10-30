/**
 * The five ways the engine reaches the outside (Q4). Everything else talks to these interfaces, and tests use the fakes
 * in tests/fakes.mts. Errors a user can fix (settings, credentials, network) throw BlockedError.
 */
import type {
  Change,
  CrawlOptions,
  Filter,
  Item,
  ItemChange,
  Requirement,
  RequirementQuery,
  TestCase,
  TestResult,
  UiModel,
} from '../shared/models.mts';

/** What `qam doctor --check-write` learned about writing to the store. `unknown` is neither a pass nor a block. */
export type WriteCheck = {
  state: 'allowed' | 'blocked' | 'unknown';
  /** The whole answer in words, ready to print; starts with "unknown" for that state. */
  detail: string;
  /** The area path the permissions were asked about, or null when it could not be resolved. */
  area: string | null;
  /** The permissions the store says the user lacks, by name. */
  missing: string[];
  /** Whether the project's process has the Test Case work item type. */
  testCaseType: 'present' | 'missing' | 'unknown';
};

/** Where test cases live: QAMASTER_STORE; v1 has ado (Q23). */
export interface TestCaseStore {
  /** Where the test cases come from, for `qam doctor`: "Azure DevOps galent/Shop, plan Shop Web". */
  where(): string;
  url(id: number): string;
  /** Every test case in the plan, with its tags and automation link: what selection needs. */
  inPlan(): Promise<Map<number, TestCase>>;
  find(filter: Filter): Promise<Item[]>;
  show(id: number): Promise<Item>;
  create(change: ItemChange): Promise<Item>;
  /** Refuses with BlockedError if the item's rev changed since it was read. */
  update(item: Item, change: ItemChange): Promise<Item>;
  /** The store's undoable removal; returns what was done, in plain words. */
  retire(item: Item): Promise<string[]>;
  addToSuite(caseId: number, suite: string): Promise<void>;
  /** The plan named like the repo (or as configured), created when there is none. Publish calls it only with --apply. */
  ensurePlan(): Promise<{ id: number; name: string; created: boolean }>;
  /** A static suite of the plan, by name, created under the plan's root suite when missing. Publish --apply only. */
  ensureSuite(name: string): Promise<{ id: number; name: string; created: boolean }>;
  /**
   * Optional: whether the credential's user may create plans, suites and test cases, asked of the store with reads
   * only (no write is sent). Optional so a store that can't answer needn't, and doctor says so.
   */
  checkWrite?(): Promise<WriteCheck>;
}

/** Where requirements live: QAMASTER_REQUIREMENTS; v1 has ado. */
export interface RequirementSource {
  /** Requirements of a sprint, the current sprint or a date range. */
  requirements(q: RequirementQuery): Promise<Requirement[]>;
  find(filter: Filter): Promise<Item[]>;
  show(id: number): Promise<Item>;
  /** Only the work-items skill writes, and only after a dry run and --apply. */
  create(change: ItemChange): Promise<Item>;
  update(item: Item, change: ItemChange): Promise<Item>;
  /** ADO: the Recycle Bin. */
  retire(item: Item): Promise<string[]>;
}

/** Runs automated tests: QAMASTER_RUNNER, playwright-bdd or pytest. */
export interface Runner {
  /** Every test ID the runner can see in `root`: `bdd:@TC-…` or `pytest:<nodeid>`. */
  collected(root: string): Promise<string[]>;
  /** Runs the test IDs behind each test case ID; one result per test case. Failure evidence goes under `evidence`. */
  run(selection: Map<number, string[]>, root: string, evidence: string): Promise<TestResult[]>;
}

/** Reads a git repository. Read-only by construction: it has no way to write. */
export interface RepoReader {
  diff(base: string, head: string): Promise<Change>;
  readFile(ref: string, path: string): Promise<string>;
  listTree(ref: string): Promise<string[]>;
  head(): Promise<string>;
}

/** Crawls the running application for the DSM. */
export interface Crawler {
  /** Blocks POST, PUT, PATCH and DELETE after login, so a crawl can't change application data (Q15). */
  crawl(opts: CrawlOptions): Promise<UiModel>;
}
