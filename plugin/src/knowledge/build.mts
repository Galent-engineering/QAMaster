/**
 * Builds the application knowledge skills from the Design Structure Matrix. Ported from Autonomous-QE's
 * build_aut_skills, which is the same in 0.1.5 and 0.2.0.
 *
 *     AUT_<App>/SKILL.md               overview, components, component dependency matrix, cross-component journeys,
 *                                      most reached screens, coverage gaps, routing to the sub-skills
 *     AUT_<App>-<Component>/SKILL.md   one per DSM module: screens, UI elements, forms and fields, navigation in and
 *                                      out, dependencies, journeys, test notes, source files
 *
 * Every SKILL.md has two blocks. The curated block is written by Claude or QA from the source code and kept as it is.
 * The generated block holds facts from dsm.json and is rewritten on every build. Dependencies between components come
 * only from the DSM's navigations.
 *
 * This file is pure: the DSM, the settings and the existing SKILL.md texts go in, the files to write come out.
 */
import { compare, type Dsm, type PageNode } from '../dsm/build.mts';

export const CURATED_START =
  '<!-- curated:start (written by Claude / QA from the source code; kept on regeneration) -->';
export const CURATED_END = '<!-- curated:end -->';
export const GEN_START =
  '<!-- generated:start (facts from the Design Structure Matrix; rewritten on regeneration, do not edit) -->';
export const GEN_END = '<!-- generated:end -->';
const REL_NAME: Record<string, string> = {
  link: 'link',
  form: 'form submit',
  click: 'click',
  popup: 'pop-up',
  redirect: 'redirect',
  code: 'in code',
};

/** config/aut-skills.json */
export type KnowledgeSettings = {
  skills_dir?: string;
  component_names?: Record<string, string>;
  exclude_modules?: string[];
  max_journeys?: number;
  max_journey_steps?: number;
};

type Relation = { from: string; to: string; types: string[]; label: string; ref: string | null };
type Journey = { start: string; steps: Relation[]; screens: string[]; components: string[] };
type ElementLike = { kind: string; label?: string | null; page?: string | null };

