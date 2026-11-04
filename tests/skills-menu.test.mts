/** The plugin lists QAMaster's own skills; Domain_Test_Design_Skill's sub-skills are reference files Claude reads, not skills (Q51). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const SKILLS = path.resolve(import.meta.dirname, '..', 'plugin', 'skills');
const REFS = path.join(SKILLS, 'Domain_Test_Design_Skill', 'references');

test('Domain_Test_Design_Skill sub-skills are reference files of the router skill, not skills of their own', () => {
  assert.deepEqual(
    fs.readdirSync(SKILLS).filter((d) => d.startsWith('Domain_Test_Design_Skill-')),
    [],
    'move these into Domain_Test_Design_Skill/references/',
  );
  const refs = fs.readdirSync(REFS).filter((f) => f.endsWith('.md'));
  assert.ok(refs.length > 30, 'the sub-skills are there');
  const router = fs.readFileSync(path.join(SKILLS, 'Domain_Test_Design_Skill', 'SKILL.md'), 'utf8');
  for (const f of refs) {
    assert.ok(!fs.readFileSync(path.join(REFS, f), 'utf8').startsWith('---'), `${f} has no frontmatter`);
    assert.ok(router.includes(`Domain_Test_Design_Skill-${f.slice(0, -3)}`), `the router names ${f}`);
  }
});
