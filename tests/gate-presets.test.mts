/**
 * 0.7.0 item 14 (Q31): selection presets and the groups model. qam plan --preset fast|standard|full, gate.preset
 * (default standard, exactly today's plan) and gate.groupsModel; the plan names the preset, the selectors and the model.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Runner } from '../plugin/src/adapters/base.mts';
import type { Gate } from '../plugin/src/gate/gate.mts';
import { makePlan } from '../plugin/src/gate/gate.mts';
import { choosePreset, inCI, planWith, renderSelection } from '../plugin/src/gate/presets.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { GROUPS_MODELS, PRESETS } from '../plugin/src/shared/models.mts';
import { asProjectConfig, DEFAULT_PROJECT_CONFIG } from '../plugin/src/shared/schema.mts';
import { FakeRepoReader, FakeRunner, FakeStore } from './fakes.mts';
import { tmpDir } from './tmp.mts';

/** The DSM says the diff touches /cart (case 701), and /checkout has no case. */
const DSM: Gate['dsm'] = () => ({
  cases: new Map([[701, ['/cart']]]),
  gaps: [{ screen: '/checkout', files: ['shop/checkout/coupon.ts'], why: 'no test case visits it' }],
});
function gate(more: Partial<Gate> = {}): Gate {
  const runners: Record<string, Runner> = { 'playwright-bdd': new FakeRunner(), pytest: new FakeRunner() };
  return {
    store: new FakeStore(),
    repo: new FakeRepoReader(),
    runner: (name) => runners[name] ?? null,
    root: (name) => `/tests/${name}`,
    retries: 1,
    ...more,
  };
}
const ids = (p: { items: { testCase: { id: number } }[] }) => p.items.map((i) => i.testCase.id);
const on = { ai: 'on', groupsModel: null } as const;

test('the presets, and the models a groups subagent may use, are named in one place', () => {
  assert.deepEqual([...PRESETS], ['fast', 'standard', 'full']);
  assert.deepEqual([...GROUPS_MODELS], ['sonnet', 'opus', 'haiku', 'fable', 'inherit']);
});

test('standard is exactly the plan without a preset, and names its selectors', async () => {
  const g = gate({ dsm: DSM });
  const today = await makePlan(g, 'main', {});
  const plan = await planWith(g, 'main', {}, { preset: 'standard', ...on });
  const { id: _a, createdAt: _b, ...a } = today;
  const { id: _c, createdAt: _d, selection, ...b } = plan;
  assert.deepEqual(b, a);
  assert.deepEqual(ids(plan), [501, 502, 601, 701]);
  assert.deepEqual(selection, { preset: 'standard', selectors: ['path', 'smoke', 'dsm'], model: 'inherit' });
});

test('fast is path and smoke: the DSM adds no case and reports no gap', async () => {
  const plan = await planWith(gate({ dsm: DSM }), 'main', {}, { preset: 'fast', ...on });
  assert.deepEqual(ids(plan), [501, 502, 601]);
  assert.deepEqual(plan.gaps, []);
  assert.deepEqual(plan.selection, { preset: 'fast', selectors: ['path', 'smoke'], model: null });
});

test('a group picked by hand still applies on fast, and is named as a selector', async () => {
  const plan = await planWith(gate(), 'main', { cart: 'cart total' }, { preset: 'fast', ...on });
  assert.deepEqual(ids(plan), [501, 502, 601, 701]);
  assert.deepEqual(plan.selection?.selectors, ['path', 'smoke', 'group']);
});

test('full is makePlan with all (D5: 0.6.0 qam plan --all): every case with a script, manual cases not planned', async () => {
  const g = gate({ dsm: DSM });
  const plan = await planWith(g, 'main', {}, { preset: 'full', ...on });
  const all = await makePlan(g, 'main', {}, { all: true });
  assert.deepEqual(ids(plan), ids(all));
  assert.ok(!ids(plan).includes(503), 'a case with no script is manual, not planned');
  for (const i of plan.items) assert.equal(i.reasons[0].kind, 'all');
  assert.deepEqual(plan.selection, { preset: 'full', selectors: ['all', 'path', 'smoke', 'dsm'], model: null });
});

test('--all is --preset full, and clashes with any other preset', () => {
  assert.equal(choosePreset(undefined, 'standard', true), 'full');
  assert.equal(choosePreset('full', 'fast', true), 'full');
  assert.throws(
    () => choosePreset('fast', 'standard', true),
    (e) => e instanceof BlockedError && /--all is --preset full/.test(e.message),
  );
});

