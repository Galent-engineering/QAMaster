/**
 * qam testgen and qam review: test cases from the DSM, the knowledge skills and fetched requirements, checked at
 * hallucination tolerance 0 (Q10), then reviewed by a person (Q12).
 *
 *     qam testgen context [--component NAME …]   the facts Claude may use, as JSON
 *     qam testgen validate <run>                 check a run; writes validation.json; exit 1 on any finding or gap
 *     qam testgen render <run>                   validate, then testcases.md, <Component>.feature, testcases.csv
 *     qam review <run> [--yes]                   record the person's review; on a terminal it asks first, a script passes --yes
 *
 * <run> is a folder, or a name under testgen/output/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { git } from '../adapters/git.mts';
import type { Dsm, DsmConfig } from '../dsm/build.mts';
import { type KnowledgeSettings, pascal } from '../knowledge/build.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import { domainRefs } from '../testgen/domain-refs.mts';
import { Facts } from '../testgen/facts.mts';
import { render } from '../testgen/render.mts';
import { readRunRecord, runHash, type Validation, validationProblem } from '../testgen/run.mts';
import { type Manifest, type TestCase, type TestGenSettings, validate } from '../testgen/validate.mts';

const PLUGIN_SKILLS = path.resolve(import.meta.dirname, '../../skills');
const DOMAIN = domainRefs(PLUGIN_SKILLS);

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}). Fix it, then run the command again.`);
  }
}
const writeJson = (file: string, data: unknown) => fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);

type Project = { dir: string; dsm: Dsm; facts: Facts };

/** Everything a run is checked against. No app name or no DSM blocks (AQE exited 1 for a missing DSM). */
export function load(cfg: Config): Project {
  const dir = cfg.qaProject ?? cfg.root;
  const name = cfg.project.app?.name;
  if (!name) throw new BlockedError('No app name. Run qam setup --app <Name> first.');
  const app = pascal(name);
  const settings = readJson<KnowledgeSettings>(path.join(dir, 'config', 'aut-skills.json')) ?? {};
  const dsmCfg = readJson<DsmConfig & { repositories?: { name: string; path: string }[] }>(
    path.join(dir, 'config', 'dsm-config.json'),
  );
  const dsmDir = path.join(dir, dsmCfg?.output_dir ?? 'dsm');
  const dsm = readJson<Dsm>(path.join(dsmDir, 'dsm.json'));
  if (!dsm)
    throw new BlockedError(`No DSM at ${path.relative(dir, path.join(dsmDir, 'dsm.json'))}. Run qam dsm run first.`);
  const codeModel = readJson<{ files?: Record<string, unknown> }>(path.join(dsmDir, 'code-model.json'));
  const skillsDir = path.resolve(dir, settings.skills_dir ?? '.claude/skills');
  const ls = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d) : []);
  const repos = new Map((dsmCfg?.repositories ?? []).map((r) => [r.name, path.resolve(dir, r.path)]));
  const commits = new Map(((dsm.repos ?? []) as { name: string; commit?: string }[]).map((r) => [r.name, r.commit]));
  const shown = new Map<string, string | null>();
  const show = (file: string): string | null => {
    if (shown.has(file)) return shown.get(file) ?? null;
    const [repo, ...rest] = file.split(':');
    const at = repos.get(repo);
    const commit = commits.get(repo);
    let out: string | null = null;
    if (at && commit) {
      const r = git(at, ['show', `${commit}:./${rest.join(':')}`]);
      out = r.ok ? r.stdout.toString('utf8') : null;
    }
    shown.set(file, out); // lines and text read the same file; one git call each
    return out;
  };
  const facts = new Facts({
    dsm,
    codeFiles: Object.keys(codeModel?.files ?? {}),
    settings,
    app,
    autSkills: ls(skillsDir),
    domainSkills: DOMAIN.names,
    skill: (skill) => {
      const domain = DOMAIN.read(skill);
      if (domain !== null) return domain;
      for (const d of [skillsDir, PLUGIN_SKILLS]) {
        const f = path.join(d, skill, 'SKILL.md');
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
      }
      return null;
    },
    // the file at the commit the DSM scanned, read-only (Q15); paths are relative to the configured folder
    lines: (file) => {
      const t = show(file);
      if (t === null) return null;
      return t === '' ? 0 : t.split('\n').length - (t.endsWith('\n') ? 1 : 0); // a final newline ends the last line; it doesn't start another
    },
    text: show,
    requirements: (scope) => {
      const saved = readJson<{ requirements?: { id: string }[] }>(
        path.join(dir, 'requirements', scope, 'requirements.json'),
      );
      return saved ? (saved.requirements ?? []).map((r) => String(r.id)) : null;
    },
  });
  return { dir, dsm, facts };
}

export function runDir(project: string, arg: string | undefined): string {
  if (!arg) throw new BlockedError('Name the run: a folder, or a name under testgen/output/.');
  const found = [path.resolve(arg), path.join(project, 'testgen', 'output', arg)].find((d) => fs.existsSync(d));
  if (!found) throw new BlockedError(`No run ${arg}: give its folder, or a name under testgen/output/.`);
  return found;
}

