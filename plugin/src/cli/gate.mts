/**
 * The gate's commands (Q11–Q13, Q22, Q38), run in the app repo:
 *     qam plan    [--base REF] [--tag GROUP[=WHY]]…      the cases this change selects; runs nothing (exit 3)
 *     qam approve <plan-id> [--add TC…|GROUP] [--remove TC…|GROUP]
 *     qam run     <plan-id>                              exit 0 pass, 1 fail
 *     qam check   [--base REF] [--tag …] [--yes]         plan, then with --yes approve and run; without, stops at 3
 * Plans and verdicts live in the app repo's .qamaster/ (plans/<id>.json, verdicts/<head>.json); the push hook reads the
 * verdict. The store is read live (settled 2026-11-02).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { playwrightBdd } from '../adapters/framework-bdd.mts';
import { defaultBase, GitRepoReader } from '../adapters/git.mts';
import { buildStore, RUNNERS } from '../adapters/registry.mts';
import type { RepoConfig } from '../dsm/scan.mts';
import type { Work } from '../gate/automate.mts';
import { bind, type Drafts, folderHash, prove, recordedUnchanged, worklist } from '../gate/automate.mts';
import { dsmCases, repoDirs, runCases } from '../gate/dsm.mts';
import { approve, type Gate, makePlan, runPlan } from '../gate/gate.mts';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { readLedger } from '../publish/ledger.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CodeModel, Plan, Verdict } from '../shared/models.mts';
import { appFolder } from './automation.mts';

const PASS = 0;
const FAIL = 1;
const AWAITING = 3;
const TITLE = 48;

const readJson = <T,>(file: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
};
const git = (dir: string, args: string[]) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (r.error) throw new BlockedError("git isn't installed: install git 2.20 or later, then run again.");
  return r;
};

/** The QA project's commit, when the tests live there; it must be clean, so the plan is bound to what runs (Q22). */
function testsHead(cfg: Config): string | undefined {
  if (path.resolve(cfg.testRoot) === path.resolve(cfg.root)) return undefined;
  const head = git(cfg.testRoot, ['rev-parse', 'HEAD']);
  if (head.status !== 0) return undefined; // not a git repository: nothing to bind to
  // files QAMaster drafted and recorded, unchanged since, are allowed (Q39); anything else must be committed
  const top = git(cfg.testRoot, ['rev-parse', '--show-toplevel']).stdout.trim();
  const drafts = readDrafts(cfg);
  const dirty = git(cfg.testRoot, ['status', '--porcelain', '--untracked-files=all'])
    .stdout.split('\n')
    // doctor's record changes on every check and says nothing about what runs
    .filter((l) => l.trim() && !l.endsWith(`${QAMASTER_DIR}/doctor.json`))
    .filter((l) => !recordedUnchanged(drafts, path.join(top, l.slice(3).replace(/^.* -> /, ''))))
    .join('\n');
  const changedDrafts = dirty
    .split('\n')
    .filter((l) => l.trim() && drafts?.files[path.join(top, l.slice(3).replace(/^.* -> /, ''))]);
  if (changedDrafts.length)
    throw new BlockedError(
      `Automation scripts changed since QAMaster recorded them (Q39):\n${changedDrafts.slice(0, 10).join('\n')}\nRun qam check-scripts, then qam automate <plan-id> --done again (or commit the change), then approve.`,
    );
  if (dirty)
    throw new BlockedError(
      `The QA project at ${cfg.testRoot} has uncommitted changes, so the plan can't say what will run (Q22). Commit or stash them, then run again:\n${dirty.split('\n').slice(0, 10).join('\n')}`,
    );
  return head.stdout.trim();
}

const DRAFTS = 'drafts.json';
const readDrafts = (cfg: Config): Drafts | null => readJson<Drafts>(path.join(cfg.root, QAMASTER_DIR, DRAFTS));
/** The automation folder, when the QA project has one. */
const automationFolder = (cfg: Config): string | null => {
  try {
    const dir = appFolder(cfg);
    return fs.existsSync(dir) ? dir : null;
  } catch {
    return null;
  }
};

