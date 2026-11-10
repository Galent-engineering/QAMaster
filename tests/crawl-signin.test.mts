import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { PlaywrightCrawler } from '../plugin/src/adapters/crawler-playwright.mts';
import { build } from '../plugin/src/dsm/build.mts';
import { type CrawlApp, mergePasses } from '../plugin/src/dsm/crawl-rules.mts';
import type { UiEdge, UiModel, UiPage } from '../plugin/src/shared/models.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const NORMALISE = [{ pattern: '/\\d+(?=/|$)', replace: '/:id' }];

// ---- 0.7.0 item 1: the merge of the signed-out and the signed-in pass, without a browser

const pg = (route: string, extra: Partial<UiPage> = {}): UiPage => ({
  route,
  url: `http://x${route}`,
  elements: [],
  forms: [],
  error: null,
  ...extra,
});
const el = (route: string, name: string) => ({ key: `${route}::link:${name}`, kind: 'link', text: name });
const redirect = (route: string, to: string): [UiPage, UiEdge] => [
  pg(route, { redirect_to: to, error: 'redirected to the sign-in page (needs sign-in)' }),
  { from: route, to, type: 'redirect', via: null, label: 'redirect' },
];

test('item 1: a route redirected signed out with content signed in is signed-in, not a redirect', () => {
  const [gated, gatedEdge] = redirect('/todo', '/login');
  const out = mergePasses(
    {
      pages: [gated, pg('/login', { forms: [{ key: 'f', fields: [{ key: 'k', name: 'username' }] }] })],
      edges: [gatedEdge],
    },
    { pages: [pg('/todo', { elements: [el('/todo', 'Home')] })], edges: [] },
  );
  const todo = out.pages.find((p) => p.route === '/todo');
  assert.equal(todo?.access, 'signed-in');
  assert.equal(todo?.redirect_to, undefined);
  assert.equal(todo?.error, null);
  assert.deepEqual(out.edges, [], 'the redirect relation is gone with the redirect');
});

test('item 1: /login keeps its signed-out fields even though it redirects once signed in', () => {
  const [moved, movedEdge] = redirect('/login', '/');
  const out = mergePasses(
    { pages: [pg('/login', { forms: [{ key: 'f', fields: [{ key: 'k', name: 'username' }] }] })], edges: [] },
    { pages: [moved, pg('/')], edges: [movedEdge] },
  );
  const login = out.pages.find((p) => p.route === '/');
  assert.equal(login?.access, 'signed-in');
  const signIn = out.pages.find((p) => p.route === '/login');
  assert.equal(signIn?.access, 'public');
  assert.equal(signIn?.redirect_to, undefined, 'not the signed-in redirect');
  assert.equal(signIn?.forms?.[0].fields?.[0].name, 'username');
  assert.deepEqual(out.edges, [], 'and no relation says /login redirects');
});

test('item 1: a screen seen in both states is the signed-in page, plus the elements only the signed-out page had (D2)', () => {
  const out = mergePasses(
    { pages: [pg('/about', { elements: [el('/about', 'Sign in'), el('/about', 'About')] })], edges: [] },
    { pages: [pg('/about', { elements: [el('/about', 'About'), el('/about', 'Log out')] })], edges: [] },
  );
  const about = out.pages[0];
  assert.equal(about.access, 'both');
  assert.deepEqual(
    about.elements?.map((e) => [e.text, e.state ?? null]),
    [
      ['About', null],
      ['Log out', null],
      ['Sign in', 'signed-out'],
    ],
  );
});

test('item 1: with no signed-in pass, content is public and a route that needs sign-in is signed-in', () => {
  const [gated] = redirect('/todo', '/login');
  const out = mergePasses({ pages: [pg('/'), gated], edges: [] }, null);
  assert.deepEqual(
    out.pages.map((p) => [p.route, p.access]),
    [
      ['/', 'public'],
      ['/todo', 'signed-in'],
    ],
  );
});

// ---- a real crawl of tests/fixtures/crawl/todo-app.mjs

let server: ChildProcess;
let ui: string;

