/**
 * Neutral models shared by build and gate (docs/tech.md, Models). Stores, requirement sources and runners map their own
 * ideas onto these. Data files are checked with the guards in schema.mts before they're trusted.
 */

// Build side (from Autonomous-QE)

/** Where a step or rule comes from: "dsm:relation:/->/employees", "aut:AUT_Shop#Checkout", "req:PROJ-12". */
export type Evidence = string;

export const CATEGORIES = ['Positive', 'Negative', 'Boundary', 'E2E', 'Business', 'Edge'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CHANNELS = ['Web', 'Mobile Web', 'Android', 'iOS', 'API', 'Desktop'] as const;
export type Channel = (typeof CHANNELS)[number];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];
/** Test types come from the Domain_Test_Design_Skill (Functional, Regression, API, …); severities from the team. */
export type TestType = string;
export type Severity = string;

export type Step = {
  screen: string;
  action: string;
  element?: string;
  leadsTo?: string;
  data?: string;
  expected: string;
  evidence: Evidence[];
};

export type DraftCase = {
  id: string; // "TC-LOGIN-001"
  title: string;
  component: string;
  subModule?: string;
  feature: string;
  type: TestType;
  category: Category;
  priority: Priority;
  severity: Severity;
  channel: Channel;
  coverage: string[];
  objective: string;
  preconditions: string[];
  testData: Record<string, unknown>;
  steps: Step[];
  requirements: string[];
};

export type Run = {
  dir: string;
  scope: { module: string; subModule?: string };
  validation: 'pass' | 'fail';
  reviewedAt?: string;
  reviewedBy?: { adoAccount: string; gitEmail: string }; // checked identity, never typed (Q12)
  ownerWarning?: string; // set when an owner exists and someone else approved
};

// Publish (new)

export type LedgerEntry = {
  localId: string;
  trackerId: number;
  hash: string;
  ownedTags: string[];
  smokeDeclined: boolean; // QA removed smoke: never suggest again
  publishedAt: string;
  trackerRev: number;
};

export type PublishChange = {
  kind: 'create' | 'update' | 'unchanged' | 'retire' | 'conflict';
  localId: string;
  trackerId?: number;
  fields: string[];
  reason: string;
};

// Gate side (from CheckMaster)

export type ChangedFile = { path: string; status: string };
export type Change = { base: string; head: string; branch: string; files: ChangedFile[] };
/** A test case as the gate sees it. `automatedTest` is `bdd:@TC-…` or `pytest:<nodeid>` (Q9), null when manual. */
export type TestCase = { id: number; title: string; url: string; tags: string[]; automatedTest: string | null };
export type Reason = { kind: 'path' | 'smoke' | 'group' | 'added' | 'dsm'; detail: string };
export type PlanItem = { testCase: TestCase; reasons: Reason[]; selected: boolean };
/** `broken`: the automated test named in the store isn't in the test root, so the check fails until it's fixed. */
export type NotRun = { testCase: TestCase; why: string; broken: boolean };
export type Gap = { screen: string; files: string[]; why: string }; // new: DSM impact with no case

export type Plan = {
  id: string;
  createdAt: string;
  change: Change;
  testsHead?: string; // QA project commit when QAMASTER_TEST_ROOT is set (Q22)
  items: PlanItem[];
  notRun: NotRun[];
  gaps: Gap[];
  catalogSize: number;
  otherGroups: Record<string, string[]>; // group tag -> titles of the test cases it would add
  approvedBy?: string;
  approvedAt?: string;
};

export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'not_run';

export type TestResult = {
  testCaseId: number;
  status: TestStatus;
  durationS: number;
  error?: string;
  testIds: string[];
  evidence: string[]; // screenshots, videos and traces of failed tests, relative to the repo
};

export type Verdict = {
  result: 'pass' | 'fail' | 'blocked';
  head: string;
  testsHead?: string;
  planId: string;
  reasons: string[];
  warnings: string[];
  results: TestResult[];
};

// Store items: requirements and test cases as the req / tc commands see them, whatever the store (from CheckMaster)

/** "other" is a test artifact that isn't a test case: a test plan, suite or shared steps. */
export type ItemKind = 'requirement' | 'test_case' | 'other';
export type ItemStep = { action: string; expected: string };

export type Item = {
  kind: ItemKind;
  id: number;
  rev: number; // update refuses if this changed since the read
  type: string;
  title: string;
  state: string;
  url: string;
  tags: string[];
  description: string;
  parent: number | null;
  children: number[];
  steps: ItemStep[];
  automatedTest: string | null;
  tests: number[]; // requirements this test case tests
  testedBy: number[]; // test cases that test this requirement
  suites: string[]; // "Plan / Suite" names this test case is in
  fields: Record<string, string>; // other fields worth showing, by display name
};

/** What a create or update sets. Undefined or empty means leave it as it is. */
export type ItemChange = {
  type?: string; // create only; the store's default type when absent
  title?: string;
  description?: string;
  state?: string;
  addTags?: string[];
  removeTags?: string[];
  parent?: number;
  steps?: ItemStep[];
  automatedTest?: string;
  requirements?: number[]; // requirements a test case tests, added to its links
  suite?: string; // a suite of the plan to add a test case to
  fields?: Record<string, string>; // any other field, by name or reference name
};

export type Filter = {
  kind: ItemKind;
  type?: string;
  state?: string;
  tag?: string;
  text?: string;
  limit?: number; // default 50
};

/** One of the three ways to ask for requirements: a named sprint, the current sprint, or a date range. */
export type RequirementQuery =
  | { sprint: string; module?: string }
  | { currentSprint: true; module?: string }
  | { from: string; to: string; module?: string };

/** A requirement in Autonomous-QE's normalised shape, so its test design reads it unchanged. */
export type Requirement = {
  id: string;
  source: 'jira' | 'azure_devops' | 'confluence' | 'document';
  title: string;
  type: string;
  status: string;
  description: string;
  acceptance_criteria: string[];
  sprint?: string;
  priority?: string;
  module?: string;
  components?: string[];
  labels?: string[];
  url?: string;
  links?: { type: string; id: string }[];
  updated?: string;
};

// Crawl (from Autonomous-QE). Pages and edges keep the crawler's own shape until step 3 ports it.

export type CrawlOptions = {
  baseUrl: string;
  out: string;
  loginMode?: 'auto' | 'manual' | 'none';
  routes?: string[]; // re-crawl only these and merge with `previous`
  previous?: string;
  seeds?: string[];
};

export type UiModel = {
  generated_at: string;
  base_url: string;
  mode: 'full' | 'incremental';
  truncated: boolean;
  pages: { route: string; url: string; [key: string]: unknown }[];
  edges: { from: string; to: string; [key: string]: unknown }[];
  api_calls: { method: string; path: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

/** Tags after adding and removing some, ignoring case like the trackers do. */
export function retag(have: string[], add: string[] = [], remove: string[] = []): string[] {
  const gone = new Set(remove.map((t) => t.toLowerCase()));
  const out = have.filter((t) => !gone.has(t.toLowerCase()));
  for (const t of add) if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  return out;
}
