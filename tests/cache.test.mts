/**
 * The store cache (Q34): reads may come from .qamaster/cache/store.json and say how old they are; writes always go to the
 * live store, and a stale cache can never make an update overwrite someone else's change.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CachedStore, cacheFile, withCache } from '../plugin/src/adapters/cache.mts';
import { FileStore } from '../plugin/src/adapters/file.mts';
import { GITIGNORE_LINES } from '../plugin/src/pipeline/setup.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { Item, TestCase } from '../plugin/src/shared/models.mts';
import { testCaseStoreContract } from './contracts.mts';
import { FakeStore } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

/** The fake store, counting what it was asked, so a test can tell a cached read from a live one. */
class Counting extends FakeStore {
  calls: string[] = [];
  override async inPlan(): Promise<Map<number, TestCase>> {
    this.calls.push('inPlan');
    return super.inPlan();
  }
  override async show(id: number): Promise<Item> {
    this.calls.push(`show ${id}`);
    return super.show(id);
  }
}

const file = () => path.join(tmpDir('qam-cache-'), '.qamaster', 'cache', 'store.json');
const T1 = () => new Date('2026-10-30T10:00:00.000Z');
const T2 = () => new Date('2026-10-30T11:00:00.000Z');

testCaseStoreContract('cached fake store', {
  make: () => new CachedStore(new FakeStore(), file()),
  inPlan: 501,
  notInPlan: 504,
  missing: 999,
});

test('cache: a second read comes from the cache, and says when it was read live', async () => {
  const inner = new Counting();
  const f = file();
  const first = new CachedStore(inner, f, { now: T1 });
  await first.show(501);
  assert.equal(first.age(), null, 'a live read has no age to report');
  const second = new CachedStore(inner, f, { now: T2 });
  assert.equal((await second.show(501)).id, 501);
  assert.deepEqual(inner.calls, ['show 501'], 'the second store never asked the live one');
  assert.equal(second.age(), '2026-10-30T10:00:00.000Z');
});

test('cache: the plan is cached too', async () => {
  const inner = new Counting();
  const f = file();
  await new CachedStore(inner, f, { now: T1 }).inPlan();
  const again = new CachedStore(inner, f, { now: T2 });
  assert.ok((await again.inPlan()).has(501));
  assert.deepEqual(inner.calls, ['inPlan']);
  assert.equal(again.age(), '2026-10-30T10:00:00.000Z');
});

test('cache: refresh reads the live store and replaces what was cached', async () => {
  const inner = new Counting();
  const f = file();
  await new CachedStore(inner, f, { now: T1 }).show(501);
  await inner.update(await inner.show(501), { title: 'Changed behind the cache' });
  inner.calls = [];
  const fresh = new CachedStore(inner, f, { refresh: true, now: T2 });
  assert.equal((await fresh.show(501)).title, 'Changed behind the cache');
  assert.deepEqual(inner.calls, ['show 501']);
  assert.equal(fresh.age(), null);
  const later = new CachedStore(inner, f, { now: T2 });
  assert.equal((await later.show(501)).title, 'Changed behind the cache', 'the cache was updated');
});

test("cache: another store's cache, or one that can't be read, is ignored and rebuilt", async () => {
  const inner = new Counting();
  const f = file();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(
    f,
    JSON.stringify({
      where: 'Azure DevOps galent/Other',
      items: { 501: { at: 'x', value: { id: 501, title: 'Wrong store' } } },
    }),
  );
  assert.notEqual((await new CachedStore(inner, f).show(501)).title, 'Wrong store');
  fs.writeFileSync(f, '{ not json');
  assert.equal((await new CachedStore(inner, f).show(501)).id, 501);
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).where, inner.where(), 'rewritten for this store');
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['store.json'], 'no temp file left');
});

test('cache: writes go to the live store, put the result in the cache, and drop the cached plan', async () => {
  const inner = new Counting();
  const f = file();
  const store = new CachedStore(inner, f, { now: T1 });
  await store.inPlan();
  const made = await store.create({ title: 'Made through the cache' });
  assert.ok(inner.items.has(made.id), 'it exists in the live store');
  inner.calls = [];
  const reader = new CachedStore(inner, f, { now: T2 });
  assert.equal((await reader.show(made.id)).title, 'Made through the cache');
  assert.deepEqual(inner.calls, [], 'the new case is in the cache');
  await reader.inPlan();
  assert.deepEqual(inner.calls, ['inPlan'], 'the plan may have changed, so it was read again');

  const updated = await reader.update(await reader.show(made.id), { addTags: ['more'] });
  assert.deepEqual((await new CachedStore(inner, f).show(made.id)).tags, updated.tags);
  await reader.retire(updated);
  inner.calls = [];
  assert.equal((await new CachedStore(inner, f).show(made.id)).state, 'Closed');
  assert.deepEqual(inner.calls, [`show ${made.id}`], 'a retired case is read live, not from the cache');
});

test('cache: a stale cache cannot make an update overwrite a change made since', async () => {
  const inner = new Counting();
  const f = file();
  const cached = new CachedStore(inner, f, { now: T1 });
  const old = await cached.show(501); // cached at rev 1
  await inner.update(await inner.show(501), { addTags: ['someone-else'] }); // the store moves on
  const stale = await new CachedStore(inner, f, { now: T2 }).show(501);
  assert.equal(stale.rev, old.rev, 'the cache still has the old revision');
  await assert.rejects(cached.update(stale, { title: 'Mine' }), blocked(/changed since it was read/));
  assert.ok(!(await inner.show(501)).title.includes('Mine'));
});

test('cache: a store that is already a local file is not cached; any other is', () => {
  const dir = tmpDir('qam-cache-');
  const local = new FileStore(path.join(dir, 'testcases', 'testcases.csv'), 'Shop');
  assert.equal(withCache(local, dir, false).store, local);
  const remote = withCache(new FakeStore(), dir, false);
  assert.ok(remote.store instanceof CachedStore);
  assert.equal(cacheFile(dir), path.join(dir, '.qamaster', 'cache', 'store.json'));
  assert.equal(remote.age(), null);
});

test('cache: the cache folder is git-ignored in every QA project', () => {
  assert.ok(GITIGNORE_LINES.includes('.qamaster/cache/'));
});

test('cache: a wrapper passes checkWrite through only when the store has one', () => {
  const dir = tmpDir('qam-cache-');
  assert.equal(typeof withCache(new FakeStore(), dir, false).store.checkWrite, 'undefined');
  const withCheck = new FakeStore() as FakeStore & { checkWrite: () => Promise<never> };
  withCheck.checkWrite = async () =>
    ({ state: 'allowed', detail: 'ok', area: null, missing: [], testCaseType: 'present' }) as never;
  assert.equal(typeof withCache(withCheck, dir, false).store.checkWrite, 'function');
});
