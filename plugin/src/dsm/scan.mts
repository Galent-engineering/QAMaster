/**
 * Static scan of the app's source for the DSM: which routes exist, which files serve each route, and which routes
 * each file links to. Ported from Autonomous-QE's scan_repo (the same in 0.1.5 and 0.2.0). No AI, no network: this
 * module only reads the files it is given; adapters/git.mts reads them from the repository.
 *
 * It finds, without running the app:
 *   - routes: router objects (Angular, Vue, React data routers), JSX <Route>, Next.js pages/ and app/, ASP.NET MVC
 *     controllers, Razor Pages, WebForms .aspx, Spring @Controller, Django urls.py, Flask, standalone HTML pages;
 *   - navigation: routerLink, navigate(), <Link to>, href, form action, location =, redirects, RedirectToAction,
 *     Html.ActionLink, Url.Action, asp-* tag helpers;
 *   - UI elements declared in templates: forms, controls, buttons, click handlers.
 *
 * Patterns are JavaScript regexes. AQE wrote them in Python syntax; the one visible difference is that \w and \b
 * here are ASCII, so identifiers with non-ASCII letters aren't matched.
 */
import { BlockedError } from '../shared/errors.mts';
import type { CodeModel } from '../shared/models.mts';
import { sortBy } from './build.mts';

export type RepoConfig = {
  name: string;
  path: string;
  branch?: string;
  include?: string[];
  exclude?: string[];
  [key: string]: unknown;
};

/** What the scan needs from one repository: its files (path relative to the repo folder -> text), in tree order. */
export type RepoSnapshot = { ref: string | null; commit: string | null; files: Map<string, string> };

export type ScanConfig = {
  repositories?: RepoConfig[];
  application?: { route_normalization?: { pattern: string; replace: string }[]; [key: string]: unknown };
  [key: string]: unknown;
};

export type ScanRoute = {
  route: string;
  repo: string;
  file: string;
  line: number;
  kind: string; // route, page-file or action
  framework: string;
  component: string | null;
  redirect_to?: string | null;
  lazy?: string;
  controller?: string;
  action?: string;
  views?: string[];
  prefixed?: string;
};

export type NavRef = { target: string | null; kind: string; line: number; relative?: string };
export type Rule = [RegExp, string];

export const TEXT_EXT = new Set(
  '.ts .tsx .js .jsx .mjs .vue .svelte .html .htm .cshtml .razor .aspx .ascx .master .jsp .php .py .java .cs .vb .rb .erb'.split(
    ' ',
  ),
);
export const MAX_FILE_BYTES = 1_500_000;

// ---- path and string helpers, with the semantics AQE's Python had

/** str.strip(chars) */
export function trim(s: string, chars: string): string {
  let i = 0;
  let j = s.length;
  while (i < j && chars.includes(s[i])) i++;
  while (j > i && chars.includes(s[j - 1])) j--;
  return s.slice(i, j);
}

/** posixpath.dirname: "" for a bare name, "/" for a top-level path. */
export function dirname(p: string): string {
  let head = p.slice(0, p.lastIndexOf('/') + 1);
  if (head && head !== '/'.repeat(head.length)) head = head.replace(/\/+$/, '');
  return head;
}

/** posixpath.join for two parts. */
export function join(a: string, b: string): string {
  if (b.startsWith('/')) return b;
  return !a || a.endsWith('/') ? a + b : `${a}/${b}`;
}

/** posixpath.normpath: resolves "." and "..", no trailing slash, "." for empty. */
export function normPath(p: string): string {
  if (p === '') return '.';
  const initial = p.startsWith('//') && !p.startsWith('///') ? 2 : p.startsWith('/') ? 1 : 0;
  const out: string[] = [];
  for (const comp of p.split('/')) {
    if (comp === '' || comp === '.') continue;
    if (comp !== '..' || (!initial && !out.length) || out.at(-1) === '..') out.push(comp);
    else if (out.length) out.pop();
  }
  return '/'.repeat(initial) + out.join('/') || '.';
}

/** os.path.splitext(p)[1]: the extension, ignoring leading dots of the file name. */
export function extOf(p: string): string {
  const base = p.slice(p.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 && trim(base.slice(0, dot), '.') ? base.slice(dot) : '';
}

/** fnmatch.fnmatch: shell-style, "*" also matches "/", case-sensitive. */
export function fnmatch(name: string, pattern: string): boolean {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const end = pattern.indexOf(']', i + 2);
      if (end < 0) re += '\\[';
      else {
        let set = pattern.slice(i + 1, end).replace(/\\/g, '\\\\');
        if (set.startsWith('!')) set = `^${set.slice(1)}`;
        re += `[${set}]`;
        i = end;
      }
    } else re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  }
  return new RegExp(`^(?:${re})$`, 's').test(name);
}

