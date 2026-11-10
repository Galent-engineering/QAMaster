/**
 * 0.6.0 item 8 (Q50): publish chooses its destinations. `--to file,ado` checks access to each first, shows one preview
 * per destination, and one --apply writes to all, the local file first. In process on an in-memory ADO, as in
 * publish-ado.test.mts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { AdoClient, AdoTestCases } from '../plugin/src/adapters/ado.mts';
import { STORES } from '../plugin/src/adapters/registry.mts';
import { publish } from '../plugin/src/cli/publish.mts';
import { setupProject } from '../plugin/src/pipeline/setup.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { runHash } from '../plugin/src/testgen/run.mts';
import { FakeAdo } from './fake-ado.mts';
import { tmpDir } from './tmp.mts';

const REAL = STORES.ado;
afterEach(() => {
  STORES.ado = REAL;
});

const RUN = '20261030-1200-cart';
const kase = (id: string) => ({
  id,
  title: `Case ${id}`,
  component: 'Cart',
  category: 'Positive',
  priority: 'P1',
  objective: `Objective of ${id}`,
  preconditions: [],
  test_data: {},
  steps: [{ screen: '/cart', action: 'Click Pay', expected: 'The order is placed' }],
  expected_result: 'Placed',
  evidence: [],
});

function project(ado: FakeAdo) {
  const dir = tmpDir('qam-publish-dest-');
  setupProject(dir, { check: false, install: false, browsers: 'none' });
  fs.mkdirSync(path.join(dir, 'dsm'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dsm/dsm.json'),
    JSON.stringify({ generated_at: 'D1', page: { nodes: [{ id: '/cart', files: ['shop:src/cart/Cart.tsx'] }] } }),
  );
  STORES.ado = () =>
    new AdoTestCases(
      new AdoClient(
        'org',
        'Shop',
        () => 'Basic t',
        ado.fetch,
        async () => {},
      ),
      { organization: 'org', project: 'Shop', repoName: 'shop-web' },
    );
  // the project is set up for the file store: --to adds ADO next to it
  const env = { QAMASTER_ADO_ORG: 'org', QAMASTER_ADO_PROJECT: 'Shop', AZURE_CONFIG_DIR: dir };
  const cfg = loadConfig(dir, { ...env });
  const runDir = path.join(dir, 'testgen/output', RUN);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ scope: { module: 'Cart', sub_module: '' } }));
  fs.writeFileSync(path.join(runDir, 'testcases.json'), JSON.stringify([kase('TC-CART-001'), kase('TC-CART-002')]));
  const stamp = { run_hash: runHash(runDir) };
  fs.writeFileSync(
    path.join(runDir, 'validation.json'),
    JSON.stringify({ status: 'pass', errors: [], gaps: [], dsm_generated_at: 'D1', validated_at: 'x', ...stamp }),
  );
  fs.writeFileSync(
    path.join(runDir, 'run.json'),
    JSON.stringify({ reviewedBy: 'jo@example.test', reviewedAt: '2026-10-30T10:00:00Z', ...stamp }),
  );
  const run = async (...argv: string[]) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(' '));
    try {
      const json = argv.includes('--json');
      const args = argv.filter((a) => a !== '--json');
      return { code: await publish(cfg, [RUN, ...args], json), out: lines.join('\n') };
    } finally {
      console.log = log;
    }
  };
  const ledger = () => JSON.parse(fs.readFileSync(path.join(dir, '.qamaster/ledger.json'), 'utf8'));
  const store = () => loadConfig(dir, { ...env }).store;
  return { dir, run, ledger, store, csv: path.join(dir, 'testcases/testcases.csv') };
}

test('Q50: --to file,ado previews each destination, writes nothing, and exits 3', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  const before = JSON.stringify([...ado.items]);
  const r = await p.run('--to', 'file,ado');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /→ File testcases\/testcases\.csv.*\(dry run\)[\s\S]*Create \(2\)/);
  assert.match(r.out, /→ Azure DevOps org\/Shop \(dry run\)[\s\S]*Create \(2\)/);
  assert.ok(r.out.indexOf('→ File') < r.out.indexOf('→ Azure DevOps'), 'the local file comes first');
  assert.match(r.out, /Reply yes once to apply to all 2 destinations \(file, ado/);
  assert.equal(fs.existsSync(p.csv), false);
  assert.equal(JSON.stringify([...ado.items]), before, 'ADO was only read');
});

test('Q50: --to ado,file is still applied file first, and one --apply writes both and keeps both stores IDs', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  const cases = () => [...ado.items.values()].filter((i) => i.fields['System.WorkItemType'] === 'Test Case').length;
  const had = cases();
  const r = await p.run('--to', 'ado,file', '--apply');
  assert.equal(r.code, 0, r.out);
  assert.ok(r.out.indexOf('→ File') < r.out.indexOf('→ Azure DevOps'));
  assert.match(fs.readFileSync(p.csv, 'utf8'), /Case TC-CART-001/);
  assert.equal(cases(), had + 2);
  const ledger = p.ledger();
  // the project stays set up for the file store: the other destination is parked, never made the store quietly
  assert.match(ledger.store, /^File testcases\/testcases\.csv/);
  assert.deepEqual(ledger.entries.map((e: { trackerId: number }) => e.trackerId).sort(), [1000, 1001]);
  const [adoName, adoEntries] = Object.entries(ledger.other as Record<string, { trackerId: number }[]>)[0];
  assert.match(adoName, /^Azure DevOps org\/Shop/);
  assert.equal(adoEntries.length, 2);
  assert.ok(
    adoEntries.every((e) => ado.items.has(e.trackerId)),
    "the parked entries are ADO's",
  );
  assert.equal(p.store(), 'file', 'publish with no --to still goes to the file store');
});

test('Q50: a single --to that is not the configured store leaves the configured store active', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  for (const flags of [
    ['--to', 'ado', '--apply'],
    ['--to', 'file', '--apply'],
    ['--to', 'ado', '--apply'],
  ]) {
    const r = await p.run(...flags);
    assert.equal(r.code, 0, r.out);
    assert.match(p.ledger().store, /^File /, `after ${flags.join(' ')}`);
    assert.equal(p.store(), 'file');
  }
  assert.equal(p.ledger().entries.length, 2);
  assert.equal(Object.values(p.ledger().other as Record<string, unknown[]>)[0].length, 2, 'ADO kept its IDs');
});

test('Q50: the preview says when a destination has nothing recorded yet', async () => {
  const p = project(new FakeAdo());
  await p.run('--to', 'file', '--apply');
  const r = await p.run('--to', 'ado');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /Nothing recorded yet for Azure DevOps org\/Shop: every case is created there/);
});

test('Q34: --to ado still blocks when the ledger holds another ADO project', async () => {
  const p = project(new FakeAdo());
  await p.run('--to', 'file', '--apply');
  const ledger = p.ledger();
  ledger.other = { 'Azure DevOps org/OldProject': ledger.entries };
  fs.writeFileSync(path.join(p.dir, '.qamaster/ledger.json'), JSON.stringify(ledger));
  for (const to of ['ado', 'file,ado']) {
    await assert.rejects(
      p.run('--to', to),
      /belongs to Azure DevOps org\/OldProject, but the store is now Azure DevOps org\/Shop/,
    );
  }
});

test('Q50: publishing again to both destinations changes nothing in either', async () => {
  const ado = new FakeAdo();
  const p = project(ado);
  await p.run('--to', 'file,ado', '--apply');
  const csv = fs.readFileSync(p.csv, 'utf8');
  const items = JSON.stringify([...ado.items]);
  const again = await p.run('--to', 'file,ado', '--apply');
  assert.equal(again.code, 0, again.out);
  assert.equal(fs.readFileSync(p.csv, 'utf8'), csv);
  assert.equal(JSON.stringify([...ado.items]), items);
  assert.equal(p.ledger().entries.length, 2, 'both destinations kept their IDs through the second pass');
  assert.equal(Object.values(p.ledger().other as Record<string, unknown[]>)[0].length, 2);
});

test('Q50: a destination that cannot be reached blocks everything first, naming it', async () => {
  const p = project(new FakeAdo());
  STORES.ado = () => {
    throw new BlockedError('No Azure DevOps credentials. Set QAMASTER_ADO_TOKEN.');
  };
  for (const flags of [[], ['--apply']]) {
    await assert.rejects(
      p.run('--to', 'file,ado', ...flags),
      (e: unknown) =>
        e instanceof BlockedError &&
        /ado: No Azure DevOps credentials/.test(e.message) &&
        /nothing was previewed or written/.test(e.message) &&
        /--to file/.test(e.message),
    );
    assert.equal(fs.existsSync(p.csv), false, 'the file store was not written either');
  }
});

test('Q50: a destination that is not a store is blocked with the list', async () => {
  const p = project(new FakeAdo());
  await assert.rejects(p.run('--to', 'jira'), /--to jira isn't a store\. Use one or more of: ado, file/);
});

test('Q50: --json for several destinations gives one entry each', async () => {
  const p = project(new FakeAdo());
  const r = await p.run('--to', 'file,ado', '--json');
  const data = JSON.parse(r.out);
  assert.equal(data.result, 'awaiting approval');
  assert.deepEqual(
    data.destinations.map((d: { store: string }) => d.store.split(' ')[0]),
    ['File', 'Azure'],
  );
});
