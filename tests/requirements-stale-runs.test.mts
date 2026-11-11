/**
 * 0.7.2 item 16: after qam requirements fetch, the output names the reviewed TestGen runs for this scope whose manifest
 * was generated before the fetch. The fetch time is the saved requirements.json's saved_at; no new file is written.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { requirements, reviewedRunsBefore } from '../plugin/src/cli/requirements.mts';
import { loadConfig } from '../plugin/src/shared/config.mts';
import { FakeRequirements } from './fakes.mts';
import { tmpDir } from './tmp.mts';

function run(dir: string, name: string, manifest: Record<string, unknown>, reviewed: boolean) {
  const d = path.join(dir, 'testgen', 'output', name);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(manifest));
  if (reviewed) fs.writeFileSync(path.join(d, 'run.json'), JSON.stringify({ reviewedBy: 'qa', reviewedAt: 'x' }));
}

test('reviewed runs for the scope generated before the fetch are named; the rest are not', () => {
  const dir = tmpDir('qam-stale-');
  const scope = { requirements_scope: 'sprint-24' };
  run(dir, '20261101-old-reviewed', { generated_at: '2026-11-01T09:00:00Z', ...scope }, true);
  run(dir, '20261101-old-unreviewed', { generated_at: '2026-11-01T09:00:00Z', ...scope }, false);
  run(dir, '20261101-other-scope', { generated_at: '2026-11-01T09:00:00Z', requirements_scope: 'x' }, true);
  run(dir, '20261115-after-fetch', { generated_at: '2026-11-15T09:00:00Z', ...scope }, true);
  assert.deepEqual(reviewedRunsBefore(dir, 'sprint-24', '2026-11-10T12:00:00Z'), ['20261101-old-reviewed']);
  assert.deepEqual(reviewedRunsBefore(tmpDir('qam-none-'), 'sprint-24', '2026-11-10T12:00:00Z'), []);
});

test('fetch prints the stale runs as a note and writes no file besides the requirements the fetch saves', async () => {
  const dir = tmpDir('qam-stale-fetch-');
  run(dir, '20000101-old', { generated_at: '2000-01-01T00:00:00Z', requirements_scope: 'sprint-24' }, true);
  const lines: string[] = [];
  const log = console.log;
  console.log = (s: string) => lines.push(s);
  try {
    await requirements(loadConfig(dir, {}), ['fetch', '--sprint', 'Sprint 24'], false, () => new FakeRequirements());
  } finally {
    console.log = log;
  }
  const out = lines.join('\n');
  assert.match(out, /Note: Reviewed TestGen run\(s\) generated before this fetch: 20000101-old/);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'requirements')).sort(), ['sprint-24']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'requirements', 'sprint-24')).sort(), [
    'requirements.json',
    'requirements.md',
  ]);
});
