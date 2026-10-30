/**
 * The `file` test case store (Q34): the shared store contract, then what is particular to a CSV a person also edits.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { FileStore } from '../plugin/src/adapters/file.mts';
import { buildStore } from '../plugin/src/adapters/registry.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { testCaseStoreContract } from './contracts.mts';
import { tmpDir } from './tmp.mts';

const HEADER =
  'ID,Title,Description,State,Suite,Requirement,Automated Test,Tags,Rev,Signature,Fields,Step Action,Step Expected';

/** The shop the contract expects: 501 in the plan with a link, 504 in no suite, and an empty suite "Payments". */
const SHOP = `${HEADER}
501,Coupon applies,,Design,Checkout,3,bdd:@TC-CHECKOUT-001,checkout; checkout-coupon,,,,Apply SAVE10,Total drops 10%
504,Draft: refund,,Design,,,,payments,,,,,
,,,,Payments,,,,,,,,
`;

const PLAN = 'Shop';

function folder(csv?: string): { file: string; store: () => FileStore } {
  const dir = tmpDir('qam-file-');
  const file = path.join(dir, 'testcases', 'testcases.csv');
  if (csv !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, csv);
  }
  return { file, store: () => new FileStore(file, PLAN, 'testcases/testcases.csv') };
}

const blocked = (re: RegExp) => (e: unknown) => e instanceof BlockedError && re.test(e.message);

testCaseStoreContract('file store', {
  make: () => folder(SHOP).store(),
  inPlan: 501,
  notInPlan: 504,
  missing: 999,
});

test('file store: where() names the file and the plan, relative so a ledger matches on every machine', () => {
  assert.equal(folder(SHOP).store().where(), 'File testcases/testcases.csv, plan Shop');
});

test('file store: an empty or missing file is an empty store; IDs start at 1000 and the file appears on first write', async () => {
  const f = folder();
  const store = f.store();
  assert.equal((await store.inPlan()).size, 0);
  assert.equal(fs.existsSync(f.file), false, 'reading writes nothing');
  const a = await store.create({ title: 'First' });
  const b = await store.create({ title: 'Second' });
  assert.deepEqual([a.id, b.id], [1000, 1001]);
  assert.equal(fs.readFileSync(f.file, 'utf8').split('\n')[0], HEADER);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['testcases.csv'], 'no temp file left behind');
});

test('file store: the next ID follows the highest in the file, not a gap', async () => {
  const store = folder(SHOP).store();
  assert.equal((await store.create({ title: 'Next' })).id, 1000);
  const high = folder(`${HEADER}\n2500,High,,Design,,,,,,,,,\n`).store();
  assert.equal((await high.create({ title: 'Next' })).id, 2501);
});

test('file store: awkward text and several steps survive a write and a re-read', async () => {
  const f = folder();
  const made = await f.store().create({
    title: 'Say "hi", then leave',
    description: 'Line one\nLine two, with a comma\r\nand a café ✓',
    steps: [
      { action: 'Type "a,b"\nthen press Enter', expected: '  Spaces kept  ' },
      { action: 'Second', expected: '' },
    ],
    addTags: ['one', 'two words'],
    requirements: [3, 4],
    automatedTest: 'bdd:@TC-X-001',
    fields: { Priority: '2' },
  });
  const again = await f.store().show(made.id);
  assert.deepEqual(again, made);
  assert.equal(again.title, 'Say "hi", then leave');
  assert.deepEqual(again.tests, [3, 4]);
  assert.deepEqual(again.fields, { Priority: '2' });
  assert.equal(again.steps.length, 2);
});

test('file store: the file is written with LF line ends and rows sorted by ID, so git diffs stay small', async () => {
  const f = folder();
  const s = f.store();
  await s.create({ title: 'A', steps: [{ action: 'x', expected: 'y' }] });
  await s.create({ title: 'B' });
  const text = fs.readFileSync(f.file, 'utf8');
  assert.ok(!text.includes('\r'));
  assert.ok(text.endsWith('\n'));
  const ids = text
    .split('\n')
    .map((l) => l.split(',')[0])
    .filter((x) => /^\d+$/.test(x));
  assert.deepEqual(ids, ['1000', '1001']);
});

