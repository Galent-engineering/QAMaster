/**
 * The decisions the UI crawl makes, as plain functions: which URLs it visits, how a URL becomes a route, which
 * requests the write guard lets through, and when a page counts as a sign-in page. The Playwright adapter
 * (adapters/crawler-playwright.mts) only drives the browser and asks these.
 *
 * Three of these fix bugs found in Autonomous-QE's crawler (porting-step3.md, feature 3), each of which let a crawl
 * change application data:
 *   1. a page with an email field and no password was taken for a sign-in page, filled in and submitted;
 *   2. the write guard was switched off to sign in again, and stayed off when that sign-in failed;
 *   3. the write guard only covered the app's own host, so an API on another host or port was never guarded.
 */
import type { Access, CrawlPass, UiEdge, UiElement, UiModel, UiPage } from '../shared/models.mts';

/** The `application` section of config/dsm-config.json, as the crawl reads it. */
export type CrawlApp = {
  base_url?: string;
  start_paths?: string[];
  allowed_hosts?: string[];
  api_hosts?: string[];
  secrets_file?: string;
  max_pages?: number;
  max_depth?: number;
  page_timeout_ms?: number;
  settle_ms?: number;
  headless?: boolean;
  ignore_https_errors?: boolean;
  hash_routing?: boolean | 'auto';
  route_normalization?: { pattern: string; replace: string }[];
  keep_query_params?: string[];
  exclude_url_patterns?: string[];
  login?: {
    mode?: 'auto' | 'manual' | 'none';
    url?: string;
    username_selector?: string;
    password_selector?: string;
    submit_selector?: string;
    username_env?: string;
    password_env?: string;
    post_login_wait_ms?: number;
    manual_timeout_s?: number;
    save_session?: boolean;
    signed_out_pass?: boolean; // 0.7.0 (D1): crawl signed out first and merge; on unless false
  };
  crawl?: { concurrency?: number }; // 0.7.0 (D1, D4): pages crawled at once in one browser context
  safety?: { block_mutating_requests?: boolean; allow_mutating_patterns?: string[]; dismiss_dialogs?: boolean };
  explore_clicks?: { enabled?: boolean; max_per_page?: number; selectors?: string[]; deny_text_patterns?: string[] };
  [key: string]: unknown;
};

// Autonomous-QE's template values. They apply whenever the config leaves a list out, so a sparse config is still safe.
export const DEFAULT_EXCLUDE = [
  'logout',
  'signout',
  'sign-out',
  'logoff',
  'delete',
  'remove',
  '\\.(pdf|xlsx?|docx?|zip|csv)(\\?|$)',
];
export const DEFAULT_CLICK_SELECTORS = [
  'nav a:not([href])',
  '[role=menuitem]',
  '[role=tab]',
  '[routerlink]',
  '[ng-click]',
  'button:not([type=submit])',
  '[role=button]',
  "a[href='#']",
  "a[href^='javascript']",
];
export const DEFAULT_DENY = [
  'delete',
  'remove',
  'logout',
  'log out',
  'sign out',
  'submit',
  'save',
  'approve',
  'reject',
  'send',
  'pay',
  'lock',
  'run',
  'process',
  'import',
  'upload',
  'publish',
  'release',
  'terminate',
  'deactivate',
  'reset',
  'clear all',
  'confirm',
];
const READS = ['GET', 'HEAD', 'OPTIONS'];

/** Turns URLs into route keys, as the crawl and the DSM use them. Detects hash routing once when it's "auto". */
export class Routes {
  readonly base: URL;
  hashRouting: boolean;
  private readonly auto: boolean;
  private readonly rules: [RegExp, string][];
  private readonly keep: Set<string>;
  private readonly hosts: Set<string>;
  private readonly exclude: RegExp[];

  constructor(app: CrawlApp, baseUrl: string) {
    this.base = new URL(baseUrl);
    this.hashRouting = app.hash_routing === true;
    this.auto = app.hash_routing === 'auto';
    this.rules = (app.route_normalization ?? []).map((r) => [new RegExp(r.pattern, 'g'), r.replace]);
    this.keep = new Set(app.keep_query_params ?? []);
    this.hosts = new Set([this.base.host, ...(app.allowed_hosts ?? [])]);
    this.exclude = (app.exclude_url_patterns ?? DEFAULT_EXCLUDE).map((p) => new RegExp(p, 'i'));
  }

