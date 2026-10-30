/**
 * Hand-written checks for the data files QAMaster reads (Q1: no runtime dependencies). Each one returns the typed value
 * with defaults filled in, or throws BlockedError naming the file and the key to fix.
 */

import { BlockedError } from './errors.mts';
import {
  CATEGORIES,
  type Category,
  type ItemStep,
  type Ledger,
  type LedgerEntry,
  PRIORITIES,
  type Priority,
} from './models.mts';

/** The QA project's config/qamaster.json (docs/design.md, Configuration), with defaults filled in. */
export type ProjectConfig = {
  app?: { name: string; url?: string; repo?: string; channels?: string[] };
  publish: { pathDepth: number; suiteBy: 'module' };
  smoke: { max: number; priorities: Priority[]; categories: Category[] };
  ai: 'on' | 'off';
  owners: Record<string, string>; // module -> owner's email
  gate: { retries: number; noMatch: 'pass-with-warning' };
};

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  publish: { pathDepth: 4, suiteBy: 'module' },
  smoke: { max: 20, priorities: ['P1'], categories: ['Positive', 'E2E'] },
  ai: 'on',
  owners: {},
  gate: { retries: 1, noMatch: 'pass-with-warning' },
};

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function asProjectConfig(data: unknown, file: string): ProjectConfig {
  const bad = (key: string, want: string): never => {
    throw new BlockedError(`${file}: "${key}" must be ${want}. Fix it, or remove it to use the default.`);
  };
  const section = (o: Obj, key: string): Obj => {
    if (o[key] === undefined) return {};
    return isObj(o[key]) ? o[key] : bad(key, 'an object');
  };
  if (!isObj(data)) return bad('(top level)', 'a JSON object');
  const d = DEFAULT_PROJECT_CONFIG;
  const out: ProjectConfig = structuredClone(d);

  if (data.app !== undefined) {
    const app = section(data, 'app');
    if (typeof app.name !== 'string' || !app.name) bad('app.name', 'a non-empty string');
    for (const key of ['url', 'repo'] as const) {
      if (app[key] !== undefined && typeof app[key] !== 'string') bad(`app.${key}`, 'a string');
    }
    if (app.channels !== undefined && !isStrings(app.channels)) bad('app.channels', 'a list of strings');
    out.app = app as ProjectConfig['app'];
  }

  const publish = section(data, 'publish');
  if (publish.pathDepth !== undefined) {
    if (!isCount(publish.pathDepth) || publish.pathDepth < 1) bad('publish.pathDepth', 'a whole number of 1 or more');
    out.publish.pathDepth = publish.pathDepth as number;
  }
  if (publish.suiteBy !== undefined && publish.suiteBy !== 'module') bad('publish.suiteBy', '"module"');

  const smoke = section(data, 'smoke');
  if (smoke.max !== undefined) out.smoke.max = isCount(smoke.max) ? smoke.max : bad('smoke.max', 'a whole number');
  if (smoke.priorities !== undefined) {
    const ok =
      isStrings(smoke.priorities) && smoke.priorities.every((p) => (PRIORITIES as readonly string[]).includes(p));
    out.smoke.priorities = ok ? (smoke.priorities as Priority[]) : bad('smoke.priorities', `a list of ${PRIORITIES}`);
  }
  if (smoke.categories !== undefined) {
    const ok =
      isStrings(smoke.categories) && smoke.categories.every((c) => (CATEGORIES as readonly string[]).includes(c));
    out.smoke.categories = ok ? (smoke.categories as Category[]) : bad('smoke.categories', `a list of ${CATEGORIES}`);
  }

  if (data.ai !== undefined) out.ai = data.ai === 'on' || data.ai === 'off' ? data.ai : bad('ai', '"on" or "off"');

  const owners = section(data, 'owners');
  if (!Object.values(owners).every((v) => typeof v === 'string')) bad('owners', 'module names mapped to emails');
  out.owners = owners as Record<string, string>;

  const gate = section(data, 'gate');
  if (gate.retries !== undefined)
    out.gate.retries = isCount(gate.retries) ? gate.retries : bad('gate.retries', 'a whole number');
  if (gate.noMatch !== undefined && gate.noMatch !== 'pass-with-warning') bad('gate.noMatch', '"pass-with-warning"');

  return out;
}

