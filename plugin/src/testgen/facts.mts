/**
 * What a test case may refer to, loaded once: the DSM's screens, elements, navigations and journeys, the scanned code
 * files, and the AUT and domain skills. Ported from Autonomous-QE's testgen (0.2.0) without its v2 parts: API steps
 * (api:), revision mode (tc:) and locator evidence (locator:, feature 8).
 *
 * Evidence a test case can cite, each checked by verify():
 *     dsm:screen:<route>              the screen is in the DSM
 *     dsm:element:<route>:<label>     the element, form, field or button is on that screen
 *     dsm:relation:<from>-><to>       the navigation is in the DSM
 *     dsm:journey:<n>                 candidate journey n (from context)
 *     dsm:api:<METHOD> <path>         the API route is in the code model (kind: api, Q48), for API cases
 *     code:<repo>:<path>[:<line>[-<line>]]  the file is in the scanned code, and the line or range is in it
 *     aut:<Skill>[#<heading>]         the AUT skill (and heading) exists
 *     domain:<SubSkill>[#<heading>]   Domain_Test_Design_Skill or a sub-skill (prefix optional), and the heading
 *     req:<id>                        a requirement in requirements/<manifest.requirements_scope>/requirements.json
 *
 * Pure: skill texts come through `skill(dir, name)`, so tests need no files.
 */
import type { Dsm, PageNode } from '../dsm/build.mts';
import { type Journey, type KnowledgeSettings, Model } from '../knowledge/build.mts';

export const DOMAIN_SKILL = 'Domain_Test_Design_Skill';
export const EVIDENCE_FORMATS = [
  'dsm:screen:<route>',
  'dsm:element:<route>:<label>',
  'dsm:relation:<from>-><to>',
  'dsm:journey:<n>',
  'dsm:api:<METHOD> <path>',
  'code:<repo>:<path>[:<line>[-<line>]]',
  'aut:<Skill>[#<heading>]',
  'domain:<SubSkill>[#<heading>]',
  'req:<id>',
];

/**
 * The DSM shape 0.7.0 adds, read through local types until the dsm track's PageNode carries it: a screen's access, a
 * form's dialog and a field's declared limits. Every one is optional, so a DSM from 0.6.0 still reads.
 */
export type Access = 'public' | 'signed-in' | 'both';
type Limits = { min_length?: number | null; max_length?: number | null; min?: number | null; max?: number | null };
export type DsmField = PageNode['forms'][number]['fields'][number] & Limits & { pattern?: string | null };
export type DsmForm = Omit<PageNode['forms'][number], 'fields'> & { dialog?: string; fields: DsmField[] };
export type Screen = Omit<PageNode, 'forms'> & { access?: Access; forms: DsmForm[] };

const LIMITS = ['min_length', 'max_length', 'min', 'max', 'pattern'] as const;
/** The limits a field declares, without the ones the page leaves out. */
const declared = (fd: DsmField) =>
  Object.fromEntries(LIMITS.flatMap((k) => (fd[k] === undefined || fd[k] === null ? [] : [[k, fd[k]]])));

/** Lower case, punctuation as single spaces. */
export function norm(text: unknown): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/** str.partition(sep) */
export function partition(s: string, sep: string): [string, string, string] {
  const i = s.indexOf(sep);
  return i < 0 ? [s, '', ''] : [s.slice(0, i), sep, s.slice(i + sep.length)];
}
/** str.rpartition(sep) */
export function rpartition(s: string, sep: string): [string, string, string] {
  const i = s.lastIndexOf(sep);
  return i < 0 ? ['', '', s] : [s.slice(0, i), sep, s.slice(i + sep.length)];
}
const pair = (a: unknown, b: unknown) => JSON.stringify([a ?? null, b ?? null]);
const access = (n: PageNode) => (n as Screen).access;
const sorted = (xs: Iterable<string>) => [...xs].sort();

/** A route of code-model.json (the scan's ScanRoute, the fields TestGen reads). */
export type ApiRoute = { route: string; kind?: string; method?: string; repo?: string; file?: string; line?: number };
/** "POST", "/todos/{id}/" -> "POST /todos/:id": a path parameter is written {id} or :id, a trailing slash doesn't count. */
export const apiKey = (method: unknown, route: unknown): string =>
  `${String(method).toUpperCase()} ${(
    String(route)
      .replace(/\{(\w+)\}/g, ':$1')
      .replace(/\/+$/, '') || '/'
  ).trim()}`;

