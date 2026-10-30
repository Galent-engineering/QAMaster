/**
 * The ledger (Q7, Q34): .qamaster/ledger.json maps each draft ID to its test case in the store, with a content hash,
 * the tags QAMaster owns and whether QA declined smoke. Losing it would make the next publish create everything again.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { FileStore } from '../plugin/src/adapters/file.mts';
import {
  type Applied,
  checkStore,
  LEDGER_FILE,
  readLedger,
  record,
  writeLedger,
} from '../plugin/src/publish/ledger.mts';
import { derive, diff, type PlannedChange, type PublishCase, suggestSmoke } from '../plugin/src/publish/publish.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import type { Item, Ledger, LedgerEntry } from '../plugin/src/shared/models.mts';
import { item } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);
const STORE = 'File testcases/testcases.csv, plan Shop';
const NOW = '2026-10-30T12:00:00.000Z';

const entry = (localId: string, trackerId: number, more: Partial<LedgerEntry> = {}): LedgerEntry => ({
  localId,
  trackerId,
  hash: `hash-${localId}`,
  ownedTags: ['checkout'],
  smokeDeclined: false,
  publishedAt: 'before',
  trackerRev: 1,
  ...more,
});
const planned = (kind: PlannedChange['kind'], localId: string, more: Partial<PlannedChange> = {}): PlannedChange => ({
  kind,
  localId,
  fields: [],
  reason: '',
  hash: `new-${localId}`,
  ownedTags: ['checkout', 'path:src/**'],
  suite: 'Checkout',
  ...more,
});

// ---- the file

test('ledger: no file is no ledger; a written one reads back, sorted by ID, with no temp file left', () => {
  const dir = tmpDir('qam-ledger-');
  assert.equal(readLedger(dir), null);
  const ledger: Ledger = { store: STORE, entries: [entry('TC-B', 2), entry('TC-A', 1)] };
  writeLedger(dir, ledger);
  const read = readLedger(dir);
  assert.deepEqual(
    read?.entries.map((e) => e.localId),
    ['TC-A', 'TC-B'],
  );
  assert.equal(read?.store, STORE);
  const text = fs.readFileSync(path.join(dir, LEDGER_FILE), 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(fs.readdirSync(path.join(dir, '.qamaster')), ['ledger.json']);
});

test("ledger: a file that can't be read says to restore it, never to delete it", () => {
  const dir = tmpDir('qam-ledger-');
  fs.mkdirSync(path.join(dir, '.qamaster'));
  fs.writeFileSync(path.join(dir, LEDGER_FILE), '{ not json');
  assert.throws(
    () => readLedger(dir),
    blocked(/ledger\.json.*valid JSON.*restore it from git.*every test case again/s),
  );
});

test('ledger: a file of the wrong shape names the entry that is wrong', () => {
  const dir = tmpDir('qam-ledger-');
  fs.mkdirSync(path.join(dir, '.qamaster'));
  const put = (v: unknown) => fs.writeFileSync(path.join(dir, LEDGER_FILE), JSON.stringify(v));
  const good = entry('TC-A', 1);
  put({ store: STORE, entries: [good, { ...entry('TC-B', 2), trackerId: 'two' }] });
  assert.throws(() => readLedger(dir), blocked(/entry 2.*TC-B.*trackerId/s));
  put({ store: STORE, entries: [good, good] });
  assert.throws(() => readLedger(dir), blocked(/TC-A.*twice/));
  put({ entries: [] });
  assert.throws(() => readLedger(dir), blocked(/"store"/));
  put([]);
  assert.throws(() => readLedger(dir), blocked(/JSON object/));
  put({ store: STORE, entries: [{ ...good, ownedTags: 'checkout' }] });
  assert.throws(() => readLedger(dir), blocked(/ownedTags/));
});

// ---- one ledger, one store

test('ledger: publishing to a different store than the ledger names is blocked, with both ways out', () => {
  assert.doesNotThrow(() => checkStore(null, STORE));
  assert.doesNotThrow(() => checkStore({ store: STORE, entries: [] }, STORE));
  assert.throws(
    () => checkStore({ store: 'Azure DevOps galent/Shop, plan Shop', entries: [entry('TC-A', 1)] }, STORE),
    blocked(/belongs to Azure DevOps galent\/Shop.*now File testcases.*QAMASTER_STORE.*move.*ledger.*aside/s),
  );
});

// ---- record: what the ledger says after an apply

test('record: a created case gets an entry from what the store returned', () => {
  const created = item(1000, 'test_case', 'New', { rev: 1 });
  const out = record(null, STORE, [{ change: planned('create', 'TC-A'), item: created }], [], NOW);
  assert.equal(out.store, STORE);
  assert.deepEqual(out.entries, [
    {
      localId: 'TC-A',
      trackerId: 1000,
      hash: 'new-TC-A',
      ownedTags: ['checkout', 'path:src/**'],
      smokeDeclined: false,
      publishedAt: NOW,
      trackerRev: 1,
    },
  ]);
});

test('record: an update refreshes the hash, tags and revision; other entries stay as they were', () => {
  const prev: Ledger = {
    store: STORE,
    entries: [entry('TC-A', 1000), entry('TC-CART', 2000, { ownedTags: ['cart'] })],
  };
  const updated = item(1000, 'test_case', 'New', { rev: 4 });
  const out = record(prev, STORE, [{ change: planned('update', 'TC-A', { trackerId: 1000 }), item: updated }], [], NOW);
  const a = out.entries.find((e) => e.localId === 'TC-A');
  assert.deepEqual([a?.hash, a?.trackerRev, a?.publishedAt], ['new-TC-A', 4, NOW]);
  assert.deepEqual(
    out.entries.find((e) => e.localId === 'TC-CART'),
    prev.entries[1],
  );
  assert.equal(prev.entries[0].trackerRev, 1, 'the ledger passed in is not changed');
});

test('record: unchanged only refreshes the hash and tags, and keeps the revision so a store edit stays a conflict', () => {
  const prev: Ledger = { store: STORE, entries: [entry('TC-A', 1000, { trackerRev: 1 })] };
  const out = record(
    prev,
    STORE,
    [{ change: planned('unchanged', 'TC-A', { trackerId: 1000, ownedTags: ['checkout'] }) }],
    [],
    NOW,
  );
  assert.deepEqual(
    [out.entries[0].hash, out.entries[0].trackerRev, out.entries[0].publishedAt],
    ['new-TC-A', 1, 'before'],
  );
});

test('record: a conflict leaves its entry exactly as it was', () => {
  const prev: Ledger = { store: STORE, entries: [entry('TC-A', 1000)] };
  assert.deepEqual(
    record(prev, STORE, [{ change: planned('conflict', 'TC-A', { trackerId: 1000 }) }], [], NOW).entries,
    prev.entries,
  );
});

test('record: a retired case leaves the ledger only when the store really closed it', () => {
  const prev: Ledger = { store: STORE, entries: [entry('TC-OLD', 1000), entry('TC-A', 1001)] };
  const change = planned('retire', 'TC-OLD', { trackerId: 1000 });
  assert.deepEqual(
    record(prev, STORE, [{ change, done: true }], [], NOW).entries.map((e) => e.localId),
    ['TC-A'],
  );
  assert.deepEqual(
    record(prev, STORE, [{ change }], [], NOW).entries.map((e) => e.localId),
    ['TC-A', 'TC-OLD'].sort(),
  );
});

test('record: smoke QA removed is remembered, and the next suggestion skips it', () => {
  const d = derive(kase('TC-A'), ctx());
  const prev: Ledger = {
    store: STORE,
    entries: [entry('TC-A', 1000, { hash: d.hash, ownedTags: [...d.tags, 'smoke'] })],
  };
  const out = record(
    prev,
    STORE,
    [{ change: planned('unchanged', 'TC-A', { trackerId: 1000, ownedTags: d.tags }) }],
    ['TC-A'],
    NOW,
  );
  assert.equal(out.entries[0].smokeDeclined, true);
  assert.ok(!out.entries[0].ownedTags.includes('smoke'));
  assert.deepEqual(suggestSmoke([d], out.entries, 0, ctx().settings).ids, []);
});

test('record: refuses a ledger that belongs to another store, so IDs are never mixed', () => {
  const prev: Ledger = { store: 'Azure DevOps galent/Shop, plan Shop', entries: [] };
  assert.throws(() => record(prev, STORE, [], [], NOW), blocked(/belongs to Azure DevOps/));
});

// ---- the whole loop, on a real store

const DSM = { page: { nodes: [{ id: '/cart', files: ['shop:src/cart/Cart.tsx'] }] } };
function ctx() {
  return {
    scope: { module: 'Checkout', subModule: '' },
    dsm: DSM,
    settings: {
      publish: { pathDepth: 4, suiteBy: 'module' as const },
      smoke: { max: 5, priorities: ['P1' as const], categories: ['Positive' as const] },
      owners: {},
    },
    scenarios: new Set<string>(),
  };
}
function kase(id: string, more: Partial<PublishCase> = {}): PublishCase {
  return {
    id,
    title: `Case ${id}`,
    component: 'Checkout',
    category: 'Positive',
    priority: 'P1',
    objective: 'Pay',
    preconditions: [],
    test_data: {},
    steps: [{ screen: '/cart', action: 'Click Pay', expected: 'The order is placed' }],
    expected_result: 'Placed',
    evidence: [],
    ...more,
  };
}

/** One publish --apply, as step 6 will do it, minus the preview and the person's yes. */
async function publish(store: FileStore, project: string, cases: PublishCase[], confirmed: string[] = []) {
  const ledger = readLedger(project);
  checkStore(ledger, store.where());
  const derived = cases.map((c) => derive(c, ctx()));
  const items = new Map<number, Item>();
  for (const e of ledger?.entries ?? [])
    items.set(e.trackerId, await store.show(e.trackerId).catch(() => undefined as never));
  for (const [id, i] of items) if (!i) items.delete(id);
  const result = diff({
    derived,
    ledger: ledger?.entries ?? [],
    items,
    module: 'Checkout',
    confirmedSmoke: new Set(confirmed),
  });
  const applied: Applied[] = [];
  for (const change of result.changes) {
    if (change.kind === 'create' && change.change) {
      await store.ensureSuite(change.suite);
      applied.push({ change, item: await store.create(change.change) });
    } else if (change.kind === 'update' && change.change && change.trackerId) {
      applied.push({ change, item: await store.update(await store.show(change.trackerId), change.change) });
    } else applied.push({ change });
  }
  writeLedger(project, record(ledger, store.where(), applied, result.declinedSmoke, NOW));
  return result;
}

