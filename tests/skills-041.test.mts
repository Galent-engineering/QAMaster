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
const LAUNCHER = 'node .qamaster/bin/qam.mjs';

test('A9: skills and commands that run qam prefer the project launcher once setup has written it', () => {
  const files = [
    ...['TestGen', 'Gate', 'Publish', 'AutomationCode', 'Design-Structure-Matrix', 'AUT-Skill-Builder'].map((s) =>
      path.join('skills', s, 'SKILL.md'),
    ),
    ...fs
      .readdirSync(path.join(PLUGIN, 'commands'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join('commands', f)),
  ].filter((f) => read(f).includes('src/cli/main.mts'));
  assert.ok(files.length >= 6, 'expected the skills and commands that run the CLI');
  const bad = files.filter((f) => !read(f).includes(LAUNCHER));
  assert.deepEqual(bad, [], `these never mention ${LAUNCHER}`);
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
