/**
 * Domain_Test_Design_Skill and its sub-skills, as TestGen names them (Q51).
 *
 * The sub-skills are reference files of the router skill: Domain_Test_Design_Skill-<X> is
 * skills/Domain_Test_Design_Skill/references/<X>.md. Their names stay the ones evidence cites.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN_SKILL } from './facts.mts';

export function domainRefs(pluginSkills: string) {
  const refs = path.join(pluginSkills, DOMAIN_SKILL, 'references');
  const fileOf = (name: string) =>
    name === DOMAIN_SKILL
      ? path.join(pluginSkills, DOMAIN_SKILL, 'SKILL.md')
      : path.join(refs, `${name.slice(DOMAIN_SKILL.length + 1)}.md`);
  return {
    names: [
      DOMAIN_SKILL,
      ...(fs.existsSync(refs) ? fs.readdirSync(refs) : [])
        .filter((f) => f.endsWith('.md'))
        .map((f) => `${DOMAIN_SKILL}-${f.slice(0, -3)}`),
    ],
    /** The text of a domain skill, or null when the name isn't one. */
    read(name: string): string | null {
      if (name !== DOMAIN_SKILL && !name.startsWith(`${DOMAIN_SKILL}-`)) return null;
      const f = fileOf(name);
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    },
  };
}
