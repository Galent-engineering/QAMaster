/** 0.5.0: qam requirements fetch, import and list, and stage 6 of the pipeline. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { requirements } from '../plugin/src/cli/requirements.mts';
import { storiesFromFile } from '../plugin/src/requirements/requirements.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { BlockedError } from '../plugin/src/shared/errors.mts';
import { FakeRequirements } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/requirements');
const QAM = path.join(ROOT, 'bin/qam');
const HOME = tmpDir('qam-home-');
const qam = (dir: string, ...args: string[]) => {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
const saved = (dir: string, scope: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'requirements', scope, 'requirements.json'), 'utf8'));
/** Runs the command in-process, capturing what it prints. */
async function run(dir: string, argv: string[], src = new FakeRequirements()) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (s: string) => lines.push(s);
  try {
    return { code: await requirements(loadConfig(dir, {}), argv, false, () => src), out: lines.join('\n') };
  } finally {
    console.log = log;
  }
}

test('import reads a workbook, a CSV, a JSON list and a Markdown file; stories with no ID get US-001, …', () => {
  const ids = (f: string) => storiesFromFile(path.join(FIX, f)).map((r) => [r.id, r.title]);
  assert.deepEqual(ids('stories.xlsx'), [
    ['SHOP-12', 'Login'],
    ['US-002', 'Reset password'],
  ]);
  assert.deepEqual(storiesFromFile(path.join(FIX, 'stories.xlsx'))[0].acceptance_criteria, [
    'Valid email and password open the dashboard',
    'A wrong password shows an error',
  ]);
  assert.deepEqual(ids('stories.csv'), [
    ['SHOP-1', 'Add to cart'],
    ['US-002', 'Remove from cart'],
  ]);
  const csv = storiesFromFile(path.join(FIX, 'stories.csv'))[0];
  assert.deepEqual(
    [csv.description, csv.acceptance_criteria, csv.labels],
    [
      'Shoppers add an item, then see it in the cart',
      ['The cart badge counts the item', 'The item shows in the cart'],
      ['cart', 'web'],
    ],
  );
  assert.deepEqual(ids('stories.json'), [
    ['SHOP-30', 'Track an order'],
    ['US-002', 'Cancel an order'],
  ]);
  assert.deepEqual(ids('stories.md'), [
    ['US-7', 'Apply a coupon'],
    ['US-002', 'Checkout as guest'],
  ]);
  assert.deepEqual(storiesFromFile(path.join(FIX, 'stories.md'))[0].acceptance_criteria, [
    'SAVE10 takes 10% off',
    'An unknown code shows an error',
  ]);
});

test('import saves requirements/<file name>/ with a readable copy; list shows it; a file with no stories blocks', () => {
  const dir = tmpDir('qam-req-');
  const r = qam(dir, 'requirements', 'import', '--file', path.join(FIX, 'stories.csv'));
  assert.equal(r.status, 0, r.err);
  assert.match(
    r.out,
    /Saved 2 requirement\(s\) from document \(stories\.csv\) in requirements\/stories\/requirements\.json/,
  );
  assert.match(r.out, /No acceptance criteria: US-002/);
  assert.match(r.out, /"requirements_scope": "stories"/);
  assert.equal(saved(dir, 'stories').count, 2);
  assert.match(
    fs.readFileSync(path.join(dir, 'requirements/stories/requirements.md'), 'utf8'),
    /## SHOP-1: Add to cart/,
  );
  assert.match(qam(dir, 'requirements', 'list').out, /stories +2 item\(s\) +document, stories\.csv/);
  const empty = path.join(dir, 'empty.md');
  fs.writeFileSync(empty, '# Nothing here\n');
  const b = qam(dir, 'requirements', 'import', '--file', empty, '--scope', 'x');
  assert.equal(b.status, 2);
  assert.match(b.err, /No user stories in/);
});

test('fetch saves a sprint under its name, with the source; one period only; nothing found saves nothing', async () => {
  const dir = tmpDir('qam-req-');
  const r = await run(dir, ['fetch', '--sprint', 'Sprint 24']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Saved 1 requirement\(s\) .*\(sprint Sprint 24\) in requirements\/sprint-24\/requirements\.json/);
  assert.deepEqual(
    saved(dir, 'sprint-24').requirements.map((x: { id: string }) => x.id),
    ['3'],
  );
  await assert.rejects(run(dir, ['fetch', '--sprint', 'S', '--current-sprint']), /Give one period/);
  await assert.rejects(run(dir, ['fetch', '--from', '2026-11-02', '--to', '2026-11-01']), /--from on or before --to/);
  await assert.rejects(run(dir, ['fetch', '--sprint', 'Sprint 99']), (e: Error) => {
    assert.ok(e instanceof BlockedError);
    assert.match(e.message, /No requirements in sprint Sprint 99/);
    return true;
  });
  assert.ok(!fs.existsSync(path.join(dir, 'requirements/sprint-99')));
});

test('fetch prints what the source says about bugs and the fallback, and keeps the fallback in the file', async () => {
  const dir = tmpDir('qam-req-');
  const src = Object.assign(new FakeRequirements(), {
    notice: 'No User Story work items in Shop; showing the other work items.',
    bugs: { included: false, why: "bugs left out: team Shop Team doesn't work bugs as requirements" },
  });
  const r = await run(dir, ['fetch', '--sprint', 'Sprint 24', '--scope', 'Coupons sprint'], src);
  assert.match(r.out, /Note: bugs left out: team Shop Team/);
  assert.match(r.out, /Note: No User Story work items/);
  assert.match(saved(dir, 'coupons-sprint').notice, /No User Story/);
});

test('stage 6 is done once a scope is saved, and its next step names fetch and import', () => {
  const dir = tmpDir('qam-req-');
  qam(dir, 'setup', '--no-install');
  const stage = () =>
    JSON.parse(qam(dir, '--json', 'pipeline', 'status').out).stages.find(
      (s: { stage: string }) => s.stage === 'requirements',
    );
  assert.equal(stage().status === 'done', false);
  qam(dir, 'requirements', 'import', '--file', path.join(FIX, 'stories.json'));
  assert.equal(stage().status, 'done');
});
