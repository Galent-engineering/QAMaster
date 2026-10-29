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
  DEFAULT_DENY,
  dedupeEdges,
  type GuardPhase,
  isSignInPage,
  type LoginState,
  mergeIncremental,
  Routes,
  slug,
} from '../dsm/crawl-rules.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CrawlOptions, UiEdge, UiElement, UiModel, UiPage } from '../shared/models.mts';
import type { Crawler } from './base.mts';

export type CrawlerSettings = {
  app: CrawlApp;
  projectDir: string; // Playwright is loaded from here
  authDir: string | null; // the saved session goes here; null never saves
  credentials: { username?: string; password?: string };
  ask?: (question: string, hidden: boolean) => Promise<string>; // prompts in a terminal, when there is one
  log?: (line: string) => void;
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

/** Every element the DSM records, with selectors, visibility and stable test attributes. */
const EXTRACT = `(() => {
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
  const field = (el) => ({ tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || el.tagName).toLowerCase(),
    name: el.name || el.getAttribute('formcontrolname') || el.getAttribute('ng-model') || '', id: el.id || '',
    label: labelOf(el), required: el.required || el.getAttribute('aria-required') === 'true',
    maxlength: el.maxLength > 0 ? el.maxLength : null, pattern: el.getAttribute('pattern') || null,
    options: el.tagName === 'SELECT' ? el.options.length : null, visible: visible(el), selector: cssPath(el), ...attrs(el) });
  const fieldSel = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), select, textarea';
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
  const tables = [...document.querySelectorAll('table, [role=grid]')].map((t) => ({ selector: cssPath(t),
    columns: [...t.querySelectorAll('th, [role=columnheader]')].slice(0, 40).map(text).filter(Boolean) }));
  return { title: document.title, headings, links, forms, looseFields, buttons, tabs, menus, tables };
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

const OPEN_DIALOGS = `(() => {
  const sel = '[role=dialog], [role=alertdialog], dialog[open], .modal.show, .modal.in, mat-dialog-container, .cdk-overlay-pane, .k-window, .ui-dialog';
  return [...document.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }).map((el) => {
    const title = el.querySelector('h1, h2, h3, h4, .modal-title, [mat-dialog-title], .k-window-title, .ui-dialog-title');
    return { title: (title ? title.innerText : el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 80),
      fields: el.querySelectorAll('input:not([type=hidden]), select, textarea').length,
      buttons: [...el.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 10) }; }); })()`;

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
  return { password: !!password, userOnly: !password && !!user && !otp, otp: !!otp && !password,
    message: alertEl ? alertEl.innerText.trim().replace(/\\s+/g, ' ').slice(0, 160) : '' }; })()`;