const firstGroup = (m: RegExpExecArray): string | null => m.slice(1).find((g) => g) ?? null;
export const lineOf = (text: string, idx: number): number => text.slice(0, idx).split('\n').length;
const sortStrings = (xs: Iterable<string>) => sortBy(xs, (x) => x);

// ---- which files to read

function excluded(path: string, rules: string[]): boolean {
  return rules.some((rule) =>
    rule.endsWith('/')
      ? path.startsWith(rule) || `/${path}`.includes(`/${rule}`)
      : fnmatch(path, rule) || fnmatch(path.slice(path.lastIndexOf('/') + 1), rule),
  );
}

/** Whether the scan reads a file: a source extension, not excluded, and inside `include` when that is set. */
export function wanted(path: string, repo: RepoConfig): boolean {
  if (!TEXT_EXT.has(extOf(path).toLowerCase()) || excluded(path, repo.exclude ?? [])) return false;
  const include = repo.include ?? [];
  return !include.length || include.some((i) => path.startsWith(i.replace(/\*+$/, '')) || fnmatch(path, i));
}

// ---- routes

const PARAM_RE = /(\$\{[^}]*\}|\{\{[^}]*\}\}|\{[^}/]*\}|\[\.{0,3}[^\]/]+\]|<[^>/]+>|:\w+\??)/g;

/** A route as the DSM keys it: leading "/", parameters as ":id", no query or trailing "/", rules applied. */
export function normRoute(raw: string | null | undefined, rules: Rule[] = []): string | null {
  if (raw == null) return null;
  let r = trim(raw.trim(), '\'"`');
  if (!r || ['http:', 'https:', 'mailto:', 'tel:', 'javascript:', 'data:', '//'].some((p) => r.startsWith(p)))
    return null;
  r = r.split('?')[0];
  if (r.startsWith('~/')) r = r.slice(1);
  if (r.startsWith('#!/') || r.startsWith('#/')) r = r.slice(r.indexOf('/'));
  else if (r.startsWith('#') || r === '' || r === '.') return null;
  r = r.replace(PARAM_RE, ':id');
  if (!r.startsWith('/')) r = `/${r}`;
  r = r.replace(/\/{2,}/g, '/');
  if (r.length > 1) r = r.replace(/\/+$/, '');
  for (const [pattern, replacement] of rules) r = r.replace(pattern, replacement);
  if (r.includes('**') || r === '/*') return null;
  return r;
}

export function joinRoute(...parts: (string | null | undefined)[]): string {
  const segs = parts.filter((p): p is string => !!p && !!trim(p, '/')).map((p) => trim(p, '/'));
  return segs.length ? `/${segs.join('/')}` : '/';
}