function check(p: Project, dir: string): Validation {
  const cfg = readJson<TestGenSettings & { hallucination_tolerance?: number }>(
    path.join(p.dir, 'config', 'testgen.json'),
  );
  // Q10: no setting can let a finding through (AQE passed a run with 2 findings at a tolerance of 2)
  if (cfg?.hallucination_tolerance !== undefined && cfg.hallucination_tolerance !== 0)
    throw new BlockedError(
      'config/testgen.json sets hallucination_tolerance, but QAMaster checks at tolerance 0 (decision Q10). Remove the setting.',
    );
  const report = validate(
    readJson<Manifest>(path.join(dir, 'manifest.json')),
    readJson<TestCase[]>(path.join(dir, 'testcases.json')),
    p.facts,
    cfg ?? {},
  );
  // bound to what was checked, so a later edit or DSM rebuild makes it out of date (AQE's review.json wasn't)
  const v: Validation = {
    ...report,
    dsm_generated_at: p.dsm.generated_at,
    run_hash: runHash(dir),
    validated_at: new Date().toISOString(),
  };
  writeJson(path.join(dir, 'validation.json'), v);
  return v;
}

function print(v: Validation, json: boolean, extra: Record<string, unknown> = {}) {
  if (json) {
    console.log(JSON.stringify({ result: v.status, ...v, ...extra }));
    return;
  }
  console.log(
    `Validation: ${v.status} (${v.cases} cases, ${v.errors.length} findings, ${v.gaps.length} coverage gaps)`,
  );
  for (const e of v.errors) console.log(`  finding  ${e}`);
  for (const g of v.gaps) console.log(`  gap      ${g}`);
}

export function testgen(cfg: Config, argv: string[], json: boolean): number {
  let parsed: { values: { component?: string[] }; positionals: string[] };
  try {
    parsed = parseArgs({
      args: argv,
      options: { component: { type: 'string', multiple: true } },
      allowPositionals: true,
    });
  } catch (e) {
    throw new BlockedError(`qam testgen: ${(e as Error).message}`);
  }
  const [cmd, arg] = parsed.positionals;
  if (!['context', 'validate', 'render'].includes(cmd))
    throw new BlockedError('Use qam testgen context [--component NAME] | validate <run> | render <run>.');
  const p = load(cfg);
  if (cmd === 'context') {
    console.log(JSON.stringify(p.facts.context(parsed.values.component ?? null), null, 1));
    return 0;
  }
  const dir = runDir(p.dir, arg);
  const v = check(p, dir);
  if (cmd === 'validate' || v.status !== 'pass') {
    print(v, json, cmd === 'render' ? { message: 'fix the findings before rendering' } : {});
    return v.status === 'pass' ? 0 : 1;
  }
  const files = render(
    readJson<Manifest>(path.join(dir, 'manifest.json')) ?? {},
    readJson<TestCase[]>(path.join(dir, 'testcases.json')) ?? [],
    v,
  );
  for (const [name, body] of files) fs.writeFileSync(path.join(dir, name), body);
  print(v, json, { files: [...files.keys()] });
  if (!json) console.log(`Wrote ${[...files.keys()].join(', ')} in ${path.relative(p.dir, dir)}`);
  return 0;
}

export type ReviewIo = { tty: boolean; ask: (prompt: string) => string };

/** One line from stdin, read synchronously. */
function readLine(prompt: string): string {
  process.stderr.write(prompt);
  const buf = Buffer.alloc(1);
  let line = '';
  while (fs.readSync(0, buf, 0, 1, null) === 1 && buf[0] !== 10) line += String.fromCharCode(buf[0]);
  return line.trim();
}

const REAL_IO: ReviewIo = { tty: !!process.stdin.isTTY, ask: readLine };

/**
 * Records the person's review of a validated run (Q12). On a terminal it shows the run and asks for a yes first (a
 * blank answer is a no: exit 3, nothing recorded); `--yes`, or a script with no terminal, records without asking,
 * because the caller has already had the person's yes. The reviewer is the git user here; the ADO identity is added
 * with the ADO adapter (step 4).
 */
export function review(cfg: Config, argv: string[], json: boolean, io: ReviewIo = REAL_IO): number {
  let parsed: { values: { yes?: boolean }; positionals: string[] };
  try {
    parsed = parseArgs({ args: argv, options: { yes: { type: 'boolean' } }, allowPositionals: true });
  } catch (e) {
    throw new BlockedError(`qam review: ${(e as Error).message}`);
  }
  const p = load(cfg);
  const dir = runDir(p.dir, parsed.positionals[0]);
  const problem = validationProblem(dir, p.dsm.generated_at);
  if (problem)
    throw new BlockedError(
      `Can't review ${path.basename(dir)}: ${problem}. Run qam testgen validate ${path.basename(dir)} first.`,
    );
  const email = git(p.dir, ['config', 'user.email']).stdout.toString('utf8').trim();
  if (!email)
    throw new BlockedError('No git user to record as the reviewer. Run git config user.email <you@example.com>.');
  const name = path.basename(dir);
  if (io.tty && !parsed.values.yes) {
    const v = readJson<Validation>(path.join(dir, 'validation.json'));
    const shown = path.relative(p.dir, path.join(dir, 'testcases.md'));
    console.log(
      `Run ${name}: ${v?.cases ?? '?'} test cases, validation ${v?.status ?? 'unknown'}, ${v?.gaps.length ?? 0} coverage gaps.\nRead them in ${shown} first.`,
    );
    if (!/^y(es)?$/i.test(io.ask(`Approve run ${name} as reviewed? [y/N] `))) {
      console.log(json ? JSON.stringify({ result: 'awaiting', run: name }) : `Not recorded: ${name} isn't reviewed.`);
      return 3;
    }
  }
  const record = {
    ...(readRunRecord(dir) ?? {}),
    reviewedBy: email,
    reviewedAt: new Date().toISOString(),
    run_hash: runHash(dir),
  };
  writeJson(path.join(dir, 'run.json'), record);
  console.log(json ? JSON.stringify({ result: 'pass', ...record }) : `Reviewed ${name} as ${email}.`);
  return 0;
}
