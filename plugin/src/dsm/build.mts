/**
 * Builds the UI Design Structure Matrix from the crawl (ui-model.json) and the repo scan (code-model.json). Ported from
 * Autonomous-QE's build_dsm, which is the same in 0.1.5 and 0.2.0. The output matches AQE's dsm.json as parsed data,
 * so reports and the DSM page read either one.
 *
 * Two n x n matrices come out:
 *   - page level: nodes are screens; cell (r, c) says how screen r reaches screen c (link, form, click, popup,
 *     redirect seen in the UI; code found in the source).
 *   - element level: nodes are screens and everything on them (links, buttons, tabs, menu items, forms, fields,
 *     dialogs); cells are contains, navigates, submits, opens and redirect.
 *
 * A mark in row r, column c means r -> c. In the partitioned order, marks below the diagonal are backward
 * navigation: cycles.
 */
import { isDeepStrictEqual } from 'node:util';
import type { CodeModel, UiModel } from '../shared/models.mts';

export type DsmConfig = {
  project?: string;
  output_dir?: string;
  application?: { base_url?: string; start_paths?: string[] };
  matrix?: { module_depth?: number; max_element_nodes?: number; [key: string]: unknown };
  [key: string]: unknown;
};

export type Via = Record<string, unknown>;

export type PageNode = {
  id: string; // matchKey of the route
  label: string;
  module: string;
  sources: string[]; // ui, code, ui-target (linked to, never visited), code-ref (named in code, no route)
  routes: string[];
  url: string | null;
  title: string;
  status: number | null;
  error: string | null;
  depth: number | null;
  discovered_by: string | null;
  counts: Record<string, number>;
  forms: {
    name: string;
    method: string | null;
    target: string | null;
    fields: { label: string | null; name: string | null; type: string | null; required: boolean | null }[];
    submits: unknown[];
  }[];
  dialogs: (string | null)[];
  tables: unknown[];
  headings?: string[];
  code_defs: string[]; // "<repo>:<file>:<line>" of each route definition
  files: string[];
  code_elements: Record<string, string[]>;
  redirect_to: string | null;
  fan_out: number;
  fan_in: number;
  scc: number;
  in_cycle: boolean;
  flags: string[];
};

export type ElementNode = {
  id: string;
  label: string;
  kind: string; // page, or one of ELEMENT_KINDS_ORDER
  page: string;
  module: string;
  [key: string]: unknown;
};

export type DsmDiff =
  | { first_run: true }
  | {
      previous_generated_at: string | null;
      nodes_added: string[];
      nodes_removed: string[];
      nodes_changed: { id: string; what: string[] }[];
      relations_added: string[];
      relations_removed: string[];
      relations_changed: string[];
    };

export type Dsm = {
  generated_at: string;
  project: string | null;
  base_url: string | null;
  convention: string;
  repos: unknown[];
  crawl: Record<string, unknown>;
  stats: {
    pages: number;
    page_relations: number;
    elements: number;
    element_relations: number;
    cycles: number;
    flags: Record<string, number>;
    density: number;
  };
  page: {
    nodes: PageNode[];
    cells: { r: number; c: number; t: Record<string, number>; v: Via[] }[];
    orders: { partitioned: number[]; module: number[] };
  };
  element: {
    nodes: ElementNode[];
    cells: { r: number; c: number; t: Record<string, number> }[];
    orders: { partitioned: number[]; module: number[] };
    truncated: boolean;
  };
  change: Record<string, unknown>;
  diff: DsmDiff;
};

export const ELEMENT_KINDS_ORDER = ['menuitem', 'tab', 'link', 'button', 'form', 'field', 'dialog'];
export const FLAGS = ['orphan', 'dead-end', 'code-only', 'ui-only', 'unresolved', 'broken', 'redirect'];
const CONVENTION = 'row -> column: the row page/element contains, navigates to, submits to or opens the column';

/** The node ID of a route: the part after "#" for hash routes, no query, lower case, no trailing "/". */
export function matchKey(route: string): string {
  let r = route.includes('#') ? route.slice(route.indexOf('#') + 1) : route;
  r = r.split('?')[0].toLowerCase();
  if (r.length > 1) r = r.replace(/\/+$/, '');
  return r || '/';
}