/** 'order management' -> 'OrderManagement'; '' -> 'Home'. Also turns the app name into the skill name. */
export function pascal(text: string | null | undefined): string {
  const words = String(text ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Home';
}

/** Python's truthiness, which decides what AQE printed: empty strings, lists and objects count as missing. */
function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === 'object') return Object.keys(v).length > 0;
  return Boolean(v);
}
const str = (v: unknown): string => (v === null || v === undefined ? 'None' : String(v));
const chars = (s: string) => Array.from(s); // code points, as Python slices strings
const sorted = (xs: Iterable<string>) => [...xs].sort((a, b) => compare(a, b));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Text safe inside a Markdown table cell. */
function md(text: unknown): string {
  return str(text ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .trim();
}
const mermaidId = (id: string) => `n${id.replace(/[^A-Za-z0-9]/g, '_')}`;
const mermaidLabel = (text: unknown) =>
  chars(str(text).replace(/["[\]{}()<>]/g, ' '))
    .slice(0, 40)
    .join('')
    .trim() || '/';
const relHow = (types: string[]) => types.map((t) => REL_NAME[t] ?? t).join('/');
const more = (n: number, limit: number) => (n > limit ? ' …' : '');
const isGap = (n: PageNode) => n.flags.includes('unresolved') || n.flags.includes('broken');

class Model {
  readonly nodes: PageNode[];
  readonly byId = new Map<string, PageNode>();
  readonly comp = new Map<string, string>();
  readonly out = new Map<string, Relation[]>();
  readonly inc = new Map<string, Relation[]>();
  readonly elements = new Map<string, ElementLike[]>();
  readonly components = new Map<string, PageNode[]>();
  readonly dsm: Dsm;
  readonly settings: KnowledgeSettings;
  readonly app: string;

  constructor(dsm: Dsm, settings: KnowledgeSettings, app: string) {
    this.dsm = dsm;
    this.settings = settings;
    this.app = app;
    const exclude = settings.exclude_modules ?? [];
    this.nodes = dsm.page.nodes.filter((n) => n.id !== '(shared)' && !exclude.includes(n.module));
    for (const n of this.nodes) this.byId.set(n.id, n);
    const names = settings.component_names ?? {};
    for (const n of this.nodes) this.comp.set(n.id, names[n.module] || pascal(n.module));
    for (const c of dsm.page.cells) {
      const a = dsm.page.nodes[c.r]?.id;
      const b = dsm.page.nodes[c.c]?.id;
      if (a === undefined || b === undefined || !this.byId.has(a) || !this.byId.has(b)) continue;
      const vs = (c.v ?? []) as { s?: string; label?: string; ref?: string | null }[];
      const ui = vs.find((v) => v.s === 'ui' && truthy(v.label));
      const code = vs.find((v) => v.s === 'code');
      const rel: Relation = {
        from: a,
        to: b,
        types: sorted(Array.isArray(c.t) ? (c.t as string[]) : Object.keys(c.t)),
        label: ui ? (ui.label as string) : '',
        ref: code ? (code.ref ?? null) : '',
      };
      this.rels(this.out, a).push(rel);
      this.rels(this.inc, b).push(rel);
    }
    for (const n of this.nodes) {
      this.rels(this.out, n.id);
      this.rels(this.inc, n.id);
    }
    for (const e of (dsm.element?.nodes ?? []) as ElementLike[]) {
      if (e.kind === 'page') continue;
      const key = e.page ?? 'null';
      this.elements.set(key, [...(this.elements.get(key) ?? []), e]);
    }
    const depth = (n: PageNode) => n.depth ?? 99;
    const groups = new Map<string, PageNode[]>();
    for (const n of [...this.nodes].sort((x, y) =>
      compare([this.compOf(x.id), depth(x), x.label], [this.compOf(y.id), depth(y), y.label]),
    )) {
      groups.set(this.compOf(n.id), [...(groups.get(this.compOf(n.id)) ?? []), n]);
    }
    // a module made only of dead targets (unresolved links, pages that fail to load) is a coverage gap, not a component
    for (const [c, ns] of groups) if (!ns.every(isGap)) this.components.set(c, ns);
  }

  private rels(m: Map<string, Relation[]>, id: string): Relation[] {
    if (!m.has(id)) m.set(id, []);
    return m.get(id) as Relation[];
  }
  compOf = (id: string) => this.comp.get(id) as string;
  node = (id: string) => this.byId.get(id) as PageNode;
  outOf = (id: string) => this.out.get(id) ?? [];
  incOf = (id: string) => this.inc.get(id) ?? [];

  /** Navigations between components: `${from}\0${to}` -> count, in first-seen order. */
  compMatrix(): Map<string, number> {
    const m = new Map<string, number>();
    for (const rels of this.out.values()) {
      for (const r of rels) {
        const a = this.compOf(r.from);
        const b = this.compOf(r.to);
        if (a !== b && this.components.has(a) && this.components.has(b))
          m.set(`${a}\0${b}`, (m.get(`${a}\0${b}`) ?? 0) + 1);
      }
    }
    return m;
  }

  /** Candidate end-to-end journeys: shortest navigation paths from entry screens to screens where work is done. */
  journeys(): Journey[] {
    // entry screens: where the crawl started or landed after login (re-crawled pages also get depth 0)
    let starts = this.nodes.filter((n) => n.discovered_by === 'start' || n.discovered_by === 'login').map((n) => n.id);
    if (!starts.length) starts = this.nodes.filter((n) => n.depth === 0).map((n) => n.id);
    if (!starts.length && this.nodes.length) {
      let best = this.nodes[0];
      for (const n of this.nodes) if ((n.fan_out ?? 0) > (best.fan_out ?? 0)) best = n;
      starts = [best.id];
    }
    const prev = new Map<string, [string, Relation] | null>();
    const dist = new Map<string, number>();
    const queue = [...starts];
    for (const s of starts) {
      dist.set(s, 0);
      prev.set(s, null);
    }
    while (queue.length) {
      const v = queue.shift() as string;
      for (const r of this.outOf(v)) {
        if (!dist.has(r.to) && !isGap(this.node(r.to))) {
          dist.set(r.to, (dist.get(v) as number) + 1);
          prev.set(r.to, [v, r]);
          queue.push(r.to);
        }
      }
    }
    const pathTo = (t: string): [string, Relation[]] => {
      const steps: Relation[] = [];
      let cur = t;
      for (let p = prev.get(cur); p; p = prev.get(cur)) {
        steps.push(p[1]);
        cur = p[0];
      }
      return [cur, steps.reverse()];
    };
    const worth = (n: PageNode) => {
      const c = n.counts ?? {};
      return truthy(c.form ?? 0) || truthy(c.dialog ?? 0) || n.flags.includes('dead-end');
    };
    // targets: screens where work is done, plus the deepest reachable screen of every component
    const deepest = new Map<string, string>();
    for (const [t, d] of dist) {
      const c = this.compOf(t);
      if (d > 0 && (!deepest.has(c) || d > (dist.get(deepest.get(c) as string) as number))) deepest.set(c, t);
    }
    const targets = new Set<string>();
    for (const [t, d] of dist) if (d > 0 && worth(this.node(t))) targets.add(t);
    for (const t of deepest.values()) targets.add(t);
    let cands: Journey[] = [];
    for (const t of targets) {
      if ((dist.get(t) as number) > (this.settings.max_journey_steps ?? 8)) continue;
      const [start, steps] = pathTo(t);
      const screens = [start, ...steps.map((s) => s.to)];
      cands.push({ start, steps, screens, components: [...new Set(screens.map((s) => this.compOf(s)))] });
    }
    const chosen: Journey[] = [];
    const covered = new Set<string>();
    const fresh = (c: Journey) => new Set(c.screens.filter((s) => !covered.has(s))).size;
    const key = (c: Journey) => [fresh(c) * 3 + c.components.length, -c.steps.length];
    while (cands.length && chosen.length < (this.settings.max_journeys ?? 12)) {
      let best = cands[0];
      for (const c of cands.slice(1)) if (compare(key(c), key(best)) > 0) best = c;
      if (!fresh(best)) break;
      chosen.push(best);
      for (const s of best.screens) covered.add(s);
      cands = cands.filter((c) => c !== best);
    }
    return chosen;
  }

  journeyText(j: Journey): string {
    const parts = [`\`${this.node(j.start).label}\``];
    for (const s of j.steps)
      parts.push(`→ (${s.label ? `"${s.label}"` : relHow(s.types)}) \`${this.node(s.to).label}\``);
    return parts.join(' ');
  }
}

// ---- rendering

/** The curated block of an existing SKILL.md, or null. */
export function curatedBlock(text: string | null): string | null {
  if (text === null) return null;
  const s = text.indexOf(CURATED_START);
  const e = text.indexOf(CURATED_END);
  return s >= 0 && e > s ? text.slice(s, e + CURATED_END.length) : null;
}

function curatedSummary(curated: string | null): string {
  const m = /^Summary:\s*([^\n]+)$/m.exec(curated || '');
  return m ? m[1].trim() : '';
}

function frontmatter(name: string, description: string): string {
  // no XML-like tags (claude.ai rejects them in skill descriptions): <App> becomes {App}
  let d = description
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/<([^<>]*)>/g, '{$1}')
    .replace(/[<>]/g, '');
  if (chars(d).length > 1000) {
    const cut = chars(d).slice(0, 997).join('');
    const i = cut.lastIndexOf(' ');
    d = `${i >= 0 ? cut.slice(0, i) : cut}...`;
  }
  // JSON-quoted: always valid YAML even when the text contains ": " or "#"
  return `---\nname: ${name}\ndescription: ${JSON.stringify(d)}\n---\n`;
}

const DEFAULT_SUB_CURATED = `{start}
## Business understanding
Summary: _(one sentence: what this module lets which users do; it is also used in this skill's description)_

_Not written yet. Claude (AUT-Skill-Builder): read this module's source files listed below through the code-repository
MCP server or the local clone, and the screens and forms in the generated facts, then describe:_
- _purpose of the module and the user roles that use it;_
- _business objects and their life cycle (states, transitions);_
- _business rules, calculations, validations, limits (cite \`file:line\`);_
- _integrations and data the module reads or writes (APIs, other modules, batch jobs)._
_Mark anything inferred rather than read in the code as **(inferred)**._

## End-to-end business cases
_Not written yet. One entry per real business case that touches this module, built from the candidate journeys and
dependencies below and confirmed in the code:_
- _**Name** · persona · preconditions and data · steps (screen → action → result) · expected business outcome ·
  modules involved · related candidate journey._
{end}`;

const DEFAULT_MAIN_CURATED = `{start}
## Application overview
Summary: _(one sentence: what the application is, for whom; it is also used in this skill's description)_

_Not written yet. Claude (AUT-Skill-Builder): from the source code (via the code-repository MCP server or the local
clones) and the generated facts below, describe the business domain, user roles and permissions, the main business
objects, environments, and how the components work together. Cite \`file:line\`; mark inferred statements **(inferred)**._

## Key end-to-end business cases
_Not written yet. The application's most important business flows across components (name · persona · steps across
components · expected outcome · sub-skills involved), built from the cross-module journeys and the component
dependency matrix below._
{end}`;

const fillCurated = (t: string) => t.replace('{start}', CURATED_START).replace('{end}', CURATED_END);

type Meta = { now: string; dsmAt: string; sources: string };

function navText(m: Model, r: Relation, end: 'from' | 'to'): string {
  return `\`${m.node(r[end]).label}\`${r.label ? ` via "${r.label}"` : ` (${relHow(r.types)})`}`;
}

function renderSub(
  m: Model,
  comp: string,
  screens: PageNode[],
  journeys: Journey[],
  meta: Meta,
  curated: string | null,
): string {
  const app = m.app;
  const ids = screens.map((n) => n.id);
  const idSet = new Set(ids);
  const labels =
    screens
      .slice(0, 12)
      .map((n) => n.label)
      .join(', ') + (screens.length > 12 ? ' ...' : '');
  const formCount = screens.reduce((s, n) => s + (n.counts?.form ?? 0), 0);
  const summary = curatedSummary(curated);
  const desc =
    `${app} application, ${comp} component (AUT sub-skill of AUT_${app}). ${summary ? `${summary} ` : ''}` +
    `Screens: ${labels}. ${formCount} form(s). Covers its UI elements, forms and fields, page navigation, dependencies ` +
    `on other components (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on ` +
    `${app} ${comp}: understanding the screens, writing or reviewing test cases, automation, impact analysis, defects.`;
  const out: string[] = [
    frontmatter(`AUT_${app}-${comp}`, desc),
    `# ${app} · ${comp} (AUT)\n`,
    `Part of [AUT_${app}](../AUT_${app}/SKILL.md). Generated from the Design Structure Matrix; business sections curated from the source code.\n`,
    curated || fillCurated(DEFAULT_SUB_CURATED),
    '',
    GEN_START,
    `## Facts from the Design Structure Matrix\n_DSM built ${meta.dsmAt} from ${meta.sources}; skill generated ${meta.now}._\n`,
    `### Screens (${screens.length})\n`,
    '| Screen | Title | Reached from | Goes to | Forms · fields | Flags |',
    '|---|---|---|---|---|---|',
  ];
  for (const n of screens) {
    const c = n.counts ?? {};
    const ins = sorted(new Set(m.incOf(n.id).map((r) => m.node(r.from).label)));
    const outs = sorted(new Set(m.outOf(n.id).map((r) => m.node(r.to).label)));
    const flags = [...n.flags, ...(n.in_cycle ? ['cycle'] : [])].join(', ');
    out.push(
      `| \`${md(n.label)}\` | ${md(n.title)} | ${md(ins.slice(0, 6).join(', '))}${more(ins.length, 6)} | ` +
        `${md(outs.slice(0, 6).join(', '))}${more(outs.length, 6)} | ${str(c.form ?? 0)} · ${str(c.field ?? 0)} | ${md(flags)} |`,
    );
  }
  out.push('\n### Screen details\n');
  for (const n of screens) {
    out.push(`#### \`${n.label}\`${truthy(n.title) ? ` — ${str(n.title)}` : ''}`);
    const facts: string[] = [];
    if (truthy(n.url)) facts.push(`- URL: ${str(n.url)}${truthy(n.status) ? ` (HTTP ${str(n.status)})` : ''}`);
    if (truthy(n.headings)) facts.push(`- Headings: ${(n.headings as string[]).join(', ')}`);
    facts.push(`- Found by: ${(n.sources ?? []).join(', ')}${truthy(n.error) ? `; error: ${str(n.error)}` : ''}`);
    for (const f of n.forms ?? []) {
      const fields = (f.fields ?? [])
        .map((fd) => `${str(fd.label || fd.name || '?')} (${str(fd.type ?? null)}${fd.required ? ', required' : ''})`)
        .join('; ');
      const buttons = truthy(f.submits) ? `; buttons: ${f.submits.filter((b) => truthy(b)).join(', ')}` : '';
      facts.push(
        `- Form **${str(f.name || 'form')}** (${str(f.method || 'n/a')}${truthy(f.target) ? ` → ${f.target}` : ''}): ${fields || 'no fields'}${buttons}`,
      );
    }
    const kinds = new Map<string, string[]>();
    for (const e of m.elements.get(n.id) ?? []) {
      if (['button', 'link', 'tab', 'menuitem', 'dialog'].includes(e.kind) && truthy(e.label))
        kinds.set(e.kind, [...(kinds.get(e.kind) ?? []), e.label as string]);
    }
    for (const kind of ['button', 'link', 'tab', 'menuitem', 'dialog']) {
      const uniq = [...new Set(kinds.get(kind) ?? [])];
      if (uniq.length) facts.push(`- ${capitalize(kind)}s: ${uniq.slice(0, 20).join(', ')}${more(uniq.length, 20)}`);
    }
    for (const t of (n.tables ?? []) as { columns?: string[] }[]) {
      if (truthy(t.columns)) facts.push(`- Grid columns: ${(t.columns as string[]).slice(0, 20).join(' | ')}`);
    }
    const ce = n.code_elements ?? {};
    if (truthy(ce.controls)) facts.push(`- Form controls declared in code: ${ce.controls.slice(0, 25).join(', ')}`);
    const navIn = m.incOf(n.id).map((r) => navText(m, r, 'from'));
    const navOut = m.outOf(n.id).map((r) => navText(m, r, 'to'));
    if (navIn.length) facts.push(`- Reached from: ${navIn.slice(0, 12).join(', ')}${more(navIn.length, 12)}`);
    if (navOut.length) facts.push(`- Leads to: ${navOut.slice(0, 12).join(', ')}${more(navOut.length, 12)}`);
    if (truthy(n.code_defs))
      facts.push(
        `- Route defined at: ${n.code_defs
          .slice(0, 5)
          .map((d) => `\`${d}\``)
          .join(', ')}`,
      );
    if (truthy(n.files))
      facts.push(
        `- Source files: ${n.files
          .slice(0, 12)
          .map((f) => `\`${f}\``)
          .join(', ')}${more(n.files.length, 12)}`,
      );
    out.push(...facts, '');
  }

  const inner = ids.flatMap((i) => m.outOf(i).filter((r) => idSet.has(r.to)));
  if (inner.length) {
    out.push('### Navigation within the component\n', '```mermaid', 'flowchart LR');
    for (const i of ids) out.push(`  ${mermaidId(i)}["${mermaidLabel(m.node(i).label)}"]`);
    for (const r of inner)
      out.push(`  ${mermaidId(r.from)} -->|${r.label ? mermaidLabel(r.label) : relHow(r.types)}| ${mermaidId(r.to)}`);
    out.push('```', '');
  }

  const outbound: [string, number][] = [];
  const inbound: [string, number][] = [];
  for (const [k, cnt] of m.compMatrix()) {
    const [a, b] = k.split('\0');
    if (a === comp) outbound.push([b, cnt]);
    if (b === comp) inbound.push([a, cnt]);
  }
  outbound.sort((x, y) => y[1] - x[1]);
  inbound.sort((x, y) => y[1] - x[1]);
  const link = (c: string, k: number) => `[AUT_${app}-${c}](../AUT_${app}-${c}/SKILL.md) (${k})`;
  out.push('### Dependencies on other components (from the DSM)\n');
  out.push(`- Depends on (navigates to): ${outbound.map(([b, k]) => link(b, k)).join(', ') || 'none'}`);
  out.push(`- Used by (navigated from): ${inbound.map(([a, k]) => link(a, k)).join(', ') || 'none'}`);
  const cyc = sorted(new Set(screens.filter((n) => n.in_cycle).map((n) => n.label)));
  if (cyc.length)
    out.push(
      `- In navigation cycles: ${cyc.map((c) => `\`${c}\``).join(', ')} (test back/forward and state carry-over)`,
    );
  out.push('');
  const mine = journeys.filter((j) => j.components.includes(comp));
  out.push('### Candidate end-to-end journeys through this component\n');
  out.push(
    ...(mine.length ? mine.map((j, i) => `${i + 1}. ${m.journeyText(j)}`) : ['_None found in the DSM navigation._']),
  );
  const notes: string[] = [];
  for (const [flag, why] of [
    ['code-only', 'defined in code but not reached by the crawl (role, feature flag or data needed?)'],
    ['unresolved', 'navigation target not defined anywhere (possible broken link)'],
    ['broken', 'returned HTTP ≥ 400 or failed to load'],
    ['orphan', 'no screen links to it'],
    ['dead-end', 'no onward navigation'],
  ]) {
    const hits = screens.filter((n) => n.flags.includes(flag)).map((n) => n.label);
    if (hits.length) notes.push(`- **${flag}**: ${hits.map((h) => `\`${h}\``).join(', ')} — ${why}`);
  }
  out.push(
    '',
    '### Test design notes',
    ...(notes.length ? notes : ['- No DSM flags for this component.']),
    '- Design scenarios with the `Domain_Test_Design_Skill`; check impact of code changes with `/autonomous-qe:generate-dsm`.',
    GEN_END,
    '',
  );
  return out.join('\n');
}

function renderMain(m: Model, journeys: Journey[], meta: Meta, curated: string | null): string {
  const app = m.app;
  const names = [...m.components.keys()];
  const summary = curatedSummary(curated);
  const desc =
    `Knowledge base and router for the ${app} application under test (AUT). ${summary ? `${summary} ` : ''}` +
    `${m.nodes.length} screens in ${names.length} components: ${names.slice(0, 15).join(', ')}${names.length > 15 ? ' ...' : ''}. ` +
    `Application understanding, UI elements, page navigation, component dependencies (from the Design Structure Matrix) ` +
    `and end-to-end business cases. Use for any QA task on ${app}: understanding the application, writing, reviewing or ` +
    `automating test cases, regression and impact analysis, defect triage. Routes to the AUT_${app}-<Component> sub-skills.`;
  const s = (m.dsm.stats ?? {}) as Partial<Dsm['stats']>;
  const byFanIn = (ns: PageNode[]) => [...ns].sort((x, y) => -(x.fan_in ?? 0) - -(y.fan_in ?? 0));
  const out: string[] = [
    frontmatter(`AUT_${app}`, desc),
    `# ${app} — application under test (AUT)\n`,
    curated || fillCurated(DEFAULT_MAIN_CURATED),
    '',
    GEN_START,
    `## Facts from the Design Structure Matrix\n_DSM built ${meta.dsmAt} from ${meta.sources}; skill generated ${meta.now}._\n`,
    `- Application: ${str(m.dsm.base_url || 'n/a')}`,
    `- ${str(s.pages)} screens, ${str(s.page_relations)} navigations, ${str(s.elements)} UI elements, ${str(s.cycles)} navigation cycles`,
    '- Interactive matrix: `dsm/index.html` (skill `Design-Structure-Matrix`)\n',
    '### Components (sub-skills)\n',
    '| Component | Sub-skill | Screens | Forms | Main screens |',
    '|---|---|---|---|---|',
  ];
  for (const [comp, screens] of m.components) {
    const forms = screens.reduce((t, n) => t + (n.counts?.form ?? 0), 0);
    const main = byFanIn(screens)
      .slice(0, 4)
      .map((n) => `\`${n.label}\``)
      .join(', ');
    out.push(
      `| ${comp} | [AUT_${app}-${comp}](../AUT_${app}-${comp}/SKILL.md) | ${screens.length} | ${forms} | ${main} |`,
    );
  }
  const matrix = m.compMatrix();
  out.push(
    '',
    '### Component dependency matrix (row navigates to column; from the DSM)\n',
    `| | ${names.join(' | ')} |`,
    `|---|${'---|'.repeat(names.length)}`,
  );
  for (const a of names)
    out.push(
      `| **${a}** | ${names.map((b) => (a === b ? '·' : String(matrix.get(`${a}\0${b}`) ?? ''))).join(' | ')} |`,
    );
  out.push('', '### Cross-component journeys (candidates for end-to-end tests)\n');
  const crossOnly = journeys.filter((j) => j.components.length > 1);
  const cross = crossOnly.length ? crossOnly : journeys;
  out.push(
    ...(cross.length
      ? cross.map((j, i) => `${i + 1}. ${m.journeyText(j)}  _(components: ${j.components.join(', ')})_`)
      : ['_None found._']),
  );
  out.push(
    '',
    '### Most reached screens (smoke / regression candidates)\n',
    ...byFanIn(m.nodes)
      .slice(0, 8)
      .map((n) => `- \`${n.label}\` (${m.compOf(n.id)}): reached from ${str(n.fan_in ?? 0)} screens`),
  );
  const gapLines: string[] = [];
  for (const f of ['code-only', 'unresolved', 'broken']) {
    const v = m.nodes.filter((n) => n.flags.includes(f));
    if (v.length)
      gapLines.push(
        `- **${f}** (${v.length}): ${v
          .slice(0, 15)
          .map((n) => `\`${n.label}\``)
          .join(', ')}`,
      );
  }
  out.push('', '### Coverage gaps', ...(gapLines.length ? gapLines : ['- None flagged.']));
  out.push(
    '',
    '### Routing',
    `- Questions about one component → its \`AUT_${app}-<Component>\` sub-skill.`,
    '- Navigation, dependencies, impact of a code change → `Design-Structure-Matrix` / `/autonomous-qe:generate-dsm`.',
    '- Test scenario design → `Domain_Test_Design_Skill`; locators → `UI-Locator-Sync`.',
    '- Refresh these skills → `AUT-Skill-Builder` (also triggered by the hook `the aut-skill-gen hook of the plugin`).',
    GEN_END,
    '',
  );
  return out.join('\n');
}