test('loop: publishing a run, then the same run again, changes nothing the second time', async () => {
  const project = tmpDir('qam-ledger-loop-');
  const store = new FileStore(path.join(project, 'testcases', 'testcases.csv'), 'Shop', 'testcases/testcases.csv');
  const cases = [kase('TC-A'), kase('TC-B')];
  const first = await publish(store, project, cases);
  assert.deepEqual(
    first.changes.map((c) => c.kind),
    ['create', 'create'],
  );
  const csv = fs.readFileSync(path.join(project, 'testcases', 'testcases.csv'), 'utf8');
  const second = await publish(store, project, cases);
  assert.deepEqual(
    second.changes.map((c) => c.kind),
    ['unchanged', 'unchanged'],
  );
  assert.equal(
    fs.readFileSync(path.join(project, 'testcases', 'testcases.csv'), 'utf8'),
    csv,
    'the store was not rewritten',
  );
  assert.equal(readLedger(project)?.entries.length, 2);
});

test('loop: a changed case is updated; a tag QA added in the store survives; a hand edit in the store is a conflict', async () => {
  const project = tmpDir('qam-ledger-loop-');
  const store = new FileStore(path.join(project, 'testcases', 'testcases.csv'), 'Shop', 'testcases/testcases.csv');
  await publish(store, project, [kase('TC-A')]);
  const id = readLedger(project)?.entries[0].trackerId as number;
  await store.update(await store.show(id), { addTags: ['added-by-qa'] });
  const third = await publish(store, project, [kase('TC-A', { title: 'Renamed' })]);
  assert.equal(third.changes[0].kind, 'conflict', 'the QA edit bumped the revision, so our title change is held back');
  assert.equal((await store.show(id)).title, 'Case TC-A');
});