const ROUTER_FILE_RE =
  /\bRoutes\b|RouterModule|createBrowserRouter|createHashRouter|createRouter|VueRouter|new Router\(|\broutes\s*[:=]\s*\[/;
const OBJ_TOKEN_RE = new RegExp(
  [
    '(?<open>\\{)',
    '(?<close>\\})',
    '\\bpath\\s*:\\s*(?<q>[\'"`])(?<path>.*?)\\k<q>',
    '\\bcomponent\\s*:\\s*(?<comp>[A-Z]\\w*)',
    '\\b(?:element|Component)\\s*:\\s*<\\s*(?<elem>[A-Z]\\w*)',
    '\\bloadChildren\\s*:\\s*(?:\\(\\)\\s*=>\\s*)?import\\(\\s*[\'"](?<lazy>[^\'"]+)[\'"]',
    '\\bloadChildren\\s*:\\s*[\'"](?<lazyold>[^\'"#]+)',
    '\\bloadComponent\\s*:\\s*\\(\\)\\s*=>\\s*import\\(\\s*[\'"](?<lazycomp>[^\'"]+)[\'"]',
    '\\bredirectTo\\s*:\\s*[\'"](?<redirect>[^\'"]*)[\'"]',
  ].join('|'),
  'g',
);
// <Route>, and route components named …Route (PrivateRoute, SecureRoute). An attribute value in {…} is skipped whole,
// so element={<X />} doesn't end the tag early.
const JSX_ROUTE_RE = /<\w*Route\b(?<attrs>(?:[^>{]|\{(?:[^{}]|\{[^{}]*\})*\})*?)(?<self>\/?)>|<\/\w*Route>/g;
export const JSX_ROUTE_TAG = /<\w*Route\b/;
// The first component inside an open route tag, before any other route tag: React Router v5's <Route><Screen/></Route>.
const CHILD_RE = /<\/?\w*Route\b|<([A-Z]\w*)/g;
const ATTR_PATH_RE = /\bpath\s*=\s*\{?\s*['"`]([^'"`]*)['"`]/;
const ATTR_COMP_RE = /\b(?:element\s*=\s*\{\s*<\s*([A-Z]\w*)|component\s*=\s*\{\s*([A-Z]\w*))/;

type RouterObj = {
  route: string;
  component: string | null;
  lazy: string | null;
  redirect: string | null;
  line: number;
};

/** Router config objects with nested children (Angular, Vue, React data routers). */
export function scanRouterObjects(text: string): RouterObj[] {
  type Frame = { path: string | null; comp: string | null; lazy: string | null; redirect: string | null; pidx: number };
  const out: RouterObj[] = [];
  const stack: Frame[] = [];
  for (const m of text.matchAll(OBJ_TOKEN_RE)) {
    const g = m.groups as Record<string, string | undefined>;
    if (g.open) stack.push({ path: null, comp: null, lazy: null, redirect: null, pidx: 0 });
    else if (g.close) {
      const frame = stack.pop();
      if (!frame || frame.path === null) continue;
      const parents = stack.filter((f) => f.path !== null).map((f) => f.path);
      const route = joinRoute(...parents, frame.path);
      out.push({
        route,
        component: frame.comp,
        lazy: frame.lazy,
        redirect: frame.redirect,
        line: lineOf(text, frame.pidx),
      });
    } else if (stack.length) {
      const top = stack[stack.length - 1];
      if (g.path !== undefined && top.path === null) {
        top.path = g.path;
        top.pidx = m.index;
      } else if (g.comp || g.elem) top.comp = (g.comp || g.elem) as string;
      else if (g.lazy || g.lazyold || g.lazycomp) top.lazy = (g.lazy || g.lazyold || g.lazycomp) as string;
      else if (g.redirect !== undefined) top.redirect = g.redirect;
    }
  }
  return out;
}

/** JSX <Route path=…> elements, nested by their closing tags. */
/**
 * React Router v5 path patterns: each "(a|b)" group becomes one route per choice ("?" adds the route without it),
 * and a "*" ending a segment ("/bankaccounts*") is dropped. A lone "/*" is left for normRoute to discard.
 */
export function expandPath(path: string): string[] {
  const m = /\(([\w|-]+)\)(\?)?/.exec(path);
  if (!m) return [path.replace(/(?<=\w)\*$/, '')];
  const choices = [...(m[2] ? [''] : []), ...m[1].split('|')];
  return choices.flatMap((c) => expandPath(path.slice(0, m.index) + c + path.slice(m.index + m[0].length)));
}

/** JSX route elements, nested by their closing tags. */
export function scanJsxRoutes(text: string): { route: string; component: string | null; line: number }[] {
  const out: { route: string; component: string | null; line: number }[] = [];
  const stack: (string | null)[] = [];
  for (const m of text.matchAll(JSX_ROUTE_RE)) {
    if (m[0].startsWith('</')) {
      stack.pop();
      continue;
    }
    const { attrs, self } = m.groups as { attrs: string; self: string };
    const path = ATTR_PATH_RE.exec(attrs)?.[1] ?? null;
    const cm = ATTR_COMP_RE.exec(attrs);
    let component = cm ? cm[1] || cm[2] || null : null;
    if (!component && !self) {
      CHILD_RE.lastIndex = m.index + m[0].length;
      component = CHILD_RE.exec(text)?.[1] ?? null;
    }
    if (path !== null || attrs.includes('index')) {
      const parents = stack.filter((p): p is string => !!p);
      for (const p of expandPath(path || '')) {
        out.push({ route: joinRoute(...parents, p), component, line: lineOf(text, m.index) });
      }
    }
    if (!self) stack.push(path);
  }
  return out;
}

const CS_CONTROLLER_RE = /class\s+(\w+?)Controller\b/;
const CS_CLASS_ROUTE_RE =
  /\[Route\(\s*"([^"]*)"\s*\)\]\s*(?:\[[^\]]*\]\s*)*public\s+(?:sealed\s+|partial\s+|abstract\s+)*class\s+\w+Controller/;
const CS_ACTION_RE =
  /((?:\[[^\]]*\]\s*)*)public\s+(?:virtual\s+|override\s+|async\s+)*(?:Task<)?\s*(?:I?ActionResult|ViewResult|PartialViewResult|IActionResult|RedirectResult|RedirectToActionResult|ContentResult|FileResult|ActionResult<\w+>)\s*>?\s+(\w+)\s*\(/dg;
const CS_ATTR_ROUTE_RE = /\[(?:Route|HttpGet|HttpPost|HttpPut|HttpDelete|AcceptVerbs)\(\s*"([^"]*)"/;
const SPRING_CTRL_RE = /@Controller\b/;
const SPRING_CLASS_MAP_RE =
  /@RequestMapping\(\s*(?:value\s*=\s*)?\{?\s*"([^"]*)"[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*public\s+class/;
const SPRING_METHOD_RE = /@(?:Get|Post|Request|Put|Delete)Mapping\(\s*(?:value\s*=\s*|path\s*=\s*)?\{?\s*"([^"]*)"/g;
const DJANGO_PATH_RE = /\b(?:path|re_path)\(\s*r?['"]([^'"]*)['"]\s*,\s*([\w.]+)/g;
const FLASK_RE = /@\w+\.(?:route|get|post)\(\s*['"]([^'"]+)['"]/g;

/** The route a page file serves, from its path (Next.js, Razor Pages, WebForms, static HTML). */
export function pageRouteFromFile(rel: string, kind: string): string {
  let p = rel;
  if (kind === 'next-pages') {
    p = p
      .replace(/^(?:src\/)?pages\//, '')
      .replace(/\.(tsx?|jsx?|mdx?)$/, '')
      .replace(/(^|\/)index$/, '');
  } else if (kind === 'next-app') {
    p = p
      .replace(/^(?:src\/)?app\//, '')
      .replace(/(^|\/)page\.(tsx?|jsx?|mdx?)$/, '')
      .replace(/\([^)]*\)\/?/g, '');
  } else if (kind === 'razor-page') {
    p = p
      .replace(/^.*?Pages\//, '')
      .replace(/\.cshtml$/, '')
      .replace(/(^|\/)Index$/, '');
  } else if (kind === 'aspx' || kind === 'html') {
    p = p.replace(/^(?:src\/|public\/|wwwroot\/|static\/|www\/|web\/|WebContent\/|webapp\/)/, '');
  }
  return `/${trim(p, '/')}`;
}

// ---- navigation references and UI elements

const NAV_PATTERNS: [string, RegExp][] = [
  ['routerLink', /\brouterLink\s*=\s*"([^"{]+)"|\brouterLink\s*=\s*'([^'{]+)'/g],
  ['routerLink', /\[routerLink\]\s*=\s*"\s*'([^']*)'\s*"/g],
  ['routerLink', /\[routerLink\]\s*=\s*"\s*(\[[^\]"]*\])/g],
  ['navigate', /\.navigate\(\s*(\[[^\]]*\])/g],
  ['navigate', /\b(?:navigateByUrl|navigate|push|replace|redirect|assign)\(\s*['"`](\/[^'"`]*|#\/[^'"`]*)['"`]/g],
  ['navigate', /\.push\(\s*\{\s*path\s*:\s*['"`]([^'"`]+)['"`]/g],
  ['link', /<(?:Link|NavLink|router-link|RouterLink)\b[^>]*?\bto\s*=\s*\{?\s*['"`]([^'"`]+)['"`]/g],
  [
    'href',
    /\bhref\s*=\s*"((?:\/|#\/|~\/|\.\.\/|[\w-]+\.(?:html?|aspx|jsp|php)|[\w-]+\/)[^"{}@]*)"|\bhref\s*=\s*'((?:\/|#\/|~\/)[^'{}@]*)'/g,
  ],
  ['form-action', /<form\b[^>]*?\baction\s*=\s*["']((?:\/|~\/|[\w-]+\.(?:aspx|php|jsp))[^"'{}@]*)["']/gi],
  ['location', /(?:window\.)?location(?:\.href)?\s*=\s*['"`](\/[^'"`]*|#\/[^'"`]*)['"`]/g],
  ['redirect', /Response\.Redirect\(\s*"([^"]+)"/g],
  ['redirect', /\bredirect\(\s*['"](\/[^'"]*)['"]/g],
];
const MVC_LINK_PATTERNS: [string, RegExp][] = [
  ['redirect', /RedirectToAction\(\s*(?:nameof\((\w+)\)|"(\w+)")\s*(?:,\s*(?:nameof\((\w+)Controller\)|"(\w+)"))?/g],
  ['action-link', /Html\.ActionLink\(\s*[^,]+,\s*"(\w+)"\s*(?:,\s*"(\w+)")?/g],
  ['url-action', /Url\.Action\(\s*"(\w+)"\s*(?:,\s*"(\w+)")?/g],
];
const ASP_TAG_RE = /<(?:a|form)\b[^>]*?\basp-(?:action|page|controller)\s*=[^>]*>/gi;
const ASP_ATTR_RE = /\basp-(action|controller|page)\s*=\s*"([^"]+)"/gi;
const ELEMENT_PATTERNS: [string, RegExp][] = [
  ['forms', /<form\b[^>]*?(?:\b(?:id|name|\[formGroup\]|formGroup)\s*=\s*"([^"]+)")?[^>]*>/gi],
  ['controls', /\b(?:formControlName|formControl|ng-model|v-model|asp-for|name)\s*=\s*"([\w.\-[\]]+)"/g],
  ['buttons', /<button\b[^>]*>\s*([^<]{1,60}?)\s*</gi],
  [
    'click_handlers',
    /\((?:click|ngSubmit|submit)\)\s*=\s*"(\w+)\(|onClick\s*=\s*\{\s*(?:\(\)\s*=>\s*)?(\w+)|@click\s*=\s*"(\w+)/g,
  ],
];
const LITERAL_SEG = /^['"`]([^'"`]*)['"`]$/;
const ASSET_EXT = ['.css', '.js', '.png', '.jpg', '.svg', '.ico', '.gif', '.woff', '.woff2'];

export function mvcRoute(ctrl: string, action: string | null | undefined): string {
  return !action || action.toLowerCase() === 'index' ? `/${ctrl}` : `/${ctrl}/${action}`;
}

export function navRefs(text: string, ctrlName: string | null, rules: Rule[]): NavRef[] {
  const refs: NavRef[] = [];
  for (const [kind, pattern] of NAV_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      let raw = firstGroup(m);
      if (raw === null) continue;
      if (raw.startsWith('[')) {
        // an array of segments: literals kept, expressions become :id, query objects skipped
        const segs: string[] = [];
        for (const t of trim(raw, '[]').split(',')) {
          const tok = t.trim();
          if (!tok) continue;
          const lit = LITERAL_SEG.exec(tok);
          if (lit) segs.push(trim(lit[1], '/'));
          else if (!tok.startsWith('{')) segs.push(':id');
        }
        if (!segs.length || segs[0] === ':id') continue;
        raw = (trim(trim(raw, '[] '), '\'"`').startsWith('/') ? '/' : '') + segs.filter((s) => s).join('/');
      }
      const target = normRoute(raw, rules);
      if (!target || ASSET_EXT.some((x) => target.endsWith(x))) continue;
      const ref: NavRef = { target, kind, line: lineOf(text, m.index) };
      const stripped = raw.trim();
      if (!['/', '#', '~'].some((c) => stripped.startsWith(c))) ref.relative = stripped; // resolved per owner later
      refs.push(ref);
    }
  }
  for (const [kind, pattern] of MVC_LINK_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const [, a, b, c, d] = m;
      const action = kind === 'redirect' ? a || b : a;
      const ctrl = (kind === 'redirect' ? c || d : b) || ctrlName;
      if (ctrl) refs.push({ target: normRoute(mvcRoute(ctrl, action), rules), kind, line: lineOf(text, m.index) });
    }
  }
  for (const m of text.matchAll(ASP_TAG_RE)) {
    const attrs: Record<string, string> = {};
    for (const am of m[0].matchAll(ASP_ATTR_RE)) attrs[am[1].toLowerCase()] = am[2];
    let target: string | null;
    if (Object.hasOwn(attrs, 'page')) target = normRoute(attrs.page, rules);
    else {
      const ctrl = attrs.controller || ctrlName;
      target = ctrl ? normRoute(mvcRoute(ctrl, Object.hasOwn(attrs, 'action') ? attrs.action : 'Index'), rules) : null;
    }
    if (target) refs.push({ target, kind: 'asp-tag', line: lineOf(text, m.index) });
  }
  return refs;
}

export function elementsOf(text: string): Record<string, string[] | number> {
  const res: Record<string, string[] | number> = {};
  for (const [name, pattern] of ELEMENT_PATTERNS) {
    const vals = [...text.matchAll(pattern)].map((m) => (firstGroup(m) ?? '').trim() || '(unnamed)');
    if (vals.length) {
      res[name] = sortStrings(new Set(vals)).slice(0, 200);
      res[`${name}_count`] = vals.length;
    }
  }
  return res;
}

// ---- one repository

const RE = {
  classOrConst: /(?:export\s+)?(?:default\s+)?(?:class|function)\s+([A-Z]\w*)|(?:export\s+)?const\s+([A-Z]\w*)\s*[:=]/g,
  templateUrl: /templateUrl\s*:\s*['"]([^'"]+)['"]/,
  pagesDir: /(^|\/)pages\//,
  pagesSpecial: /pages\/(_app|_document|api\/)/,
  appPage: /(^|\/)app\/(.*\/)?page\.(tsx|jsx|js|ts)$/,
  razorPagesDir: /(^|\/)Pages\//,
  atPage: /^\s*@page/m,
  componentHtml: /\.component\.html?$/,
  htmlBody: /<(html|body)\b/i,
  indexHtml: /(^|\/)(src\/)?index\.html$/,
  sibling: /\.(component|page|view)?\.?(ts|tsx|js|jsx|html|htm|scss|css|less|cs|vb)$/,
  codeBehindExt: /\.(cs|vb)$/,
  viewsDir: /(?:^|\/)Views\/(\w+)\//,
};
const ELEMENT_EXTS = new Set('.html .htm .cshtml .razor .aspx .ascx .tsx .jsx .vue .svelte .jsp .php .erb'.split(' '));

type FileInfo = { owners: string[]; confidence: string; nav?: NavRef[]; elements?: Record<string, string[] | number> };
type CodeEdge = NonNullable<CodeModel['edges']>[number];

export function scanRepo(repo: RepoConfig, snapshot: RepoSnapshot, rules: Rule[]) {
  const { name } = repo;
  const { files } = snapshot;
  const routes: ScanRoute[] = [];
  const hints = new Set<string>();
  const classFile = new Map<string, string>();
  const templateOf = new Map<string, string>();
  const lazyLinks: [string, string, string][] = []; // [prefix route, file that declared it, import path]

  for (const [rel, text] of files) {
    for (const m of text.matchAll(RE.classOrConst)) {
      const k = m[1] || m[2];
      if (!classFile.has(k)) classFile.set(k, rel);
    }
    const tm = RE.templateUrl.exec(text);
    if (tm) templateOf.set(rel, normPath(join(dirname(rel), tm[1])));
  }

  const addRoute = (
    route: string,
    rel: string,
    line: number,
    kind: string,
    framework: string,
    component: string | null = null,
    extra: Partial<ScanRoute> = {},
  ) => {
    const r = route !== '/' ? normRoute(route, rules) : '/';
    if (r === null) return;
    routes.push({ route: r, repo: name, file: rel, line, kind, framework, component, ...extra });
    hints.add(framework);
  };

  // ---- route definitions
  for (const [rel, text] of files) {
    const low = rel.toLowerCase();
    const ext = extOf(low);
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue'].includes(ext) && ROUTER_FILE_RE.test(text)) {
      const fw =
        text.includes('RouterModule') || text.includes('@angular')
          ? 'angular'
          : text.includes('vue-router') || ext === '.vue'
            ? 'vue'
            : 'router';
      for (const r of scanRouterObjects(text)) {
        const extra: Partial<ScanRoute> = {};
        if (r.redirect !== null) {
          const to = r.redirect.startsWith('/') ? r.redirect : joinRoute(dirname(r.route), r.redirect);
          extra.redirect_to = normRoute(to, rules);
        }
        if (r.lazy) {
          const target = normPath(join(dirname(rel), r.lazy));
          lazyLinks.push([r.route, rel, target]);
          extra.lazy = target;
        }
        addRoute(r.route, rel, r.line, 'route', fw, r.component, extra);
      }
    }
    if (['.tsx', '.jsx', '.js'].includes(ext) && JSX_ROUTE_TAG.test(text)) {
      for (const r of scanJsxRoutes(text)) addRoute(r.route, rel, r.line, 'route', 'react-router', r.component);
    }
    if (
      RE.pagesDir.test(rel) &&
      ['.tsx', '.ts', '.jsx', '.js'].includes(ext) &&
      !RE.pagesSpecial.test(rel) &&
      (text.includes('next') || text.includes('export default'))
    ) {
      addRoute(pageRouteFromFile(rel, 'next-pages'), rel, 1, 'page-file', 'nextjs');
    }
    if (RE.appPage.test(rel)) addRoute(pageRouteFromFile(rel, 'next-app'), rel, 1, 'page-file', 'nextjs');
    if (ext === '.cs') {
      const cm = CS_CONTROLLER_RE.exec(text);
      if (cm && !text.includes('ApiController')) {
        const ctrl = cm[1];
        const prefixM = CS_CLASS_ROUTE_RE.exec(text);
        const prefix = prefixM ? prefixM[1].split('[controller]').join(ctrl) : null;
        for (const am of text.matchAll(CS_ACTION_RE)) {
          const [, attrs, action] = am;
          const ar = CS_ATTR_ROUTE_RE.exec(attrs || '');
          let route: string;
          if (ar) {
            const tmpl = ar[1].split('[controller]').join(ctrl).split('[action]').join(action);
            route = tmpl.startsWith('/') || tmpl.startsWith('~') ? tmpl : joinRoute(prefix || '', tmpl);
          } else if (prefix && prefixM) {
            route = joinRoute(prefix.split('[action]').join(action), prefixM[1].includes('[action]') ? '' : action);
          } else route = mvcRoute(ctrl, action);
          const line = lineOf(text, (am.indices as RegExpIndicesArray)[2]?.[0] ?? am.index);
          addRoute(route, rel, line, 'action', 'aspnet-mvc', `${ctrl}Controller.${action}`, {
            controller: ctrl,
            action,
          });
        }
      }
    }
    if (ext === '.cshtml' && RE.razorPagesDir.test(rel) && RE.atPage.test(text)) {
      addRoute(pageRouteFromFile(rel, 'razor-page'), rel, 1, 'page-file', 'razor-pages');
    }
    if (ext === '.aspx') addRoute(pageRouteFromFile(rel, 'aspx'), rel, 1, 'page-file', 'webforms');
    if (ext === '.java' && SPRING_CTRL_RE.test(text)) {
      const pm = SPRING_CLASS_MAP_RE.exec(text);
      for (const mm of text.matchAll(SPRING_METHOD_RE)) {
        if (pm && mm.index === pm.index) continue;
        addRoute(joinRoute(pm ? pm[1] : '', mm[1]), rel, lineOf(text, mm.index), 'action', 'spring-mvc');
      }
    }
    if (low.slice(low.lastIndexOf('/') + 1) === 'urls.py') {
      for (const mm of text.matchAll(DJANGO_PATH_RE)) {
        addRoute(mm[1], rel, lineOf(text, mm.index), 'action', 'django', mm[2]);
      }
    }
    if (ext === '.py') {
      for (const mm of text.matchAll(FLASK_RE)) addRoute(mm[1], rel, lineOf(text, mm.index), 'action', 'flask');
    }
    if (
      ['.html', '.htm'].includes(ext) &&
      !RE.componentHtml.test(low) &&
      RE.htmlBody.test(text) &&
      !RE.indexHtml.test(low)
    ) {
      addRoute(pageRouteFromFile(rel, 'html'), rel, 1, 'page-file', 'html');
    }
  }

  // ---- lazy-loaded modules: routes declared inside the module's folder hang under the lazy route's path
  for (const [prefix, declFile, target] of sortBy(lazyLinks, (x) => x[0].split('/').length - 1)) {
    const tdir = dirname(target);
    for (const r of routes) {
      if (r.file !== declFile && r.file.startsWith(`${tdir}/`) && r.kind === 'route' && !r.prefixed) {
        r.route = normRoute(joinRoute(prefix, r.route), rules) || prefix;
        if (r.redirect_to) r.redirect_to = normRoute(joinRoute(prefix, r.redirect_to), rules);
        r.prefixed = prefix;
      }
    }
  }

  // ---- owners: which routes each file serves, and how sure we are
  const owners = new Map<string, Set<string>>();
  for (const rel of files.keys()) owners.set(rel, new Set());
  const confidence = new Map<string, string>();
  const own = (rel: string) => {
    if (!owners.has(rel)) owners.set(rel, new Set());
    return owners.get(rel) as Set<string>;
  };
  for (const r of routes) {
    if (r.kind === 'page-file' || r.kind === 'action') own(r.file).add(r.route);
    const compFile = classFile.get(r.component || '');
    if (compFile) {
      own(compFile).add(r.route);
      confidence.set(compFile, 'direct');
      const t = templateOf.get(compFile);
      if (t) {
        own(t).add(r.route);
        confidence.set(t, 'direct');
      }
    }
    if (r.kind === 'page-file' || r.kind === 'action') confidence.set(r.file, 'direct');
  }
  // MVC views: Views/<Controller>/<Action>.cshtml
  for (const r of routes) {
    if (r.framework !== 'aspnet-mvc') continue;
    const esc = (s = '') => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    const viewRe = new RegExp(`(?:^|/)Views/${esc(r.controller)}/${esc(r.action)}\\.(cshtml|aspx|vbhtml)$`, 'i');
    for (const rel of files.keys()) {
      if (!viewRe.test(rel)) continue;
      own(rel).add(r.route);
      confidence.set(rel, 'direct');
      r.views = [...(r.views ?? []), rel];
    }
  }
  // code-behind and sibling files (same name, other extension) share the owner
  for (const rel of [...owners.keys()]) {
    const base = rel.replace(RE.sibling, '');
    for (const other of owners.keys()) {
      if (
        other !== rel &&
        own(other).size &&
        confidence.get(other) === 'direct' &&
        other.replace(RE.sibling, '') === base
      ) {
        for (const x of own(other)) own(rel).add(x);
        if (!confidence.has(rel)) confidence.set(rel, 'direct');
      }
    }
    if (['.aspx.cs', '.aspx.vb', '.cshtml.cs'].some((x) => rel.endsWith(x))) {
      const parent = rel.replace(RE.codeBehindExt, '');
      if (owners.has(parent) && own(parent).size) {
        for (const x of own(parent)) own(rel).add(x);
        confidence.set(rel, 'direct');
      }
    }
  }
  // lazy modules: the whole folder belongs to the lazy route and its children
  for (const [prefix, , target] of lazyLinks) {
    const tdir = dirname(target);
    const childRoutes = new Set(
      routes
        .filter((r) => r.route === prefix || r.route.startsWith(`${prefix.replace(/\/+$/, '')}/`))
        .map((r) => r.route),
    );
    for (const rel of files.keys()) {
      if (rel.startsWith(`${tdir}/`) && !own(rel).size) {
        for (const x of childRoutes.size ? childRoutes : [prefix]) own(rel).add(x);
        confidence.set(rel, 'module');
      }
    }
  }
  // anything else: the nearest folder above it with owned files (if that folder serves 25 routes or fewer)
  const ownedDirs = new Map<string, Set<string>>();
  for (const [rel, rs] of owners) {
    if (!rs.size || !['direct', 'module'].includes(confidence.get(rel) as string)) continue;
    const d = dirname(rel);
    if (!ownedDirs.has(d)) ownedDirs.set(d, new Set());
    for (const x of rs) (ownedDirs.get(d) as Set<string>).add(x);
  }
  for (const [rel, rs] of owners) {
    if (rs.size) continue;
    for (let d = dirname(rel); !['', '/', '.'].includes(d); d = dirname(d)) {
      const od = ownedDirs.get(d);
      if (od && od.size <= 25) {
        for (const x of od) rs.add(x);
        confidence.set(rel, 'inferred');
        break;
      }
    }
    if (!rs.size) confidence.set(rel, 'shared');
  }

  // ---- navigation edges, from each route the file serves (or "(shared)")
  const fileInfo: Record<string, FileInfo> = {};
  const edges: CodeEdge[] = [];
  for (const [rel, text] of files) {
    const ctrl = (RE.viewsDir.exec(rel) || CS_CONTROLLER_RE.exec(text))?.[1] ?? null;
    const refs = navRefs(text, ctrl, rules);
    const elements = ELEMENT_EXTS.has(extOf(rel).toLowerCase()) ? elementsOf(text) : {};
    const info: FileInfo = { owners: sortStrings(owners.get(rel) ?? []), confidence: confidence.get(rel) ?? 'shared' };
    if (refs.length) info.nav = refs;
    if (Object.keys(elements).length) info.elements = elements;
    fileInfo[`${name}:${rel}`] = info;
    for (const ref of refs) {
      for (const owner of info.owners.length ? info.owners : ['(shared)']) {
        let target = ref.target;
        if (ref.relative && owner !== '(shared)') {
          // router links resolve against the current route, plain hrefs against its folder
          const base = ['routerLink', 'navigate', 'link'].includes(ref.kind) ? owner : dirname(owner);
          target = normRoute(normPath(join(base, ref.relative)), rules) || target;
        }
        edges.push({
          from: owner,
          to: target as string,
          type: 'code',
          kind: ref.kind,
          repo: name,
          file: rel,
          line: ref.line,
          confidence: info.confidence,
        });
      }
    }
  }
  for (const r of routes) {
    if (!r.redirect_to) continue;
    edges.push({
      from: r.route,
      to: r.redirect_to,
      type: 'code',
      kind: 'route-redirect',
      repo: name,
      file: r.file,
      line: r.line,
      confidence: 'direct',
    });
  }
  const info = {
    name,
    path: repo.path,
    ref: snapshot.ref,
    commit: snapshot.commit,
    files_scanned: files.size,
    frameworks: sortStrings(hints),
  };
  return { info, routes, files: fileInfo, edges };
}

/** route_normalization rules from the config. Python's (?P<name>…) and \1 / \g<name> are accepted, as AQE wrote them. */
export function compileRules(config: ScanConfig): Rule[] {
  return (config.application?.route_normalization ?? []).map(({ pattern, replace }) => {
    try {
      const source = pattern.replace(/\(\?P</g, '(?<').replace(/\(\?P=(\w+)\)/g, '\\k<$1>');
      const replacement = replace
        .replace(/\$/g, '$$$$')
        .replace(/\\g<(\d+)>|\\(\d{1,2})/g, (_, a, b) => `$${a ?? b}`)
        .replace(/\\g<(\w+)>/g, '$<$1>');
      return [new RegExp(source, 'g'), replacement] as Rule;
    } catch (e) {
      throw new BlockedError(
        `route_normalization pattern ${pattern} isn't valid: ${(e as Error).message}. Fix it in dsm-config.json.`,
      );
    }
  });
}

/**
 * The code model for every configured repository. `read` returns a repository's files, or null when its path
 * doesn't exist (recorded in `errors`).
 */
export function scan(
  config: ScanConfig,
  read: (repo: RepoConfig) => RepoSnapshot | null,
  now = new Date(),
): CodeModel & { errors: string[] } {
  const rules = compileRules(config);
  const model = {
    generated_at: now.toISOString().replace(/\.\d{3}Z$/, '+00:00'),
    repos: [] as ReturnType<typeof scanRepo>['info'][],
    routes: [] as ScanRoute[],
    files: {} as Record<string, FileInfo>,
    edges: [] as CodeEdge[],
    errors: [] as string[],
  };
  for (const repo of config.repositories ?? []) {
    const snapshot = read(repo);
    if (!snapshot) {
      model.errors.push(`repository ${repo.name}: path not found: ${repo.path}`);
      continue;
    }
    const r = scanRepo(repo, snapshot, rules);
    model.repos.push(r.info);
    model.routes.push(...r.routes);
    Object.assign(model.files, r.files);
    model.edges.push(...r.edges);
  }
  const seen = new Set<string>();
  model.edges = model.edges.filter((e) => {
    const k = JSON.stringify([e.from, e.to, e.kind, e.file, e.line]);
    if (seen.has(k) || e.from === e.to) return false;
    seen.add(k);
    return true;
  });
  return model;
}
