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

/** What is wrong with the lines of one skill or command that mention the launcher (qam.mjs). */
function launcherProblems(text: string): string[] {
  const lines = text.split('\n').filter((l) => l.includes('qam.mjs'));
  if (!lines.length) return ['no line mentions the launcher'];
  return lines.flatMap((l) => [
    ...(/node <absolute path of the QA project>\/\.qamaster\/bin\/qam\.mjs/.test(l)
      ? []
      : ["the launcher isn't named by the QA project's absolute path"]),
    ...(/node \.qamaster\/bin\/qam\.mjs|from the repo\b/.test(l) ? ['a launcher instruction runs from the repo'] : []),
  ]);
}

test("A9: Gate and /qamaster:check name the QA project's absolute launcher path, not one from the repo", () => {
  for (const f of ['skills/Gate/SKILL.md', 'commands/check.md']) assert.deepEqual(launcherProblems(read(f)), [], f);
});

test('A9: the launcher check fails on the text that ran the launcher from the repo (dd6b975)', () => {
  const gate =
    'Once `qam setup` has written the project launcher, run it as `node .qamaster/bin/qam.mjs <command>` from the repo (it follows plugin updates).';
  const check =
    'Once `qam setup` has written `.qamaster/bin/qam.mjs`, run `node .qamaster/bin/qam.mjs` with the same arguments.';
  assert.ok(launcherProblems(gate).length >= 2);
  assert.ok(launcherProblems(check).length >= 1);
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
