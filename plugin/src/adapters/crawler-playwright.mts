/**
 * The UI crawl for the DSM, with Playwright's Chromium (Crawler, Q4). Ported from Autonomous-QE 0.2.0's crawl_ui.mjs
 * without its secrets vault (Q16). It signs in, explores breadth-first, records every page's elements, forms, dialogs
 * and navigations, and returns the ui-model. It never writes a file except the saved session (Q16 amendment).
 *
 * Safety (Q15): forms are recorded, never submitted; clicks whose text is on the deny list are skipped; confirm and
 * alert dialogs are dismissed; and after sign-in every write to any host is blocked. The decisions live in
 * dsm/crawl-rules.mts, which fixes the three ways Autonomous-QE's crawl could change data.
 *
 * Playwright comes from the QA project's node_modules (installed by qam setup), so the plugin has no runtime
 * dependency (Q1). The code that runs inside the page is plain JavaScript, in the strings below.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Browser, BrowserContext, Page, Request, Response } from 'playwright';
import {
  blocks,
  type CrawlApp,
  DEFAULT_CLICK_SELECTORS,
  DEFAULT_CONCURRENCY,
  DEFAULT_DENY,
  dedupeEdges,
  type GuardPhase,
  isBrowserClosedError,
  isSignInPage,
  isSignInRoute,
  type LoginState,
  MAX_BROWSER_RESTARTS,
  mergeIncremental,
  mergePasses,
  progressLine,
  QUIET_MS,
  RETRY_503_MS,
  Routes,
  slug,
} from '../dsm/crawl-rules.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CrawlOptions, UiEdge, UiElement, UiForm, UiModel, UiPage } from '../shared/models.mts';
import type { Crawler } from './base.mts';

export type CrawlerSettings = {
  app: CrawlApp;
  projectDir: string; // Playwright is loaded from here
  authDir: string | null; // the saved session goes here; null never saves
  credentials: { username?: string; password?: string };
  ask?: (question: string, hidden: boolean) => Promise<string>; // prompts in a terminal, when there is one
  log?: (line: string) => void;
  retry503Ms?: number[]; // waits between retries of a 503 page; tests shorten them
};

type Playwright = { chromium: { launch(o: { headless: boolean }): Promise<Browser> } };
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
type LoginInfo = {
  mode: string;
  required?: boolean;
  session?: string;
  login_route?: string | null;
  landed_route?: string | null;
};
type PassName = 'signed-out' | 'signed-in';
type QueueItem = { url: string; route: string; depth: number; from: string | null; how: string };
type ItemResult = { item: QueueItem; rec: UiPage; edges: UiEdge[]; found: QueueItem[]; closed: string | null };
type PassOut = { pages: UiPage[]; edges: UiEdge[]; pending: string[]; restarts: number; recrawled: string[] };
/** What a pass of the crawl is given by crawl(): waiting, signing in, a new browser, and what is shared by both passes. */
type Handles = {
  settle: (p: Page) => Promise<void>;
  signInHere: (p: Page) => Promise<boolean>;
  reSignIn: (p: Page) => Promise<void>;
  restart: () => Promise<BrowserContext>;
  observe: (c: BrowserContext) => void;
  login: { route: string | null };
  warned: { signIn: boolean };
};
type ApiCall = UiModel['api_calls'][number] & {
  host: string;
  query_keys: string[];
  statuses: number[];
  pages: string[];
};

/** Loads Playwright from the QA project, or from beside the plugin (development). */
export function loadPlaywright(projectDir: string): Playwright {
  for (const base of [path.join(projectDir, 'package.json'), import.meta.filename]) {
    try {
      return createRequire(base)('playwright') as Playwright;
    } catch {
      // try the next place
    }
  }
  throw new BlockedError(
    `Playwright isn't installed in ${projectDir}. Run qam setup, or there: npm install -D playwright && npx playwright install chromium.`,
  );
}

// ---- code that runs inside the page (plain JavaScript)

const VISIBLE = `(el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }`;
const CSS_PATH = `(el) => {
  if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id;
  const parts = []; let node = el;
  while (node && node.nodeType === 1 && parts.length < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id && /^[A-Za-z][\\w-]*$/.test(node.id)) { parts.unshift('#' + node.id); break; }
    const parent = node.parentElement;
    if (parent) { const same = [...parent.children].filter((c) => c.tagName === node.tagName);
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'; }
    parts.unshift(part); node = parent;
  }
  return parts.join(' > '); }`;

/** Helpers the code that runs in the page shares: visibility, selectors, test attributes, and one field's facts. */
const HELPERS = `
  const fieldSel = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea';
  const visible = ${VISIBLE}; const cssPath = ${CSS_PATH};
  const text = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.title || el.getAttribute('alt') || '')
    .trim().replace(/\\s+/g, ' ').slice(0, 80);
  const TEST_ATTRS = ['data-testid', 'data-test', 'data-test-id', 'data-qa', 'data-cy', 'data-automation-id', 'testid'];
  const attrs = (el) => { const out = {};
    for (const a of TEST_ATTRS) { const v = el.getAttribute(a); if (v) { out.test_attr = a; out.test_id = v; break; } }
    const role = el.getAttribute('role'); if (role) out.role = role;
    const aria = el.getAttribute('aria-label'); if (aria) out.aria_label = aria.slice(0, 80);
    if (el.placeholder) out.placeholder = String(el.placeholder).slice(0, 80);
    if (el.getAttribute('name')) out.name_attr = el.getAttribute('name');
    return out; };
  const labelOf = (el) => {
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return l.innerText.trim().replace(/\\s+/g, ' ').slice(0, 80); }
    const wrap = el.closest('label'); if (wrap) return wrap.innerText.trim().replace(/\\s+/g, ' ').slice(0, 80);
    return el.getAttribute('aria-label') || el.placeholder || el.getAttribute('formcontrolname') || el.name || el.id || ''; };
  // min and max as the page declares them: a number for number and range inputs, else the text (a date)
  const limit = (el, name) => { const v = el.getAttribute(name); if (v === null || v === '') return null;
    const t = (el.getAttribute('type') || '').toLowerCase();
    return (t === 'number' || t === 'range') && isFinite(Number(v)) ? Number(v) : v; };
  const field = (el) => ({ tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || el.tagName).toLowerCase(),
    name: el.name || el.getAttribute('formcontrolname') || el.getAttribute('ng-model') || '', id: el.id || '',
    label: labelOf(el), required: el.required || el.getAttribute('aria-required') === 'true',
    minlength: el.minLength > 0 ? el.minLength : null, maxlength: el.maxLength > 0 ? el.maxLength : null,
    min: limit(el, 'min'), max: limit(el, 'max'), pattern: el.getAttribute('pattern') || null,
    options: el.tagName === 'SELECT' ? el.options.length : null, visible: visible(el), selector: cssPath(el), ...attrs(el) });
`;

