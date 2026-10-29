/**
 * qam aut-skills: the application knowledge skills (AUT_<App>, AUT_<App>-<Component>) from the QA project's DSM.
 *
 *     qam aut-skills            build or refresh; writes only the files whose text changed
 *     qam aut-skills --check    exit 1 when the skills are older than the DSM, 0 when current
 *
 * The app name is config/qamaster.json app.name (qam setup --app); config/aut-skills.json holds the other settings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Dsm, DsmConfig } from '../dsm/build.mts';
import { buildSkills, type KnowledgeSettings, pascal } from '../knowledge/build.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}). Fix it, then run the command again.`);
  }
}

/** Writes `text` unless the file already holds it. Claude Code protects .claude/skills, so a refusal says what to do. */
function writeIfChanged(file: string, text: string): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'EPERM' && code !== 'EACCES') throw e;
    throw new BlockedError(
      `Can't write ${file} (${code}). Claude Code protects .claude/skills from sandboxed commands: run qam aut-skills in your own terminal, or let Claude run it outside the sandbox when it asks.`,
    );
  }
  return true;
}

export function autSkills(cfg: Config, argv: string[], json: boolean): number {
  let check = false;
  try {
    check = !!parseArgs({ args: argv, options: { check: { type: 'boolean' } } }).values.check;
  } catch (e) {
    throw new BlockedError(`qam aut-skills: ${(e as Error).message}`);
  }
  const project = cfg.qaProject ?? cfg.root;
  // one place for the app name (AQE kept a second copy in aut-skills.json, which --save could wipe)
  const name = cfg.project.app?.name;
  if (!name) throw new BlockedError('No app name. Run qam setup --app <Name> first.');
  const app = pascal(name);
  const settings = readJson<KnowledgeSettings>(path.join(project, 'config', 'aut-skills.json')) ?? {};
  const dsmCfg = readJson<DsmConfig>(path.join(project, 'config', 'dsm-config.json')) ?? {};
  const dsmFile = path.join(project, dsmCfg.output_dir ?? 'dsm', 'dsm.json');
  const dsm = readJson<Dsm>(dsmFile);
  if (!dsm) throw new BlockedError(`No DSM at ${path.relative(project, dsmFile)}. Run qam dsm run first.`);
  const skillsDir = path.resolve(project, settings.skills_dir ?? '.claude/skills');
  const stateFile = path.join(skillsDir, `AUT_${app}`, '.aut-build.json');
  const state = readJson<{ dsm_generated_at?: string; built_at?: string }>(stateFile);

  if (check) {
    const stale = state?.dsm_generated_at !== dsm.generated_at;
    const out = {
      result: stale ? 'stale' : 'current',
      app,
      dsm: dsm.generated_at,
      built_from: state?.dsm_generated_at ?? null,
    };
    console.log(
      json
        ? JSON.stringify(out)
        : `AUT_${app}: ${out.result} (DSM ${out.dsm}, skills built from ${out.built_from ?? 'nothing yet'})`,
    );
    return stale ? 1 : 0;
  }

  const existing = (skill: string) => {
    const f = path.join(skillsDir, skill, 'SKILL.md');
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  };
  const folders = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir) : [];
  const r = buildSkills(dsm, settings, app, existing, folders, new Date().toISOString());
  const written = [...r.files].filter(([f, text]) => writeIfChanged(path.join(skillsDir, f), text)).map(([f]) => f);
  // the build time changes every run: the record is rewritten only when something else in it did
  const { built_at: _, ...before } = state ?? {};
  const { built_at: __, ...after } = r.state;
  if (written.length || JSON.stringify(before) !== JSON.stringify(after))
    writeIfChanged(stateFile, `${JSON.stringify(r.state, null, 2)}\n`);
  const report = { result: 'pass', ...r.report, written, skills_dir: path.relative(project, skillsDir) };
  if (json) console.log(JSON.stringify(report));
  else {
    console.log(
      `AUT_${app}: ${r.report.skills.length} skill(s), ${r.report.components} component(s), ${r.report.screens} screen(s), ${r.report.journeys} journey(s); ${written.length} file(s) written in ${report.skills_dir}`,
    );
    if (r.report.needs_curation.length) console.log(`Needs curation: ${r.report.needs_curation.join(', ')}`);
    if (r.report.sub_skills_no_longer_in_dsm.length)
      console.log(
        `No longer in the DSM (marked retired, curated notes kept; delete when done): ${r.report.sub_skills_no_longer_in_dsm.join(', ')}`,
      );
  }
  return 0;
}
