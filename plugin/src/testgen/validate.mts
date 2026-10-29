/**
 * The TestGen validator: every step, element, navigation and piece of evidence in a run is checked against the facts,
 * then coverage is reviewed (categories, screens, forms, journeys). Any finding or gap fails the run (Q10).
 */
import { isGap } from '../knowledge/build.mts';
import type { Facts } from './facts.mts';

export const CATEGORIES = ['Positive', 'Negative', 'Boundary', 'E2E', 'Business', 'Edge'];
/** Values the Manual Test Case Report accepts (require_report_fields in config/testgen.json). */
export const REPORT_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const REPORT_CHANNELS = ['Web', 'Mobile Web', 'Android', 'iOS', 'API', 'Desktop'];
export const TYPES = [
  'Functional',
  'Regression',
  'API',
  'UI/UX',
  'Localisation',
  'Accessibility',
  'Security',
  'Performance',
  'Integration',
  'Compatibility',
  'Data migration',
  'Resilience',
];
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
/** Wording that says nothing a tester can execute or check; rejected in titles, objectives, actions and data. */
export const GENERIC_PHRASES = [
  'valid data',
  'invalid data',
  'valid details',
  'invalid details',
  'valid credentials',
  'invalid credentials',
  'valid input',
  'invalid input',
  'valid values',
  'invalid values',
  'required details',
  'necessary details',
  'relevant details',
  'all details',
  'enter details',
  'enter the details',
  'fill the details',
  'fill in the details',
  'fill the form',
  'fill all fields',
  'some data',
  'any data',
  'any value',
  'dummy',
  'sample data',
  'test data',
  'lorem',
  'appropriate',
  'as required',
  'as needed',
  'and so on',
  'etc',
  'check functionality',
  'verify functionality',
  'test the functionality',
  'check the page',
  'verify the page',
  'verify the screen',
  'check the screen',
  'works properly',
  'works fine',
  'as expected',
  'proper',
  'properly',
  'correct data',
  'correct details',
];

/** config/testgen.json */
export type TestGenSettings = {
  hallucination_tolerance?: number;
  required_categories?: string[];
  require_every_screen_covered?: boolean;
  require_every_form_positive_and_negative?: boolean;
  require_every_journey_covered?: boolean;
  vague_expected_phrases?: string[];
  generic_phrases?: string[];
  min_expected_length?: number;
  require_report_fields?: boolean;
};