/** Every element the DSM records, with selectors, visibility and stable test attributes. */
const EXTRACT = `(() => {
  ${HELPERS}
  const navAncestor = 'nav, [role=navigation], header, aside, .sidebar, .side-nav, .menu, .navbar';
  const links = [...document.querySelectorAll('a[href], area[href]')].map((a) => ({ text: text(a), href: a.href,
    raw: a.getAttribute('href'), target: a.target || '', visible: visible(a), inNav: !!a.closest(navAncestor), selector: cssPath(a), ...attrs(a) }));
  const forms = [...document.querySelectorAll('form')].map((f, i) => ({ id: f.id || '', name: f.getAttribute('name') || '', index: i,
    action: f.getAttribute('action') ? f.action : '', method: (f.getAttribute('method') || 'get').toLowerCase(),
    selector: cssPath(f), visible: visible(f), fields: [...f.querySelectorAll(fieldSel)].map(field),
    submits: [...f.querySelectorAll('button:not([type=button]):not([type=reset]), input[type=submit]')].map(text) }));
  const looseFields = [...document.querySelectorAll(fieldSel)].filter((el) => !el.closest('form') && visible(el)).map(field);
  const buttons = [...document.querySelectorAll('button, [role=button], input[type=button], input[type=submit], input[type=reset]')]
    .filter((b) => b.tagName !== 'A').map((b) => ({ text: text(b), type: (b.getAttribute('type') || 'button').toLowerCase(), id: b.id || '',
      visible: visible(b), disabled: !!b.disabled, inForm: !!b.closest('form'), selector: cssPath(b), ...attrs(b) }));
  const tabs = [...document.querySelectorAll('[role=tab]')].map((t) => ({ text: text(t), visible: visible(t), selector: cssPath(t), ...attrs(t) }));
  const menus = [...document.querySelectorAll('[role=menuitem]')].map((t) => ({ text: text(t), visible: visible(t), selector: cssPath(t), ...attrs(t) }));
  const headings = [...document.querySelectorAll('h1, h2')].slice(0, 5).map((h) => text(h)).filter(Boolean);
  const firstOf = (tag) => { const h = [...document.querySelectorAll(tag)].find((x) => visible(x) && text(x)); return h ? text(h) : ''; };
  const heading = firstOf('h1') || firstOf('h2') || null;
  const tables = [...document.querySelectorAll('table, [role=grid]')].map((t) => ({ selector: cssPath(t),
    columns: [...t.querySelectorAll('th, [role=columnheader]')].slice(0, 40).map(text).filter(Boolean) }));
  // what the page says, as a short hash: a single-page app's shell says the same on every path, a static site's pages don't
  const body = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < body.length; i++) h = ((h * 33) ^ body.charCodeAt(i)) >>> 0;
  const textHash = body ? h.toString(36) + ':' + body.length : '';
  return { title: document.title, headings, heading, textHash, links, forms, looseFields, buttons, tabs, menus, tables };
})()`;

/** Clickable elements without a link, to find menus, dialogs and JavaScript navigation. */
const CLICK_CANDIDATES = (selectors: string[]) => `(() => {
  const visible = ${VISIBLE}; const cssPath = ${CSS_PATH}; const seen = new Set(); const out = [];
  for (const sel of ${JSON.stringify(selectors)}) {
    let nodes = []; try { nodes = [...document.querySelectorAll(sel)]; } catch { continue; }
    for (const el of nodes) {
      if (!visible(el) || el.disabled || (el.closest('form') && el.type === 'submit')) continue;
      const selector = cssPath(el); if (seen.has(selector)) continue; seen.add(selector);
      out.push({ selector, text: (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 80) });
    }
  }
  return out; })()`;

/**
 * Clickable cards (0.7.0 item 3, R7) and sidebar items: an element with a pointer cursor and no link or role, found by
 * its computed style because the crawler cannot see a React onClick. Only the outermost element of a pointer region
 * counts. Outside a nav or aside, one card per group of repeated siblings (same parent, tag and class); in a nav or
 * aside every item. A card's text leaves out the buttons and links inside it, so a "Delete" in it does not hide it.
 */
const CARD_CANDIDATES = `(() => {
  ${HELPERS}
  const navAncestor = 'nav, [role=navigation], aside, .sidebar, .side-nav, .menu, .navbar';
  const area = innerWidth * innerHeight; const groups = new Set(); const out = [];
  for (const el of document.body ? document.body.querySelectorAll('*') : []) {
    if (el.closest('svg') || el.matches('a[href], button, input, select, textarea, label, summary, option, [role]')) continue;
    if (el.closest('a[href], button, [role=button], [role=link]') || getComputedStyle(el).cursor !== 'pointer') continue;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === 'pointer') continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.width < 24 || r.height < 16 || r.width * r.height > area * 0.8) continue;
    const inNav = !!el.closest(navAncestor);
    if (!inNav) { const g = cssPath(parent) + '>' + el.tagName + '.' + el.className; if (groups.has(g)) continue; groups.add(g); }
    const copy = el.cloneNode(true); copy.querySelectorAll('button, a, [role=button], input, select, textarea').forEach((n) => n.remove());
    out.push({ selector: cssPath(el), text: (copy.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80), card: !inNav, inNav });
  }
  return out; })()`;

/** In the page: a point inside a card where a click lands on the card itself, never on a button or link in it (offsets from its corner). */
const SAFE_POINT = (el: Element) => {
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  for (const fy of [0.5, 0.25, 0.75, 0.12, 0.88]) {
    for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (!hit || !el.contains(hit)) continue;
      const inner = hit.closest(
        'a[href], button, input, select, textarea, label, [role=button], [role=link], [onclick]',
      );
      if (inner && inner !== el && el.contains(inner)) continue;
      return { x: r.width * fx, y: r.height * fy };
    }
  }
  return null;
};

const OPEN_DIALOGS = `(() => {
  ${HELPERS}
  const sel = '[role=dialog], [role=alertdialog], dialog[open], .modal.show, .modal.in, mat-dialog-container, .cdk-overlay-pane, .k-window, .ui-dialog';
  const CANCEL = /^(cancel|close|dismiss|back|no|x|\\u00d7)$/i;
  return [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }).map((el) => {
    const title = el.querySelector('h1, h2, h3, h4, .modal-title, [mat-dialog-title], .k-window-title, .ui-dialog-title');
    const buttons = [...el.querySelectorAll('button, [role=button], input[type=submit], input[type=button]')].map(text).filter(Boolean).slice(0, 10);
    const form = el.querySelector('form');
    const submits = form ? [...form.querySelectorAll('button:not([type=button]):not([type=reset]), input[type=submit]')].map(text).filter(Boolean)
      : buttons.filter((b) => !CANCEL.test(b)).slice(-1);
    return { title: (title ? title.innerText : el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
      fields: el.querySelectorAll('input:not([type=hidden]), select, textarea').length, buttons,
      form: { fields: [...el.querySelectorAll(fieldSel)].filter(visible).map(field), submits } }; }); })()`;

