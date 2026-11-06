/**
 * qam requirements: the stories TestGen may cite as req:<id>, saved in the QA project.
 *
 *     qam requirements fetch (--sprint NAME | --current-sprint | --from YYYY-MM-DD --to YYYY-MM-DD) [--module AREA] [--scope NAME]
 *     qam requirements import --file <stories.xlsx|.csv|.json|.md> [--sheet NAME] [--scope NAME]
 *     qam requirements list
 *
 * fetch reads Azure Boards (QAMASTER_REQUIREMENTS, Q20: ADO only in v1); import takes a file someone hands over, such
 * as a Jira or spreadsheet export. Both write requirements/<scope>/; the scope is what a TestGen manifest names in
 * requirements_scope. With no --scope it's the sprint's name, the date range, or the file's name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { RequirementSource } from '../adapters/base.mts';
import { buildRequirements } from '../adapters/registry.mts';
import { list, problems, type Saved, save, slug, storiesFromFile } from '../requirements/requirements.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Requirement, RequirementQuery } from '../shared/models.mts';

const USAGE =
  'Use qam requirements fetch (--sprint NAME | --current-sprint | --from YYYY-MM-DD --to YYYY-MM-DD) [--module AREA] [--scope NAME] | import --file <stories.xlsx|.csv|.json|.md> [--sheet NAME] [--scope NAME] | list.';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type V = {
  sprint?: string;
  'current-sprint'?: boolean;
  from?: string;
  to?: string;
  module?: string;
  scope?: string;
  file?: string;
  sheet?: string;
};

function report(project: string, s: Saved, dir: string, json: boolean, extra: string[]) {
  const noAc = s.requirements.filter((r) => !r.acceptance_criteria.length).map((r) => r.id);
  const file = path.relative(project, path.join(dir, 'requirements.json'));
  if (json) {
    const { requirements: _, ...meta } = s;
    console.log(JSON.stringify({ result: 'pass', ...meta, file, without_acceptance_criteria: noAc, notes: extra }));
    return;
  }
  console.log(`Saved ${s.count} requirement(s) from ${s.source} (${s.period}) in ${file}.`);
  for (const n of extra) console.log(`Note: ${n}`);
  if (noAc.length)
    console.log(`No acceptance criteria: ${noAc.join(', ')}. Test cases may cite only what their descriptions state.`);
  console.log(`TestGen: set "requirements_scope": "${s.scope}" in the run's manifest and cite req:<id>.`);
}

export async function requirements(
  cfg: Config,
  argv: string[],
  json: boolean,
  source: () => RequirementSource = () => buildRequirements(cfg),
): Promise<number> {
  let parsed: { values: V; positionals: string[] };
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        sprint: { type: 'string' },
        'current-sprint': { type: 'boolean' },
        from: { type: 'string' },
        to: { type: 'string' },
        module: { type: 'string' },
        scope: { type: 'string' },
        file: { type: 'string' },
        sheet: { type: 'string' },
      },
      allowPositionals: true,
    }) as unknown as typeof parsed;
  } catch (e) {
    throw new BlockedError(`qam requirements: ${(e as Error).message}. ${USAGE}`);
  }
  const { values: v, positionals } = parsed;
  const project = cfg.qaProject ?? cfg.root;
  const now = new Date().toISOString();

  if (positionals[0] === 'list') {
    const scopes = list(project);
    if (json) console.log(JSON.stringify({ result: 'pass', scopes }));
    else if (!scopes.length)
      console.log('No requirements saved yet. Run qam requirements fetch --current-sprint, or import a file.');
    else
      for (const s of scopes)
        console.log(`${s.scope.padEnd(24)} ${String(s.count).padStart(4)} item(s)  ${s.source}, ${s.period}`);
    return 0;
  }

  if (positionals[0] === 'import') {
    if (!v.file) throw new BlockedError(`qam requirements import needs --file. ${USAGE}`);
    const file = path.resolve(v.file.replace(/^~(?=[\\/]|$)/, process.env.HOME ?? '~'));
    if (!fs.existsSync(file)) throw new BlockedError(`${v.file} doesn't exist.`);
    const stories = storiesFromFile(file, v.sheet);
    if (!stories.length)
      throw new BlockedError(
        `No user stories in ${v.file}: a spreadsheet needs a Title or Summary column; a document needs one heading or "ID: title" line per story.`,
      );
    const errs = problems(stories);
    if (errs.length) throw new BlockedError(`${v.file} can't be saved:\n  ${errs.slice(0, 20).join('\n  ')}`);
    const scope = slug(v.scope ?? path.basename(file, path.extname(file)));
    const s: Saved = {
      scope,
      source: 'document',
      period: path.basename(file),
      saved_at: now,
      count: stories.length,
      requirements: stories,
    };
    report(project, s, save(project, s), json, []);
    return 0;
  }

  if (positionals[0] !== 'fetch') throw new BlockedError(USAGE);
  const modes = [!!v.sprint, !!v['current-sprint'], !!(v.from || v.to)].filter(Boolean).length;
  if (modes !== 1)
    throw new BlockedError('Give one period: --sprint NAME, --current-sprint, or --from YYYY-MM-DD --to YYYY-MM-DD.');
  if ((v.from || v.to) && (!DATE.test(v.from ?? '') || !DATE.test(v.to ?? '') || (v.from ?? '') > (v.to ?? '')))
    throw new BlockedError('--from and --to must both be dates (YYYY-MM-DD), with --from on or before --to.');
  const module = v.module ? { module: v.module } : {};
  const query: RequirementQuery = v.sprint
    ? { sprint: v.sprint, ...module }
    : v['current-sprint']
      ? { currentSprint: true, ...module }
      : { from: v.from as string, to: v.to as string, ...module };
  const src = source();
  const found: Requirement[] = await src.requirements(query);
  const period = v.sprint ? `sprint ${v.sprint}` : v['current-sprint'] ? 'current sprint' : `${v.from} to ${v.to}`;
  if (!found.length)
    throw new BlockedError(
      `No requirements in ${period}${v.module ? ` under ${v.module}` : ''}. Check the sprint or dates, then fetch again; nothing was saved.`,
    );
  const named = v.sprint ?? (v['current-sprint'] ? (found.find((r) => r.sprint)?.sprint ?? 'current-sprint') : null);
  const scope = slug(v.scope ?? named ?? `${v.from}_${v.to}`);
  const { notice, bugs } = src as { notice?: string; bugs?: { why: string } };
  const where = (src as { where?: () => string }).where?.() ?? 'the requirement source';
  const s: Saved = {
    scope,
    source: where,
    period: `${period}${v.module ? `, ${v.module}` : ''}`,
    saved_at: now,
    count: found.length,
    ...(notice ? { notice } : {}),
    requirements: found,
  };
  report(
    project,
    s,
    save(project, s),
    json,
    [bugs?.why, notice].filter((n): n is string => !!n),
  );
  return 0;
}