test('loop: a case changed in the repo, with the store untouched, is updated and the new hash is recorded', async () => {
  const project = tmpDir('qam-ledger-loop-');
  const store = new FileStore(path.join(project, 'testcases', 'testcases.csv'), 'Shop', 'testcases/testcases.csv');
  await publish(store, project, [kase('TC-A')]);
  const changed = [kase('TC-A', { title: 'Renamed' })];
  const second = await publish(store, project, changed);
  assert.deepEqual(
    second.changes.map((c) => [c.kind, c.fields.join()]),
    [['update', 'title']],
  );
  assert.equal((await store.show(readLedger(project)?.entries[0].trackerId as number)).title, 'Renamed');
  assert.deepEqual(
    (await publish(store, project, changed)).changes.map((c) => c.kind),
    ['unchanged'],
  );
});

test('loop: switching stores is blocked before anything is written', async () => {
  const project = tmpDir('qam-ledger-loop-');
  const file = new FileStore(path.join(project, 'testcases', 'testcases.csv'), 'Shop', 'testcases/testcases.csv');
  await publish(file, project, [kase('TC-A')]);
  const other = new FileStore(path.join(project, 'other.csv'), 'Shop', 'other.csv');
  await assert.rejects(
    publish(other, project, [kase('TC-A')]),
    blocked(/belongs to File testcases.*now File other\.csv/s),
  );
  assert.equal(fs.existsSync(path.join(project, 'other.csv')), false);
});
