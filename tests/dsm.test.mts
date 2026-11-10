import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  build,
  compare,
  type Dsm,
  type DsmConfig,
  matchKey,
  moduleOf,
  round4,
  tarjan,
} from '../plugin/src/dsm/build.mts';
import { renderPage } from '../plugin/src/dsm/render.mts';
import { tmpDir } from './tmp.mts';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures/dsm');

// biome-ignore lint/suspicious/noExplicitAny: fixtures are whatever AQE wrote
const read = (file: string): any => JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));

/** Builds as AQE did (same clock), then compares what would land in dsm.json. */
function golden(
  dir: string,
  expectedFile: string,
  opts: { ui?: string; config?: DsmConfig; previous?: string; change?: Record<string, unknown> } = {},
) {
  const expected = read(`${dir}/${expectedFile}`);
  const dsm = build(
    read(`${dir}/${opts.ui ?? 'ui-model.json'}`),
    read(`${dir}/code-model.json`),
    opts.config ?? read(`${dir}/dsm-config.json`),
    {
      previous: opts.previous ? (read(`${dir}/${opts.previous}`) as Dsm) : null,
      change: opts.change,
      now: new Date(expected.generated_at),
    },
  );
  assert.deepEqual(JSON.parse(JSON.stringify(dsm)), expected);
}

test('golden: the old demo app (one page, no code routes)', () => golden('demo', 'dsm.expected.json'));

test('golden: the Real World App, real crawl and scan', () => golden('rwa', 'dsm.expected.json'));

test('golden: the shop, every flag and edge type', () => golden('shop', 'dsm.expected.json'));

test('golden: the shop with the element cap and module depth 2', () => {
  const config = read('shop/dsm-config.json');
  config.matrix = { module_depth: 2, max_element_nodes: 14 };
  golden('shop', 'dsm.truncated.expected.json', { config });
});

test('golden: the shop diff against an earlier crawl', () => {
  golden('shop', 'dsm.previous.expected.json', { ui: 'ui-model.previous.json' });
  golden('shop', 'dsm.with-previous.expected.json', {
    previous: 'dsm.previous.expected.json',
    change: { reason: 'test' },
  });
});

test('matchKey keeps the hash route, drops the query, case and trailing slash', () => {
  assert.equal(matchKey('/#/Help/?x=1'), '/help');
  assert.equal(matchKey('/Login?next=1'), '/login');
  assert.equal(matchKey('/products/'), '/products');
  assert.equal(matchKey('//'), '/');
  assert.equal(matchKey(''), '/');
});

test('moduleOf skips parameters and names the root home', () => {
  assert.equal(moduleOf('/', 1), 'home');
  assert.equal(moduleOf('/:id', 1), 'home');
  assert.equal(moduleOf('/user/settings/x', 2), 'user/settings');
  assert.equal(moduleOf('/transaction/:id/edit', 2), 'transaction/edit');
});

test('tarjan finds a cycle and numbers components sinks first', () => {
  // 0 -> 1 <-> 2 -> 3
  const [comp, n] = tarjan(4, [[1], [2], [1, 3], []]);
  assert.equal(n, 3);
  assert.equal(comp[1], comp[2]);
  assert.ok(comp[3] < comp[1] && comp[1] < comp[0]);
});

test('round4 rounds ties to the even digit, as Python does', () => {
  assert.equal(round4(1 / 32), 0.0312); // 0.03125 exactly
  assert.equal(round4(3 / 32), 0.0938); // 0.09375 exactly
  assert.equal(round4(40 / 240), 0.1667);
});

test('compare orders tuples element by element, shorter first', () => {
  assert.ok(compare([0, 1, 'a'], [0, 2, 'a']) < 0);
  assert.ok(compare(['b'], ['a', 'z']) > 0);
  assert.ok(compare(['a'], ['a', 'z']) < 0);
  assert.equal(compare('Z', 'a'), -1); // code order, not locale order
});

test('no crawl and no code gives an empty matrix', () => {
  const dsm = build(null, null, {});
  assert.equal(dsm.stats.pages, 0);
  assert.deepEqual(dsm.diff, { first_run: true });
});

/** The page around the data, and the data parsed. */
function splitPage(html: string): [string, unknown] {
  const start = html.indexOf('const D = ') + 'const D = '.length;
  const end = html.indexOf(';\n', start);
  return [html.slice(0, start) + html.slice(end), JSON.parse(html.slice(start, end))];
}

