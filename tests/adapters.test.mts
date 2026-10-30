import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRequirements, buildRunner, buildStore } from '../plugin/src/adapters/registry.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { retag } from '../plugin/src/shared/models.mts';
import { requirementSourceContract, testCaseStoreContract } from './contracts.mts';
import { CHANGE, FakeCrawler, FakeRepoReader, FakeRequirements, FakeRunner, FakeStore, UI_MODEL } from './fakes.mts';
import { tmpDir } from './tmp.mts';

testCaseStoreContract('fake store', { make: () => new FakeStore(), inPlan: 501, notInPlan: 504, missing: 999 });
requirementSourceContract('fake requirements', {
  make: () => new FakeRequirements(),
  sprint: 'Sprint 24',
  inSprint: '3',
  missing: 999,
});

const config = (env: Record<string, string> = {}) => loadConfig(tmpDir('qam-adapters-'), env);

test('an unknown adapter names the known ones', () => {
  assert.throws(() => buildStore(config({ QAMASTER_STORE: 'jira' })), {
    name: 'BlockedError',
    message: "QAMASTER_STORE=jira isn't a known adapter. Use one of: ado.",
  });
  assert.throws(() => buildRunner(config({ QAMASTER_RUNNER: 'cypress' })), /Use one of: playwright-bdd, pytest\./);
  assert.throws(() => buildRunner(config({ QAMASTER_RUNNER: 'toString' })), /isn't a known adapter/);
});

test('the ADO adapters say which settings they need; the runners block until their porting step lands', () => {
  for (const build of [buildStore, buildRequirements]) {
    assert.throws(() => build(config()), { name: 'BlockedError', message: /QAMASTER_ADO_ORG=<organization>/ });
  }
  assert.ok(
    buildStore(config({ QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop' }))
      .where()
      .includes('org/Shop'),
  );
  assert.throws(() => buildRunner(config()), { name: 'BlockedError', message: /adapter isn't built yet/ });
});

test('retag adds and removes without case and keeps order', () => {
  assert.deepEqual(retag(['A', 'b', 'c'], ['B', 'd'], ['C']), ['A', 'b', 'd']);
});

test('fake runner fails only the failing cases and records the run', async () => {
  const runner = new FakeRunner(undefined, new Set([502]));
  const selection = new Map([
    [501, ['bdd:@TC-CHECKOUT-001']],
    [502, ['bdd:@TC-CHECKOUT-002']],
  ]);
  const results = await runner.run(selection, '/tests', '/evidence');
  assert.deepEqual(
    results.map((r) => [r.testCaseId, r.status]),
    [
      [501, 'passed'],
      [502, 'failed'],
    ],
  );
  assert.equal(runner.ran[0].evidence, '/evidence');
  assert.ok((await runner.collected('/tests')).includes('bdd:@TC-LOGIN-001'));
});

test('fake repo reader diffs the given range and reads only known files', async () => {
  const repo = new FakeRepoReader();
  const change = await repo.diff('base', 'head');
  assert.deepEqual([change.base, change.head, change.files], ['base', 'head', CHANGE.files]);
  assert.equal(await repo.head(), CHANGE.head);
  await assert.rejects(repo.readFile(CHANGE.head, 'missing.ts'), { name: 'BlockedError' });
});

test('fake crawler returns a copy of the model and records the options', async () => {
  const crawler = new FakeCrawler();
  const model = await crawler.crawl({ baseUrl: UI_MODEL.base_url });
  assert.deepEqual(model, UI_MODEL);
  assert.notEqual(model, UI_MODEL);
  assert.equal(crawler.crawls[0].baseUrl, UI_MODEL.base_url);
});
