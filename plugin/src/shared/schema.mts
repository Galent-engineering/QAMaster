/**
 * Hand-written checks for the data files QAMaster reads (Q1: no runtime dependencies). Each one returns the typed value
 * with defaults filled in, or throws BlockedError naming the file and the key to fix.
 */

import { BlockedError } from './errors.mts';
import { CATEGORIES, type Category, PRIORITIES, type Priority } from './models.mts';

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
  publish: { pathDepth: 3, suiteBy: 'module' },
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