/** .qamaster/ledger.json (Q7, Q34). Strict: a ledger that is half understood would publish things twice. */
export function asLedger(data: unknown, file: string): Ledger {
  const bad = (what: string, want: string): never => {
    throw new BlockedError(`${file}: ${what} must be ${want}. Restore the file from git; don't delete it.`);
  };
  if (!isObj(data)) return bad('the file', 'a JSON object');
  if (typeof data.store !== 'string' || !data.store) bad('"store"', 'the name of the store the IDs belong to');
  if (!Array.isArray(data.entries)) bad('"entries"', 'a list');
  const seen = new Set<string>();
  const entries = (data.entries as unknown[]).map((raw, i) => {
    const e = isObj(raw) ? raw : bad(`entry ${i + 1}`, 'an object');
    const id = typeof e.localId === 'string' && e.localId ? e.localId : bad(`entry ${i + 1}: "localId"`, 'a draft ID');
    const field = (key: string, want: string, ok: boolean) => {
      if (!ok) bad(`entry ${i + 1} (${id}): "${key}"`, want);
    };
    field('trackerId', 'a whole number', Number.isInteger(e.trackerId) && (e.trackerId as number) > 0);
    field('hash', 'a string', typeof e.hash === 'string' && e.hash !== '');
    field('ownedTags', 'a list of tags', isStrings(e.ownedTags));
    field('smokeDeclined', 'true or false', typeof e.smokeDeclined === 'boolean');
    field('publishedAt', 'a string', typeof e.publishedAt === 'string');
    field('trackerRev', 'a whole number', Number.isInteger(e.trackerRev) && (e.trackerRev as number) >= 0);
    if (seen.has(id)) bad(`${id}`, 'in the ledger once, not twice');
    seen.add(id);
    return e as unknown as LedgerEntry;
  });
  return { store: data.store as string, entries };
}

/** One test case in the `file` store's JSON form (Q34): the CSV's columns, under these keys. */
export type FileCaseRecord = {
  id: number;
  title: string;
  description: string;
  state: string;
  suites: string[];
  requirements: number[];
  automatedTest: string | null;
  tags: string[];
  rev: number;
  signature: string; // '' when nobody has written one: the case then counts as unedited
  fields: Record<string, string>;
  steps: ItemStep[];
};
/** A record with only a suite declares that suite, so an empty suite survives, as a Suite-only row does in the CSV. */
export type FileStoreRecord = FileCaseRecord | { suite: string };

const CASE_KEYS = [
  'id',
  'title',
  'description',
  'state',
  'suites',
  'requirements',
  'automatedTest',
  'tags',
  'rev',
  'signature',
  'fields',
  'steps',
] as const;

/** testcases/testcases.json, read by the `file` store (Q34). Optional keys get the CSV's defaults. */
export function asFileStoreRecords(data: unknown, file: string): FileStoreRecord[] {
  const bad = (what: string, want: string): never => {
    throw new BlockedError(`${file}: ${what} must be ${want}. Fix it by hand or restore the file from git.`);
  };
  if (!Array.isArray(data)) return bad('the file', 'a list of test case records, like [{"id": 1000, "title": "…"}]');
  const seen = new Set<number>();
  return data.map((raw, i): FileStoreRecord => {
    const r = isObj(raw) ? raw : bad(`record ${i + 1}`, 'an object');
    if (r.id === undefined && 'suite' in r && Object.keys(r).length === 1) {
      return typeof r.suite === 'string' && r.suite.trim()
        ? { suite: r.suite.trim() }
        : bad(`record ${i + 1}: "suite"`, 'a suite name');
    }
    if (!Number.isInteger(r.id) || (r.id as number) < 1) bad(`record ${i + 1}: "id"`, 'a whole number');
    const id = r.id as number;
    const at = `record ${i + 1} (${id})`;
    const odd = Object.keys(r).find((k) => !(CASE_KEYS as readonly string[]).includes(k));
    if (odd !== undefined) {
      throw new BlockedError(
        `${file}: ${at} has a key "${odd}" that QAMaster doesn't use and would lose on its next write. Remove it.`,
      );
    }
    if (seen.has(id)) bad(`${at}: test case ${id}`, 'in the file once, not twice');
    seen.add(id);
    const field = <T,>(key: (typeof CASE_KEYS)[number], want: string, ok: (v: unknown) => boolean, empty: T): T => {
      if (r[key] === undefined) return empty;
      return ok(r[key]) ? (r[key] as T) : bad(`${at}: "${key}"`, want);
    };
    const text = (v: unknown) => typeof v === 'string';
    if (typeof r.title !== 'string' || !r.title) bad(`${at}: "title"`, 'a non-empty string');
    return {
      id,
      title: r.title as string,
      description: field('description', 'a string', text, ''),
      state: field('state', 'a string', text, '') || 'Design',
      suites: field('suites', 'a list of suite names', isStrings, [] as string[]),
      requirements: field(
        'requirements',
        'a list of work item numbers',
        (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n > 0),
        [] as number[],
      ),
      automatedTest:
        field<string | null>('automatedTest', 'a string or null', (v) => v === null || text(v), null) || null,
      tags: field('tags', 'a list of tags', isStrings, [] as string[]),
      rev: field('rev', 'a whole number of 1 or more', (v) => Number.isInteger(v) && (v as number) >= 1, 1),
      signature: field('signature', 'a string', text, ''),
      fields: field(
        'fields',
        'an object of strings, like {"Priority": "2"}',
        (v) => isObj(v) && Object.values(v).every(text),
        {} as Record<string, string>,
      ),
      steps: field(
        'steps',
        'a list of {"action": "…", "expected": "…"}',
        (v) =>
          Array.isArray(v) &&
          v.every((s) => isObj(s) && text(s.action) && text(s.expected) && Object.keys(s).length === 2),
        [] as ItemStep[],
      ),
    };
  });
}