test('file store: a file saved by Excel (BOM, CRLF) reads the same', async () => {
  const f = folder(`﻿${SHOP.replaceAll('\n', '\r\n')}`);
  const tc = await f.store().show(501);
  assert.equal(tc.title, 'Coupon applies');
  assert.deepEqual(tc.steps, [{ action: 'Apply SAVE10', expected: 'Total drops 10%' }]);
});

test('file store: a case with no Rev reads as revision 1', async () => {
  assert.equal((await folder(SHOP).store().show(501)).rev, 1);
});

test('file store: a hand edit counts as a change by someone else, so a stale read is refused', async () => {
  const f = folder();
  const made = await f.store().create({ title: 'Original', addTags: ['keep'] });
  const read = await f.store().show(made.id);
  fs.writeFileSync(f.file, fs.readFileSync(f.file, 'utf8').replace('Original', 'Edited by hand'));
  const after = await f.store().show(made.id);
  assert.equal(after.title, 'Edited by hand');
  assert.ok(after.rev > read.rev, 'the edit raises the revision even though nobody bumped the Rev column');
  assert.equal((await f.store().show(made.id)).rev, after.rev, 'and it stays the same until the next write');
  await assert.rejects(f.store().update(read, { title: 'Mine' }), blocked(/changed since it was read/));
  const next = await f.store().update(after, { addTags: ['more'] });
  assert.ok(next.rev > after.rev);
  assert.equal((await f.store().show(made.id)).rev, next.rev, 'a write by qam is not mistaken for a hand edit');
});

test("file store: two stores on one file see each other's writes, and the second writer is refused", async () => {
  const f = folder(SHOP);
  const a = f.store();
  const b = f.store();
  const mine = await a.show(501);
  await b.update(await b.show(501), { addTags: ['b-was-here'] });
  await assert.rejects(a.update(mine, { title: 'Late' }), blocked(/changed since it was read/));
});

test('file store: suites are kept even while empty, found again ignoring case, and numbered stably', async () => {
  const f = folder(SHOP);
  const first = await f.store().ensureSuite('Refunds');
  assert.equal(first.created, true);
  const again = await f.store().ensureSuite('refunds');
  assert.deepEqual([again.created, again.id], [false, first.id]);
  assert.notEqual((await f.store().ensureSuite('Payments')).id, first.id);
  await f.store().addToSuite(504, 'Refunds');
  assert.deepEqual((await f.store().show(504)).suites, ['Shop / Refunds']);
});

test('file store: the plan is the one in the settings; there is nothing to create', async () => {
  assert.deepEqual(await folder().store().ensurePlan(), { id: 1, name: PLAN, created: false });
});

test('file store: retire closes the case and takes it out of every suite; a closed case is not in the plan', async () => {
  const f = folder(SHOP);
  const s = f.store();
  await s.addToSuite(501, 'Payments');
  const done = await s.retire(await s.show(501));
  assert.match(done.join(' '), /Closed/);
  assert.match(done.join(' '), /Checkout/);
  assert.match(done.join(' '), /Payments/);
  const tc = await f.store().show(501);
  assert.equal(tc.state, 'Closed');
  assert.deepEqual(tc.suites, []);
  assert.ok(!(await f.store().inPlan()).has(501));
});

test('file store: a case closed by hand but left in a suite is not in the plan either', async () => {
  const f = folder(SHOP.replace('501,Coupon applies,,Design', '501,Coupon applies,,Closed'));
  assert.ok(!(await f.store().inPlan()).has(501));
});

test('file store: find only knows test cases', async () => {
  const s = folder(SHOP).store();
  assert.deepEqual(await s.find({ kind: 'requirement' }), []);
  assert.equal((await s.find({ kind: 'test_case', state: 'Design' })).length, 2);
});