/** The gate's services, from the settings. */
export function gateFor(cfg: Config): Gate {
  const project = cfg.qaProject ?? cfg.root;
  const dsmConfig = readJson<{ repositories?: RepoConfig[]; output_dir?: string }>(
    path.join(project, 'config', 'dsm-config.json'),
  );
  const code = readJson<CodeModel>(path.join(project, dsmConfig?.output_dir ?? 'dsm', 'code-model.json'));
  const ledger = readLedger(project);
  const appRoot = git(cfg.root, ['rev-parse', '--show-toplevel']).stdout.trim() || cfg.root;
  return {
    store: buildStore(cfg),
    repo: new GitRepoReader(cfg.root),
    runner: (name) => (Object.hasOwn(RUNNERS, name) ? RUNNERS[name](cfg) : null),
    root: (name) => {
      const r = cfg.project.runners[name]?.root;
      if (r) return path.resolve(project, r);
      // playwright-bdd scripts live in the QA project's automation folder (qam app create)
      return name === playwrightBdd.runners[0] ? (automationFolder(cfg) ?? cfg.testRoot) : cfg.testRoot;
    },
    testsHead: () => testsHead(cfg),
    ...(code
      ? {
          dsm: (files: string[]) =>
            dsmCases({
              files,
              appRoot,
              repos: repoDirs(project, dsmConfig?.repositories),
              code,
              cases: runCases(project),
              ledger: new Map((ledger?.entries ?? []).map((e) => [e.localId, e.trackerId])),
            }),
        }
      : {}),
    retries: cfg.project.gate.retries,
    sharedShare: cfg.project.gate.sharedShare,
    scriptsHash: () => {
      const dir = automationFolder(cfg);
      return dir ? folderHash(dir) : undefined;
    },
  };
}

/** The gate's local files in the app repo, kept out of its commits through the clone's own exclude file (Q42). */
const LOCAL = [
  `${QAMASTER_DIR}/plans/`,
  `${QAMASTER_DIR}/verdicts/`,
  `${QAMASTER_DIR}/evidence/`,
  `${QAMASTER_DIR}/drafts.json`,
  '.env',
];
function excludeLocal(root: string): void {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--git-path', 'info/exclude'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) return; // not a git repository: nothing to keep out
  const file = path.resolve(root, r.stdout.trim());
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = new Set(have.split('\n').map((l) => l.trim()));
  const missing = LOCAL.filter((l) => !lines.has(l));
  if (!missing.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sep = have && !have.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${sep}# QAMaster: this clone's own gate files (Q42)\n${missing.join('\n')}\n`);
}

const stateDir = (cfg: Config, kind: 'plans' | 'verdicts' | 'evidence') => {
  excludeLocal(cfg.root);
  const dir = path.join(cfg.root, QAMASTER_DIR, kind);
  fs.mkdirSync(dir, { recursive: true });
  // plans, verdicts and evidence are this machine's; .qamaster/integrations.json is the shared part
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  return dir;
};
const savePlan = (cfg: Config, plan: Plan) =>
  fs.writeFileSync(path.join(stateDir(cfg, 'plans'), `${plan.id}.json`), `${JSON.stringify(plan, null, 1)}\n`);
function loadPlan(cfg: Config, id: string | undefined): Plan {
  if (!id) throw new BlockedError('Name the plan: qam approve <plan-id> (qam plan prints it).');
  const plan = readJson<Plan>(path.join(cfg.root, QAMASTER_DIR, 'plans', `${id}.json`));
  if (!plan) throw new BlockedError(`No plan ${id}. Run qam plan first.`);
  return plan;
}

function whoAmI(cfg: Config): string {
  const email = git(cfg.root, ['config', 'user.email']).stdout.trim();
  if (!email)
    throw new BlockedError('No git user to record as the approver. Run git config user.email <you@example.com>.');
  return email;
}

const title = (t: string) => (t.length <= TITLE ? t : `${t.slice(0, TITLE - 1)}…`).padEnd(TITLE);
const why = (kind: string, detail: string) =>
  ({
    path: `covers ${detail}`,
    smoke: 'smoke set',
    dsm: `visits ${detail}`,
    group: `group ${detail}`,
    added: `added by ${detail}`,
  })[kind] ?? detail;

export function renderPlan(plan: Plan): string {
  const c = plan.change;
  const selected = plan.items.filter((i) => i.selected).length;
  const lines = [
    `QAMaster plan ${plan.id} for ${c.branch} vs ${c.base} (${c.files.length} file${c.files.length === 1 ? '' : 's'} changed)`,
    '',
    `Selected (${selected} of ${plan.catalogSize} test cases)`,
    ...(plan.items.length
      ? plan.items.map(
          (i) =>
            `  [${i.selected ? 'x' : ' '}] TC${i.testCase.id}  ${title(i.testCase.title)}  ${i.reasons.map((r) => why(r.kind, r.detail)).join('; ')}${plan.newScripts?.includes(i.testCase.id) ? '  (new script)' : ''}`,
        )
      : ['  none']),
  ];
  if (plan.notRun.length)
    lines.push(
      '',
      'Not run',
      ...plan.notRun.map(
        (n) => `  TC${n.testCase.id}  ${title(n.testCase.title)}  ${n.why}${n.broken ? '  BROKEN' : ''}`,
      ),
    );
  if (plan.shared?.length)
    lines.push(
      '',
      'Shared files (their path tags cover too much of the plan; smoke and the DSM cover them instead)',
      ...plan.shared.map((s) => `  ${s.file}  ${s.cases} test cases`),
    );
  if (plan.gaps.length)
    lines.push(
      '',
      'Coverage gaps (from the DSM)',
      ...plan.gaps.map(
        (g) => `  ${g.screen}  ${g.files.join(', ')} changed; ${g.why}\n    → propose: a TestGen run for this screen`,
      ),
    );
  if (Object.keys(plan.otherGroups).length)
    lines.push(
      '',
      'Other groups (add with --tag, or approve --add <group>)',
      ...Object.entries(plan.otherGroups).map(
        ([tag, titles]) =>
          `  ${tag}: ${titles.slice(0, 3).join('; ')}${titles.length > 3 ? `; and ${titles.length - 3} more` : ''}`,
      ),
    );
  if (plan.approvedBy)
    lines.push('', `Approved by ${plan.approvedBy} at ${plan.approvedAt?.slice(0, 16).replace('T', ' ')}.`);
  return lines.join('\n');
}

export function renderVerdict(v: Verdict, plan: Plan): string {
  const titles = new Map(plan.items.map((i) => [i.testCase.id, i.testCase.title]));
  const lines = [`Verdict: ${v.result.toUpperCase()} (${v.reasons.join(' ')})`];
  for (const r of v.results) {
    lines.push(
      `  ${r.status.padEnd(8)} TC${r.testCaseId}  ${title(titles.get(r.testCaseId) ?? '')}  ${r.durationS.toFixed(1)}s`,
    );
    if (r.error) {
      const errs = r.error.split('\n').filter((l) => l.trim());
      // pytest marks its assertion lines with E; Playwright's message leads with the assertion
      const shown = errs.filter((l) => l.startsWith('E ')).slice(0, 4);
      if (r.status === 'flaky') lines.push('      first attempt:');
      lines.push(...(shown.length ? shown : errs.slice(0, 5)).map((l) => `      ${l}`));
    }
    lines.push(...r.evidence.map((f) => `      evidence: ${f}`));
  }
  lines.push(...v.warnings.map((w) => `  warning: ${w}`));
  return lines.join('\n');
}

function parse(argv: string[], command: string) {
  try {
    return parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        base: { type: 'string' },
        tag: { type: 'string', multiple: true },
        add: { type: 'string', multiple: true },
        remove: { type: 'string', multiple: true },
        yes: { type: 'boolean' },
        done: { type: 'boolean' },
      },
    });
  } catch (e) {
    throw new BlockedError(`qam ${command}: ${(e as Error).message}`);
  }
}
const list = (xs: string[] | undefined) =>
  (xs ?? [])
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
const tags = (xs: string[] | undefined) =>
  Object.fromEntries(
    list(xs).map((t) => {
      const [tag, ...rest] = t.split('=');
      return [tag.trim(), rest.join('=').trim()];
    }),
  );