type Extracted = {
  title: string;
  headings: string[];
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
type Dialog = { title: string; fields: number; buttons: string[] };

// ---- the crawler

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
    const configuredLoginRoute = login.url ? routes.routeOf(new URL(login.url, routes.base).href) : null;
    const authFile = this.s.authDir && login.save_session !== false ? path.join(this.s.authDir, 'state.json') : null;

    let phase: GuardPhase = 'signing-in';
    let loginRoute: string | null = configuredLoginRoute;
    const blocked: { method: string; url: string }[] = [];
    const browser = await pw.chromium.launch({ headless: app.headless !== false });

    const settle = async (page: Page) => {
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 10000) }).catch(() => {});
      await page.waitForTimeout(settleMs);
    };
    const frameRoute = (req: Request) => {
      try {
        return routes.routeOf(req.frame().url());
      } catch {
        return null; // a service worker request has no frame
      }
    };
    const makeContext = async (storageState?: StorageState) => {
      const ctx = await browser.newContext({
        ignoreHTTPSErrors: !!app.ignore_https_errors,
        viewport: { width: 1440, height: 900 },
        ...(storageState ? { storageState } : {}),
      });
      await ctx.route('**/*', (route) => {
        const req = route.request();
        if (blocks({ method: req.method(), url: req.url(), frameRoute: frameRoute(req) }, phase, loginRoute, app)) {
          blocked.push({ method: req.method(), url: req.url().slice(0, 200) });
          return route.abort('blockedbyclient');
        }
        return route.continue();
      });
      return ctx;
    };
    const loginState = (page: Page) => page.evaluate(LOGIN_STATE) as Promise<LoginState>;
    const signInHere = async (page: Page) =>
      isSignInPage(await loginState(page), routes.routeOf(page.url()), loginRoute);

    try {
      const { context, info } = await this.ensureLogin(
        (page) => settle(page),
        makeContext,
        routes,
        mode,
        authFile,
        loginState,
        signInHere,
      );
      loginRoute = info.login_route ?? loginRoute;
      phase = 'crawling';
      return await this.explore(context, opts, routes, info, {
        settle,
        signInHere,
        reSignIn: async (page: Page) => {
          phase = 're-signing-in';
          try {
            await this.signIn(page, settle, loginState, routes, () => loginRoute);
          } finally {
            phase = 'crawling'; // fix 2: back on even when signing in fails
          }
          if (authFile) this.saveSession(authFile, await context.storageState());
        },
        blocked,
      });
    } finally {
      await browser.close();
    }
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
  ): Promise<{ context: BrowserContext; info: LoginInfo }> {
    const { app } = this.s;
    const timeout = app.page_timeout_ms ?? 30000;
    const startUrl = new URL(app.login?.url || app.start_paths?.[0] || '/', routes.base).href;
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

  private async explore(
    context: BrowserContext,
    opts: CrawlOptions,
    routes: Routes,
    info: LoginInfo,
    h: {
      settle: (p: Page) => Promise<void>;
      signInHere: (p: Page) => Promise<boolean>;
      reSignIn: (p: Page) => Promise<void>;
      blocked: { method: string; url: string }[];
    },
  ): Promise<UiModel> {
    const { app } = this.s;
    const timeout = app.page_timeout_ms ?? 30000;
    const maxPages = app.max_pages ?? 300;
    const maxDepth = app.max_depth ?? 8;
    const explore = app.explore_clicks ?? {};
    const deny = (explore.deny_text_patterns ?? DEFAULT_DENY).map((p) => new RegExp(`\\b${p}\\b`, 'i'));
    const apiHosts = new Set(app.api_hosts ?? []);

    // API calls the UI makes: method, path, statuses and response keys, never values
    let currentRoute: string | null = null;
    const apiCalls = new Map<string, ApiCall>();
    context.on('response', async (resp: Response) => {
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
        for (const k of u.searchParams.keys()) if (!rec.query_keys.includes(k)) rec.query_keys.push(k);
        if (!rec.statuses.includes(resp.status())) rec.statuses.push(resp.status());
        if (currentRoute && !rec.pages.includes(currentRoute) && rec.pages.length < 20) rec.pages.push(currentRoute);
        const ct = resp.headers()['content-type'] || '';
        rec.content_type = ct.split(';')[0] || rec.content_type;
        if (/json/.test(ct) && !(rec.response_keys as string[]).length) {
          const body = await resp.json().catch(() => null);
          const sample = Array.isArray(body) ? body[0] : body;
          if (sample && typeof sample === 'object') rec.response_keys = Object.keys(sample).slice(0, 40);
          if (Array.isArray(body)) rec.response_is_array = true;
        }
        apiCalls.set(key, rec);
      } catch {
        // observing must never break the crawl
      }
    });

    const previous = opts.previous ?? null;
    const onlyRoutes = opts.routes?.length ? opts.routes : null;
    const pages = new Map<string, UiPage>();
    const edges: UiEdge[] = [];
    const visited = new Set<string>();
    const queue: { url: string; route: string; depth: number; from: string | null; how: string }[] = [];
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
      if (info.login_route) visited.add(info.login_route); // never crawl back into the sign-in form
      if (info.landed_route) enqueue(abs(info.landed_route), 0, null, 'login');
      for (const p of app.start_paths ?? ['/']) enqueue(abs(p), 0, null, 'start');
    }
    for (const s of opts.seeds ?? []) if (!s.includes(':')) enqueue(abs(s), 1, null, 'code-seed');

    const page = await context.newPage();
    page.on('dialog', (d) => (app.safety?.dismiss_dialogs === false ? d.accept() : d.dismiss()).catch(() => {}));
    let relogins = 0;

    while (queue.length && pages.size < maxPages) {
      const item = queue.shift() as (typeof queue)[number];
      currentRoute = item.route;
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
      try {
        let resp = await page.goto(item.url, { timeout, waitUntil: 'domcontentloaded' });
        rec.status = resp ? resp.status() : null;
        await h.settle(page);
        if (info.required && info.mode === 'auto' && relogins < 2 && (await h.signInHere(page))) {
          relogins++; // the session ended mid-crawl: sign in again, then reload the page
          await h.reSignIn(page);
          resp = await page.goto(item.url, { timeout, waitUntil: 'domcontentloaded' });
          rec.status = resp ? resp.status() : null;
          await h.settle(page);
        }
        const finalRoute = routes.routeOf(page.url());
        if (info.login_route && finalRoute === info.login_route && item.route !== finalRoute) {
          rec.redirect_to = finalRoute;
          rec.error = 'redirected to the sign-in page (session lost or no access)';
          pages.set(item.route, rec);
          continue;
        }
        if (finalRoute && finalRoute !== item.route) {
          rec.redirect_to = finalRoute;
          edges.push({ from: item.route, to: finalRoute, type: 'redirect', via: null, label: 'redirect' });
          if (!visited.has(finalRoute) && routes.allowed(page.url()))
            enqueue(page.url(), item.depth, item.route, 'redirect');
          pages.set(item.route, rec);
          this.log(`${pages.size}/${maxPages} ${item.route} -> ${finalRoute}`);
          continue;
        }
        await this.recordPage(page, item, rec, edges, routes, enqueue, maxDepth, h.settle, explore, deny);
      } catch (err) {
        rec.error = String((err as Error).message ?? err)
          .split('\n')[0]
          .slice(0, 300);
      }
      pages.set(item.route, rec);
      this.log(`${pages.size}/${maxPages} ${item.route} ${rec.status ?? ''}${rec.error ? ` ERROR ${rec.error}` : ''}`);
    }

    let outPages = [...pages.values()];
    let outEdges = dedupeEdges(edges);
    let outCalls = [...apiCalls.values()] as UiModel['api_calls'];
    if (onlyRoutes && previous) {
      ({
        pages: outPages,
        edges: outEdges,
        api_calls: outCalls,
      } = mergeIncremental(previous, { pages: outPages, edges: outEdges, api_calls: outCalls }));
    }
    const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return {
      generated_at: (opts.now ?? new Date()).toISOString(),
      base_url: routes.base.href,
      hash_routing: routes.hashRouting,
      mode: onlyRoutes ? 'incremental' : 'full',
      recrawled_routes: [...pages.keys()],
      login: info,
      truncated: queue.length > 0,
      pending_routes: queue.map((q) => q.route),
      blocked_requests: h.blocked.slice(0, 200),
      pages: outPages.sort((a, b) => byText(a.route, b.route)),
      edges: outEdges,
      api_calls: outCalls.sort((a, b) => byText(a.path + a.method, b.path + b.method)),
    };
  }

  /** Records one page's elements, forms and dialogs, follows its links, and explores safe clicks. */
  private async recordPage(
    page: Page,
    item: { url: string; route: string; depth: number },
    rec: UiPage,
    edges: UiEdge[],
    routes: Routes,
    enqueue: (url: string, depth: number, from: string | null, how: string) => void,
    maxDepth: number,
    settle: (p: Page) => Promise<void>,
    explore: NonNullable<CrawlApp['explore_clicks']>,
    deny: RegExp[],
  ) {
    const timeout = this.s.app.page_timeout_ms ?? 30000;
    const data = (await page.evaluate(EXTRACT)) as Extracted;
    rec.title = data.title;
    rec.headings = data.headings;
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
        if (item.depth < maxDepth) enqueue(l.href, item.depth + 1, item.route, 'link');
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

    const candidates = (
      (await page.evaluate(CLICK_CANDIDATES(explore.selectors ?? DEFAULT_CLICK_SELECTORS))) as {
        selector: string;
        text: string;
      }[]
    ).filter((c) => !deny.some((re) => re.test(c.text)));
    const openDialogs = () => page.evaluate(OPEN_DIALOGS) as Promise<Dialog[]>;
    for (const c of candidates.slice(0, explore.max_per_page ?? 40)) {
      if (routes.routeOf(page.url()) !== item.route || (await openDialogs()).length) {
        await page.goto(item.url, { timeout, waitUntil: 'domcontentloaded' });
        await settle(page);
      }
      const before = await openDialogs();
      const loc = page.locator(c.selector).first();
      if (!(await loc.count())) continue;
      const popupPromise = page
        .context()
        .waitForEvent('page', { timeout: 1500 })
        .catch(() => null);
      try {
        await loc.click({ timeout: 3000 });
      } catch {
        continue;
      }
      await page.waitForTimeout(400);
      await settle(page);
      const popup = await popupPromise;
      const viaKey = elements.find((e) => e.selector === c.selector)?.key ?? keyOf('click', c.text || c.selector);
      if (popup) {
        const pr = routes.routeOf(popup.url());
        const popupUrl = popup.url();
        await popup.close().catch(() => {});
        if (pr && routes.allowed(popupUrl)) {
          edges.push({ from: item.route, to: pr, type: 'popup', via: viaKey, label: c.text });
          enqueue(popupUrl, item.depth + 1, item.route, 'popup');
        }
        continue;
      }
      const now = routes.routeOf(page.url());
      if (now && now !== item.route) {
        if (routes.allowed(page.url())) {
          edges.push({ from: item.route, to: now, type: 'click', via: viaKey, label: c.text });
          if (item.depth < maxDepth) enqueue(page.url(), item.depth + 1, item.route, 'click');
        }
        continue;
      }
      const after = await openDialogs();
      if (after.length > before.length) {
        const d = after[after.length - 1];
        const dkey = `${item.route}::dialog:${slug(d.title || c.text) || 'dialog'}`;
        const dialogs = rec.dialogs as { key: string; [k: string]: unknown }[];
        if (!dialogs.some((x) => x.key === dkey)) {
          dialogs.push({
            key: dkey,
            title: d.title || c.text,
            fields: d.fields,
            buttons: d.buttons,
            opened_by: viaKey,
          });
        }
        edges.push({ from: viaKey, to: dkey, type: 'opens', via: viaKey, label: c.text, element_level: true });
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  }
}