/** What the page shows that looks like signing in. crawl-rules decides whether it is a sign-in page. */
const LOGIN_STATE = `(() => {
  const vis = ${VISIBLE};
  const inputs = [...document.querySelectorAll('input')].filter(vis);
  const password = inputs.find((i) => i.type === 'password');
  const userRe = /user|email|login|account|emp(loyee)?[\\s_-]?(id|code)|uname|mobile|phone/i;
  const user = inputs.find((i) => ['email', 'text', 'tel'].includes(i.type) && (i.autocomplete === 'username' || i.type === 'email' ||
    userRe.test([i.name, i.id, i.placeholder, i.getAttribute('aria-label'), i.getAttribute('formcontrolname')].join(' '))));
  const otpRe = /otp|one.?time|verification|verify|passcode|2fa|mfa|totp|security code|auth(entication)? code/i;
  const otp = inputs.find((i) => i.type !== 'password' && (i.autocomplete === 'one-time-code' ||
    otpRe.test([i.name, i.id, i.placeholder, i.getAttribute('aria-label')].join(' ')) ||
    (i.closest('form') && otpRe.test(i.closest('form').innerText || '') && i.maxLength > 0 && i.maxLength <= 8)));
  const alertEl = [...document.querySelectorAll('[role=alert], .error, .alert-danger, .text-danger, .invalid-feedback, .validation-summary-errors')].find(vis);
  return { password: !!password, passwords: inputs.filter((i) => i.type === 'password').length, userOnly: !password && !!user && !otp, otp: !!otp && !password,
    message: alertEl ? alertEl.innerText.trim().replace(/\\s+/g, ' ').slice(0, 160) : '' }; })()`;

type Extracted = {
  title: string;
  headings: string[];
  heading: string | null;
  textHash: string;
  links: {
    text: string;
    href: string;
    raw: string | null;
    visible: boolean;
    inNav: boolean;
    selector: string;
    [k: string]: unknown;
  }[];
  forms: {
    id: string;
    name: string;
    index: number;
    action: string;
    method: string;
    fields: { name: string; id: string; label: string; [k: string]: unknown }[];
    [k: string]: unknown;
  }[];
  looseFields: { name: string; id: string; label: string; [k: string]: unknown }[];
  buttons: { text: string; id: string; selector: string; [k: string]: unknown }[];
  tabs: { text: string; selector: string; [k: string]: unknown }[];
  menus: { text: string; selector: string; [k: string]: unknown }[];
  tables: unknown[];
};
type DialogField = { name: string; id: string; label: string; [k: string]: unknown };
type Dialog = {
  title: string;
  fields: number;
  buttons: string[];
  form: { fields: DialogField[]; submits: string[] };
};

/** Requests that can still change what a page shows: its own documents, scripts, styles and data calls. */
const COUNTED = new Set(['document', 'script', 'stylesheet', 'xhr', 'fetch']);

/** In the page: resolves when the DOM has not changed for `quiet` ms, or after `cap` ms at the latest. */
const QUIET_DOM = ({ quiet, cap }: { quiet: number; cap: number }) =>
  new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quiet);
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout(done, quiet);
    setTimeout(done, cap);
  });

const SIGN_UP = /\b(sign ?up|register|create (an )?account)\b/i;

// ---- the crawler

/** What a page shows, without its route: its elements' keys minus the `<route>::` prefix, and its form field labels. */
function pageSignature(p: UiPage): string {
  const prefix = `${p.route}::`;
  const parts = (p.elements ?? []).map((e) => (e.key.startsWith(prefix) ? e.key.slice(prefix.length) : e.key));
  for (const f of p.forms ?? []) for (const field of f.fields ?? []) parts.push(`field:${field.label ?? ''}`);
  return [...new Set(parts)].sort().join('\n');
}

/**
 * A page's title, headings and a hash of its visible text: pages that share a menu (the same elements) still differ
 * here, even when the title and the site-wide h1 are the same too (0.4.2 W3, found on dummy-static-website).
 */
const pageHeading = (p: UiPage) => [p.title ?? '', ...(p.headings ?? []), String(p.text_hash ?? '')].join('\n');

/**
 * A single-page app answers 200 with the same shell for any path, so a code-seeded route that shows exactly the start
 * page's elements, title, headings and text is not a screen. Drops those pages and their edges. Pages found by a link, errors and redirects stay.
 */
export function dropShellPages(
  pages: UiPage[],
  edges: UiEdge[],
  startRoute: string,
): { pages: UiPage[]; edges: UiEdge[]; dropped: string[] } {
  const start = pages.find((p) => p.route === startRoute);
  const shell = start ? pageSignature(start) : '';
  if (!shell) return { pages, edges, dropped: [] };
  const heading = start ? pageHeading(start) : '';
  const isShell = (p: UiPage) =>
    p.discovered_by === 'code-seed' &&
    !p.error &&
    !p.redirect_to &&
    pageSignature(p) === shell &&
    pageHeading(p) === heading;
  const dropped = pages.filter(isShell).map((p) => p.route);
  if (!dropped.length) return { pages, edges, dropped };
  return {
    pages: pages.filter((p) => !dropped.includes(p.route)),
    edges: edges.filter((e) => !dropped.includes(e.from) && !dropped.includes(e.to)),
    dropped,
  };
}

export class PlaywrightCrawler implements Crawler {
  private readonly s: CrawlerSettings;

  constructor(settings: CrawlerSettings) {
    this.s = settings;
  }

  private log(line: string) {
    this.s.log?.(`[dsm-crawl] ${line}`);
  }