function out(json: boolean, data: unknown, text: string) {
  console.log(json ? JSON.stringify(data, null, 1) : text);
}

async function finish(cfg: Config, g: Gate, plan: Plan, json: boolean): Promise<number> {
  const evidence = path.join(stateDir(cfg, 'evidence'), plan.change.head);
  const verdict = await runPlan(g, plan, evidence);
  const drafts = readDrafts(cfg);
  if (drafts) {
    const passed = verdict.results
      .filter((r) => r.status === 'passed' || r.status === 'flaky')
      .map((r) => r.testCaseId);
    const ledger = readLedger(cfg.qaProject ?? cfg.root)?.entries ?? [];
    fs.writeFileSync(
      path.join(cfg.root, QAMASTER_DIR, DRAFTS),
      `${JSON.stringify(prove(drafts, ledger, passed), null, 1)}\n`,
    );
  }
  fs.writeFileSync(
    path.join(stateDir(cfg, 'verdicts'), `${verdict.head}.json`),
    `${JSON.stringify(verdict, null, 1)}\n`,
  );
  out(json, verdict, renderVerdict(verdict, plan));
  return verdict.result === 'pass' ? PASS : FAIL;
}

export async function gate(cfg: Config, command: string, argv: string[], json: boolean): Promise<number> {
  const { values: v, positionals } = parse(argv, command);
  const g = gateFor(cfg);
  if (command === 'plan' || command === 'check') {
    const plan = await makePlan(g, v.base ?? defaultBase(cfg.root), tags(v.tag));
    savePlan(cfg, plan);
    if (command === 'check' && v.yes) {
      const approved = await approve(g, plan, whoAmI(cfg), [], []);
      savePlan(cfg, approved);
      if (!json) console.log(`${renderPlan(approved)}\n`);
      return finish(cfg, g, approved, json);
    }
    out(
      json,
      plan,
      `${renderPlan(plan)}\n\nApprove with qam approve ${plan.id} (--add/--remove to change it), then qam run ${plan.id}.`,
    );
    return AWAITING;
  }
  const plan = loadPlan(cfg, positionals[0]);
  if (command === 'automate') return automateCommand(cfg, plan, !!v.done, json);
  if (command === 'approve') {
    const approved = await approve(g, plan, whoAmI(cfg), list(v.add), list(v.remove));
    savePlan(cfg, approved);
    out(json, approved, `${renderPlan(approved)}\n\nRun it with qam run ${approved.id}.`);
    return PASS;
  }
  return finish(cfg, g, plan, json);
}