export type BuildResult = {
  files: Map<string, string>; // path under the skills folder -> text
  state: { app: string; dsm_generated_at: string; built_at: string; skills: string[]; repos: unknown[] };
  report: {
    app: string;
    skills: string[];
    components: number;
    screens: number;
    journeys: number;
    curated_kept: string[];
    needs_curation: string[];
    sub_skills_no_longer_in_dsm: string[];
  };
};

/**
 * The skills for `app` (already the skill name) from `dsm`. `existing(name)` returns the current SKILL.md of a skill
 * folder, or null; `folders` lists the skill folders there now.
 */
export function buildSkills(
  dsm: Dsm,
  settings: KnowledgeSettings,
  app: string,
  existing: (name: string) => string | null,
  folders: string[],
  now: string,
): BuildResult {
  const m = new Model(dsm, settings, app);
  const journeys = m.journeys();
  const repos = (dsm.repos ?? []) as { name?: string; commit?: string }[];
  const meta: Meta = {
    now,
    dsmAt: str(dsm.generated_at ?? '?'),
    sources:
      repos.map((r) => `${str(r.name)}@${String(r.commit || '').slice(0, 8)}`).join(', ') ||
      str(dsm.base_url || 'the UI crawl'),
  };
  const files = new Map<string, string>();
  const written: string[] = [];
  const curatedKept: string[] = [];
  for (const [comp, screens] of m.components) {
    const name = `AUT_${app}-${comp}`;
    const curated = curatedBlock(existing(name));
    files.set(`${name}/SKILL.md`, renderSub(m, comp, screens, journeys, meta, curated));
    written.push(name);
    if (curated) curatedKept.push(name);
  }
  const main = `AUT_${app}`;
  const curated = curatedBlock(existing(main));
  files.set(`${main}/SKILL.md`, renderMain(m, journeys, meta, curated));
  written.unshift(main);
  if (curated) curatedKept.push(main);
  const expected = new Set(written);
  const state = { app, dsm_generated_at: dsm.generated_at, built_at: now, skills: written, repos };
  return {
    files,
    state,
    report: {
      app,
      skills: written,
      components: m.components.size,
      screens: m.nodes.length,
      journeys: journeys.length,
      curated_kept: curatedKept,
      needs_curation: written.filter((w) => (files.get(`${w}/SKILL.md`) as string).includes('_Not written yet.')),
      sub_skills_no_longer_in_dsm: sorted(folders.filter((d) => d.startsWith(`AUT_${app}-`) && !expected.has(d))),
    },
  };
}
