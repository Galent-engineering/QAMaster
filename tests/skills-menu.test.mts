/** The `/` menu shows QAMaster's own commands; Domain_Test_Design_Skill's sub-skills are loaded by Claude, not typed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SKILLS = path.resolve(import.meta.dirname, '..', 'plugin', 'skills');

test('Domain_Test_Design_Skill sub-skills are hidden from the / menu, and Claude can still load them', () => {
  const subs = fs.readdirSync(SKILLS).filter((d) => d.startsWith('Domain_Test_Design_Skill-'));
  assert.ok(subs.length > 30, 'the sub-skills are there');
  const shown = subs.filter((d) => {
    const front = fs.readFileSync(path.join(SKILLS, d, 'SKILL.md'), 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    return !/^user-invocable: false$/m.test(front) || /^disable-model-invocation: true$/m.test(front);
  });
  assert.deepEqual(shown, [], 'add `user-invocable: false` to these sub-skills');
});
