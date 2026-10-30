/**
 * The publish engine (Q7, Q8, Q9, Q34): what a reviewed run would write to the test case store. loadRun refuses a run
 * that isn't validated and reviewed; derive makes each case's tags, steps and link from facts; diff compares that with
 * the ledger and the store. Nothing here writes. The ledger file and `--apply` come after, in the CLI.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchKey } from '../dsm/build.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Item, ItemChange, ItemStep, LedgerEntry, PublishChange } from '../shared/models.mts';
import type { ProjectConfig } from '../shared/schema.mts';
import { readRunRecord, runHash, validationProblem } from '../testgen/run.mts';

/** A case as `testgen/output/<run>/testcases.json` has it; only what publishing reads. */
export type PublishCase = {
  id: string;
  title: string;
  component: string;
  category: string;
  priority: string;
  objective: string;
  preconditions: string[];
  test_data: Record<string, unknown>;
  steps: {
    screen?: string;
    action: string;
    element?: string;
    leads_to?: string;
    expected: string;
    evidence?: string[];
  }[];
  expected_result: string;
  evidence: string[];
};

/** The part of the DSM that links screens to the source files behind them. */
export type DsmFiles = { page: { nodes: { id: string; files: string[] }[] } };
type Settings = Pick<ProjectConfig, 'publish' | 'smoke' | 'owners'>;

export type PublishContext = {
  scope: { module: string; subModule: string };
  dsm: DsmFiles;
  settings: Settings;
  scenarios: Set<string>; // @TC ids of the scenarios in the automation suite (Q9)
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const hasTag = (tags: string[], t: string) => tags.some((x) => same(x, t));
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

// ---- load

export type LoadedRun = {
  dir: string;
  name: string;
  scope: { module: string; subModule: string };
  cases: PublishCase[];
  reviewedBy: string;
  reviewedAt: string;
  ownerWarning?: string;
};

function readJson<T>(file: string, what: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new BlockedError(`Can't read ${what} (${(e as Error).message}). Run qam testgen validate on the run again.`);
  }
}

/** The run's cases, or a BlockedError saying what is missing. Publishing never skips validation or the review (Q7). */
export function loadRun(dir: string, o: { dsmGeneratedAt: string | null; owners: Record<string, string> }): LoadedRun {
  const name = path.basename(dir);
  const problem = validationProblem(dir, o.dsmGeneratedAt);
  if (problem)
    throw new BlockedError(
      `Can't publish ${name}: ${problem}. Run qam testgen validate ${name}, then have it reviewed.`,
    );
  const record = readRunRecord(dir);
  if (!record?.reviewedBy) {
    throw new BlockedError(
      `Can't publish ${name}: it hasn't been reviewed. Show the test cases to the person; only after their yes, run qam review ${name}.`,
    );
  }
  if (record.run_hash !== runHash(dir)) {
    throw new BlockedError(
      `Can't publish ${name}: the test cases changed since they were reviewed. Review them again: qam review ${name}.`,
    );
  }
  const manifest = readJson<{ scope?: { module?: string; sub_module?: string } }>(
    path.join(dir, 'manifest.json'),
    'manifest.json',
  );
  const module = manifest.scope?.module;
  if (!module)
    throw new BlockedError(`${name}/manifest.json has no scope.module, so the suite for these cases is unknown.`);
  const owner = Object.entries(o.owners).find(([m]) => same(m, module))?.[1];
  return {
    dir,
    name,
    scope: { module, subModule: manifest.scope?.sub_module ?? '' },
    cases: readJson<PublishCase[]>(path.join(dir, 'testcases.json'), 'testcases.json'),
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt ?? '',
    ...(owner && !same(owner, record.reviewedBy)
      ? {
          ownerWarning: `${module}'s owner is ${owner} (config/qamaster.json), and ${record.reviewedBy} reviewed this run. Publishing anyway is allowed.`,
        }
      : {}),
  };
}

// ---- derive

export type Derived = {
  id: string;
  title: string;
  description: string;
  steps: ItemStep[];
  tags: string[]; // QAMaster's own tags except smoke: group, then path
  automatedTest: string | null;
  suite: string;
  hash: string; // of everything above but smoke, which is confirmed apart (Q8)
  priority: string;
  category: string;
  notLinked: boolean; // no source file could be found behind the case: no path: tag
};