export type FactsInput = {
  dsm: Dsm;
  codeFiles: string[]; // "<repo>:<path>" of every scanned file (code-model.json files)
  apiRoutes?: ApiRoute[]; // the code model's routes; those of kind api are the API channel's (Q48)
  settings: KnowledgeSettings;
  app: string; // the skill name, as qam aut-skills writes it
  autSkills: string[]; // folders in the skills directory
  domainSkills: string[]; // Domain_Test_Design_Skill and its sub-skills
  skill: (name: string) => string | null; // the SKILL.md text of an AUT or domain skill
  lines: (file: string) => number | null; // lines in "<repo>:<path>" at the scanned commit; null if it can't be read
  text?: (file: string) => string | null; // the text of "<repo>:<path>" at the scanned commit; null if it can't be read
  requirements: (scope: string) => string[] | null; // IDs saved under requirements/<scope>/; null if none
};

/** Words that name an element's kind rather than the element: "Coupon field" is the Coupon element. */
const KIND = /^(?:the )?(.*?)(?: (?:field|button|link|tab|menu item|menuitem|menu|checkbox|dropdown|form|dialog))?$/;
const bare = (name: string) => KIND.exec(name)?.[1] || name;

export class Facts {
  readonly dsm: Dsm;
  readonly model: Model;
  readonly app: string;
  readonly codeFiles: Set<string>;
  readonly elements = new Map<string, Set<string>>();
  readonly relations: Set<string>;
  readonly journeys: Journey[];
  readonly entries: Set<string>;
  readonly apiRoutes: (ApiRoute & { key: string })[];
  readonly limited = new Map<string, string[]>(); // route -> labels of the fields with a declared limit
  readonly hasAccess: boolean; // the DSM records which screens are public (0.7.0)
  readonly input: FactsInput;

  constructor(input: FactsInput) {
    this.input = input;
    this.dsm = input.dsm;
    this.app = input.app;
    this.model = new Model(input.dsm, input.settings, input.app);
    this.codeFiles = new Set(input.codeFiles);
    for (const n of this.model.nodes) {
      for (const f of n.files ?? []) this.codeFiles.add(f);
      for (const d of n.code_defs ?? []) this.codeFiles.add(String(d).split(':').slice(0, 2).join(':'));
    }
    for (const n of this.model.nodes) {
      const names = new Set<string>();
      for (const e of this.model.elements.get(n.id) ?? []) names.add(norm(e.label));
      for (const f of (n as Screen).forms ?? []) {
        names.add(norm(f.name));
        for (const b of f.submits ?? []) names.add(norm(b));
        for (const fd of f.fields ?? []) {
          names.add(norm(fd.label));
          names.add(norm(fd.name));
          if (Object.keys(declared(fd)).length && (fd.label ?? fd.name))
            this.limited.set(n.id, [...(this.limited.get(n.id) ?? []), String(fd.label ?? fd.name)]);
        }
      }
      for (const t of (n.tables ?? []) as { columns?: string[] }[]) for (const c of t.columns ?? []) names.add(norm(c));
      for (const c of n.code_elements?.controls ?? []) names.add(norm(c));
      names.delete('');
      this.elements.set(n.id, names);
    }
    this.apiRoutes = (input.apiRoutes ?? [])
      .filter((r) => r.kind === 'api' && r.method)
      .map((r) => ({ ...r, key: apiKey(r.method, r.route) }));
    this.hasAccess = this.model.nodes.some((n) => (n as Screen).access);
    this.relations = new Set([...this.model.out.values()].flatMap((rels) => rels.map((r) => pair(r.from, r.to))));
    this.journeys = this.model.journeys();
    this.entries = new Set([
      ...this.journeys.map((j) => j.start),
      ...this.model.nodes.filter((n) => n.discovered_by === 'start' || n.discovered_by === 'login').map((n) => n.id),
    ]);
  }