export type Step = {
  screen?: string;
  action?: string;
  element?: string;
  data?: unknown;
  leads_to?: string;
  expected?: string;
  evidence?: string[];
  [key: string]: unknown;
};
export type TestCase = {
  id?: string;
  title?: string;
  component?: string;
  type?: string;
  category?: string;
  priority?: string;
  objective?: string;
  expected_result?: string;
  business_scenario?: string;
  preconditions?: string[];
  test_data?: Record<string, unknown>;
  steps?: Step[];
  evidence?: string[];
  domain_rules?: string[];
  start_via?: string;
  start_via_reason?: string;
  [key: string]: unknown;
};
export type Manifest = {
  app?: string;
  components?: string[];
  domain?: string;
  domain_evidence?: string[];
  required_types?: string[];
  requirements?: unknown;
  coverage_exclusions?: { component?: string; item?: string; reason?: string }[];
  generated_at?: string;
  [key: string]: unknown;
};
export type Report = {
  status: 'pass' | 'fail';
  hallucination_tolerance: number;
  cases: number;
  errors: string[];
  gaps: string[];
  by_category: Record<string, number>;
  by_type: Record<string, number>;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const s = (v: unknown) => (v === null || v === undefined ? 'None' : String(v)); // AQE printed Python's None
const pair = (a: unknown, b: unknown) => JSON.stringify([a ?? null, b ?? null]);

export function validate(
  manifest: Manifest | null,
  cases: TestCase[] | null,
  facts: Facts,
  cfg: TestGenSettings,
): Report {
  const empty = (error: string): Report => ({
    status: 'fail',
    hallucination_tolerance: cfg.hallucination_tolerance ?? 0,
    cases: 0,
    errors: [error],
    gaps: [],
    by_category: {},
    by_type: {},
  });
  if (!manifest) return empty('manifest.json missing or not valid JSON');
  if (!Array.isArray(cases) || !cases.length) return empty('testcases.json missing, not a list, or empty');
  const errors: string[] = [];
  const gaps: string[] = [];
  const vagueRe = cfg.vague_expected_phrases?.length
    ? new RegExp(`\\b(${cfg.vague_expected_phrases.map((p) => escapeRe(p.toLowerCase())).join('|')})\\b`)
    : null;
  const minLen = cfg.min_expected_length ?? 15;
  const genericRe = new RegExp(
    `(^|[^a-z])(${(cfg.generic_phrases ?? GENERIC_PHRASES).map((p) => escapeRe(p.toLowerCase())).join('|')})($|[^a-z])`,
  );
  const generic = (text: unknown) => genericRe.exec(String(text ?? '').toLowerCase())?.[2] ?? null;
  const genericValue =
    /^(valid|invalid|test|testing|dummy|sample|xyz|abc|abc123|asdf|qwerty|value|data|n\/a|na|tbd|todo|something|anything|x+)$/i;
  const components = facts.model.components;
  const isVague = (text: unknown) => {
    const t = String(text || '')
      .trim()
      .toLowerCase();
    return Array.from(t).length < minLen || Boolean(vagueRe?.test(t));
  };
  const checkEvidence = (where: string, refs: unknown) => {
    if (!Array.isArray(refs) || !refs.length) {
      errors.push(`${where}: no evidence`);
      return;
    }
    for (const ref of refs) {
      const why = facts.verify(ref, manifest);
      if (why) errors.push(`${where}: unverifiable evidence ${s(ref)} (${why})`);
    }
  };

  if (!manifest.domain) errors.push('manifest: domain not set (determine it with Domain_Test_Design_Skill)');
  checkEvidence('manifest.domain_evidence', manifest.domain_evidence);
  const scope = manifest.components ?? [];
  for (const c of scope) {
    if (!components.has(c))
      errors.push(
        `manifest: component ${s(c)} is not in the DSM / AUT skills (known: ${[...components.keys()].join(', ')})`,
      );
  }
  const ids = new Set<string>();
  for (const tc of cases) {
    const w = s(tc.id || '?');
    if (ids.has(w)) errors.push(`${w}: duplicate id`);
    ids.add(w);
    for (const field of ['title', 'component', 'type', 'category', 'priority', 'objective', 'expected_result']) {
      if (!tc[field]) errors.push(`${w}: missing ${field}`);
    }
    if (tc.type && !TYPES.includes(tc.type)) errors.push(`${w}: type ${s(tc.type)} not one of ${TYPES.join(', ')}`);
    if (tc.category && !CATEGORIES.includes(tc.category))
      errors.push(`${w}: category ${s(tc.category)} not one of ${CATEGORIES.join(', ')}`);
    if (tc.priority && !PRIORITIES.includes(tc.priority))
      errors.push(`${w}: priority ${s(tc.priority)} not one of ${PRIORITIES.join(', ')}`);
    if (tc.component && !components.has(tc.component)) errors.push(`${w}: component ${s(tc.component)} not in the DSM`);
    if (cfg.require_report_fields) {
      // the fields the Manual Test Case Report needs; full words, never guessed
      if (!REPORT_SEVERITIES.includes(tc.severity as string))
        errors.push(
          `${w}: severity ${s(tc.severity ?? 'missing')} not one of ${REPORT_SEVERITIES.join(', ')} (from the domain risk hotspots and the requirement, not guessed)`,
        );
      if (!tc.sub_module)
        errors.push(`${w}: missing sub_module (the AUT sub-skill or screen group the case belongs to)`);
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(String(tc.feature ?? '')))
        errors.push(`${w}: feature ${s(tc.feature ?? 'missing')} must be exactly one word`);
      if (!REPORT_CHANNELS.includes(tc.channel as string))
        errors.push(`${w}: channel ${s(tc.channel ?? 'missing')} not one of ${REPORT_CHANNELS.join(', ')}`);
      if (!Array.isArray(tc.coverage) || !tc.coverage.length)
        errors.push(
          `${w}: coverage must list what the case covers (for example Functional, Navigation, Business Rule, Boundary)`,
        );
      if (!('test_data' in tc)) errors.push(`${w}: missing test_data (an empty object when the case needs none)`);
    }
    if (tc.category === 'Business' || tc.category === 'E2E') {
      if (!tc.business_scenario) errors.push(`${w}: ${tc.category} test without business_scenario`);
      if (!(tc.evidence ?? []).some((r) => /^(aut:|code:|req:)/.test(String(r))))
        errors.push(
          `${w}: business scenario not traced to the AUT skill, code or a requirement (aut:/code:/req: evidence)`,
        );
    }
    checkEvidence(w, tc.evidence);
    for (const r of tc.domain_rules ?? []) {
      const why = facts.verify(r, manifest);
      if (why) errors.push(`${w}: domain rule ${s(r)} (${why})`);
    }
    for (const [field, value] of [
      ['title', tc.title],
      ['objective', tc.objective],
    ] as const) {
      const g = generic(value);
      if (g)
        errors.push(
          `${w}: generic wording "${g}" in ${field}: name the exact screen, element, value or rule ("${s(value).slice(0, 80)}")`,
        );
    }
    for (const [k, v] of Object.entries(tc.test_data ?? {})) {
      if (typeof v === 'string' && (genericValue.test(v.trim()) || generic(v)))
        errors.push(
          `${w}: test_data ${k} = "${v}" is generic: give the concrete value the application accepts or rejects (from the DSM field rules, code or requirement)`,
        );
    }
    if (tc.expected_result && isVague(tc.expected_result))
      errors.push(`${w}: vague or too short expected_result "${s(tc.expected_result)}" (state the observable outcome)`);
    const steps = tc.steps ?? [];
    if (!steps.length) {
      errors.push(`${w}: no steps`);
      continue;
    }
    let prev: string | null = null;
    steps.forEach((st, idx) => {
      const sw = `${w} step ${idx + 1}`;
      for (const [field, value] of [
        ['action', st.action],
        ['data', typeof st.data === 'string' ? st.data : ''],
      ] as const) {
        const g = generic(value);
        if (g)
          errors.push(
            `${sw}: generic wording "${g}" in ${field}: say exactly what is done and with which value ("${s(value).slice(0, 80)}")`,
          );
      }
      const route = facts.screen(st.screen);
      if (!st.screen) errors.push(`${sw}: no screen`);
      else if (!route) errors.push(`${sw}: screen ${s(st.screen)} is not in the DSM`);
      for (const field of ['action', 'expected']) if (!st[field]) errors.push(`${sw}: missing ${field}`);
      if (st.expected && isVague(st.expected))
        errors.push(`${sw}: vague or too short expected "${s(st.expected)}" (state what is shown or stored)`);
      if (st.element && route && !facts.hasElement(route, st.element))
        errors.push(`${sw}: element "${s(st.element)}" is not on ${route} in the DSM (invented UI element?)`);
      checkEvidence(sw, st.evidence);
      if (!route) return;
      if (prev === null) {
        if (!facts.entries.has(route) && tc.start_via !== 'deep-link') {
          errors.push(
            `${sw}: starts on ${route}, which is not an entry screen (${[...facts.entries].sort().join(', ')}); ` +
              'add the navigation steps to reach it, or set start_via=deep-link with a reason',
          );
        }
        if (tc.start_via === 'deep-link' && !tc.start_via_reason)
          errors.push(`${w}: start_via=deep-link without start_via_reason`);
      } else if (route !== prev && !facts.hasRelation(prev, route)) {
        errors.push(`${sw}: navigation ${prev} -> ${route} does not exist in the DSM (missing intermediate step?)`);
      }
      prev = route;
      if (st.leads_to) {
        const target = facts.screen(st.leads_to);
        if (!target) errors.push(`${sw}: leads_to ${s(st.leads_to)} is not in the DSM`);
        else if (target !== route && !facts.hasRelation(route, target))
          errors.push(`${sw}: navigation ${route} -> ${target} does not exist in the DSM`);
        else prev = target;
      }
    });
  }

  // ---- coverage review (domain and AUT perspective)
  const exclusions = manifest.coverage_exclusions ?? [];
  const excl = new Set(exclusions.filter((e) => e.reason).map((e) => pair(e.component, e.item)));
  for (const e of exclusions) {
    if (!e.reason) errors.push(`coverage_exclusions: ${s(e.component)}/${s(e.item)} has no reason`);
  }
  const gap = (comp: string, item: string, text: string) => {
    if (!excl.has(pair(comp, item))) gaps.push(`${comp}: ${text}`);
  };
  const pathOf = (tc: TestCase): string[] => {
    const seq: string[] = [];
    for (const st of tc.steps ?? []) {
      for (const r of [facts.screen(st.screen), facts.screen(st.leads_to)]) {
        if (r && (!seq.length || seq[seq.length - 1] !== r)) seq.push(r);
      }
    }
    return seq;
  };
  for (const comp of scope) {
    const screens = components.get(comp) ?? [];
    const mine = cases.filter((tc) => tc.component === comp);
    const visited = new Set(cases.flatMap(pathOf));
    for (const cat of cfg.required_categories ?? CATEGORIES) {
      if (!mine.some((tc) => tc.category === cat)) gap(comp, `category:${cat}`, `no ${cat} test case`);
    }
    for (const t of manifest.required_types ?? ['Functional']) {
      if (!mine.some((tc) => tc.type === t)) gap(comp, `type:${t}`, `no ${t} test case (required_types)`);
    }
    if (cfg.require_every_screen_covered ?? true) {
      for (const n of screens)
        if (!isGap(n) && !visited.has(n.id)) gap(comp, `screen:${n.id}`, `screen ${n.id} not covered by any step`);
    }
    if (cfg.require_every_form_positive_and_negative ?? true) {
      for (const n of screens) {
        for (const f of n.forms ?? []) {
          const on = cases.filter((tc) => (tc.steps ?? []).some((st) => facts.screen(st.screen) === n.id));
          for (const [cat, cats] of [
            ['positive', ['Positive', 'E2E', 'Business']],
            ['negative', ['Negative', 'Boundary']],
          ] as const) {
            if (!on.some((tc) => (cats as readonly string[]).includes(tc.category as string)))
              gap(comp, `form:${n.id}:${s(f.name)}:${cat}`, `form ${s(f.name)} on ${n.id} has no ${cat} test`);
          }
        }
      }
    }
    if (cfg.require_every_journey_covered ?? true) {
      facts.journeys.forEach((j, i) => {
        if (!j.components.includes(comp)) return;
        const covered = cases.some((tc) => {
          if (tc.category !== 'E2E' && tc.category !== 'Business') return false;
          const p = pathOf(tc);
          let k = 0;
          return j.screens.every((sc) => {
            while (k < p.length) if (p[k++] === sc) return true;
            return false;
          });
        });
        if (!covered)
          gap(
            comp,
            `journey:${i + 1}`,
            `journey ${i + 1} (${facts.model.journeyText(j)}) not covered by an E2E/Business test`,
          );
      });
    }
  }

  const tolerance = cfg.hallucination_tolerance ?? 0;
  const byCategory: Record<string, number> = {};
  for (const c of CATEGORIES) byCategory[c] = cases.filter((tc) => tc.category === c).length;
  const byType: Record<string, number> = {};
  for (const t of TYPES) if (cases.some((tc) => tc.type === t)) byType[t] = cases.filter((tc) => tc.type === t).length;
  return {
    status: errors.length <= tolerance && !gaps.length ? 'pass' : 'fail',
    hallucination_tolerance: tolerance,
    cases: cases.length,
    errors,
    gaps,
    by_category: byCategory,
    by_type: byType,
  };
}
