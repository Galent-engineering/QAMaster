/**
 * 0.6.0 item 1 (Q52, R22): the gate's files live in the QA project that recorded the app clone, keyed by the repo's name.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { recordedIn, recordingProject, stateDirs } from '../plugin/src/gate/state.mts';
import { tmpDir } from './tmp.mts';

/** A QA project that recorded `clone` as its code source `shop`, listed in the home index. */
function world() {
  const home = tmpDir('qam-home-');
  const qa = tmpDir('qam-qa-');
  const clone = tmpDir('qam-clone-');
  fs.mkdirSync(path.join(qa, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(qa, 'config/dsm-config.json'),
    JSON.stringify({ repositories: [{ name: 'shop', path: path.relative(qa, clone) }] }),
  );
  fs.writeFileSync(
    path.join(home, 'installs.json'),
    JSON.stringify({ repos: { [qa]: { app: 'Shop', integrations: ['claude-hooks:Shop'], updated_at: 'x' } } }),
  );
  return { home, qa, clone };
}

test('the QA project that recorded a clone is found from the home index', () => {
  const { home, qa, clone } = world();
  assert.deepEqual(recordingProject(clone, home), { project: qa, name: 'shop' });
  assert.equal(recordingProject(tmpDir('qam-other-'), home), null);
  assert.equal(recordingProject(clone, tmpDir('qam-empty-home-')), null);
});

test('recordedIn names the repository entry for a clone, by path', () => {
  const { qa, clone } = world();
  assert.equal(recordedIn(qa, clone), 'shop');
  assert.equal(recordedIn(qa, tmpDir('qam-x-')), null);
});

test('a recorded clone writes to the QA project and reads the old folder too; an unrecorded one stays in its own', () => {
  const { qa, clone } = world();
  const d = stateDirs(clone, qa);
  assert.equal(d.write, path.join(qa, '.qamaster', 'gate', 'shop'));
  assert.deepEqual(d.read, [d.write, path.join(clone, '.qamaster')]);
  assert.equal(d.legacy, path.join(clone, '.qamaster'));
  const own = stateDirs(clone, null);
  assert.equal(own.write, path.join(clone, '.qamaster'));
  assert.deepEqual(own.read, [own.write]);
  assert.equal(own.legacy, null);
  // the QA project that is itself the repo keeps its own folder
  assert.equal(stateDirs(qa, qa).write, path.join(qa, '.qamaster'));
});