test('file store: a problem in the file says which row and what to do', async () => {
  const COLS = HEADER.split(',');
  const row = (cells: Record<string, string>) => COLS.map((c) => cells[c] ?? '').join(',');
  const file = (...r: string[]) => `${HEADER}\n${r.join('\n')}\n`;
  const ok = { State: 'Design' };
  const cases: [string, RegExp][] = [
    [file(row({ ...ok, ID: 'abc', Title: 'No number' })), /row 2.*ID.*abc/i],
    [file(row({ ...ok, Title: 'No id' })), /row 2.*no ID/i],
    [file(row({ ...ok, ID: '7', Title: 'One' }), row({ ...ok, ID: '7', Title: 'Again' })), /row 3.*7.*twice/i],
    [file(row({ ...ok, ID: '7' })), /row 2.*Title/i],
    [file(row({ ...ok, ID: '7', Title: 'Req', Requirement: 'x1' })), /row 2.*Requirement.*x1/i],
    [file(row({ ...ok, ID: '7', Title: 'Rev', Rev: 'two' })), /row 2.*Rev.*two/i],
    [file(row({ ...ok, ID: '7', Title: 'Fields', Fields: '[1]' })), /row 2.*Fields/i],
    [file(row({ ...ok, ID: '7', Title: 'Quote', 'Step Expected': '"open' })), /quote/i],
    [file(`${row({ ...ok, ID: '7', Title: 'Many' })},extra`), /row 2.*cells/i],
    [file(row({ 'Step Action': 'Orphan step' })), /row 2.*step/i],
    ['ID,Title\n1,Only two columns\n', /missing.*column/i],
  ];
  for (const [csv, why] of cases) {
    await assert.rejects(folder(csv).store().inPlan(), blocked(why), csv);
  }
});

test('file store: a failed write leaves the file as it was', async () => {
  const f = folder(SHOP);
  const before = fs.readFileSync(f.file, 'utf8');
  const s = f.store();
  await assert.rejects(s.addToSuite(501, 'No such suite'), blocked(/No static suite/));
  await assert.rejects(s.update(await s.show(501), { suite: 'Nope' }), blocked(/No static suite/));
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
});

test('file store: a column QAMaster does not use is refused, since the next write would drop it', async () => {
  const csv = `${HEADER},Notes\n501,Coupon applies,,Design,,,,,,,,,,keep me\n`;
  await assert.rejects(folder(csv).store().inPlan(), blocked(/column 'Notes'/));
});

test('file store: checkWrite asks the file system and writes nothing', async () => {
  const f = folder();
  const answer = await f.store().checkWrite();
  assert.equal(answer.state, 'allowed');
  assert.match(answer.detail, /testcases\/testcases\.csv can be written/);
  assert.equal(fs.existsSync(path.dirname(f.file)), false, 'the testcases folder is not created by asking');
  const locked = folder(SHOP);
  fs.chmodSync(path.dirname(locked.file), 0o555);
  try {
    if (process.getuid?.() !== 0) assert.equal((await locked.store().checkWrite()).state, 'blocked');
  } finally {
    fs.chmodSync(path.dirname(locked.file), 0o755);
  }
});

test('file store: QAMASTER_STORE=file builds it in the QA project, named after the app', async () => {
  const dir = tmpDir('qam-file-cfg-');
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config', 'qamaster.json'), JSON.stringify({ app: { name: 'Juice Shop' } }));
  const store = buildStore(loadConfig(dir, { QAMASTER_STORE: 'file' }));
  assert.equal(store.where(), 'File testcases/testcases.csv, plan Juice Shop');
  await store.create({ title: 'Made through the registry' });
  assert.ok(fs.existsSync(path.join(dir, 'testcases', 'testcases.csv')));
});

test('file store: qam doctor checks it, --check-write answers, and the pipeline store stage turns done', () => {
  const QAM = path.resolve(import.meta.dirname, '..', 'plugin/bin/qam');
  const dir = tmpDir('qam-file-doctor-');
  const env = { ...process.env, QAMASTER_HOME: tmpDir('qam-home-'), QAMASTER_STORE: 'file' };
  const qam = (...args: string[]) => spawnSync(QAM, ['--repo', dir, '--json', ...args], { encoding: 'utf8', env });
  assert.equal(qam('setup', '--no-install').status, 0);
  const doctor = JSON.parse(qam('doctor', '--check-write').stdout);
  const checks = Object.fromEntries(doctor.checks.map((c: { check: string }) => [c.check, c]));
  assert.equal(checks['test case store'].ok, true, checks['test case store'].detail);
  assert.match(checks['test case store'].detail, /^File testcases\/testcases\.csv, plan .*: 0 test case\(s\)/);
  assert.equal(checks['write access'].state, 'allowed');
  const stages = JSON.parse(qam('pipeline', 'status').stdout);
  const store = (stages.stages ?? stages).find((s: { stage: string }) => s.stage === 'store');
  assert.equal(store.status, 'done', JSON.stringify(store));
});