test('golden: render gives the AQE page with the same data', () => {
  const [page, data] = splitPage(renderPage(read('shop/dsm.expected.json')));
  const [expectedPage, expectedData] = splitPage(
    fs.readFileSync(path.join(FIXTURES, 'shop/index.expected.html'), 'utf8'),
  );
  assert.equal(page, expectedPage);
  assert.deepEqual(data, expectedData);
  assert.match(page, /<title>Shop UI DSM<\/title>/);
});

test('render escapes screen text that would end the script, and the project name', () => {
  const dsm = build({ pages: [{ route: '/', url: 'x', title: '</script><b>' }] } as never, null, { project: 'A&B' });
  const html = renderPage(dsm);
  assert.ok(!html.includes('</script><b>'));
  assert.match(html, /<title>A&amp;B UI DSM<\/title>/);
  assert.equal((splitPage(html)[1] as Dsm).page.nodes[0].title, '</script><b>');
});

const QAM = path.resolve(import.meta.dirname, '../bin/qam');
const qam = (...args: string[]) => spawnSync(QAM, args, { encoding: 'utf8' });

test('qam dsm build, then render, in a QA project', () => {
  const qa = tmpDir('qam-dsm-');
  fs.mkdirSync(path.join(qa, 'config'));
  fs.mkdirSync(path.join(qa, 'dsm'));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), '{}');
  fs.copyFileSync(path.join(FIXTURES, 'shop/dsm-config.json'), path.join(qa, 'config/dsm-config.json'));
  for (const f of ['ui-model.json', 'code-model.json'])
    fs.copyFileSync(path.join(FIXTURES, 'shop', f), path.join(qa, 'dsm', f));

  const first = qam('--repo', qa, 'dsm', 'build');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /13 screens, 14 relations, 27 elements, 2 cycles/);
  const again = qam('--repo', qa, '--json', 'dsm', 'build');
  assert.equal(JSON.parse(again.stdout).stats.pages, 13);
  const built = JSON.parse(fs.readFileSync(path.join(qa, 'dsm/dsm.json'), 'utf8'));
  assert.deepEqual(built.diff.nodes_added, [], 'the second build diffs against the first');

  const r = qam('--repo', qa, 'dsm', 'render');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.readFileSync(path.join(qa, 'dsm/index.html'), 'utf8').includes('<title>Shop UI DSM</title>'));
});

test('qam dsm blocks with the step to take', () => {
  const empty = tmpDir('qam-dsm-');
  const cases: [string[], RegExp][] = [
    [['dsm', 'build'], /No DSM settings at .*dsm-config\.json\. Run qam setup/],
    [['dsm', 'refresh'], /No DSM settings at .*dsm-config\.json\. Run qam setup/],
    [['dsm'], /Use qam dsm run, refresh, changes, impact, scan, build, render/],
    [['dsm', 'run', '--login-mode', 'sso'], /--login-mode must be auto, manual or none/],
    [['dsm', 'build', '--nope'], /Unknown option '--nope'/],
  ];
  for (const [args, message] of cases) {
    const r = qam('--repo', empty, ...args);
    assert.equal(r.status, 2);
    assert.match(r.stderr, message);
  }
  fs.mkdirSync(path.join(empty, 'config'));
  fs.writeFileSync(path.join(empty, 'config/dsm-config.json'), '{}');
  assert.match(
    qam('--repo', empty, 'dsm', 'build').stderr,
    /No ui-model\.json or code-model\.json .* Run qam dsm run first/,
  );
  assert.match(qam('--repo', empty, 'dsm', 'render').stderr, /No dsm\.json .* Run qam dsm build first/);
  assert.match(
    qam('--repo', empty, 'dsm', 'run').stderr,
    /no application\.base_url and no repositories\. Run qam setup/,
  );
  assert.match(qam('--repo', empty, 'dsm', 'impact').stderr, /Name the changed files/);
});

// ---- 0.7.0: the DSM shape the crawl adds (R6, R15, R30), without a browser

const spa = (route: string, extra: Record<string, unknown> = {}) => ({
  route,
  url: `http://app.test${route}`,
  title: 'Vite + React + TS',
  status: 200,
  elements: [],
  ...extra,
});
const uiOf = (pages: ReturnType<typeof spa>[]) =>
  ({
    generated_at: '2026-11-10T00:00:00Z',
    base_url: 'http://app.test/',
    mode: 'full',
    truncated: false,
    pages,
    edges: [],
    api_calls: [],
  }) as never;