/**
 * qam automate <plan-id> [--done] (Q39): without --done, what the AutomationCode skill has to draft, update or keep;
 * with --done, the script check must pass, then the drafts are recorded and the plan is bound to them (exit 3).
 */
function automateCommand(cfg: Config, plan: Plan, done: boolean, json: boolean): number {
  const project = cfg.qaProject ?? cfg.root;
  const dir = automationFolder(cfg);
  if (!dir)
    throw new BlockedError(
      'No automation folder yet. Run qam app create, then npm install in it, then run this again.',
    );
  const ledger = readLedger(project)?.entries ?? [];
  const drafts = readDrafts(cfg) ?? { cases: {}, files: {} };
  const scripts = playwrightBdd.scripts(dir);
  // each TestGen case's own hash: a script needs updating only when its case changed
  const caseHash = new Map<string, string>();
  const runsDir = path.join(project, 'testgen', 'output');
  for (const run of fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : [])
    for (const c of readJson<{ id?: string }[]>(path.join(runsDir, run, 'testcases.json')) ?? [])
      if (c.id) caseHash.set(c.id, createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16));
  const work = worklist(plan, { ledger, scripts, drafts, caseHash });
  const runOf = new Map<string, string>();
  const outDir = path.join(project, 'testgen', 'output');
  for (const run of fs.existsSync(outDir) ? fs.readdirSync(outDir).sort() : [])
    for (const c of readJson<{ id?: string }[]>(path.join(outDir, run, 'testcases.json')) ?? [])
      if (c.id) runOf.set(c.id, run);
  if (!done) {
    const n = (a: Work['action']) => work.filter((w) => w.action === a).length;
    const lines = [
      `Automate plan ${plan.id} in ${path.relative(project, dir)}/: ${n('draft')} to draft, ${n('update')} to update, ${n('keep')} kept`,
      ...work.map(
        (w) =>
          `  ${w.action.padEnd(7)} TC${w.testCaseId} ← ${w.localId}  ${w.files.length ? w.files.join(', ') : `no script yet (run ${runOf.get(w.localId) ?? '?'})`}`,
      ),
    ];
    if (n('draft') + n('update'))
      lines.push(
        '',
        `Write them with the AutomationCode skill, run qam check-scripts, then qam automate ${plan.id} --done.`,
      );
    console.log(
      json
        ? JSON.stringify(
            { plan: plan.id, folder: dir, work: work.map((w) => ({ ...w, run: runOf.get(w.localId) })) },
            null,
            1,
          )
        : lines.join('\n'),
    );
    return n('draft') + n('update') ? AWAITING : PASS;
  }
  const known = new Set(runOf.keys());
  const check = playwrightBdd.check(dir, { known, quick: false });
  if (check.status !== 'pass') {
    console.log(
      json
        ? JSON.stringify(check, null, 1)
        : [
            `Script check: fail, so nothing was recorded`,
            ...Object.entries(check.findings).flatMap(([k, l]) => l.map((f) => `  ${k.padEnd(10)} ${f}`)),
          ].join('\n'),
    );
    return FAIL;
  }
  const r = bind(plan, {
    appDir: dir,
    work,
    ledger,
    scripts: playwrightBdd.scripts(dir),
    drafts,
    link: playwrightBdd.link,
    caseHash,
  });
  fs.writeFileSync(path.join(stateDir(cfg, 'plans'), '..', DRAFTS), `${JSON.stringify(r.drafts, null, 1)}\n`);
  savePlan(cfg, r.plan);
  out(
    json,
    r.plan,
    `${renderPlan(r.plan)}\n\nScripts recorded (not committed: review and commit them yourself). Approve with qam approve ${plan.id}, then qam run ${plan.id}.`,
  );
  return AWAITING;
}