  private normalise(p: string): string {
    return this.rules.reduce((out, [re, rep]) => out.replace(re, rep), p);
  }

  /** The route of a URL: normalised path (/orders/101 -> /orders/:id), plus the hash route and kept query params. */
  routeOf(href: string): string | null {
    let u: URL;
    try {
      u = new URL(href, this.base);
    } catch {
      return null;
    }
    let p = u.pathname.replace(/\/{2,}/g, '/');
    if (p.length > 1) p = p.replace(/\/$/, '');
    p = this.normalise(p);
    if (/^#!?\//.test(u.hash) && (this.hashRouting || this.auto)) {
      this.hashRouting = true;
      let h = u.hash.replace(/^#!?/, '').split('?')[0];
      if (h.length > 1) h = h.replace(/\/$/, '');
      p += `#${this.normalise(h)}`;
    }
    const kept = [...u.searchParams.entries()].filter(([k]) => this.keep.has(k)).sort();
    if (kept.length) p += `?${kept.map(([k, v]) => `${k}=${v}`).join('&')}`;
    return p;
  }

  /** Whether the crawl may open this URL: http(s), an allowed host, and no excluded pattern. */
  allowed(href: string): boolean {
    let u: URL;
    try {
      u = new URL(href, this.base);
    } catch {
      return false;
    }
    return /^https?:$/.test(u.protocol) && this.hosts.has(u.host) && !this.exclude.some((re) => re.test(u.href));
  }

  isAppHost(host: string): boolean {
    return this.hosts.has(host);
  }
}

/** When the write guard is in force. `signing-in` is the first sign-in, before any page is crawled. */
export type GuardPhase = 'signing-in' | 'crawling' | 're-signing-in';

/**
 * Whether the write guard blocks a request. Reads always pass. Writes pass during the first sign-in, and while
 * signing in again only from the known sign-in page (fix 2: the guard is never switched off). Otherwise every write
 * to **any** host is blocked (fix 3), unless it matches allow_mutating_patterns.
 */
export function blocks(
  req: { method: string; url: string; frameRoute: string | null },
  phase: GuardPhase,
  loginRoute: string | null,
  app: CrawlApp,
): boolean {
  if (READS.includes(req.method.toUpperCase())) return false;
  if (app.safety?.block_mutating_requests === false) return false;
  if (phase === 'signing-in') return false;
  if (phase === 're-signing-in' && loginRoute !== null && req.frameRoute === loginRoute) return false;
  return !(app.safety?.allow_mutating_patterns ?? []).some((p) => new RegExp(p, 'i').test(req.url));
}

/** What the page shows that looks like signing in (read in the browser). */
export type LoginState = { password: boolean; passwords?: number; userOnly: boolean; otp: boolean; message: string };

const SIGN_IN_ROUTE = /(^|[/#_-])(log-?in|sign-?in|auth|sso|account\/login)([/?#_-]|$)/i;

/**
 * Whether a page is a sign-in page (fix 1). A visible password field is enough, unless the page has several (a
 * change-password or registration form: current, new, confirm) and isn't on the sign-in route or a route named like
 * one (0.3.2 T1: Toolshop's /account/profile was taken for a sign-in page). A username-only or code-only form
 * (two-step sign-in, OTP) counts only on the known sign-in route, or before that is known, on a route named like
 * one. A settings form with an email field is never a sign-in page.
 */
export function isSignInPage(state: LoginState, route: string | null, loginRoute: string | null): boolean {
  if (state.password) {
    const onSignInRoute = route !== null && (route === loginRoute || SIGN_IN_ROUTE.test(route));
    return onSignInRoute || (state.passwords ?? 1) <= 1;
  }
  if (!state.userOnly && !state.otp) return false;
  if (route === null) return false;
  return loginRoute !== null ? route === loginRoute : SIGN_IN_ROUTE.test(route);
}

/** Playwright's error when the page, context or browser it was using is gone. */
export const isBrowserClosedError = (err: unknown) =>
  /has been closed|Target closed|browser has disconnected/i.test(String((err as Error)?.message ?? err));

/** Waits before each retry of a page that answers 503: short and doubling, three retries at most. */
export const RETRY_503_MS = [2000, 4000, 8000];

/** Browser restarts allowed in one crawl. */
export const MAX_BROWSER_RESTARTS = 2;

/**
 * The progress line: pages crawled out of pages queued so far (never past max_pages), and the minutes left from the
 * average time per page so far. Nothing is left to estimate once the queue is done.
 */
export function progressLine(p: {
  done: number;
  queued: number;
  maxPages: number;
  elapsedMs: number;
  route: string;
  detail: string;
}): string {
  const total = Math.min(p.queued, p.maxPages);
  const left = total - p.done;
  const minutes = left > 0 && p.done > 0 ? Math.max(1, Math.ceil(((p.elapsedMs / p.done) * left) / 60000)) : 0;
  return `${p.done}/${total} queued${minutes ? `, ~${minutes} min left` : ''} ${p.route} ${p.detail}`.trimEnd();
}

/** A route named like a sign-in page. */
export const isSignInRoute = (route: string) => SIGN_IN_ROUTE.test(route);

export const slug = (s: string | null | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function dedupeEdges(edges: UiEdge[]): UiEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const k = `${e.from}|${e.to}|${e.type}|${e.via}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** An incremental crawl's pages, edges and API calls merged into the previous model: re-crawled routes replace theirs. */
export function mergeIncremental(previous: UiModel, crawled: Pick<UiModel, 'pages' | 'edges' | 'api_calls'>) {
  const redone = new Set(crawled.pages.map((p) => p.route));
  const key = (c: { method: string; path: string; [k: string]: unknown }) => `${c.method} ${c.host}${c.path}`;
  const calls = new Map(crawled.api_calls.map((c) => [key(c), c]));
  for (const c of previous.api_calls ?? []) if (!calls.has(key(c))) calls.set(key(c), c);
  return {
    pages: [...previous.pages.filter((p) => !redone.has(p.route)), ...crawled.pages],
    edges: dedupeEdges([...previous.edges.filter((e) => !redone.has(e.from.split('::')[0])), ...crawled.edges]),
    api_calls: [...calls.values()],
  };
}

// ---- 0.7.0: the signed-out pass, merged before sign-in (R5)

/** Pages crawled at once when `application.crawl.concurrency` is not set (D4). 1 keeps the one-page-at-a-time crawl. */
export const DEFAULT_CONCURRENCY = 3;

/** How long the DOM must be still for a page to count as settled, up to `settle_ms` (item 10). */
export const QUIET_MS = 200;

type PassOut = { pages: UiPage[]; edges: UiEdge[] };

/**
 * Merges the signed-out crawl and the signed-in crawl into one set of screens, each with its `access`.
 * - content signed out and signed in: `both`, the signed-in page, plus the elements only the signed-out page showed
 *   marked `state: signed-out` (D2), so a sign-in case can still click "Sign in";
 * - content signed out, a redirect (or nothing) signed in: `public`, the signed-out page (`/login` keeps its fields);
 * - a redirect signed out, content signed in: `signed-in`, not a redirect;
 * - a redirect to the sign-in route signed out and nothing signed in: `signed-in`, as seen; any other redirect is
 *   an ordinary redirect, `public`.
 * A redirect's own edge is dropped whenever the other pass has the content, so no relation says "/login redirects".
 * Pass `signedIn` as null for a crawl with no signed-in pass, and `loginRoute` as null when no sign-in route is known.
 */
export function mergePasses(signedOut: PassOut, signedIn: PassOut | null, loginRoute: string | null): PassOut {
  const inB = new Map((signedIn?.pages ?? []).map((p) => [p.route, p]));
  const pages: UiPage[] = [];
  const dropRedirectOf = new Set<string>();
  const done = new Set<string>();
  for (const a of signedOut.pages) {
    done.add(a.route);
    const b = inB.get(a.route);
    if (!b) {
      const toSignIn = !!a.redirect_to && a.redirect_to === loginRoute;
      pages.push({ ...a, access: toSignIn ? 'signed-in' : 'public' });
      continue;
    }
    if (!a.redirect_to && !b.redirect_to) {
      const have = new Set((b.elements ?? []).map((e) => e.key));
      const extra: UiElement[] = (a.elements ?? [])
        .filter((e) => !have.has(e.key))
        .map((e) => ({ ...e, state: 'signed-out' }));
      pages.push({ ...b, access: 'both', elements: [...(b.elements ?? []), ...extra] });
    } else if (!a.redirect_to) {
      pages.push({ ...a, access: 'public' });
      dropRedirectOf.add(b.route);
    } else if (!b.redirect_to) {
      pages.push({ ...b, access: 'signed-in' });
      dropRedirectOf.add(a.route);
    } else {
      pages.push({ ...b, access: a.redirect_to === b.redirect_to ? 'both' : 'signed-in' });
    }
  }
  for (const b of signedIn?.pages ?? []) if (!done.has(b.route)) pages.push({ ...b, access: 'signed-in' as Access });
  const keep = (e: UiEdge) => !(e.type === 'redirect' && dropRedirectOf.has(e.from));
  return { pages, edges: dedupeEdges([...signedOut.edges, ...(signedIn?.edges ?? [])].filter(keep)) };
}

// ---- 0.7.0: what a hundred sibling pages say about the route rules (S1 hint)

const HEX = /^[0-9a-f]+$/i;

/** Whether a path segment looks like an ID rather than a word: a UUID, a long hex value, or a code with a digit. */
function idLike(seg: string): boolean {
  if (seg.startsWith(':')) return false; // already normalised
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return true;
  if (seg.length >= 8 && HEX.test(seg)) return true;
  return seg.length >= 6 && /\d/.test(seg) && /^[A-Za-z0-9_-]+$/.test(seg);
}

/** How many sibling pages differing in one ID-like segment make a hint. */
export const ID_HINT_SIBLINGS = 5;

/**
 * A hint for each place where many crawled routes differ only in one ID-like segment (the crawl's `route_normalization`
 * did not collapse them), naming the rule to add. Empty when there is none.
 */
export function idHints(routes: string[]): string[] {
  const groups = new Map<string, { at: number; segs: string[]; values: Set<string> }>();
  for (const route of routes) {
    const path = route.split(/[?#]/)[0];
    const segs = path.split('/');
    segs.forEach((seg, at) => {
      if (!seg || !idLike(seg)) return;
      const shape = segs.map((x, i) => (i === at ? '*' : x)).join('/');
      const g = groups.get(shape) ?? { at, segs, values: new Set<string>() };
      g.values.add(seg);
      groups.set(shape, g);
    });
  }
  const hints: string[] = [];
  for (const [shape, g] of groups) {
    if (g.values.size < ID_HINT_SIBLINGS) continue;
    const sample = [...g.values].sort()[0];
    const pattern = /^[0-9a-f]{8}-/i.test(sample)
      ? '/[0-9a-fA-F]{8}-[0-9a-fA-F-]{27}(?=/|$)'
      : HEX.test(sample) && sample.length >= 8
        ? `/[0-9a-fA-F]{${sample.length}}(?=/|$)`
        : `/(?=[A-Za-z_-]*\\d)[A-Za-z0-9_-]{${sample.length},}(?=/|$)`;
    hints.push(
      `${g.values.size} pages differ only in an ID-like segment (${shape.replace('*', sample)} ...): add { "pattern": ${JSON.stringify(pattern)}, "replace": "/:id" } to application.route_normalization so they count as one screen`,
    );
  }
  return hints;
}

// ---- 0.7.0: --routes <glob...>

/** A route glob as a RegExp: `*` stays inside a path segment, `**` crosses them, `?` is one character. */
export function routeGlob(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\uE000')
    .replace(/\*/g, '[^/]*')
    .replace(/\uE000/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${re}$`);
}

/** The routes among `known` that any of the globs matches, in order. */
export function matchRoutes(globs: string[], known: string[]): string[] {
  const res = globs.map(routeGlob);
  return known.filter((r) => res.some((re) => re.test(r)));
}

/** Why the signed-in pass did not run, when it is nothing to warn about: the person chose it, or the app has no sign-in. */
export const SKIPPED_BY_CHOICE = 'login mode is none';
export const SKIPPED_PUBLIC = 'no sign-in was needed';

/** 0.8.0 item 20: the one warning line for a signed-in pass that was skipped for want of an account or a way to sign in. */
export function passWarnings(passes: CrawlPass[] | undefined): string[] {
  const skipped = (passes ?? []).find((p) => p.name === 'signed-in' && 'skipped' in p) as
    | { skipped: string }
    | undefined;
  if (!skipped || skipped.skipped === SKIPPED_BY_CHOICE || skipped.skipped === SKIPPED_PUBLIC) return [];
  return [`the signed-in pass was skipped: ${skipped.skipped}; the screens behind the sign-in are not in this DSM`];
}
