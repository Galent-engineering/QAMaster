import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

const QAM = path.resolve(import.meta.dirname, '../plugin/bin/qam');
const qam = (...args: string[]) => spawnSync(QAM, args, { encoding: 'utf8' });

test('qam dsm build, then render, in a QA project', () => {
  const qa = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-dsm-'));
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
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-dsm-'));
  const cases: [string[], RegExp][] = [
    [['dsm', 'build'], /No DSM settings at .*dsm-config\.json\. Run qam setup/],
    [['dsm', 'refresh'], /qam dsm refresh isn't built yet/],
    [['dsm'], /Use qam dsm scan, build or render/],
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
});
