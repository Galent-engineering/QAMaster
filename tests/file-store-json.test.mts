/**
 * The `file` test case store kept as JSON (Q34): the same store as the CSV one, chosen by the file's extension. The
 * shared store contract, then what differs: the file's shape and how a problem in it is reported.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { FileStore } from '../plugin/src/adapters/file.mts';
import { buildStore } from '../plugin/src/adapters/registry.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { testCaseStoreContract } from './contracts.mts';
import { tmpDir } from './tmp.mts';

/** The shop the contract expects: 501 in the plan with a link, 504 in no suite, and an empty suite "Payments". */
const SHOP = [
  {
    id: 501,
    title: 'Coupon applies',
    state: 'Design',
    suites: ['Checkout'],
    requirements: [3],
    automatedTest: 'bdd:@TC-CHECKOUT-001',
    tags: ['checkout', 'checkout-coupon'],
    steps: [{ action: 'Apply SAVE10', expected: 'Total drops 10%' }],
  },
  { id: 504, title: 'Draft: refund', tags: ['payments'] },
  { suite: 'Payments' },
];

const PLAN = 'Shop';

function folder(content?: unknown): { file: string; store: () => FileStore } {
  const dir = tmpDir('qam-json-');
  const file = path.join(dir, 'testcases', 'testcases.json');
  if (content !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return { file, store: () => new FileStore(file, PLAN, 'testcases/testcases.json') };
}

const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

testCaseStoreContract('json file store', {
  make: () => folder(SHOP).store(),
  inPlan: 501,
  notInPlan: 504,
  missing: 999,
});

test('json file store: a missing or empty file is an empty store; IDs start at 1000, then follow the highest', async () => {
  const f = folder();
  const store = f.store();
  assert.equal((await store.inPlan()).size, 0);
  assert.equal(fs.existsSync(f.file), false, 'reading writes nothing');
  assert.deepEqual([(await store.create({ title: 'A' })).id, (await store.create({ title: 'B' })).id], [1000, 1001]);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['testcases.json'], 'no temp file left behind');
  assert.equal((await folder('').store().inPlan()).size, 0);
  assert.equal(
    (
      await folder([{ id: 2500, title: 'High' }])
        .store()
        .create({ title: 'Next' })
    ).id,
    2501,
  );
});

test('json file store: the file is an array of case records, sorted by ID, suites first, LF and a final newline', async () => {
  const f = folder(SHOP);
  await f.store().create({ title: 'New', steps: [{ action: 'x', expected: 'y' }], fields: { Priority: '2' } });
  const text = fs.readFileSync(f.file, 'utf8');
  assert.ok(text.endsWith('\n') && !text.includes('\r'));
  const records = JSON.parse(text);
  assert.ok(Array.isArray(records));
  assert.deepEqual(
    records.map((r: { id?: number; suite?: string }) => r.id ?? r.suite),
    ['Payments', 'Checkout', 501, 504, 1000],
  );
  const made = records.at(-1);
  assert.deepEqual(Object.keys(made), [
    'id',
    'title',
    'description',
    'state',
    'suites',
    'requirements',
    'automatedTest',
    'tags',
    'rev',
    'signature',
    'fields',
    'steps',
  ]);
  assert.deepEqual(made.steps, [{ action: 'x', expected: 'y' }]);
  assert.deepEqual(made.fields, { Priority: '2' });
  assert.equal(made.rev, 1);
});

test('json file store: awkward text survives a write and a re-read', async () => {
  const f = folder();
  const made = await f.store().create({
    title: 'Say "hi", then leave',
    description: 'Line one\nLine two, with a comma\r\nand a café ✓',
    steps: [{ action: 'Type "a,b"', expected: '  Spaces kept  ' }],
    addTags: ['two words'],
    requirements: [3, 4],
    automatedTest: 'bdd:@TC-X-001',
  });
  assert.deepEqual(await f.store().show(made.id), made);
});

test('json file store: a hand edit counts as a change by someone else, so a stale read is refused', async () => {
  const f = folder();
  const made = await f.store().create({ title: 'Original' });
  const read = await f.store().show(made.id);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('Original', 'Edited by hand'));
  const after = await f.store().show(made.id);
  assert.equal(after.title, 'Edited by hand');
  assert.ok(after.rev > read.rev);
  await assert.rejects(f.store().update(read, { title: 'Mine' }), blocked(/changed since it was read/));
  const next = await f.store().update(after, { addTags: ['more'] });
  assert.equal((await f.store().show(made.id)).rev, next.rev, 'a write by qam is not mistaken for a hand edit');
});

test('json file store: a problem in the file says which record and what to fix', async () => {
  const cases: [unknown, RegExp][] = [
    ['{ not json', /testcases\.json.*isn't valid JSON/],
    [{ id: 1, title: 'Not a list' }, /must be a list/],
    [[3], /record 1 must be an object/],
    [[{ id: 'abc', title: 'x' }], /record 1.*"id".*whole number/],
    [[{ id: 7 }], /record 1 \(7\).*"title"/],
    [
      [
        { id: 7, title: 'One' },
        { id: 7, title: 'Again' },
      ],
      /record 2.*7.*twice/,
    ],
    [[{ id: 7, title: 'Req', requirements: ['x1'] }], /record 1 \(7\).*"requirements"/],
    [[{ id: 7, title: 'Rev', rev: 0 }], /record 1 \(7\).*"rev"/],
    [[{ id: 7, title: 'Fields', fields: { Priority: 2 } }], /record 1 \(7\).*"fields"/],
    [[{ id: 7, title: 'Steps', steps: [{ action: 'a' }] }], /record 1 \(7\).*"steps"/],
    [[{ id: 7, title: 'Tags', tags: 'a; b' }], /record 1 \(7\).*"tags"/],
    [[{ id: 7, title: 'Odd', notes: 'keep me' }], /record 1 \(7\).*"notes".*doesn't use/],
    [[{ suite: '' }], /record 1.*"suite"/],
  ];
  for (const [content, why] of cases) {
    await assert.rejects(folder(content).store().inPlan(), blocked(why), JSON.stringify(content));
  }
});

test('json file store: QAMASTER_STORE=file uses testcases/testcases.json when that file is there and no CSV is', async () => {
  const dir = tmpDir('qam-json-cfg-');
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config', 'qamaster.json'), JSON.stringify({ app: { name: 'Juice Shop' } }));
  fs.mkdirSync(path.join(dir, 'testcases'));
  fs.writeFileSync(path.join(dir, 'testcases', 'testcases.json'), '[]\n');
  const store = buildStore(loadConfig(dir, { QAMASTER_STORE: 'file' }));
  assert.equal(store.where(), 'File testcases/testcases.json, plan Juice Shop');
  await store.create({ title: 'Made through the registry' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'testcases', 'testcases.json'), 'utf8')).length, 1);
  assert.equal(fs.existsSync(path.join(dir, 'testcases', 'testcases.csv')), false);
});