/** The first `depth` path segments, skipping parameters such as ":id"; "home" for the root. */
export function moduleOf(key: string, depth: number): string {
  const segs = key.split('/').filter((s) => s && !s.startsWith(':'));
  return segs.length ? segs.slice(0, depth).join('/') : 'home';
}

// ---- ordering: AQE sorted with Python's rules, which decide the matrix order. Sort keys are compared element by
// element, strings by UTF-16 unit (Python uses code points; they differ only above U+FFFF against U+E000-U+FFFF).

type SortKey = string | number | SortKey[];

export function compare(a: SortKey, b: SortKey): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = compare(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A stable sort by key, like Python's sorted(xs, key=…). */
export function sortBy<T>(xs: Iterable<T>, key: (x: T) => SortKey): T[] {
  return Array.from(xs).sort((a, b) => compare(key(a), key(b)));
}

const sortStrings = (xs: Iterable<string>): string[] => sortBy(xs, (x) => x);

/** round(x, 4) the way Python does it: correct on the exact binary value, ties to the even digit. */
export function round4(x: number): number {
  const [int, frac] = Math.abs(x).toFixed(44).split('.');
  if (frac[4] !== '5' || /[1-9]/.test(frac.slice(5))) return Number(x.toFixed(4));
  const down = Number(`${int}.${frac.slice(0, 4)}`);
  const even = Number(frac[3]) % 2 === 0 ? down : down + 1e-4;
  return Math.sign(x) * Number(even.toFixed(4));
}

/** Iterative Tarjan: the strongly connected component of each node, numbered in reverse topological order. */
export function tarjan(n: number, adj: number[][]): [number[], number] {
  const index: (number | null)[] = new Array(n).fill(null);
  const low: number[] = new Array(n).fill(0);
  const on: boolean[] = new Array(n).fill(false);
  const comp: number[] = new Array(n).fill(-1);
  const stack: number[] = [];
  let counter = 0;
  let ncomp = 0;
  for (let root = 0; root < n; root++) {
    if (index[root] !== null) continue;
    const work: [number, number][] = [[root, 0]];
    while (work.length) {
      const [v, start] = work.pop() as [number, number];
      let i = start;
      if (i === 0) {
        index[v] = low[v] = counter++;
        stack.push(v);
        on[v] = true;
      }
      let recurse = false;
      while (i < adj[v].length) {
        const w = adj[v][i++];
        if (index[w] === null) {
          work.push([v, i], [w, 0]);
          recurse = true;
          break;
        }
        if (on[w]) low[v] = Math.min(low[v], index[w] as number);
      }
      if (recurse) continue;
      if (low[v] === index[v]) {
        for (;;) {
          const w = stack.pop() as number;
          on[w] = false;
          comp[w] = ncomp;
          if (w === v) break;
        }
        ncomp++;
      }
      if (work.length) {
        const parent = work[work.length - 1][0];
        low[parent] = Math.min(low[parent], low[v]);
      }
    }
  }
  return [comp, ncomp];
}

/** Components in topological order (sources first), ties and members ordered by `prio`. Returns [order, comp]. */
export function partitionOrder(n: number, adj: number[][], prio: (v: number) => SortKey): [number[], number[]] {
  const [comp, ncomp] = tarjan(n, adj);
  const members: number[][] = Array.from({ length: ncomp }, () => []);
  for (let v = 0; v < n; v++) members[comp[v]].push(v);
  const cadj: Set<number>[] = Array.from({ length: ncomp }, () => new Set());
  const indeg: number[] = new Array(ncomp).fill(0);
  for (let v = 0; v < n; v++) {
    for (const w of adj[v]) {
      if (comp[v] !== comp[w] && !cadj[comp[v]].has(comp[w])) {
        cadj[comp[v]].add(comp[w]);
        indeg[comp[w]]++;
      }
    }
  }
  const cprio = members.map((m) => m.map(prio).reduce((best, p) => (compare(p, best) < 0 ? p : best)));
  let ready = sortBy(
    members.keys().filter((c) => indeg[c] === 0),
    (c) => cprio[c],
  );
  const order: number[] = [];
  while (ready.length) {
    const c = ready.shift() as number;
    order.push(...sortBy(members[c], prio));
    for (const d of cadj[c]) if (--indeg[d] === 0) ready.push(d);
    ready = sortBy(ready, (x) => cprio[x]);
  }
  return [order, comp];
}

const last = (key: string) => key.split(':').pop() as string;

export type BuildOptions = {
  previous?: Dsm | null; // the last dsm.json, for the diff
  change?: Record<string, unknown> | null; // what triggered the build (feature 3 fills it)
  now?: Date;
};

export function build(
  ui: UiModel | null,
  code: CodeModel | null,
  config: DsmConfig,
  { previous = null, change = null, now = new Date() }: BuildOptions = {},
): Dsm {
  const mdepth = config.matrix?.module_depth ?? 1;
  const maxEl = config.matrix?.max_element_nodes ?? 4000;
  const uiPages = ui?.pages ?? [];
  const nodes: PageNode[] = [];
  const byKey = new Map<string, number>();
  const at = (key: string) => byKey.get(key) as number;

  const node = (key: string, label: string): PageNode => {
    if (!byKey.has(key)) {
      byKey.set(key, nodes.length);
      nodes.push({
        id: key,
        label,
        module: moduleOf(key, mdepth),
        sources: [],
        routes: [],
        url: null,
        title: '',
        status: null,
        error: null,
        depth: null,
        discovered_by: null,
        counts: {},
        forms: [],
        dialogs: [],
        tables: [],
        code_defs: [],
        files: [],
        code_elements: {},
        redirect_to: null,
        // set once every relation is known
        fan_out: 0,
        fan_in: 0,
        scc: -1,
        in_cycle: false,
        flags: [],
      });
    }
    return nodes[at(key)];
  };

  // ---- screens from the crawl, then from the code
  for (const p of uiPages) {
    const nd = node(matchKey(p.route), p.route);
    nd.label = p.route;
    if (!nd.sources.includes('ui')) nd.sources.push('ui');
    nd.routes.push(p.route);
    const counts: Record<string, number> = {};
    for (const e of p.elements ?? []) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    counts.form = (p.forms ?? []).length;
    counts.field = (p.forms ?? []).reduce((s, f) => s + (f.fields ?? []).length, 0);
    counts.dialog = (p.dialogs ?? []).length;
    Object.assign(nd, {
      url: p.url ?? null,
      title: p.title || '',
      status: p.status ?? null,
      error: p.error ?? null,
      depth: p.depth ?? null,
      discovered_by: p.discovered_by ?? null,
      redirect_to: p.redirect_to != null ? matchKey(p.redirect_to) : null,
      headings: p.headings ?? [],
      tables: p.tables ?? [],
      dialogs: (p.dialogs ?? []).map((d) => d.title ?? null),
      counts,
      forms: (p.forms ?? []).map((f) => ({
        name: f.id || f.name || last(f.key),
        method: f.method ?? null,
        target: f.target != null ? matchKey(f.target) : null,
        fields: (f.fields ?? []).map((fd) => ({
          label: fd.label ?? null,
          name: fd.name ?? null,
          type: fd.type ?? null,
          required: fd.required ?? null,
        })),
        submits: f.submits ?? [],
      })),
    });
  }

  for (const r of code?.routes ?? []) {
    const nd = node(matchKey(r.route), r.route);
    if (!nd.sources.includes('code')) nd.sources.push('code');
    nd.code_defs.push(`${r.repo}:${r.file}:${r.line}`);
  }
  for (const [fkey, info] of Object.entries(code?.files ?? {})) {
    for (const owner of info.owners ?? []) {
      const k = matchKey(owner);
      if (!byKey.has(k)) continue;
      const nd = nodes[at(k)];
      nd.files.push(fkey);
      for (const [name, vals] of Object.entries(info.elements ?? {})) {
        if (Array.isArray(vals))
          nd.code_elements[name] = sortStrings(new Set([...(nd.code_elements[name] ?? []), ...vals])).slice(0, 200);
      }
    }
  }

  // ---- page-level cells. Insertion order matters: it drives the component numbering.
  type Cell = { i: number; j: number; t: Record<string, number>; v: Via[] };
  const cells = new Map<string, Cell>();
  const addCell = (i: number, j: number, type: string, via: Via) => {
    if (i === j) return;
    const key = `${i},${j}`;
    if (!cells.has(key)) cells.set(key, { i, j, t: {}, v: [] });
    const c = cells.get(key) as Cell;
    c.t[type] = (c.t[type] ?? 0) + 1;
    if (c.v.length < 25) c.v.push(via);
  };

  for (const e of ui?.edges ?? []) {
    if (e.element_level) continue;
    const fk = matchKey(e.from.split('::')[0]);
    const tk = matchKey(e.to);
    if (!byKey.has(fk)) continue;
    if (!byKey.has(tk)) node(tk, e.to).sources.push('ui-target');
    addCell(at(fk), at(tk), e.type, { s: 'ui', label: e.label || '', el: e.via ?? null });
  }
  for (const e of code?.edges ?? []) {
    const fk = matchKey(e.from);
    const tk = matchKey(e.to);
    if (e.from === '(shared)' && !byKey.has(fk)) node(fk, '(shared layout / components)').sources.push('code');
    if (!byKey.has(tk)) node(tk, e.to).sources.push('code-ref');
    if (!byKey.has(fk)) continue;
    addCell(at(fk), at(tk), 'code', {
      s: 'code',
      kind: e.kind,
      ref: `${e.repo}:${e.file}:${e.line}`,
      conf: e.confidence ?? null,
    });
  }

  const n = nodes.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const radj: number[][] = Array.from({ length: n }, () => []);
  for (const { i, j } of cells.values()) {
    adj[i].push(j);
    radj[j].push(i);
  }
  const startPaths = config.application?.start_paths;
  const startKeys = new Set((startPaths?.length ? startPaths : ['/']).map(matchKey));
  // Start pages first, then by crawl depth, module and label.
  const prio = (v: number): SortKey => {
    const nd = nodes[v];
    return [startKeys.has(nd.id) ? 0 : 1, nd.depth ?? 99, nd.module, nd.label];
  };
  const [order, comp] = partitionOrder(n, adj, prio);

  // ---- per-screen numbers and flags
  const compSize = new Map<number, number>();
  for (const c of comp) compSize.set(c, (compSize.get(c) ?? 0) + 1);
  const hasCodeRoutes = (code?.routes?.length ?? 0) > 0;
  nodes.forEach((nd, v) => {
    nd.sources = sortStrings(new Set(nd.sources));
    nd.files = sortStrings(new Set(nd.files)).slice(0, 300);
    nd.fan_out = new Set(adj[v]).size;
    nd.fan_in = new Set(radj[v]).size;
    nd.scc = comp[v];
    nd.in_cycle = (compSize.get(comp[v]) as number) > 1;
    const has = (s: string) => nd.sources.includes(s);
    const flags: string[] = [];
    if (nd.fan_in === 0 && !startKeys.has(nd.id)) flags.push('orphan');
    if (nd.fan_out === 0 && has('ui')) flags.push('dead-end');
    if (!has('ui') && has('code')) flags.push('code-only');
    if (!has('code') && has('ui') && hasCodeRoutes) flags.push('ui-only');
    if (nd.sources.every((s) => s === 'code-ref' || s === 'ui-target')) flags.push('unresolved');
    if ((nd.status || 0) >= 400 || nd.error) flags.push('broken');
    if (nd.redirect_to) flags.push('redirect');
    nd.flags = flags;
  });

  const pageLevel: Dsm['page'] = {
    nodes,
    cells: sortBy(cells.values(), (c) => [c.i, c.j]).map((c) => ({ r: c.i, c: c.j, t: c.t, v: c.v })),
    orders: { partitioned: order, module: sortBy(nodes.keys(), (v) => [nodes[v].module, nodes[v].label]) },
  };

  // ---- element-level matrix: each screen followed by its elements, forms, fields and dialogs
  const elNodes: ElementNode[] = [];
  const elIndex = new Map<string, number>();
  const elCells = new Map<string, { a: number; b: number; t: Record<string, number> }>();
  const elAt = (key: string) => elIndex.get(key) as number;

  const elNode = (key: string, label: string, kind: string, pageKey: string, extra: Record<string, unknown>) => {
    if (!elIndex.has(key)) {
      elIndex.set(key, elNodes.length);
      elNodes.push({ id: key, label, kind, page: pageKey, module: moduleOf(pageKey, mdepth), ...extra });
    }
    return elAt(key);
  };
  const elCell = (a: number, b: number, type: string) => {
    if (a === b) return;
    const key = `${a},${b}`;
    if (!elCells.has(key)) elCells.set(key, { a, b, t: {} });
    const t = (elCells.get(key) as { t: Record<string, number> }).t;
    t[type] = (t[type] ?? 0) + 1;
  };

  const pageSeq = order.map((v) => nodes[v].id);
  for (const pk of pageSeq) elNode(pk, nodes[at(pk)].label, 'page', pk, { title: nodes[at(pk)].title });
  const pagesByKey = new Map<string, (typeof uiPages)[number]>();
  for (const p of uiPages) {
    const k = matchKey(p.route);
    if (!pagesByKey.has(k)) pagesByKey.set(k, p);
  }
  // The cap is checked before each element, form and field (not dialog), as AQE does.
  let truncated = false;
  const full = () => {
    if (elNodes.length >= maxEl) truncated = true;
    return elNodes.length >= maxEl;
  };
  for (const pk of pageSeq) {
    const p = pagesByKey.get(pk);
    if (!p) continue;
    const pi = elAt(pk);
    const kindRank = (kind: string) => (ELEMENT_KINDS_ORDER.includes(kind) ? ELEMENT_KINDS_ORDER.indexOf(kind) : 9);
    for (const e of sortBy(p.elements ?? [], (e) => kindRank(e.kind))) {
      if (full()) break;
      if (!e.visible && !e.target) continue;
      const label = e.text || e.href || last(e.key);
      const ei = elNode(e.key, label, e.kind, pk, {
        href: e.href ?? null,
        selector: e.selector ?? null,
        visible: e.visible ?? null,
      });
      elCell(pi, ei, 'contains');
    }
    for (const f of p.forms ?? []) {
      if (full()) break;
      const fi = elNode(f.key, `form ${f.id || f.name || ''}`, 'form', pk, { method: f.method ?? null });
      elCell(pi, fi, 'contains');
      for (const fd of f.fields ?? []) {
        if (full()) break;
        const label = fd.label || fd.name || fd.id || 'field';
        elCell(
          fi,
          elNode(fd.key, label, 'field', pk, { type: fd.type ?? null, required: fd.required ?? null }),
          'contains',
        );
      }
      if (f.target && elIndex.has(matchKey(f.target))) elCell(fi, elAt(matchKey(f.target)), 'submits');
    }
    for (const d of p.dialogs ?? []) elCell(pi, elNode(d.key, `dialog ${d.title || ''}`, 'dialog', pk, {}), 'contains');
  }

  for (const e of ui?.edges ?? []) {
    const src = typeof e.via === 'string' && elIndex.has(e.via) ? e.via : null;
    if (e.type === 'opens' && src !== null && elIndex.has(e.to)) {
      elCell(elAt(src), elAt(e.to), 'opens');
      continue;
    }
    const fk = matchKey(e.from.split('::')[0]);
    const tk = matchKey(e.to);
    if (src !== null && elIndex.has(tk)) elCell(elAt(src), elAt(tk), e.type === 'form' ? 'submits' : 'navigates');
    else if (src === null && e.type === 'redirect' && elIndex.has(fk) && elIndex.has(tk)) {
      elCell(elAt(fk), elAt(tk), 'redirect');
    }
  }

  const byPage = new Map<string, number[]>();
  elNodes.forEach((en, i) => {
    if (en.kind === 'page') return;
    if (!byPage.has(en.page)) byPage.set(en.page, []);
    (byPage.get(en.page) as number[]).push(i);
  });
  const elementLevel: Dsm['element'] = {
    nodes: elNodes,
    cells: sortBy(elCells.values(), (c) => [c.a, c.b]).map((c) => ({ r: c.a, c: c.b, t: c.t })),
    orders: {
      partitioned: pageSeq.flatMap((pk) => [elAt(pk), ...(byPage.get(pk) ?? [])]),
      module: sortBy(elNodes.keys(), (v) => {
        const en = elNodes[v];
        return [en.module, en.page, en.kind === 'page' ? 0 : 1, en.label];
      }),
    },
    truncated,
  };

  const dsm: Dsm = {
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    project: config.project ?? null,
    base_url: config.application?.base_url ?? null,
    convention: CONVENTION,
    repos: code?.repos ?? [],
    crawl: Object.fromEntries(['generated_at', 'mode', 'truncated', 'pending_routes'].map((k) => [k, ui?.[k] ?? null])),
    stats: {
      pages: n,
      page_relations: cells.size,
      elements: elNodes.length,
      element_relations: elCells.size,
      cycles: new Set(nodes.filter((nd) => nd.in_cycle).map((nd) => nd.scc)).size,
      flags: Object.fromEntries(FLAGS.map((f) => [f, nodes.filter((nd) => nd.flags.includes(f)).length])),
      density: n > 1 ? round4(cells.size / (n * n - n)) : 0,
    },
    page: pageLevel,
    element: elementLevel,
    change: change ?? {},
    diff: { first_run: true },
  };
  if (previous) dsm.diff = diff(previous, dsm);
  return dsm;
}

/** "<from> -> <to>" for each page relation, with its sorted types. */
export function edgeSet(dsm: Dsm): Map<string, string[]> {
  const nodes = dsm.page.nodes;
  return new Map(dsm.page.cells.map((c) => [`${nodes[c.r].id} -> ${nodes[c.c].id}`, sortStrings(Object.keys(c.t))]));
}

/** What changed since the previous DSM: screens and relations added, removed and changed. */
export function diff(prev: Dsm, cur: Dsm): DsmDiff {
  const pn = new Map(prev.page.nodes.map((nd) => [nd.id, nd]));
  const cn = new Map(cur.page.nodes.map((nd) => [nd.id, nd]));
  const pe = edgeSet(prev);
  const ce = edgeSet(cur);
  const total = (counts: Record<string, number> | undefined) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
  const changed: { id: string; what: string[] }[] = [];
  for (const [k, a] of pn) {
    const b = cn.get(k);
    if (!b) continue;
    const what: string[] = [];
    if ((a.title ?? null) !== (b.title ?? null)) what.push('title');
    if ((a.status ?? null) !== (b.status ?? null) || !a.error !== !b.error) what.push('status');
    if (!isDeepStrictEqual(a.counts ?? null, b.counts ?? null)) {
      what.push(`elements ${total(a.counts)} -> ${total(b.counts)}`);
    }
    if (!isDeepStrictEqual(sortStrings(a.flags ?? []), sortStrings(b.flags ?? []))) what.push('flags');
    if (what.length) changed.push({ id: k, what });
  }
  return {
    previous_generated_at: prev.generated_at ?? null,
    nodes_added: sortStrings(cn.keys().filter((k) => !pn.has(k))),
    nodes_removed: sortStrings(pn.keys().filter((k) => !cn.has(k))),
    nodes_changed: sortBy(changed, (x) => x.id),
    relations_added: sortStrings(ce.keys().filter((k) => !pe.has(k))),
    relations_removed: sortStrings(pe.keys().filter((k) => !ce.has(k))),
    relations_changed: sortStrings(ce.keys().filter((k) => pe.has(k) && !isDeepStrictEqual(ce.get(k), pe.get(k)))),
  };
}
