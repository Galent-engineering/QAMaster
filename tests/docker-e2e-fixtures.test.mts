/**
 * The Docker check (scripts/docker-e2e/) runs from a plain checkout on the fixtures under tests/fixtures/docker-e2e/.
 * Docker isn't needed here: these tests keep the fixtures consistent with what the scripts expect of them.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runHash } from '../plugin/src/testgen/run.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts/docker-e2e');
const FIX = path.join(ROOT, 'tests/fixtures/docker-e2e');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const json = (...p: string[]) => JSON.parse(read(...p));

test('docker-e2e: the shell scripts parse', () => {
  for (const f of ['run.sh', 'inside.sh', 'hook-event.sh']) {
    const r = spawnSync('sh', ['-n', path.join(SCRIPTS, f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('docker-e2e: run.sh defaults every input to a fixture that exists', () => {
  const sh = read(SCRIPTS, 'run.sh');
  for (const [name, dir] of [
    ['CHECKMASTER_DEMO', 'checkmaster-demo'],
    ['JUICE_SHOP', 'juice-shop-source'],
    ['QA_SOURCE', 'qa-project'],
  ]) {
    assert.match(sh, new RegExp(`\\$\\{${name}:-\\$fixtures/${dir}\\}`), name);
    assert.ok(fs.statSync(path.join(FIX, dir)).isDirectory(), dir);
  }
});

test('docker-e2e: every case the seed links to is a test in the pytest demo', () => {
  const links = [...read(SCRIPTS, 'seed-checkmaster.mts').matchAll(/(test_\w+\.py)::(test_\w+)/g)];
  assert.ok(links.length >= 6);
  for (const [, file, fn] of links) {
    const text = read(FIX, 'checkmaster-demo/tests', file);
    assert.match(text, new RegExp(`^def ${fn}\\(`, 'm'), `${file}::${fn}`);
  }
});

test('docker-e2e: the demo has what inside.sh edits, and no lock (a lock can not be made offline)', () => {
  // inside.sh breaks the discount with: sed 's/discount: 0.1 }/discount: 0.2 }/' site/coupon.js
  assert.match(read(FIX, 'checkmaster-demo/site/coupon.js'), /discount: 0\.1 \}/);
  for (const f of ['site/cart.js', 'site/login.js', 'pyproject.toml'])
    assert.ok(fs.existsSync(path.join(FIX, 'checkmaster-demo', f)), f);
  assert.equal(fs.existsSync(path.join(FIX, 'checkmaster-demo/uv.lock')), false);
  assert.match(read(SCRIPTS, 'inside.sh'), /uv lock/);
  // the image's python3 is Debian's 3.11, and uv may not download one
  assert.match(read(FIX, 'checkmaster-demo/pyproject.toml'), /requires-python = ">=3\.11"/);
});

test('docker-e2e: the fixtures are plain folders, not repos (inside.sh makes the repo)', () => {
  for (const d of ['checkmaster-demo', 'juice-shop-source', 'qa-project'])
    assert.equal(fs.existsSync(path.join(FIX, d, '.git')), false, d);
  assert.ok(fs.existsSync(path.join(FIX, 'juice-shop-source/frontend/src/app/about/about.component.ts')));
});

test('docker-e2e: the QA project holds a reviewed, validated run that matches its DSM and the drafted scripts', () => {
  const qa = path.join(FIX, 'qa-project');
  const runs = fs.readdirSync(path.join(qa, 'testgen/output'));
  assert.equal(runs.length, 1);
  const dir = path.join(qa, 'testgen/output', runs[0]);
  const hash = runHash(dir);
  const validation = json(dir, 'validation.json');
  assert.equal(validation.status, 'pass');
  assert.equal(validation.run_hash, hash, 'testgen validate again: the run changed after it was validated');
  assert.equal(validation.dsm_generated_at, json(qa, 'dsm/dsm.json').generated_at);
  assert.equal(json(dir, 'run.json').run_hash, hash, 'qam review again: the run changed after it was reviewed');
  assert.ok(json(qa, 'config/qamaster.json').app.name, 'qam app create and qam automate read the app name from here');
  // the scripts the check drafts are for cases of this run
  const ids = new Set(json(dir, 'testcases.json').map((c: { id: string }) => c.id));
  for (const f of ['features/web/about.feature', 'features/web/search.feature'])
    for (const [, id] of read(SCRIPTS, 'drafts', f).matchAll(/@(TC-[A-Z0-9-]+)/g))
      assert.ok(ids.has(id), `${f}: ${id}`);
});

test('docker-e2e: the DSM files screens under the source the check changes', () => {
  const dsm = json(FIX, 'qa-project/dsm/dsm.json');
  const about = dsm.page.nodes.find((n: { id: string }) => n.id === '/about');
  assert.ok(about.files.includes('juiceshop-online:frontend/src/app/about/about.component.ts'));
  assert.ok(fs.existsSync(path.join(FIX, 'juice-shop-source/frontend/src/app/about/about.component.ts')));
  // setup --name juiceshop-online in inside.sh names the repository the DSM's files are keyed by
  assert.match(read(SCRIPTS, 'inside.sh'), /--name juiceshop-online/);
});