  /** The DSM route for a screen, ignoring case and a trailing slash; null when it isn't one. */
  screen(route: unknown): string | null {
    const r = String(route || '').trim();
    if (this.model.byId.has(r)) return r;
    const low = r.toLowerCase().replace(/\/+$/, '') || '/';
    return [...this.model.byId.keys()].find((n) => n.toLowerCase() === low) ?? null;
  }

  /**
   * The element is on the screen by its exact name, ignoring case, punctuation and a kind word ("Coupon field").
   * AQE also accepted any part of a name over 3 characters, so an invented "Check" passed as part of "checkout".
   */
  hasElement(route: string, label: unknown): boolean {
    const target = bare(norm(label));
    if (!target) return false;
    for (const n of this.elements.get(route) ?? []) if (n === target || bare(n) === target) return true;
    return false;
  }

  /** Whether a signed-out visitor sees the screen (public), only a signed-in one does, or both; null when unrecorded. */
  access(route: string): Access | null {
    return (this.model.byId.get(route) as Screen | undefined)?.access ?? null;
  }

  /** The API route (verb and path) is one the code model found on the server only (Q48). */
  hasApiRoute(method: unknown, route: unknown): boolean {
    const key = apiKey(method, route);
    return this.apiRoutes.some((r) => r.key === key);
  }

  hasRelation(from: string, to: string): boolean {
    return this.relations.has(pair(from, to));
  }

