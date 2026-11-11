/**
 * 0.7.2 item 15: dsm run warns when a list screen was crawled with no rows, so the detail screens under it (the code
 * has /todo/:id) were never reached. The crawl follows the rows, so a list with no edge into its detail screens is empty.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyListHints, uncrawledHint } from '../plugin/src/dsm/build.mts';
import type { UiModel } from '../plugin/src/shared/models.mts';

const page = (route: string) => ({ route, url: `http://app${route}`, title: route, status: 200 });
const ui = (pages: string[], edges: { from: string; to: string; type: string }[]) =>
  ({ pages: pages.map(page), edges }) as unknown as UiModel;

test('a list crawled with no edge into its detail screens warns, and names the detail route', () => {
  const hints = emptyListHints(ui(['/todo'], []), ['/todo', '/todo/:id']);
  assert.equal(hints.length, 1);
  assert.match(hints[0], /\/todo/);
  assert.match(hints[0], /\/todo\/:id/);
  assert.match(hints[0], /no row on \/todo led to its detail screens \(\/todo\/:id\)/);
});

test('a list with rows (an edge into its detail screens) does not warn', () => {
  const edges = [{ from: '/todo', to: '/todo/:id', type: 'click' }];
  assert.deepEqual(emptyListHints(ui(['/todo', '/todo/:id'], edges), ['/todo', '/todo/:id']), []);
});

test('no detail route in the code, or a list the crawl never reached, does not warn', () => {
  assert.deepEqual(emptyListHints(ui(['/todo'], []), ['/todo']), []);
  assert.deepEqual(emptyListHints(ui(['/home'], []), ['/todo', '/todo/:id']), []);
  assert.deepEqual(emptyListHints(null, ['/todo', '/todo/:id']), []);
});

test('0.8.0 item 17: code-only screens the crawl did not reach are one summary line, without the detail screens an empty list already names', () => {
  const routes = ['/todo', '/todo/:id', '/admin', '/reports', '/settings'];
  const u = ui(['/todo'], []);
  const lines = uncrawledHint(u, routes);
  assert.equal(lines.length, 1);
  assert.match(
    lines[0],
    /^3 screens in the code were not crawled \(no link or click reached them\): \/admin, \/reports, \/settings/,
  );
  assert.deepEqual(uncrawledHint(ui(['/todo', '/admin'], []), ['/todo', '/admin']), []);
  assert.deepEqual(uncrawledHint(null, routes), []);
  assert.match(uncrawledHint(ui(['/todo'], []), ['/todo', '/a'])[0], /^1 screen in the code was not crawled/);
});
