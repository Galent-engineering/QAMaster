/**
 * 0.8.0 review item 1: Playwright's trace keeps every filled value (action parameters, DOM snapshots, the sign-in
 * request's body), and the gate keeps the trace of a failed scenario. After a run the runner strips the test account's
 * password from the evidence folder.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { scrubEvidence } from '../plugin/src/adapters/scrub-evidence.mts';
import { tmpDir } from './tmp.mts';

const SECRET = 'p@ss w0rd"x';
const forms = [
  SECRET,
  encodeURIComponent(SECRET),
  encodeURIComponent(SECRET).replace(/%20/g, '+'),
  JSON.stringify(SECRET).slice(1, -1),
];

function zipOf(dir: string, files: Record<string, string | Buffer>): string {
  const src = path.join(dir, 'src');
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(src, name)), { recursive: true });
    fs.writeFileSync(path.join(src, name), data);
  }
  const out = path.join(dir, 'trace.zip');
  const r = spawnSync('zip', ['-qr', out, '.'], { cwd: src });
  assert.equal(r.status, 0);
  return out;
}
const unzip = (zip: string, name?: string) =>
  spawnSync('unzip', name ? ['-p', zip, name] : ['-p', zip], { encoding: 'latin1', maxBuffer: 64 * 1024 * 1024 });

test('scrubEvidence strips the password, in every form it is written, from the entries of a trace zip', (t) => {
  if (spawnSync('zip', ['-v']).status !== 0 || spawnSync('unzip', ['-v']).status !== 0)
    return t.skip('no zip or unzip');
  const dir = tmpDir('qam-scrub-');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]);
  const zip = zipOf(dir, {
    'test.trace': `{"params":{"value":"${forms[3]}"}}\n`,
    '0-trace.network': `{"postData":"email=u&password=${forms[1]}&also=${forms[2]}"}`,
    'resources/x.dat': `raw ${SECRET} raw`,
    'resources/page.jpeg': jpeg,
    'attachments/empty.txt': '',
  });
  const before = fs.readFileSync(zip);
  scrubEvidence(dir, [SECRET]);
  assert.notDeepEqual(fs.readFileSync(zip), before);
  assert.equal(spawnSync('unzip', ['-tq', zip]).status, 0, 'still a valid zip');
  const all = unzip(zip).stdout;
  for (const f of forms) assert.ok(!all.includes(f), `still holds ${f}`);
  assert.match(unzip(zip, 'test.trace').stdout, /"value":"\[removed\]"/);
  assert.match(unzip(zip, 'resources/x.dat').stdout, /^raw \[removed\] raw$/);
  assert.deepEqual(Buffer.from(unzip(zip, 'resources/page.jpeg').stdout, 'latin1'), jpeg, 'an image is left as it is');
});

test('scrubEvidence strips text files, leaves others, and does nothing without a secret or a folder', () => {
  const dir = tmpDir('qam-scrub-txt-');
  fs.writeFileSync(path.join(dir, 'error-context.md'), `- textbox: ${SECRET}\n`);
  fs.writeFileSync(path.join(dir, 'video.webm'), Buffer.from(SECRET));
  scrubEvidence(dir, ['', undefined as unknown as string]);
  assert.match(fs.readFileSync(path.join(dir, 'error-context.md'), 'utf8'), /p@ss/);
  scrubEvidence(path.join(dir, 'nope'), [SECRET]);
  scrubEvidence(dir, [SECRET]);
  assert.equal(fs.readFileSync(path.join(dir, 'error-context.md'), 'utf8'), '- textbox: [removed]\n');
  assert.equal(fs.readFileSync(path.join(dir, 'video.webm')).toString(), SECRET);
});

test('scrubEvidence removes a zip it cannot read rather than keep it', () => {
  const dir = tmpDir('qam-scrub-bad-');
  fs.writeFileSync(path.join(dir, 'trace.zip'), 'not a zip');
  scrubEvidence(dir, [SECRET]);
  assert.equal(fs.existsSync(path.join(dir, 'trace.zip')), false);
});