/** "<repo>:<path>" to "<path>". */
const inRepo = (f: string) => f.replace(/^[\w.-]+:/, '');

/** A file's folder as a glob at most `depth` folders deep; a file at the repo root stands for itself. */
function pathTag(file: string, depth: number): string {
  const dir = path.posix.dirname(file);
  return dir === '.' ? `path:${file}` : `path:${dir.split('/').slice(0, depth).join('/')}/**`;
}

function sources(c: PublishCase, ctx: PublishContext): string[] {
  const evidence = [...c.evidence, ...c.steps.flatMap((s) => s.evidence ?? [])];
  const cited = evidence.filter((e) => e.startsWith('code:')).map((e) => inRepo(e.slice(5)).replace(/:\d+$/, ''));
  const screens = new Set(
    c.steps
      .flatMap((s) => [s.screen, s.leads_to])
      .filter((r): r is string => !!r)
      .map(matchKey),
  );
  const owned = ctx.dsm.page.nodes.filter((n) => screens.has(n.id)).flatMap((n) => n.files.map(inRepo));
  return [...owned, ...cited];
}

export function derive(c: PublishCase, ctx: PublishContext): Derived {
  const { module, subModule } = ctx.scope;
  const group = [slug(module), ...(subModule ? [`${slug(module)}-${slug(subModule)}`] : [])];
  const files = sources(c, ctx);
  const globs = [...new Set(files.map((f) => pathTag(f, ctx.settings.publish.pathDepth)))].sort();
  // a folder inside another selected folder says nothing more
  const paths = globs.filter((g) => !globs.some((o) => o !== g && o.endsWith('/**') && g.startsWith(o.slice(0, -2))));
  const tags = [...group, ...paths];

  const evidence = [...new Set([...c.evidence, ...c.steps.flatMap((s) => s.evidence ?? [])])];
  const data = Object.entries(c.test_data ?? {}).map(
    ([k, v]) => `- ${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`,
  );
  const description = [
    c.objective,
    ...(c.preconditions.length ? ['', 'Preconditions:', ...c.preconditions.map((p) => `- ${p}`)] : []),
    ...(data.length ? ['', 'Test data:', ...data] : []),
    '',
    `Expected result: ${c.expected_result}`,
    ...(evidence.length ? ['', 'Sources', ...evidence.map((e) => `- ${e}`)] : []),
  ].join('\n');
  const steps = c.steps.map((s) => ({ action: s.action, expected: s.expected }));
  const automatedTest = ctx.scenarios.has(c.id) ? `bdd:@${c.id}` : null;
  const suite = module;
  return {
    id: c.id,
    title: c.title,
    description,
    steps,
    tags,
    automatedTest,
    suite,
    hash: sha([c.title, description, steps, tags, automatedTest, suite]),
    priority: c.priority,
    category: c.category,
    notLinked: files.length === 0,
  };
}

// ---- smoke is suggested here and written only once the person confirms (Q8)

export function suggestSmoke(
  derived: Derived[],
  ledger: LedgerEntry[],
  inStore: number,
  settings: Settings,
): { ids: string[]; total: number; max: number } {
  const { max, priorities, categories } = settings.smoke;
  const known = new Map(ledger.map((e) => [e.localId, e]));
  const ids = derived
    .filter((d) => priorities.includes(d.priority as never) && categories.includes(d.category as never))
    .filter((d) => !known.get(d.id)?.smokeDeclined && !hasTag(known.get(d.id)?.ownedTags ?? [], 'smoke'))
    .slice(0, Math.max(0, max - inStore))
    .map((d) => d.id);
  return { ids, total: inStore + ids.length, max };
}

// ---- diff

export type PlannedChange = PublishChange & {
  hash: string;
  ownedTags: string[];
  suite: string;
  change?: ItemChange; // what --apply would write; absent for unchanged, conflict and retire
};

export type DiffInput = {
  derived: Derived[];
  ledger: LedgerEntry[];
  items: Map<number, Item>; // the store's test cases for the ledger's IDs; an ID that's missing is gone
  module: string;
  confirmedSmoke: Set<string>;
};

const sameSteps = (a: ItemStep[], b: ItemStep[]) => JSON.stringify(a) === JSON.stringify(b);

