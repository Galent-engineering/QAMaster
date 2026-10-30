/**
 * One contract per store interface (docs/tech.md, Testing): the behaviour every implementation must have. Each suite
 * runs against the fake now and against the ADO adapter's recorded responses later, so new stores reuse it unchanged.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RequirementSource, TestCaseStore } from '../plugin/src/adapters/base.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';

export type StoreFixture = {
  make: () => TestCaseStore; // a fresh store for each test
  inPlan: number; // a test case in the plan, with an automation link
  notInPlan: number; // a test case outside the plan
  missing: number; // an ID with no work item
};

const blocked = (e: unknown) => e instanceof BlockedError;

export function testCaseStoreContract(name: string, f: StoreFixture): void {
  test(`${name}: inPlan lists the plan's test cases with tags and automation links`, async () => {
    const cases = await f.make().inPlan();
    const tc = cases.get(f.inPlan);
    assert.ok(tc, `test case ${f.inPlan} is in the plan`);
    assert.equal(tc.id, f.inPlan);
    assert.ok(tc.title && tc.url && Array.isArray(tc.tags));
    assert.match(tc.automatedTest ?? '', /^(bdd:@|pytest:)/);
    assert.ok(!cases.has(f.notInPlan), `test case ${f.notInPlan} is outside the plan`);
  });

  test(`${name}: show returns the item and blocks on a missing ID`, async () => {
    const store = f.make();
    assert.equal((await store.show(f.inPlan)).kind, 'test_case');
    assert.equal(store.url(f.inPlan), (await store.show(f.inPlan)).url);
    await assert.rejects(store.show(f.missing), blocked);
  });

  test(`${name}: find filters by kind, tag and text, and honours the limit`, async () => {
    const store = f.make();
    const tc = await store.show(f.inPlan);
    const byTag = await store.find({ kind: 'test_case', tag: tc.tags[0] });
    assert.ok(byTag.some((i) => i.id === f.inPlan));
    assert.ok(byTag.every((i) => i.kind === 'test_case'));
    const byText = await store.find({ kind: 'test_case', text: tc.title.toUpperCase() });
    assert.ok(
      byText.some((i) => i.id === f.inPlan),
      'text search ignores case',
    );
    assert.equal((await store.find({ kind: 'test_case', limit: 1 })).length, 1);
  });

  test(`${name}: create, then update tags without losing others, then retire`, async () => {
    const store = f.make();
    const created = await store.create({ title: 'Contract case', addTags: ['contract', 'keep'] });
    assert.equal(created.kind, 'test_case');
    assert.equal(created.title, 'Contract case');
    const updated = await store.update(created, { addTags: ['Contract', 'new'], removeTags: ['KEEP'] });
    assert.deepEqual(updated.tags, ['contract', 'new'], 'tags compare without case');
    assert.ok(updated.rev > created.rev);
    const done = await store.retire(updated);
    assert.ok(done.length > 0, 'retire says what it did');
  });

  test(`${name}: update refuses an item read before someone else changed it`, async () => {
    const store = f.make();
    const stale = await store.show(f.inPlan);
    await store.update(await store.show(f.inPlan), { addTags: ['someone-else'] });
    await assert.rejects(store.update(stale, { title: 'Mine' }), blocked);
  });

  test(`${name}: addToSuite puts a test case in the plan`, async () => {
    const store = f.make();
    await store.addToSuite(f.notInPlan, 'Payments');
    assert.ok((await store.inPlan()).has(f.notInPlan));
  });

  test(`${name}: ensurePlan finds the plan; ensureSuite creates a missing suite once, and addToSuite can use it`, async () => {
    const store = f.make();
    const plan = await store.ensurePlan();
    assert.equal(plan.created, false, 'the plan exists');
    assert.ok(plan.name);
    const first = await store.ensureSuite('Contract suite');
    assert.equal(first.created, true);
    const again = await store.ensureSuite('contract suite');
    assert.deepEqual([again.created, again.id], [false, first.id], 'found again, ignoring case');
    await assert.rejects(store.addToSuite(f.notInPlan, 'No such suite'), blocked);
    await store.addToSuite(f.notInPlan, 'Contract suite');
    assert.ok((await store.inPlan()).has(f.notInPlan));
  });
}

export type RequirementFixture = {
  make: () => RequirementSource;
  sprint: string; // a sprint with at least one requirement
  inSprint: string; // the ID of one of them
  missing: number;
};

export function requirementSourceContract(name: string, f: RequirementFixture): void {
  test(`${name}: requirements of a sprint come in Autonomous-QE's shape`, async () => {
    const found = await f.make().requirements({ sprint: f.sprint });
    const r = found.find((x) => x.id === f.inSprint);
    assert.ok(r, `requirement ${f.inSprint} is in ${f.sprint}`);
    assert.equal(r.sprint, f.sprint);
    assert.ok(r.title && r.type && r.status && Array.isArray(r.acceptance_criteria));
  });

  test(`${name}: show blocks on a missing ID`, async () => {
    await assert.rejects(f.make().show(f.missing), blocked);
  });

  test(`${name}: create makes a requirement`, async () => {
    const source = f.make();
    const created = await source.create({ title: 'Contract requirement' });
    assert.equal(created.kind, 'requirement');
    assert.equal((await source.show(created.id)).title, 'Contract requirement');
  });
}