  async crawl(opts: CrawlOptions): Promise<UiModel> {
    const { app } = this.s;
    const pw = loadPlaywright(this.s.projectDir);
    const routes = new Routes(app, opts.baseUrl);
    const login = app.login ?? {};
    const mode = opts.loginMode ?? login.mode ?? 'auto';
    const timeout = app.page_timeout_ms ?? 30000;
    const settleMs = app.settle_ms ?? 1200;
    const concurrency = Math.max(1, Math.floor(Number(app.crawl?.concurrency) || DEFAULT_CONCURRENCY));
    const configuredLoginRoute = login.url ? routes.routeOf(new URL(login.url, routes.base).href) : null;
    const authFile = this.s.authDir && login.save_session !== false ? path.join(this.s.authDir, 'state.json') : null;
    const startedAt = Date.now();

    let phase: GuardPhase = 'signing-in';
    const loginRef: { route: string | null } = { route: configuredLoginRoute };
    const blocked: { method: string; url: string }[] = [];
    const launch = () => pw.chromium.launch({ headless: app.headless !== false });
    let browser = await launch();

    // requests still in flight per page, so a page is not settled while its data is on the way (item 10)
    const pending = new WeakMap<Page, number>();
    const timing = { waits: 0, ms: 0 };
    const settle = async (page: Page) => {
      const t0 = Date.now();
      const netCap = Math.min(timeout, 10000);
      await page.waitForLoadState('load', { timeout: netCap }).catch(() => {});
      // one deadline for every round: a long-poll request never costs more than the network cap plus settle_ms
      const deadline = Date.now() + netCap + settleMs;
      for (let round = 0; round < 3; round++) {
        while ((pending.get(page) ?? 0) > 0 && Date.now() < deadline - settleMs) await page.waitForTimeout(50);
        const left = Math.min(settleMs, deadline - Date.now());
        if (left > 0) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await page.evaluate(QUIET_DOM, { quiet: Math.min(QUIET_MS, left), cap: left });
              break;
            } catch {
              await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {}); // it navigated
            }
          }
        }
        if ((pending.get(page) ?? 0) === 0 || Date.now() >= deadline) break; // nothing started, or out of time
      }
      timing.waits++;
      timing.ms += Date.now() - t0;
    };
    const frameRoute = (req: Request) => {
      try {
        return routes.routeOf(req.frame().url());
      } catch {
        return null; // a service worker request has no frame
      }
    };
    const count = (req: Request, by: number) => {
      try {
        if (!COUNTED.has(req.resourceType())) return;
        const pg = req.frame().page();
        pending.set(pg, Math.max(0, (pending.get(pg) ?? 0) + by));
      } catch {
        // a service worker request has no page
      }
    };
    const makeContext = async (storageState?: StorageState) => {
      const ctx = await browser.newContext({
        ignoreHTTPSErrors: !!app.ignore_https_errors,
        viewport: { width: 1440, height: 900 },
        ...(storageState ? { storageState } : {}),
      });
      ctx.on('request', (r) => count(r, 1));
      ctx.on('requestfinished', (r) => count(r, -1));
      ctx.on('requestfailed', (r) => count(r, -1));
      await ctx.route('**/*', (route) => {
        const req = route.request();
        if (blocks({ method: req.method(), url: req.url(), frameRoute: frameRoute(req) }, phase, loginRoute(), app)) {
          blocked.push({ method: req.method(), url: req.url().slice(0, 200) });
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      return ctx;
    };
    const loginRoute = () => loginRef.route;
    const loginState = (page: Page) => page.evaluate(LOGIN_STATE) as Promise<LoginState>;
    const signInHere = async (page: Page) =>
      isSignInPage(await loginState(page), routes.routeOf(page.url()), loginRef.route);

    // API calls the UI makes: method, path, statuses and response keys, never values. Pages run side by side, so
    // what each call collects is a set and is sorted when the crawl ends.
    const apiHosts = new Set(app.api_hosts ?? []);
    const apiCalls = new Map<string, ApiCall>();
    const apiSets = new Map<string, { pages: Set<string>; keys: Set<string> }>();
    const observe = (ctx: BrowserContext) =>
      ctx.on('response', async (resp: Response) => {
        try {
          const req = resp.request();
          if (!['xhr', 'fetch'].includes(req.resourceType())) return;
          const u = new URL(req.url());
          if (!routes.isAppHost(u.host) && !apiHosts.has(u.host)) return;
          const pathNorm = u.pathname
            .replace(/\/\d+(?=\/|$)/g, '/{id}')
            .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/{id}');
          const key = `${req.method()} ${u.host}${pathNorm}`;
          const rec: ApiCall = apiCalls.get(key) ?? {
            method: req.method(),
            host: u.host,
            path: pathNorm,
            query_keys: [],
            statuses: [],
            pages: [],
            content_type: null,
            response_keys: [],
          };
          const sets = apiSets.get(key) ?? { pages: new Set<string>(), keys: new Set<string>() };
          apiSets.set(key, sets);
          apiCalls.set(key, rec);
          for (const k of u.searchParams.keys()) if (!rec.query_keys.includes(k)) rec.query_keys.push(k);
          if (!rec.statuses.includes(resp.status())) rec.statuses.push(resp.status());
          const from = frameRoute(req);
          if (from) sets.pages.add(from);
          const ct = resp.headers()['content-type'] || '';
          rec.content_type = ct.split(';')[0] || rec.content_type;
          if (/json/.test(ct) && !sets.keys.size) {
            const body = await resp.json().catch(() => null);
            const sample = Array.isArray(body) ? body[0] : body;
            if (sample && typeof sample === 'object')
              for (const k of Object.keys(sample).slice(0, 40)) sets.keys.add(k);
            if (Array.isArray(body)) rec.response_is_array = true;
          }
        } catch {
          // observing must never break the crawl
        }
      });

    const warned = { signIn: false };
    let current: BrowserContext | null = null;
    let reSigningIn: Promise<void> | null = null;
    const savedState = (): StorageState | undefined => {
      try {
        return authFile && fs.existsSync(authFile) ? JSON.parse(fs.readFileSync(authFile, 'utf8')) : undefined;
      } catch {
        return undefined;
      }
    };
    const handles = (restart: () => Promise<BrowserContext>): Handles => ({
      settle,
      signInHere,
      observe,
      login: loginRef,
      warned,
      restart,
      // one page signs in again; the others wait for it, and carry on with the shared session
      reSignIn: async (page: Page) => {
        if (!reSigningIn) {
          reSigningIn = (async () => {
            phase = 're-signing-in';
            try {
              await this.signIn(page, settle, loginState, routes, loginRoute);
            } finally {
              phase = 'crawling'; // fix 2: back on even when signing in fails
              reSigningIn = null;
            }
            if (authFile && current) this.saveSession(authFile, await current.storageState());
          })();
        }
        await reSigningIn;
      },
    });

    try {
      const signedOutPass = mode === 'none' || login.signed_out_pass !== false;
      let passA: PassOut | null = null;
      let passB: PassOut | null = null;
      let info: LoginInfo = { mode, required: false };
      if (signedOutPass) {
        // signed out first: writes are blocked from the start, and no form is ever submitted (Q15)
        phase = 'crawling';
        const first = await makeContext(); // explore() observes it
        let ctxA = first;
        passA = await this.explore(
          first,
          opts,
          routes,
          { mode, required: false },
          handles(async () => {
            await browser.close().catch(() => {});
            browser = await launch();
            ctxA = await makeContext();
            return ctxA;
          }),
          'signed-out',
          [],
          concurrency,
        );
        await ctxA.close().catch(() => {});
      }
      if (mode !== 'none') {
        phase = 'signing-in';
        const ensure = (startUrl?: string) =>
          this.ensureLogin(
            (page) => settle(page),
            makeContext,
            routes,
            mode,
            authFile,
            loginState,
            signInHere,
            startUrl,
          );
        let ensured = await ensure();
        // what the signed-out pass saw redirected to sign-in is crawled signed in too, even when nothing links to it
        const gatedBy = (r: string | null) => (passA?.pages ?? []).filter((p) => p.redirect_to && p.redirect_to === r);
        const canSignIn =
          mode === 'manual' || !!this.s.ask || !!(this.s.credentials.username && this.s.credentials.password);
        if (!ensured.info.required && !login.url && loginRef.route && canSignIn) {
          // the start page is public, but the signed-out pass found a sign-in route: sign in from there instead
          // (with no way to sign in, the crawl stays signed out and warns once, as before)
          const via = gatedBy(loginRef.route)[0] ?? (passA?.pages ?? []).find((p) => p.route === loginRef.route);
          if (via) {
            await ensured.context.close().catch(() => {});
            ensured = await ensure(via.url);
          }
        }
        info = ensured.info;
        loginRef.route = info.login_route ?? loginRef.route;
        if (!signedOutPass || info.required) {
          phase = 'crawling';
          current = ensured.context; // explore() observes it
          const gated = gatedBy(loginRef.route);
          passB = await this.explore(
            current,
            opts,
            routes,
            info,
            handles(async () => {
              await browser.close().catch(() => {});
              browser = await launch();
              current = await makeContext(savedState());
              return current;
            }),
            'signed-in',
            gated.map((p) => ({ url: p.url, route: p.route, depth: 1, from: null, how: 'signed-out-pass' })),
            concurrency,
          );
        }
      }
      return this.finish(opts, routes, info, passA, passB, {
        apiCalls,
        apiSets,
        blocked,
        loginRoute: loginRef.route,
        signedOutPass,
        elapsed: Date.now() - startedAt,
        timing,
        concurrency,
      });
    } finally {
      await browser.close();
    }
  }

  /** The model of a crawl: the signed-out and signed-in passes merged (R5), sorted so any order of pages gives one result. */
  private finish(
    opts: CrawlOptions,
    routes: Routes,
    info: LoginInfo,
    passA: PassOut | null,
    passB: PassOut | null,
    c: {
      apiCalls: Map<string, ApiCall>;
      apiSets: Map<string, { pages: Set<string>; keys: Set<string> }>;
      blocked: { method: string; url: string }[];
      loginRoute: string | null;
      signedOutPass: boolean;
      elapsed: number;
      timing: { waits: number; ms: number };
      concurrency: number;
    },
  ): UiModel {
    const previous = opts.previous ?? null;
    const onlyRoutes = opts.routes?.length ? opts.routes : null;
    const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    let { pages: outPages, edges: outEdges } = passA ? mergePasses(passA, passB, c.loginRoute) : (passB as PassOut);
    const crawledRoutes = [...new Set([...(passA?.recrawled ?? []), ...(passB?.recrawled ?? [])])].sort(byText);
    let outCalls = [...c.apiCalls].map(([key, rec]) => {
      const sets = c.apiSets.get(key);
      return {
        ...rec,
        query_keys: [...rec.query_keys].sort(byText),
        statuses: [...rec.statuses].sort((a, b) => a - b),
        pages: [...(sets?.pages ?? [])].sort(byText).slice(0, 20),
        response_keys: [...(sets?.keys ?? [])].sort(byText).slice(0, 40),
      };
    }) as UiModel['api_calls'];
    if (onlyRoutes && previous) {
      ({
        pages: outPages,
        edges: outEdges,
        api_calls: outCalls,
      } = mergeIncremental(previous, { pages: outPages, edges: outEdges, api_calls: outCalls }));
    }
    const pending = [...new Set([...(passA?.pending ?? []), ...(passB?.pending ?? [])])];
    const login: LoginInfo & { signed_out_pass?: boolean } = {
      ...info,
      ...(info.login_route || !c.loginRoute ? {} : { login_route: c.loginRoute }),
      signed_out_pass: c.signedOutPass,
    };
    return {
      generated_at: (opts.now ?? new Date()).toISOString(),
      base_url: routes.base.href,
      hash_routing: routes.hashRouting,
      mode: onlyRoutes ? 'incremental' : 'full',
      recrawled_routes: crawledRoutes,
      login,
      browser_restarts: (passA?.restarts ?? 0) + (passB?.restarts ?? 0),
      truncated: pending.length > 0,
      pending_routes: pending,
      blocked_requests: c.blocked.sort((a, b) => byText(`${a.method} ${a.url}`, `${b.method} ${b.url}`)).slice(0, 200),
      timing: {
        elapsed_ms: c.elapsed,
        pages: (passA?.pages.length ?? 0) + (passB?.pages.length ?? 0),
        concurrency: c.concurrency,
        settle_waits: c.timing.waits,
        settle_ms: c.timing.ms,
      },
      pages: outPages.sort((a, b) => byText(a.route, b.route)),
      edges: outEdges,
      api_calls: outCalls.sort((a, b) => byText(a.path + a.method, b.path + b.method)),
    };
  }

  private saveSession(file: string, state: StorageState) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
    fs.writeFileSync(path.join(path.dirname(file), '.gitignore'), '*\n');
  }

  private async ensureLogin(
    settle: (p: Page) => Promise<void>,
    makeContext: (s?: StorageState) => Promise<BrowserContext>,
    routes: Routes,
    mode: string,
    authFile: string | null,
    loginState: (p: Page) => Promise<LoginState>,
    signInHere: (p: Page) => Promise<boolean>,
    from?: string,
  ): Promise<{ context: BrowserContext; info: LoginInfo }> {
    const { app } = this.s;
    const timeout = app.page_timeout_ms ?? 30000;
    const startUrl = new URL(from || app.login?.url || app.start_paths?.[0] || '/', routes.base).href;
    if (mode === 'none') return { context: await makeContext(), info: { mode: 'none' } };
    let saved: StorageState | undefined;
    if (authFile && fs.existsSync(authFile)) {
      try {
        saved = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      } catch {
        saved = undefined;
      }
    }
    let context = await makeContext(saved);
    let page = await context.newPage();
    await page.goto(startUrl, { timeout, waitUntil: 'domcontentloaded' });
    await settle(page);
    if (!(await signInHere(page))) {
      const landed = routes.routeOf(page.url());
      await page.close();
      return {
        context,
        info: { mode, required: !!saved, session: saved ? 'reused' : 'not needed', landed_route: landed },
      };
    }
    if (saved) {
      // the saved session has expired
      await context.close();
      context = await makeContext();
      page = await context.newPage();
      await page.goto(startUrl, { timeout, waitUntil: 'domcontentloaded' });
      await settle(page);
    }
    const loginRoute = routes.routeOf(page.url());
    if (mode === 'manual') {
      await context.close();
      const { state, landed } = await this.manualSignIn(startUrl, loginState);
      if (authFile) this.saveSession(authFile, state);
      return {
        context: await makeContext(state),
        info: { mode, required: true, session: 'new', login_route: loginRoute, landed_route: routes.routeOf(landed) },
      };
    }
    await this.signIn(page, settle, loginState, routes, () => loginRoute);
    const landed = routes.routeOf(page.url());
    if (authFile) this.saveSession(authFile, await context.storageState());
    await page.close();
    return { context, info: { mode, required: true, session: 'new', login_route: loginRoute, landed_route: landed } };
  }

  private async credential(which: 'username' | 'password', label: string): Promise<string> {
    const value = this.s.credentials[which];
    if (value) return value;
    if (!this.s.ask) {
      const names = `${this.s.app.login?.username_env || 'DSM_APP_USERNAME'} / ${this.s.app.login?.password_env || 'DSM_APP_PASSWORD'}`;
      throw new BlockedError(
        `The application shows a sign-in page and there's no ${which}. Run qam dsm run in a terminal to be asked, use --login-mode manual to sign in in a browser window, or put ${names} in ${this.s.app.secrets_file || '.env.dsm'} (git-ignored).`,
      );
    }
    return this.s.ask(label, which === 'password');
  }

  /** Fills and submits the sign-in form on this page: one page or two steps, then up to two code (OTP) steps. */
  private async signIn(
    page: Page,
    settle: (p: Page) => Promise<void>,
    loginState: (p: Page) => Promise<LoginState>,
    routes: Routes,
    loginRoute: () => string | null,
  ) {
    const cfg = this.s.app.login ?? {};
    const wait = cfg.post_login_wait_ms ?? 3000;
    const userSel = [
      cfg.username_selector,
      'input[autocomplete=username]',
      'input[type=email]',
      'input[name*=user i]',
      'input[id*=user i]',
      'input[name*=email i]',
      'input[id*=email i]',
      'input[name*=login i]',
      'input[id*=login i]',
      'input[placeholder*=user i]',
      'input[placeholder*=email i]',
      'input[type=text]',
    ];
    const passSel = [cfg.password_selector, 'input[type=password]'];
    const otpSel = [
      'input[autocomplete=one-time-code]',
      'input[name*=otp i]',
      'input[id*=otp i]',
      'input[name*=code i]',
      'input[id*=code i]',
      'input[placeholder*=code i]',
      'input[placeholder*=otp i]',
      'input[type=tel]',
      'input[type=number]',
      'input[type=text]',
    ];
    const fillFirst = async (selectors: (string | undefined)[], value: string) => {
      for (const sel of selectors.filter((x): x is string => !!x)) {
        const loc = page.locator(sel).filter({ visible: true }).first();
        if (await loc.count().catch(() => 0)) {
          await loc.fill(value);
          return loc;
        }
      }
      return null;
    };
    const submit = async (field: Awaited<ReturnType<typeof fillFirst>>) => {
      if (cfg.submit_selector && (await page.locator(cfg.submit_selector).first().count())) {
        return page.locator(cfg.submit_selector).first().click();
      }
      const btn = page
        .locator(
          'button[type=submit], input[type=submit], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), button:has-text("Next"), button:has-text("Continue"), button:has-text("Verify")',
        )
        .filter({ visible: true })
        .first();
      if (await btn.count()) return btn.click();
      return field?.press('Enter');
    };
    const host = routes.base.host;
    this.log(`sign-in page at ${page.url()}`);
    const user = await this.credential('username', `Username for ${host}: `);
    let state = await loginState(page);
    if (state.userOnly) {
      await submit(await fillFirst(userSel, user));
      await page.waitForTimeout(800);
      await settle(page);
      state = await loginState(page);
    }
    if (state.password) {
      const pass = await this.credential('password', `Password for ${user}: `);
      await fillFirst(userSel, user);
      await submit(await fillFirst(passSel, pass));
      await page.waitForTimeout(wait);
      await settle(page);
    }
    for (let i = 0; i < 2; i++) {
      state = await loginState(page);
      if (!state.otp || !this.s.ask) break;
      const code = await this.s.ask(`One-time code for ${user}: `, false);
      await submit(await fillFirst(otpSel, code));
      await page.waitForTimeout(wait);
      await settle(page);
    }
    state = await loginState(page);
    if (isSignInPage(state, routes.routeOf(page.url()), loginRoute())) {
      throw new BlockedError(
        `Signing in didn't succeed${state.message ? `: "${state.message}"` : ''}. Check the username and password, or use --login-mode manual.`,
      );
    }
  }

  /** A visible browser where the person signs in themselves (SSO, MFA, CAPTCHA). Crawling starts once they're in. */
  private async manualSignIn(startUrl: string, loginState: (p: Page) => Promise<LoginState>) {
    const { app } = this.s;
    const limit = (app.login?.manual_timeout_s ?? 300) * 1000;
    this.log('a browser window is opening: sign in there; crawling starts once you are signed in');
    const pw = loadPlaywright(this.s.projectDir);
    const headed = await pw.chromium.launch({ headless: false });
    try {
      const ctx = await headed.newContext({ ignoreHTTPSErrors: !!app.ignore_https_errors });
      const page = await ctx.newPage();
      await page.goto(startUrl, { timeout: app.page_timeout_ms ?? 30000, waitUntil: 'domcontentloaded' });
      const deadline = Date.now() + limit;
      let sawLogin = false;
      while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        const st = await loginState(page).catch(() => null);
        if (!st) continue;
        if (st.password || st.userOnly || st.otp) {
          sawLogin = true;
          continue;
        }
        if (sawLogin) return { state: await ctx.storageState(), landed: page.url() };
      }
      throw new BlockedError(
        `Manual sign-in wasn't completed within ${limit / 1000}s. Run it again when you're ready.`,
      );
    } finally {
      await headed.close();
    }
  }

  /**
   * One pass of the crawl, breadth first in waves: every page queued so far is crawled (up to `concurrency` at once, each
   * in its own tab), then what they found is queued in the order the pages were queued. So depth, discovered_by and the
   * order of everything are the same whatever order the tabs finish in.
   */
  private async explore(
    context: BrowserContext,
    opts: CrawlOptions,
    routes: Routes,
    info: LoginInfo,
    h: Handles,
    name: PassName,
    extra: QueueItem[],
    concurrency: number,
  ): Promise<PassOut> {
    const { app } = this.s;
    const maxPages = app.max_pages ?? 300;
    const maxDepth = app.max_depth ?? 8;
    const login = app.login ?? {};
    const explore = app.explore_clicks ?? {};
    const deny = (explore.deny_text_patterns ?? DEFAULT_DENY).map((p) => new RegExp(`\\b${p}\\b`, 'i'));
    // signed out, a button that creates an account is never clicked either (writes are blocked as well, Q15)
    const denied = name === 'signed-out' ? [...deny, SIGN_UP] : deny;

    h.observe(context);
    const previous = opts.previous ?? null;
    const onlyRoutes = opts.routes?.length ? opts.routes : null;
    const pages = new Map<string, UiPage>();
    const edges: UiEdge[] = [];
    const visited = new Set<string>();
    const queue: QueueItem[] = [];
    const enqueue = (url: string, depth: number, from: string | null, how: string) => {
      const r = routes.routeOf(url);
      if (!r || visited.has(r) || !routes.allowed(url)) return;
      visited.add(r);
      queue.push({ url, route: r, depth, from, how });
    };
    const abs = (p: string) => new URL(p, routes.base).href;

    if (onlyRoutes && previous) {
      const prevUrl = new Map(previous.pages.map((p) => [p.route, p.url]));
      for (const p of previous.pages) if (!onlyRoutes.includes(p.route)) visited.add(p.route);
      for (const r of onlyRoutes) {
        const url = prevUrl.get(r) ?? (r.includes(':') ? null : abs(r));
        if (url) {
          visited.delete(r);
          enqueue(url, 0, null, 'recrawl');
        }
      }
    } else {
      if (name === 'signed-in' && h.login.route) visited.add(h.login.route); // never crawl back into the sign-in form
      if (name === 'signed-out' && login.url) enqueue(abs(login.url), 0, null, 'login');
      if (info.landed_route) enqueue(abs(info.landed_route), 0, null, 'login');
      for (const p of app.start_paths ?? ['/']) enqueue(abs(p), 0, null, 'start');
    }
    for (const s of opts.seeds ?? []) if (!s.includes(':')) enqueue(abs(s), 1, null, 'code-seed');
    if (!onlyRoutes) for (const e of extra) enqueue(e.url, e.depth, e.from, e.how);

    const slots: Page[] = [];
    const pageFor = async (slot: number) => {
      if (!slots[slot]) {
        const p = await context.newPage();
        p.on('dialog', (d) => (app.safety?.dismiss_dialogs === false ? d.accept() : d.dismiss()).catch(() => {}));
        slots[slot] = p;
      }
      return slots[slot];
    };
    let relogins = 0;
    let restarts = 0;
    const started = Date.now();
    const retry503 = this.s.retry503Ms ?? RETRY_503_MS;
    // a page that answers 503 (a rate-limited demo) gets a short, growing wait and another GET, a few times
    const open = async (page: Page, url: string, route: string) => {
      let resp = await page.goto(url, { timeout: app.page_timeout_ms ?? 30000, waitUntil: 'domcontentloaded' });
      for (let i = 0; resp?.status() === 503 && i < retry503.length; i++) {
        this.log(`${route} 503, retry ${i + 1}/${retry503.length} in ${retry503[i] / 1000}s`);
        await page.waitForTimeout(retry503[i]);
        resp = await page.goto(url, { timeout: app.page_timeout_ms ?? 30000, waitUntil: 'domcontentloaded' });
      }
      return resp;
    };
    const progress = (route: string, detail: string) =>
      this.log(
        progressLine({
          done: pages.size,
          queued: pages.size + queue.length,
          maxPages,
          elapsedMs: Date.now() - started,
          route,
          detail,
        }),
      );
    const warnSignIn = (target: string | null) => {
      if (h.warned.signIn || info.required || this.s.credentials.username || !target) return;
      if (target !== h.login.route && !isSignInRoute(target)) return;
      h.warned.signIn = true;
      this.log(
        `warning: pages need sign-in and there's no ${app.secrets_file || '.env.dsm'} (or ${login.username_env || 'DSM_APP_USERNAME'} / ${login.password_env || 'DSM_APP_PASSWORD'}): forms behind the sign-in won't be crawled`,
      );
    };

    const crawlItem = async (slot: number, item: QueueItem): Promise<ItemResult> => {
      const rec: UiPage = {
        route: item.route,
        url: item.url,
        depth: item.depth,
        discovered_from: item.from,
        discovered_by: item.how,
        status: null,
        title: '',
        headings: [],
        elements: [],
        forms: [],
        tables: [],
        dialogs: [],
        error: null,
      };
      const out: ItemResult = { item, rec, edges: [], found: [], closed: null };
      const found = (url: string, depth: number, from: string | null, how: string) =>
        out.found.push({ url, route: '', depth, from, how });
      try {
        const page = await pageFor(slot);
        let resp = await open(page, item.url, item.route);
        rec.status = resp ? resp.status() : null;
        await h.settle(page);
        if (info.required && info.mode === 'auto' && relogins < 2 && (await h.signInHere(page))) {
          relogins++; // the session ended mid-crawl: sign in again, then reload the page
          await h.reSignIn(page);
          resp = await open(page, item.url, item.route);
          rec.status = resp ? resp.status() : null;
          await h.settle(page);
        }
        const finalRoute = routes.routeOf(page.url());
        let toSignIn = !!h.login.route && finalRoute === h.login.route && item.route !== finalRoute;
        if (name === 'signed-out' && !h.login.route && finalRoute && (await h.signInHere(page))) {
          // signed out, the first page sent to a sign-in page (or called like one) names it
          if (finalRoute !== item.route || isSignInRoute(finalRoute)) h.login.route = finalRoute;
          toSignIn = finalRoute !== item.route;
        }
        if (toSignIn) {
          rec.redirect_to = finalRoute;
          rec.error =
            name === 'signed-out'
              ? 'redirected to the sign-in page (needs sign-in)'
              : 'redirected to the sign-in page (session lost or no access)';
          warnSignIn(finalRoute);
          // the sign-in page itself is crawled signed out (R5); signed in it is never crawled (it is in `visited`)
          if (routes.allowed(page.url())) found(page.url(), item.depth, item.route, 'redirect');
          return out;
        }
        if (finalRoute && finalRoute !== item.route) {
          rec.redirect_to = finalRoute;
          out.edges.push({ from: item.route, to: finalRoute, type: 'redirect', via: null, label: 'redirect' });
          if (routes.allowed(page.url())) found(page.url(), item.depth, item.route, 'redirect');
          warnSignIn(finalRoute);
          return out;
        }
        await this.recordPage(page, item, rec, out.edges, routes, found, maxDepth, h.settle, explore, denied);
      } catch (err) {
        if (isBrowserClosedError(err)) out.closed = String((err as Error).message ?? err);
        rec.error = String((err as Error).message ?? err)
          .split('\n')[0]
          .slice(0, 300);
      }
      return out;
    };

    while (queue.length && pages.size < maxPages) {
      const wave = queue.splice(0, Math.min(queue.length, maxPages - pages.size));
      const results: ItemResult[] = new Array(wave.length);
      let next = 0;
      const worker = async (slot: number) => {
        while (next < wave.length) {
          const i = next++;
          results[i] = await crawlItem(slot, wave[i]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, wave.length) }, (_, slot) => worker(slot)));
      const closed = results.filter((r) => r.closed !== null);
      const again = new Set<ItemResult>();
      if (closed.length && restarts < MAX_BROWSER_RESTARTS) {
        restarts++;
        this.log(
          `browser closed on ${closed[0].item.route}: starting a new one (restart ${restarts}/${MAX_BROWSER_RESTARTS})`,
        );
        context = await h.restart();
        h.observe(context);
        slots.length = 0;
        relogins = 0;
        for (const r of closed) again.add(r);
        queue.unshift(...closed.map((r) => r.item)); // crawl them again in the new browser
      }
      for (const r of results) {
        if (again.has(r)) continue;
        pages.set(r.item.route, r.rec);
        edges.push(...r.edges);
        for (const f of r.found) enqueue(f.url, f.depth, f.from, f.how);
        progress(
          r.item.route,
          r.rec.redirect_to
            ? `-> ${r.rec.redirect_to}`
            : `${r.rec.status ?? ''}${r.rec.error ? ` ERROR ${r.rec.error}` : ''}`,
        );
      }
    }

    let outPages = [...pages.values()];
    let outEdges = dedupeEdges(edges);
    const startRoute = routes.routeOf(abs(app.start_paths?.[0] ?? info.landed_route ?? '/'));
    if (startRoute) {
      const kept = dropShellPages(outPages, outEdges, startRoute);
      if (kept.dropped.length) {
        this.log(
          `dropped ${kept.dropped.length} code-seeded route(s) that show the start page's elements (a single-page app's fallback): ${kept.dropped.join(', ')}`,
        );
        outPages = kept.pages;
        outEdges = kept.edges;
      }
    }
    return {
      pages: outPages,
      edges: outEdges,
      pending: queue.map((q) => q.route),
      restarts,
      recrawled: [...pages.keys()],
    };
  }

  /** Records one page's elements, forms and dialogs, follows its links, and explores safe clicks. */
  private async recordPage(
    page: Page,
    item: { url: string; route: string; depth: number },
    rec: UiPage,
    edges: UiEdge[],
    routes: Routes,
    found: (url: string, depth: number, from: string | null, how: string) => void,
    maxDepth: number,
    settle: (p: Page) => Promise<void>,
    explore: NonNullable<CrawlApp['explore_clicks']>,
    deny: RegExp[],
  ) {
    const timeout = this.s.app.page_timeout_ms ?? 30000;
    const data = (await page.evaluate(EXTRACT)) as Extracted;
    rec.title = data.title;
    rec.headings = data.headings;
    rec.heading = data.heading;
    rec.text_hash = data.textHash;
    rec.tables = data.tables;
    const elements = rec.elements as UiElement[];
    const keys = new Set<string>();
    const keyOf = (kind: string, ident: string | null | undefined) => {
      const base = `${item.route}::${kind}:${slug(ident) || 'item'}`;
      let k = base;
      for (let n = 2; keys.has(k); n++) k = `${base}-${n}`;
      keys.add(k);
      return k;
    };
    for (const l of data.links) {
      if (!l.raw || l.raw === '#' || /^javascript:/i.test(l.raw)) continue; // left to click exploration
      const key = keyOf('link', l.text || l.raw);
      const target = routes.allowed(l.href) ? routes.routeOf(l.href) : null;
      elements.push({
        key,
        kind: 'link',
        text: l.text,
        href: l.raw,
        target,
        external: !target && !/^(mailto|tel):/i.test(l.raw),
        visible: l.visible,
        in_nav: l.inNav,
        selector: l.selector,
        ...(l.test_id ? { test_attr: l.test_attr, test_id: l.test_id } : {}),
        ...(l.aria_label ? { aria_label: l.aria_label } : {}),
      } as UiElement);
      if (target && target !== item.route) {
        edges.push({ from: item.route, to: target, type: 'link', via: key, label: l.text });
        if (item.depth < maxDepth) found(l.href, item.depth + 1, item.route, 'link');
      }
    }
    for (const b of data.buttons)
      elements.push({ key: keyOf('button', b.text || b.id), kind: 'button', ...b } as UiElement);
    for (const t of data.tabs) elements.push({ key: keyOf('tab', t.text), kind: 'tab', ...t } as UiElement);
    for (const m of data.menus) elements.push({ key: keyOf('menuitem', m.text), kind: 'menuitem', ...m } as UiElement);
    const forms = [...data.forms];
    if (data.looseFields.length) {
      forms.push({
        id: 'page-inputs',
        name: 'Inputs outside a form',
        index: -1,
        action: '',
        method: 'none',
        selector: 'body',
        visible: true,
        fields: data.looseFields,
        submits: [],
      });
    }
    for (const f of forms) {
      const key = keyOf('form', f.id || f.name || `form-${f.index + 1}`);
      const target = f.action && routes.allowed(f.action) ? routes.routeOf(f.action) : null;
      rec.forms?.push({
        key,
        ...f,
        target,
        fields: f.fields.map((fd) => ({ key: keyOf('field', fd.name || fd.id || fd.label), ...fd })),
      });
      if (target && target !== item.route) {
        edges.push({
          from: item.route,
          to: target,
          type: 'form',
          via: key,
          label: `${f.method.toUpperCase()} ${f.id || f.name || 'form'}`,
        });
      }
    }
    if (explore.enabled === false) return;

    type Candidate = { selector: string; text: string; card?: boolean; inNav?: boolean };
    const fromSelectors = (
      (await page.evaluate(CLICK_CANDIDATES(explore.selectors ?? DEFAULT_CLICK_SELECTORS))) as Candidate[]
    ).filter((c) => !deny.some((re) => re.test(c.text)));
    // cards and sidebar items the selectors do not name: a pointer cursor and no link or role (R7, R8)
    const taken = new Set(fromSelectors.map((c) => c.selector));
    const cards = ((await page.evaluate(CARD_CANDIDATES)) as Candidate[]).filter(
      (c) => !taken.has(c.selector) && !deny.some((re) => re.test(c.text)),
    );
    const openDialogs = () => page.evaluate(OPEN_DIALOGS) as Promise<Dialog[]>;
    for (const c of [...fromSelectors, ...cards].slice(0, explore.max_per_page ?? 40)) {
      if (routes.routeOf(page.url()) !== item.route || (await openDialogs()).length) {
        await page.goto(item.url, { timeout, waitUntil: 'domcontentloaded' });
        await settle(page);
      }
      const before = await openDialogs();
      const loc = page.locator(c.selector).first();
      if (!(await loc.count())) continue;
      // inside a card, click where the card itself is, never on a button or link in it
      const point = c.card
        ? ((await loc.evaluate(SAFE_POINT).catch(() => null)) as { x: number; y: number } | null)
        : null;
      if (c.card && !point) continue;
      const popupPromise = page
        .context()
        .waitForEvent('page', { timeout: 1500, predicate: async (p) => (await p.opener().catch(() => null)) === page })
        .catch(() => null);
      try {
        await loc.click({ timeout: 3000, ...(point ? { position: point } : {}) });
      } catch {
        continue;
      }
      await page.waitForTimeout(150);
      await settle(page);
      const popup = await popupPromise;
      const known = elements.find((e) => e.selector === c.selector)?.key;
      if (popup) {
        const pr = routes.routeOf(popup.url());
        const popupUrl = popup.url();
        await popup.close().catch(() => {});
        if (pr && routes.allowed(popupUrl)) {
          edges.push({
            from: item.route,
            to: pr,
            type: 'popup',
            via: known ?? keyOf('click', c.text || c.selector),
            label: c.text,
          });
          found(popupUrl, item.depth + 1, item.route, 'popup');
        }
        continue;
      }
      const now = routes.routeOf(page.url());
      if (now && now !== item.route) {
        if (routes.allowed(page.url())) {
          let via = known;
          if (!via && c.card) via = keyOf('card', c.text || c.selector);
          else if (!via) {
            // a sidebar or menu item with no href: an element a step may click, and the relation it causes (R8)
            via = keyOf('link', c.text || c.selector);
            elements.push({
              key: via,
              kind: 'link',
              text: c.text,
              href: null,
              target: now,
              external: false,
              visible: true,
              in_nav: !!c.inNav,
              selector: c.selector,
            } as UiElement);
          }
          edges.push({ from: item.route, to: now, type: 'click', via, label: c.text });
          if (item.depth < maxDepth) found(page.url(), item.depth + 1, item.route, 'click');
        }
        continue;
      }
      const after = await openDialogs();
      if (after.length > before.length) {
        const d = after[after.length - 1];
        const title = d.title || c.text;
        const via = known ?? keyOf('click', c.text || c.selector);
        const dkey = `${item.route}::dialog:${slug(title) || 'dialog'}`;
        const dialogs = rec.dialogs as { key: string; [k: string]: unknown }[];
        if (!dialogs.some((x) => x.key === dkey)) {
          dialogs.push({ key: dkey, title, fields: d.fields, buttons: d.buttons, opened_by: via });
          // the dialog's fields, buttons and submit are a form on this page, named after the dialog (R6)
          if (d.form.fields.length) {
            const mine = new Set(d.form.fields.map((f) => f.selector));
            rec.forms = (rec.forms ?? []).filter(
              (f) => !(f.fields?.length && f.fields.every((fd) => mine.has((fd as { selector?: string }).selector))),
            );
            rec.forms.push({
              key: keyOf('form', `dialog-${title}`),
              id: '',
              name: title,
              dialog: title,
              method: 'none',
              target: null,
              fields: d.form.fields.map((fd) => ({ key: keyOf('field', fd.name || fd.id || fd.label), ...fd })),
              submits: d.form.submits,
              buttons: d.buttons,
            } as UiForm);
          }
        }
        edges.push({ from: via, to: dkey, type: 'opens', via, label: c.text, element_level: true });
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  }
}
