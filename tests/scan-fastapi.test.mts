import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build, type DsmConfig } from '../plugin/src/dsm/build.mts';
import { type RepoConfig, scan, wanted } from '../plugin/src/dsm/scan.mts';
import { DEFAULT_EXCLUDE } from '../plugin/src/pipeline/sources.mts';

const DIR = path.resolve(import.meta.dirname, 'fixtures/scan/fastapi/repo');

function files(prefix = ''): string[] {
  return fs.readdirSync(path.join(DIR, prefix), { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? files(rel) : [rel];
  });
}

// FastAPI: router prefixes, every verb, and server-only routes as kind api (A4, A5, Q48)

function fastapiModel() {
  const repo: RepoConfig = { name: 'api', path: '<repo>', branch: 'main', include: [], exclude: DEFAULT_EXCLUDE };
  return scan({ repositories: [repo] }, (r) => ({
    ref: 'main',
    commit: null,
    files: new Map(
      files()
        .sort()
        .filter((p) => wanted(p, r))
        .map((p) => [p, fs.readFileSync(path.join(DIR, p), 'utf8')]),
    ),
  }));
}

test('FastAPI: router and include_router prefixes are applied, and all five verbs are found', () => {
  const found = (fastapiModel().routes ?? [])
    .filter((r) => r.framework === 'fastapi')
    .map((r) => `${r.method} ${r.route}`)
    .sort();
  assert.deepEqual(found, [
    'DELETE /api/v1/workflows/:id',
    'DELETE /v2/agents/:id',
    'GET /api/v1/workflows',
    'GET /api/v1/workflows/:id',
    'GET /health',
    'GET /status',
    'GET /v2/agents/:id',
    'PATCH /api/v1/workflows/:id/assignments/:id/claim',
    'POST /api/v1/workflows/:id/approvals',
    'PUT /api/v1/workflows/:id',
  ]);
});

test('Q48: a verb route nothing links to is kind api; a linked one and a page stay screens', () => {
  const kinds = Object.fromEntries((fastapiModel().routes ?? []).map((r) => [r.route, r.kind]));
  assert.equal(kinds['/api/v1/workflows/:id/approvals'], 'api');
  assert.equal(kinds['/health'], 'api');
  assert.equal(kinds['/status'], 'action', 'dashboard.html links to it');
  assert.equal(kinds['/dashboard.html'], 'page-file');
});

test('Q48: the DSM keeps the UI route as a screen and gives the API routes no cell, flag or count', () => {
  const code = fastapiModel();
  const config: DsmConfig = { project: 'api', output_dir: 'dsm', repositories: [] };
  const dsm = build(
    { generated_at: '', base_url: '', mode: 'full', truncated: false, pages: [], edges: [], api_calls: [] },
    code,
    config,
    { now: new Date('2026-11-04T00:00:00Z') },
  );
  const labels = dsm.page.nodes.map((n) => n.label).sort();
  assert.deepEqual(labels, ['/dashboard.html', '/status']);
  for (const n of dsm.page.nodes) assert.ok(!n.flags.includes('orphan') || n.label === '/dashboard.html');
  assert.ok(
    (code.routes ?? []).some((r) => r.route === '/health' && r.kind === 'api'),
    'still in the code model',
  );
});