before(async () => {
  server = spawn(process.execPath, [path.join(ROOT, 'tests/fixtures/crawl/todo-app.mjs')], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  ui = (
    await new Promise<{ ui: string }>((resolve) => server.stdout?.once('data', (d) => resolve(JSON.parse(String(d)))))
  ).ui;
});
after(() => server.kill());

// the crawl's own sign-in is the one write it may make
const writes = async () =>
  ((await (await fetch(`${ui}__writes`)).json()) as { method: string; path: string }[]).filter(
    (w) => !(w.method === 'POST' && w.path === '/login'),
  );

function crawler(app: CrawlApp = {}, credentials: { username?: string; password?: string } | null = null) {
  return new PlaywrightCrawler({
    app: { base_url: ui, settle_ms: 100, route_normalization: NORMALISE, login: { mode: 'auto' }, ...app },
    projectDir: ROOT,
    authDir: null,
    credentials: credentials ?? { username: 'qa@example.test', password: 'qa-password' }, // the fixture's test account
  });
}

let crawled: Promise<UiModel> | undefined;
const full = () => {
  crawled ??= crawler().crawl({ baseUrl: ui, now: new Date('2026-11-10T00:00:00Z') });
  return crawled;
};
const route = (m: UiModel, r: string) => m.pages.find((p) => p.route === r) as UiPage;

test('item 1: one crawl gives /login and /register their fields (public) and the private pages their elements', {
  timeout: 180_000,
}, async () => {
  const model = await full();
  for (const r of ['/login', '/register', '/about']) assert.ok(route(model, r), `${r} was crawled`);
  const login = route(model, '/login');
  assert.equal(login.access, 'public');
  assert.deepEqual(
    login.forms?.[0].fields?.map((f) => f.name),
    ['username', 'password'],
    'the sign-in fields, seen signed out',
  );
  assert.equal(login.redirect_to, undefined, 'it redirects when signed in, but keeps the signed-out page');
  const register = route(model, '/register');
  assert.equal(register.access, 'public');
  assert.equal(register.forms?.[0].fields?.length, 3);
  const todo = route(model, '/todo');
  assert.equal(todo.access, 'signed-in');
  assert.equal(todo.redirect_to, undefined, 'a route redirected signed out is not a redirect signed in');
  assert.equal(todo.error, null);
  assert.ok((todo.elements ?? []).length > 3);
  assert.equal(route(model, '/about').access, 'both');
  assert.deepEqual(await writes(), [], 'no write: the sign-up form was never submitted (Q15)');
  const dsm = build(model, null, { project: 'x' });
  assert.ok(!dsm.page.nodes.find((n) => n.id === '/todo')?.flags.includes('redirect'), 'no redirect flag on /todo');
  assert.equal(dsm.page.nodes.find((n) => n.id === '/login')?.access, 'public');
  assert.equal(dsm.page.nodes.find((n) => n.id === '/todo')?.access, 'signed-in');
});

test('item 1: the text link on /login to /register is a relation', { timeout: 180_000 }, async () => {
  const model = await full();
  assert.ok(model.edges.some((e) => e.from === '/login' && e.to === '/register' && e.type === 'link'));
});

test('item 1: --login-mode none crawls only signed out, and a route that needs sign-in is signed-in', {
  timeout: 120_000,
}, async () => {
  const model = await crawler({}, {}).crawl({
    baseUrl: ui,
    loginMode: 'none',
    seeds: ['/todo', '/login', '/register'],
  });
  assert.equal(route(model, '/login').access, 'public');
  assert.equal(route(model, '/todo').access, 'signed-in');
  assert.ok(route(model, '/todo').redirect_to, 'as seen signed out');
  assert.equal(model.login?.signed_out_pass, true);
});

test('item 1: login.signed_out_pass false keeps the signed-in crawl alone, as in 0.6.0', {
  timeout: 120_000,
}, async () => {
  const model = await crawler({ login: { mode: 'auto', signed_out_pass: false }, max_pages: 6 }).crawl({ baseUrl: ui });
  assert.ok(!model.pages.some((p) => p.route === '/login'), 'the sign-in page is not crawled');
  assert.ok(model.pages.every((p) => p.access === undefined));
});

test("item 2: a dialog's fields, buttons and submit are a form on its page, named after its title, with limits", {
  timeout: 180_000,
}, async () => {
  const model = await full();
  const dialogForm = route(model, '/todo').forms?.find((f) => f.dialog === 'New todo');
  assert.ok(dialogForm, 'the Add todo dialog is a form');
  assert.equal(dialogForm.name, 'New todo');
  const byName = new Map(dialogForm.fields?.map((f) => [f.name, f]));
  assert.equal(byName.get('title')?.minlength, 3);
  assert.equal(byName.get('title')?.maxlength, 50);
  assert.equal(byName.get('priority')?.min, 1);
  assert.equal(byName.get('priority')?.max, 5);
  assert.equal(byName.get('code')?.pattern, '[A-Z]{3}');
  assert.deepEqual(dialogForm.buttons, ['Cancel', 'Save todo']);
  assert.deepEqual(dialogForm.submits, ['Save todo']);
  const register = route(model, '/register').forms?.[0];
  const password = register?.fields?.find((f) => f.name === 'password');
  assert.equal(password?.minlength, 8);
  assert.equal(password?.maxlength, 32);
  const dsm = build(model, null, { project: 'x' });
  const form = dsm.page.nodes.find((n) => n.id === '/todo')?.forms.find((f) => f.dialog === 'New todo');
  assert.equal(form?.name, 'New todo');
  const title = form?.fields.find((f) => f.name === 'title');
  assert.deepEqual(
    [title?.min_length, title?.max_length, title?.min ?? null, title?.max ?? null, title?.pattern ?? null],
    [3, 50, null, null, null],
  );
  assert.equal(form?.fields.find((f) => f.name === 'code')?.pattern, '[A-Z]{3}');
});

test('item 3: a clickable card with no link is clicked once, and its navigation is a click relation', {
  timeout: 180_000,
}, async () => {
  const model = await full();
  const clicks = model.edges.filter((e) => e.from === '/todo' && e.to === '/todo/:id' && e.type === 'click');
  assert.equal(clicks.length, 1, 'three cards, one group: one click, one relation');
  assert.ok(route(model, '/todo/:id'), 'the detail page is a screen');
  assert.ok(
    (model.blocked_requests ?? []).every((b) => b.method !== 'DELETE'),
    'the click landed on the card, not on the button inside it',
  );
  assert.deepEqual(await writes(), []);
});

test('item 4: a sidebar item with no href is a link element on each page that shows it', {
  timeout: 180_000,
}, async () => {
  const model = await full();
  for (const r of ['/', '/todo', '/profile']) {
    const links = (route(model, r).elements ?? []).filter((e) => e.kind === 'link' && e.in_nav);
    assert.ok(
      links.some((e) => e.text === 'Profile' || e.text === 'Todos' || e.text === 'Home'),
      `${r} has sidebar links`,
    );
  }
  const home = (route(model, '/').elements ?? []).find((e) => e.text === 'Todos');
  assert.equal(home?.target, '/todo');
  assert.ok(model.edges.some((e) => e.from === '/' && e.to === '/todo' && e.type === 'click' && e.via === home?.key));
  const dsm = build(model, null, { project: 'x' });
  assert.ok(dsm.element.nodes.some((n) => n.page === '/' && n.kind === 'link' && n.label === 'Todos'));
});

test('item 12: an incremental crawl of one route keeps the rest of the last crawl, with access', {
  timeout: 180_000,
}, async () => {
  const previous = await full();
  const model = await crawler().crawl({ baseUrl: ui, routes: ['/profile'], previous });
  assert.equal(model.mode, 'incremental');
  assert.deepEqual(model.recrawled_routes, ['/profile'], 'only that route was crawled');
  assert.equal(route(model, '/profile').access, 'signed-in');
  assert.deepEqual(
    model.pages.map((p) => p.route),
    previous.pages.map((p) => p.route),
    'every other screen is kept',
  );
  assert.equal(route(model, '/login').access, 'public');
});
