import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { type UpdateConfig, update } from '../plugin/src/dsm/update.mts';
import type { UiModel } from '../plugin/src/shared/models.mts';
import { FakeCrawler } from './fakes.mts';
import { tmpDir } from './tmp.mts';

const FASTAPI = path.resolve(import.meta.dirname, 'fixtures/scan/fastapi/repo');

function gitIn(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
}

const UI: UiModel = {
  generated_at: '2026-10-29T00:00:00.000Z',
  base_url: 'http://app.test/',
  mode: 'full',
  truncated: false,
  pages: [{ route: '/status', url: 'http://app.test/status' }],
  edges: [],
  api_calls: [],
};

test('API routes (kind api) are never crawl seeds, for a full and an incremental refresh (Q48)', async () => {
  const qa = tmpDir('qam-api-seeds-');
  const app = path.join(qa, 'app');
  fs.cpSync(FASTAPI, app, { recursive: true });
  gitIn(app, 'init', '-q', '-b', 'main');
  gitIn(app, 'add', '-A');
  gitIn(app, 'commit', '-qm', 'init');
  const config = {
    project: 'api',
    output_dir: 'dsm',
    repositories: [{ name: 'api', path: 'app', branch: 'main', fetch: false, include: [], exclude: [] }],
    application: { base_url: 'http://app.test/' },
  } as UpdateConfig;
  fs.mkdirSync(path.join(qa, 'config'));
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), '{}');
  const dir = path.join(qa, 'dsm');
  const crawler = new FakeCrawler(UI);

  await update(qa, dir, config, () => crawler, { mode: 'run', fetch: false });
  const full = crawler.crawls[0].seeds ?? [];
  assert.ok(full.includes('/status'), 'an action route is still seeded');
  assert.ok(!full.includes('/health'), 'an API route is not');

  // a commit adds a new API route (/ping, no link to it) : it must not become an incremental seed
  fs.appendFileSync(path.join(app, 'main.py'), '\n\n@app.get("/ping")\ndef ping():\n    return {}\n');
  gitIn(app, 'commit', '-qam', 'more routes');
  await update(qa, dir, config, () => crawler, { mode: 'refresh', fetch: false });
  assert.equal(crawler.crawls.length, 2);
  const inc = crawler.crawls.at(-1);
  assert.ok(inc?.routes !== undefined || inc?.seeds !== undefined);
  assert.ok(!(inc?.seeds ?? []).includes('/ping'), 'a new API route is not an incremental seed');
});