  skillHeading(skill: string, heading: string): boolean {
    const text = this.input.skill(skill);
    if (text === null) return false;
    if (!heading) return true;
    const heads = [...text.matchAll(/^#{1,6} ([^\n]+)$/gm)].map((m) => norm(m[1]));
    return heads.some((h) => h.includes(norm(heading)));
  }

  /** null when the evidence reference checks out, else the reason it doesn't. */
  verify(refIn: unknown, manifest: { requirements_scope?: unknown }): string | null {
    const ref = String(refIn).trim();
    const [kind, , rest] = partition(ref, ':');
    if (kind === 'dsm') {
      const [sub, , val] = partition(rest, ':');
      if (sub === 'screen') return this.screen(val) ? null : `screen ${val} is not in the DSM`;
      if (sub === 'element') {
        const [route, , label] = rpartition(val, ':');
        const s = this.screen(route);
        if (!s) return `screen ${route} is not in the DSM`;
        return this.hasElement(s, label) ? null : `element "${label}" is not on ${route} in the DSM`;
      }
      if (sub === 'relation') {
        const [a, , b] = partition(val, '->');
        const sa = this.screen(a);
        const sb = this.screen(b);
        return sa && sb && this.hasRelation(sa, sb) ? null : `navigation ${a} -> ${b} is not in the DSM`;
      }
      if (sub === 'api') {
        const [method, , route] = partition(val.trim(), ' ');
        return /^[A-Za-z]+$/.test(method) && route.startsWith('/') && this.hasApiRoute(method, route.trim())
          ? null
          : `API route ${val} is not in the code model's API routes (kind: api): ${this.apiRoutes.length ? this.apiRoutes.map((r) => r.key).join(', ') : 'none found'}`;
      }
      if (sub === 'journey')
        return /^\d+$/.test(val) && Number(val) >= 1 && Number(val) <= this.journeys.length
          ? null
          : `journey ${val} does not exist`;
      return `unknown dsm reference ${ref}`;
    }
    if (kind === 'code') {
      const parts = rest.split(':');
      const key = parts.length >= 2 ? parts.slice(0, 2).join(':') : rest;
      if (!this.codeFiles.has(key)) return `${key} is not in the scanned repository (DSM code model)`;
      if (parts.length < 3) return null;
      // a cited line, or both ends of a range (18-25), must exist (AQE checked the file only, so line 9999 of a
      // 40-line file passed)
      const count = this.input.lines(key);
      if (count === null) return `can't read ${key} at the scanned commit to check line ${parts[2]}`;
      const ends = parts[2].split('-');
      for (const end of ends) {
        const line = Number(end);
        if (!(ends.length <= 2 && Number.isInteger(line) && line >= 1 && line <= count))
          return `${key} has no line ${end} (${count} lines)`;
      }
      if (ends.length === 2 && Number(ends[0]) > Number(ends[1]))
        return `${key} lines ${parts[2]}: the range starts after it ends`;
      return null;
    }
    if (kind === 'aut') {
      const [skill, , heading] = partition(rest, '#');
      return this.skillHeading(skill, heading) ? null : `AUT skill ${skill}${heading ? `#${heading}` : ''} not found`;
    }
    if (kind === 'domain') return this.verifyDomain(rest);
    if (kind === 'req') {
      // from the fetched file, not the manifest: the manifest is written by the model whose claims are checked
      const scope = manifest.requirements_scope;
      if (!scope)
        return `req:${rest} needs manifest.requirements_scope, a requirements/<scope>/ folder: run qam requirements fetch or import`;
      const ids = this.input.requirements(String(scope));
      if (ids === null)
        return `no requirements/${scope}/requirements.json: run qam requirements fetch or import, or fix requirements_scope`;
      return ids.includes(rest) ? null : `requirement ${rest} is not in requirements/${scope}/requirements.json`;
    }
    return `unknown evidence type in ${ref}`;
  }

  /** domain:<SubSkill>[#<heading>], with or without the Domain_Test_Design_Skill- prefix. */
  verifyDomain(rest: string): string | null {
    let [skill, , heading] = partition(rest, '#');
    skill = skill.trim();
    if (skill !== DOMAIN_SKILL && !skill.startsWith(`${DOMAIN_SKILL}-`)) skill = `${DOMAIN_SKILL}-${skill}`;
    if (this.input.domainSkills.includes(skill) && this.skillHeading(skill, heading.trim())) return null;
    return `domain skill ${skill}${heading ? `#${heading}` : ''} not found (sub-skills: ${DOMAIN_SKILL}-Domain-*, -Test-*, -App-*, -Core-*)`;
  }

  /** The fact pack Claude generates from: every screen, element and navigation it may use. */
  context(components: string[] | null) {
    const comps = components?.length ? components : [...this.model.components.keys()];
    const pack = {
      app: this.app,
      dsm_generated_at: this.dsm.generated_at,
      base_url: this.dsm.base_url,
      entry_screens: sorted(this.entries),
      components: {} as Record<string, { aut_skill: string; screens: unknown[] }>,
      journeys: this.journeys.map((j, i) => ({
        n: i + 1,
        components: j.components,
        path: this.model.journeyText(j),
        screens: j.screens,
      })),
      ...(this.apiRoutes.length
        ? {
            api_routes: this.apiRoutes.map((r) => ({
              method: String(r.method).toUpperCase(),
              path: r.route,
              source: `${r.repo}:${r.file}:${r.line}`,
            })),
          }
        : {}),
      evidence_formats: EVIDENCE_FORMATS,
      domain_skills: sorted(this.input.domainSkills),
      aut_skills: sorted(this.input.autSkills.filter((d) => d.startsWith(`AUT_${this.app}`))),
    };
    for (const comp of comps) {
      const screens = this.model.components.get(comp);
      if (!screens?.length) continue;
      pack.components[comp] = {
        aut_skill: `AUT_${this.app}-${comp}`,
        screens: screens.map((n) => ({
          route: n.id,
          title: n.title ?? null,
          url: n.url ?? null,
          flags: n.flags ?? [],
          ...(access(n) ? { access: access(n) } : {}),
          forms: ((n as Screen).forms ?? []).map((f) => ({
            name: f.name ?? null,
            ...(f.dialog ? { dialog: f.dialog } : {}),
            method: f.method ?? null,
            target: f.target ?? null,
            fields: (f.fields ?? []).map((fd) => ({
              label: fd.label ?? null,
              name: fd.name ?? null,
              type: fd.type ?? null,
              required: fd.required ?? null,
              ...declared(fd),
            })),
            buttons: f.submits ?? [],
          })),
          elements: sorted(
            new Set((this.model.elements.get(n.id) ?? []).filter((e) => e.label).map((e) => `${e.kind}: ${e.label}`)),
          ),
          navigates_to: this.model.outOf(n.id).map((r) => ({ to: r.to, via: r.label || r.types.join('/') })),
          reached_from: this.model.incOf(n.id).map((r) => ({ from: r.from, via: r.label || r.types.join('/') })),
          source_files: [...(n.files ?? []).slice(0, 20), ...(n.code_defs ?? []).slice(0, 5)],
        })),
      };
    }
    return pack;
  }
}
