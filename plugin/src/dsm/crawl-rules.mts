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
import type { UiEdge, UiModel } from '../shared/models.mts';

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
  };
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
export type LoginState = { password: boolean; userOnly: boolean; otp: boolean; message: string };

const SIGN_IN_ROUTE = /(^|[/#_-])(log-?in|sign-?in|auth|sso|account\/login)([/?#_-]|$)/i;

/**
 * Whether a page is a sign-in page (fix 1). A visible password field is enough. A username-only or code-only form
 * (two-step sign-in, OTP) counts only on the known sign-in route, or before that is known, on a route named like
 * one. A settings form with an email field is never a sign-in page.
 */
export function isSignInPage(state: LoginState, route: string | null, loginRoute: string | null): boolean {
  if (state.password) return true;
  if (!state.userOnly && !state.otp) return false;
  if (route === null) return false;
  return loginRoute !== null ? route === loginRoute : SIGN_IN_ROUTE.test(route);
}

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