test('in CI no model picks groups, so the plan names none (0.7.1)', async () => {
  const p = await planWith(gate(), 'main', {}, { preset: 'standard', ai: 'on', groupsModel: 'haiku', ci: true });
  assert.equal(p.selection?.model, null);
  assert.doesNotMatch(renderSelection(p), /groups picked by/);
  assert.equal(inCI({ CI: 'true' }), true);
  assert.equal(inCI({ CI: '1' }), true);
  for (const off of [{}, { CI: '' }, { CI: 'false' }, { CI: '0' }]) assert.equal(inCI(off), false);
});

test('the groups model is named only when a model picks groups: standard, with AI on', async () => {
  const g = gate();
  assert.equal(
    (await planWith(g, 'main', {}, { preset: 'standard', ai: 'on', groupsModel: 'haiku' })).selection?.model,
    'haiku',
  );
  assert.equal(
    (await planWith(g, 'main', {}, { preset: 'standard', ai: 'on', groupsModel: null })).selection?.model,
    'inherit',
  );
  assert.equal(
    (await planWith(g, 'main', {}, { preset: 'standard', ai: 'off', groupsModel: 'haiku' })).selection?.model,
    null,
  );
  assert.equal(
    (await planWith(g, 'main', {}, { preset: 'fast', ai: 'on', groupsModel: 'haiku' })).selection?.model,
    null,
  );
});

test('renderSelection prints the preset, selectors and model', async () => {
  const g = gate({ dsm: DSM });
  const p = await planWith(g, 'main', {}, { preset: 'standard', ai: 'on', groupsModel: 'sonnet' });
  assert.equal(renderSelection(p), 'Selection: preset standard (path, smoke, dsm); groups picked by sonnet');
  const q = await planWith(g, 'main', {}, { preset: 'standard', ai: 'on', groupsModel: null });
  assert.equal(
    renderSelection(q),
    "Selection: preset standard (path, smoke, dsm); groups picked by the session's model",
  );
  const f = await planWith(g, 'main', {}, { preset: 'fast', ai: 'on', groupsModel: null });
  assert.equal(renderSelection(f), 'Selection: preset fast (path, smoke)');
  assert.equal(renderSelection(await makePlan(g, 'main', {})), '');
});

test('--preset must be one of the presets, else the configured one', () => {
  assert.equal(choosePreset(undefined, 'standard'), 'standard');
  assert.equal(choosePreset(undefined, 'full'), 'full');
  assert.equal(choosePreset('fast', 'full'), 'fast');
  assert.throws(
    () => choosePreset('quick', 'standard'),
    (e) => e instanceof BlockedError && /--preset must be one of fast, standard, full/.test(e.message),
  );
});

test('gate.preset and gate.groupsModel: defaults, and a BlockedError naming the valid values', () => {
  assert.equal(DEFAULT_PROJECT_CONFIG.gate.preset, 'standard');
  assert.equal(DEFAULT_PROJECT_CONFIG.gate.groupsModel, null);
  const c = asProjectConfig({ gate: { preset: 'fast', groupsModel: 'opus' } }, 'q.json');
  assert.deepEqual([c.gate.preset, c.gate.groupsModel], ['fast', 'opus']);
  assert.throws(
    () => asProjectConfig({ gate: { preset: 'quick' } }, 'q.json'),
    /"gate\.preset" must be one of fast, standard, full/,
  );
  assert.throws(
    () => asProjectConfig({ gate: { groupsModel: 'gpt' } }, 'q.json'),
    /"gate\.groupsModel" must be one of sonnet, opus, haiku, fable, inherit/,
  );
  assert.equal(asProjectConfig({}, 'q.json').gate.preset, 'standard');
});

test('gate.groupsModel may be null (unset), as a config written from the defaults has it', () => {
  assert.equal(asProjectConfig({ gate: { groupsModel: null } }, 'q.json').gate.groupsModel, null);
});

test('qam plan --preset with an unknown preset is blocked (exit 2) and names the valid ones', () => {
  const dir = tmpDir('qam-preset-');
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(path.join(dir, 'config/qamaster.json'), JSON.stringify({ app: { name: 'Shop' } }));
  for (const a of [
    ['init', '-q', '-b', 'main'],
    ['-c', 'user.name=A', '-c', 'user.email=a@b.test', 'commit', '-q', '--allow-empty', '-m', 'x'],
  ])
    spawnSync('git', ['-C', dir, ...a]);
  const r = spawnSync(
    path.resolve(import.meta.dirname, '..', 'bin/qam'),
    ['--repo', dir, 'plan', '--preset', 'quick'],
    {
      encoding: 'utf8',
      env: { ...process.env, QAMASTER_HOME: tmpDir('qam-home-'), QAMASTER_STORE: 'file' },
    },
  );
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--preset must be one of fast, standard, full/);
});
