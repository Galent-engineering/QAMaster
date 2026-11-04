/**
 * 0.4.1 (AgentMesh run) skill text: A9 the project launcher, A10 TestGen one component at a time with the exact names
 * `qam testgen context` prints, Q48 API routes are not screens.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const PLUGIN = path.resolve(import.meta.dirname, '..', 'plugin');
const read = (...p: string[]) => fs.readFileSync(path.join(PLUGIN, ...p), 'utf8');

const FILES = [
  ...['TestGen', 'Gate', 'Publish', 'AutomationCode', 'Design-Structure-Matrix', 'AUT-Skill-Builder'].map((s) =>
    path.join('skills', s, 'SKILL.md'),
  ),
  ...fs
    .readdirSync(path.join(PLUGIN, 'commands'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join('commands', f)),
];

test('A9: every file that mentions the launcher states the no-placeholder rule and the absolute path', () => {
  const files = FILES.filter((f) => read(f).includes('qam.mjs'));
  assert.ok(files.length >= 6, 'expected the skills and commands that hand over a command');
  const bad = files.filter((f) => !/never a `<placeholder>`/.test(read(f)) || !/absolute path/.test(read(f)));
  assert.deepEqual(bad, [], 'these lack the paste-ready, absolute-path rule');
  const noWarn = files.filter((f) => !read(f).includes('WARN launcher'));
  assert.deepEqual(noWarn, [], 'these lack the WARN launcher fallback');
});

test('A9: the skills still call the CLI by the plugin path (CLAUDE.md portable-path rule)', () => {
  for (const f of FILES.filter((f) => f.startsWith('skills') && read(f).includes('src/cli/main.mts')))
    assert.ok(read(f).includes(`node "$\{CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`), f);
});

test('A9: every launcher mention names the absolute path of the QA project; Gate and /qamaster:check say the app repo has none', () => {
  for (const f of FILES) {
    for (const line of read(f)
      .split('\n')
      .filter((l) => l.includes('qam.mjs'))) {
      assert.match(line, /absolute path of the QA project/, `${f}: ${line.slice(0, 80)}`);
      assert.doesNotMatch(line, /from the repo\b/, f);
    }
  }
  for (const f of ['skills/Gate/SKILL.md', 'commands/check.md'])
    assert.match(read(f), /has no launcher[^.]*always names? the QA project/, f);
});

test('A12 and A13: TestGen cites the request model for API steps, AutomationCode copies the crawl locator', () => {
  for (const f of ['skills/TestGen/SKILL.md', 'skills/TestGen/references/cases.md']) {
    assert.match(read(f), /request model/, f);
    assert.match(read(f), /extra="forbid"/, f);
  }
  assert.match(read('skills/AutomationCode/SKILL.md'), /test_id/);
  assert.match(read('skills/AutomationCode/SKILL.md'), /never the DSM's CSS selector path/);
});

test('item 9: TestGen step 5 links the file that holds "Names to copy exactly"', () => {
  assert.match(read('skills/TestGen/SKILL.md'), /"Names to copy exactly" in \[references\/cases\.md\]/);
  assert.match(read('skills/TestGen/references/cases.md'), /## Names to copy exactly/);
});

test('A10: TestGen writes and validates one component at a time, with the exact names from the context', () => {
  const skill = read('skills/TestGen/SKILL.md');
  assert.match(skill, /one component at a time/i);
  const refs = read('skills/TestGen/references/cases.md');
  assert.match(refs, /exact/i);
  assert.match(refs, /field: /); // element names are `kind: label`, copied as printed
  assert.match(refs, /## Business understanding/);
  assert.ok(skill.length < 9000, 'SKILL.md stays short; detail goes in references');
});

test('Q48: TestGen writes no UI case for a route the DSM marks kind: api', () => {
  assert.match(read('skills/TestGen/SKILL.md'), /kind: api/);
});