test('item 7: screens that share a document title are labelled by their heading, and their ids do not change', () => {
  const dsm = build(
    uiOf([
      spa('/todo', { heading: 'Todos', headings: ['Todos', 'Add'] }),
      spa('/users', { heading: 'Users', headings: ['Users'] }),
      spa('/old', { headings: ['Old crawl'] }),
      spa('/profile', { heading: 'Profile', headings: ['Profile'] }),
      spa('/solo', { title: 'Only one', heading: 'Solo', headings: ['Solo'] }),
      spa('/bare', { title: 'Same', headings: [] }),
      spa('/bare2', { title: 'Same', headings: [] }),
    ]),
    null,
    { project: 'x', application: { start_paths: ['/todo'] } },
  );
  const byId = new Map(dsm.page.nodes.map((n) => [n.id, n.label]));
  assert.equal(byId.get('/todo'), 'Todos');
  assert.equal(byId.get('/users'), 'Users');
  assert.equal(byId.get('/old'), '/old', 'a crawl from before 0.7.0 recorded no h1 / h2 split: the route');
  assert.equal(byId.get('/profile'), 'Profile');
  assert.equal(byId.get('/solo'), '/solo', 'a title of its own: the route');
  assert.equal(byId.get('/bare'), '/bare', 'no heading: the route');
  assert.deepEqual([...byId.keys()].sort(), ['/bare', '/bare2', '/old', '/profile', '/solo', '/todo', '/users']);
});

test('item 2: a dialog form and its limits reach the screen and the element matrix; a form without limits is as before', () => {
  const dsm = build(
    uiOf([
      spa('/todo', {
        title: 'Todos',
        forms: [
          {
            key: '/todo::form:dialog-new-todo',
            name: 'New todo',
            dialog: 'New todo',
            buttons: ['Cancel', 'Save'],
            submits: ['Save'],
            fields: [
              {
                key: '/todo::field:title',
                name: 'title',
                label: 'Title',
                type: 'text',
                minlength: 3,
                maxlength: 50,
                pattern: null,
              },
              { key: '/todo::field:n', name: 'n', label: 'Count', type: 'number', min: 1, max: 5 },
            ],
          },
          {
            key: '/todo::form:search',
            name: 'search',
            fields: [{ key: '/todo::field:q', name: 'q', label: 'Q', type: 'text' }],
          },
        ],
      }),
    ]),
    null,
    { project: 'x' },
  );
  const [dialog, search] = dsm.page.nodes[0].forms;
  assert.equal(dialog.name, 'New todo');
  assert.equal(dialog.dialog, 'New todo');
  assert.deepEqual(dialog.buttons, ['Cancel', 'Save']);
  assert.deepEqual(dialog.fields[0], {
    label: 'Title',
    name: 'title',
    type: 'text',
    required: null,
    min_length: 3,
    max_length: 50,
  });
  assert.deepEqual(dialog.fields[1], { label: 'Count', name: 'n', type: 'number', required: null, min: 1, max: 5 });
  assert.deepEqual(search, {
    name: 'search',
    method: null,
    target: null,
    fields: [{ label: 'Q', name: 'q', type: 'text', required: null }],
    submits: [],
  });
  assert.equal(dsm.element.nodes.find((n) => n.id === '/todo::field:title')?.max_length, 50);
});

test('item 3: a start_paths entry with an ID is not an entry screen when its list page is', () => {
  const pages = [
    spa('/todo', { depth: 0, discovered_by: 'start', title: 'a' }),
    spa('/todo/:id', { depth: 0, discovered_by: 'start', title: 'b' }),
    spa('/other', { depth: 0, discovered_by: 'start', title: 'c' }),
  ];
  const both = build(uiOf(pages), null, { project: 'x', application: { start_paths: ['/todo', '/todo/:id'] } });
  const flags = (id: string) => both.page.nodes.find((n) => n.id === id)?.flags;
  assert.ok(flags('/todo/:id')?.includes('orphan'), 'not an entry screen: nothing links to it');
  assert.ok(!flags('/todo')?.includes('orphan'), 'its list page still is one');
  const order = both.page.orders.partitioned.map((v) => both.page.nodes[v].id);
  assert.ok(order.indexOf('/todo') < order.indexOf('/todo/:id'), 'and it is not ordered with the entry screens');
  const alone = build(uiOf(pages.slice(1, 2)), null, { project: 'x', application: { start_paths: ['/todo/:id'] } });
  assert.ok(
    !alone.page.nodes[0].flags.includes('orphan'),
    'with no list page among the start paths it stays an entry screen',
  );
});

test('a screen records its access when the crawl did, and not otherwise', () => {
  const dsm = build(uiOf([spa('/login', { access: 'public' }), spa('/todo')]), null, { project: 'x' });
  assert.equal(dsm.page.nodes.find((n) => n.id === '/login')?.access, 'public');
  assert.ok(!('access' in (dsm.page.nodes.find((n) => n.id === '/todo') ?? {})), 'a 0.6.0 crawl has none');
});