export function diff(i: DiffInput): { changes: PlannedChange[]; declinedSmoke: string[] } {
  const byLocal = new Map(i.ledger.map((e) => [e.localId, e]));
  const changes: PlannedChange[] = [];
  const declinedSmoke: string[] = [];

  for (const d of i.derived) {
    const entry = byLocal.get(d.id);
    const base = { localId: d.id, hash: d.hash, suite: d.suite };
    if (!entry) {
      const owned = i.confirmedSmoke.has(d.id) ? [...d.tags, 'smoke'] : d.tags;
      changes.push({
        ...base,
        kind: 'create',
        fields: ['title', 'description', 'steps', 'tags', 'suite', ...(d.automatedTest ? ['automatedTest'] : [])],
        reason: 'not published yet',
        ownedTags: owned,
        change: {
          title: d.title,
          description: d.description,
          steps: d.steps,
          addTags: owned,
          suite: d.suite,
          ...(d.automatedTest ? { automatedTest: d.automatedTest } : {}),
        },
      });
      continue;
    }

    const had = entry.ownedTags;
    const it = i.items.get(entry.trackerId);
    if (!it) {
      changes.push({
        ...base,
        kind: 'conflict',
        trackerId: entry.trackerId,
        fields: [],
        reason: `Test case ${entry.trackerId} isn't in the store any more (deleted or moved). Not creating it again: check the store, or remove ${d.id} from .qamaster/ledger.json to publish it as new.`,
        ownedTags: had,
      });
      continue;
    }

    // smoke QA took off in the store stays off (Q8)
    const smokeRemoved = hasTag(had, 'smoke') && !hasTag(it.tags, 'smoke');
    if (smokeRemoved) declinedSmoke.push(d.id);
    const keepSmoke = hasTag(had, 'smoke') && !smokeRemoved;
    const addSmoke = !smokeRemoved && i.confirmedSmoke.has(d.id) && !hasTag(it.tags, 'smoke');
    const owned = keepSmoke || addSmoke ? [...d.tags, 'smoke'] : d.tags;

    const wants = d.hash !== entry.hash || addSmoke;
    const fields: string[] = [];
    const change: ItemChange = {};
    if (wants) {
      if (it.title !== d.title) {
        fields.push('title');
        change.title = d.title;
      }
      if (it.description !== d.description) {
        fields.push('description');
        change.description = d.description;
      }
      if (!sameSteps(it.steps, d.steps)) {
        fields.push('steps');
        change.steps = d.steps;
      }
      if (d.automatedTest && it.automatedTest !== d.automatedTest) {
        fields.push('automatedTest');
        change.automatedTest = d.automatedTest;
      }
      const add = owned.filter((t) => !hasTag(it.tags, t));
      const remove = had.filter((t) => !hasTag(owned, t) && hasTag(it.tags, t));
      if (add.length || remove.length) {
        fields.push('tags');
        if (add.length) change.addTags = add;
        if (remove.length) change.removeTags = remove;
      }
      if (!it.suites.some((s) => s.toLowerCase().endsWith(` / ${d.suite.toLowerCase()}`))) {
        fields.push('suite');
        change.suite = d.suite;
      }
    }
    const common = { ...base, trackerId: entry.trackerId, ownedTags: owned };

    if (!fields.length) {
      changes.push({ ...common, kind: 'unchanged', fields: [], reason: 'nothing to write' });
    } else if (it.rev !== entry.trackerRev) {
      changes.push({
        ...common,
        kind: 'conflict',
        fields,
        ownedTags: had,
        reason: `Test case ${entry.trackerId} changed in the store since it was published (rev ${entry.trackerRev} → ${it.rev}), so ${d.id} wasn't written. Review it there, or re-run with the store's version.`,
      });
    } else {
      changes.push({ ...common, kind: 'update', fields, reason: `${fields.join(', ')} changed`, change });
    }
  }

  // a case this module no longer generates (Q7): listed, closed only with --retire
  const current = new Set(i.derived.map((d) => d.id));
  for (const e of i.ledger) {
    const it = i.items.get(e.trackerId);
    if (current.has(e.localId) || !hasTag(e.ownedTags, slug(i.module)) || !it || it.state === 'Closed') continue;
    changes.push({
      kind: 'retire',
      localId: e.localId,
      trackerId: e.trackerId,
      fields: [],
      reason: `${e.localId} is no longer generated. Pass --retire to close test case ${e.trackerId}.`,
      hash: e.hash,
      ownedTags: e.ownedTags,
      suite: i.module,
    });
  }
  return { changes, declinedSmoke };
}
