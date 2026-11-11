/**
 * Just-in-time automation (Q39): the gate's step between plan and approve.
 *   worklist()  each case of the plan that a TestGen case stands behind (through the ledger) is a draft (no scenario is
 *               tagged with it yet), an update (its case changed since its script was recorded) or a keep;
 *   bind()      after the AutomationCode skill wrote the scripts and the script check passed: records each drafted case
 *               (a case it left without a scenario stays manual, under Not run)
 *               and the hash of every file in the automation folder (.qamaster/drafts.json), moves the drafted manual
 *               cases into the plan with their local link, and binds the plan to the folder's hash.
 * Approval then refuses if any script changed after bind; the QA project's "uncommitted changes" rule skips the files
 * recorded here while their hash still matches. QAMaster never commits, pushes or deletes them.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ENV_FILE } from '../shared/config.mts';
import { type Env, loadEnv } from '../shared/env.mts';
import { BlockedError } from '../shared/errors.mts';
import type { LedgerEntry, NotRun, Plan } from '../shared/models.mts';

export type Drafts = {
  /** TC ID -> the hash of its test case when its script was recorded, and whether the script has passed once. */
  cases: Record<string, { caseHash: string; proven?: boolean }>;
  /** Every file of the automation folder at bind (absolute path -> sha256). */
  files: Record<string, string>;
};
export type Work = { testCaseId: number; localId: string; action: 'draft' | 'update' | 'keep'; files: string[] };

const SKIP = new Set(['node_modules', '.features-gen', 'test-results', 'playwright-report']);
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Every source file of the automation folder, absolute, sorted (generated folders left out). */
export function folderFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...folderFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out.sort();
}

/** One hash for the folder's files and their contents. */
export function folderHash(dir: string): string {
  const h = createHash('sha256');
  for (const f of folderFiles(dir)) h.update(`${path.relative(dir, f)}\0${sha(f)}\0`);
  return h.digest('hex');
}

/** The cases the plan selected (manual ones included) that a TestGen case stands behind, and what each needs. */
export function worklist(
  plan: Plan,
  o: { ledger: LedgerEntry[]; scripts: Map<string, string[]>; drafts: Drafts; caseHash?: Map<string, string> },
): Work[] {
  const byTracker = new Map(o.ledger.map((e) => [e.trackerId, e]));
  const manual = new Set(plan.notRun.filter((n) => !n.broken).map((n) => n.testCase.id));
  const cases = [...plan.items.filter((i) => i.selected).map((i) => i.testCase.id), ...manual];
  const out: Work[] = [];
  for (const id of cases) {
    const e = byTracker.get(id);
    if (!e) continue; // not from a TestGen run: nothing to draft from
    const files = o.scripts.get(e.localId) ?? [];
    const recorded = o.drafts.cases[e.localId];
    // a manual case's script that QAMaster hasn't recorded yet is still a draft, also once it's written
    const action =
      !files.length || (manual.has(id) && !recorded)
        ? 'draft'
        : recorded && recorded.caseHash !== (o.caseHash?.get(e.localId) ?? e.hash)
          ? 'update'
          : 'keep';
    out.push({ testCaseId: id, localId: e.localId, action, files });
  }
  return out;
}

/** Records the drafted scripts and binds the plan to them. A case to draft that still has no scenario stays manual. */
export function bind(
  plan: Plan,
  o: {
    appDir: string;
    work: Work[];
    ledger: LedgerEntry[];
    scripts: Map<string, string[]>;
    drafts: Drafts;
    link: (localId: string) => string;
    /** TC ID -> the hash of the case in its TestGen run. */
    caseHash?: Map<string, string>;
  },
): { plan: Plan; drafts: Drafts } {
  // a case left without a scenario stays manual, under Not run: the person may keep some cases manual on purpose
  const touched = o.work.filter((w) => w.action !== 'keep' && o.scripts.get(w.localId)?.length);
  // the TestGen case's own hash when given: publishing adds a link and a Script line, which isn't a change to the case
  const hashOf = new Map(o.ledger.map((e) => [e.localId, o.caseHash?.get(e.localId) ?? e.hash]));
  const cases = { ...o.drafts.cases };
  // a drafted or updated script is new until it passes once (Q39)
  for (const w of touched) cases[w.localId] = { caseHash: hashOf.get(w.localId) ?? '' };
  // real paths: git reports them so (macOS: /private/var for /var), and the clean-tree rule compares with git's
  const files = Object.fromEntries(folderFiles(fs.realpathSync(o.appDir)).map((f) => [f, sha(f)]));

  // every manual case that has a script runs with its local link, recorded earlier or now
  const scripted = new Map(
    o.work.filter((w) => o.scripts.get(w.localId)?.length).map((w) => [w.testCaseId, w.localId]),
  );
  const moved = plan.notRun.filter((n) => scripted.has(n.testCase.id));
  return {
    drafts: { cases, files },
    plan: {
      ...plan,
      items: [
        ...plan.items,
        ...moved.map((n) => ({
          testCase: { ...n.testCase, automatedTest: o.link(scripted.get(n.testCase.id) ?? '') },
          reasons: n.reasons ?? [],
          selected: true,
        })),
      ],
      notRun: plan.notRun.filter((n) => !scripted.has(n.testCase.id)),
      // only scripts QAMaster drafted can be new; one already linked in the store has run before
      newScripts: [...scripted].filter(([, id]) => cases[id] && !cases[id].proven).map(([tc]) => tc),
      scriptsHash: folderHash(o.appDir),
    },
  };
}

/** Files of a `git status --porcelain` list that QAMaster recorded and that are unchanged since. */
export function recordedUnchanged(drafts: Drafts | null, file: string): boolean {
  const want = drafts?.files[file];
  return !!want && fs.existsSync(file) && sha(file) === want;
}

/** Marks the recorded scripts of the cases that passed (or passed on retry) as proven: no longer new (Q39). */
export function prove(drafts: Drafts, ledger: LedgerEntry[], passed: number[]): Drafts {
  const local = new Map(ledger.map((e) => [e.trackerId, e.localId]));
  const cases = { ...drafts.cases };
  for (const tc of passed) {
    const id = local.get(tc);
    if (id && cases[id]) cases[id] = { ...cases[id], proven: true };
  }
  return { ...drafts, cases };
}

/**
 * Q49: at plan time, a manual case whose script QAMaster recorded runs with its local link, with no new --done: the
 * binding is the case's TestGen ID, so it outlives the plan and a store switch. A recorded script whose files changed
 * since stays manual, saying how to record it again (Q39: a later edit voids the approval).
 */
export function rebind(
  plan: Plan,
  o: {
    appDir: string;
    ledger: LedgerEntry[];
    scripts: Map<string, string[]>;
    drafts: Drafts;
    link: (localId: string) => string;
  },
): Plan {
  const local = new Map(o.ledger.map((e) => [e.trackerId, e.localId]));
  const root = fs.realpathSync(o.appDir);
  const bound = new Map<number, string>();
  const notRun = plan.notRun.map((n) => {
    const id = local.get(n.testCase.id);
    const files = id ? (o.scripts.get(id) ?? []) : [];
    if (n.broken || !id || !o.drafts.cases[id] || !files.length) return n;
    const edited = files.filter((f) => {
      const abs = path.join(root, f);
      return !fs.existsSync(abs) || o.drafts.files[abs] !== sha(abs);
    });
    if (edited.length)
      return {
        ...n,
        why: `script edited since recorded (${edited.join(', ')}): run qam check-scripts, then qam automate ${plan.id} --done`,
      };
    bound.set(n.testCase.id, id);
    return null;
  });
  if (!bound.size) return { ...plan, notRun: notRun.filter((n): n is NotRun => !!n) };
  return {
    ...plan,
    items: [
      ...plan.items,
      ...plan.notRun
        .filter((n) => bound.has(n.testCase.id))
        .map((n) => ({
          testCase: { ...n.testCase, automatedTest: o.link(bound.get(n.testCase.id) ?? '') },
          reasons: n.reasons ?? [],
          selected: true,
        })),
    ],
    notRun: notRun.filter((n): n is NotRun => !!n),
    newScripts: [
      ...new Set([
        ...(plan.newScripts ?? []),
        ...[...bound].filter(([, id]) => !o.drafts.cases[id]?.proven).map(([tc]) => tc),
      ]),
    ],
    scriptsHash: folderHash(o.appDir),
  };
}

/** The login block of config/dsm-config.json, and the secrets file an older project still names (Q57). */
function loginOf(project: string): { login?: Record<string, unknown>; secretsFile: string } | null {
  let app: { secrets_file?: unknown; login?: Record<string, unknown> } | undefined;
  try {
    app = JSON.parse(fs.readFileSync(path.join(project, 'config', 'dsm-config.json'), 'utf8'))?.application;
  } catch {
    return null; // an unreadable config is reported by the command that reads it
  }
  const secretsFile = typeof app?.secrets_file === 'string' && app.secrets_file ? app.secrets_file : OLD_SECRETS_FILE;
  return { login: app?.login && typeof app.login === 'object' ? app.login : undefined, secretsFile };
}

/** Where projects set up before Q58 kept the account: the crawl's secrets file. */
export const OLD_SECRETS_FILE = '.env.dsm';

/** The two variable names login.username_env / password_env hold (empty when there is no login, or mode is none). */
function accountNames(project: string): string[] {
  const l = loginOf(project)?.login;
  if (!l || l.mode === 'none') return [];
  return [l.username_env, l.password_env].filter((n): n is string => typeof n === 'string' && n !== '');
}

/**
 * Q57, Q58 item 12: the account the crawl and the gate scripts sign in with is login.username_env and
 * login.password_env in config/dsm-config.json, and both must be set in the QA project's .env (the shell counts, as
 * for every setting). The old secrets file (.env.dsm) is no longer read. Returns the names that are not set (names
 * only: no value is read into the result). A config with no login block has nothing to check.
 */
export function accountVarsMissing(project: string, env: Env): string[] {
  return accountNames(project).filter((n) => !env[n]);
}

/** The missing names that the old secrets file still holds: they only need to move to the QA .env. */
export function accountInOldFile(project: string, env: Env): string[] {
  const file = loginOf(project)?.secretsFile;
  if (!file) return [];
  const old: Env = {};
  loadEnv(path.join(project, file), old);
  return accountVarsMissing(project, env).filter((n) => old[n]);
}

/**
 * Moves the account's lines from the old secrets file to the QA project's .env: a name that .env doesn't have gets its
 * line appended (the line is copied as it is, so the value is never read into a variable that gets shown), and the
 * line leaves the old file. Returns the names moved; no value is printed or returned.
 */
export function moveAccount(project: string, env: Env): string[] {
  const l = loginOf(project);
  const names = accountInOldFile(project, env);
  if (!l || !names.length) return [];
  const from = path.join(project, l.secretsFile);
  const lines = fs.readFileSync(from, 'utf8').split(/\r?\n/);
  const keyOf = (line: string) =>
    line
      .trim()
      .replace(/^export\s+/, '')
      .split('=')[0]
      .trim();
  const moving = lines.filter((line) => names.includes(keyOf(line)) && line.includes('='));
  const target = path.join(project, ENV_FILE);
  const text = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  fs.writeFileSync(target, `${text}${text && !text.endsWith('\n') ? '\n' : ''}${moving.join('\n')}\n`, { mode: 0o600 });
  fs.writeFileSync(from, lines.filter((line) => !moving.includes(line)).join('\n'));
  return names;
}

/**
 * What the scripts' sign-in needs in their environment (Q58 item 11): the two variables login.username_env /
 * password_env name, with their values from the QA .env (a value that isn't set is left out, so the framework hook says
 * which one is missing), the names themselves in QAMASTER_LOGIN_USER_VAR / QAMASTER_LOGIN_PASSWORD_VAR, and
 * login.url as QAMASTER_LOGIN_URL, and login.username_selector / password_selector / submit_selector as
 * QAMASTER_LOGIN_USERNAME_SELECTOR / _PASSWORD_SELECTOR / _SUBMIT_SELECTOR, when they are set (the crawl tries those
 * first, and so does the hook). Nothing when the project has no sign-in.
 */
export function accountEnvForScripts(project: string, env: Env): Record<string, string> {
  const [user, password] = accountNames(project);
  const login = loginOf(project)?.login;
  const set = (name: string, v: unknown) => (typeof v === 'string' && v ? { [name]: v } : {});
  if (!user || !password) return {};
  return {
    QAMASTER_LOGIN_USER_VAR: user,
    QAMASTER_LOGIN_PASSWORD_VAR: password,
    ...set('QAMASTER_LOGIN_URL', login?.url),
    ...set('QAMASTER_LOGIN_USERNAME_SELECTOR', login?.username_selector),
    ...set('QAMASTER_LOGIN_PASSWORD_SELECTOR', login?.password_selector),
    ...set('QAMASTER_LOGIN_SUBMIT_SELECTOR', login?.submit_selector),
    ...(env[user] ? { [user]: env[user] as string } : {}),
    ...(env[password] ? { [password]: env[password] as string } : {}),
  };
}

/** The crawl's environment: the shell, then the QA project's .env, then (a project that still names one) its secrets_file. */
export function crawlEnv(project: string, secretsFile?: string): Env {
  const env: Env = { ...process.env };
  loadEnv(path.join(project, ENV_FILE), env);
  if (secretsFile && secretsFile !== ENV_FILE) loadEnv(path.join(project, secretsFile), env);
  return env;
}

/** Stops with one message that names the missing account variables (exit 2). */
export function requireAccountVars(project: string, env: Env): void {
  const missing = accountVarsMissing(project, env);
  if (!missing.length) return;
  const old = accountInOldFile(project, env);
  const where = loginOf(project)?.secretsFile ?? OLD_SECRETS_FILE;
  if (old.length)
    throw new BlockedError(
      `The test account is in ${where}, which QAMaster no longer reads (Q58). Move the ${old.join(' and ')} line${old.length > 1 ? 's' : ''} from ${where} to the QA project's ${ENV_FILE}, or run qam setup --move-account to have QAMaster copy ${old.length > 1 ? 'them' : 'it'} (names only; the values are copied, never printed), then run again.${missing.length > old.length ? ` Still not set: ${missing.filter((n) => !old.includes(n)).join(' and ')}.` : ''}`,
    );
  throw new BlockedError(
    `The test account isn't set: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not in the QA project's ${ENV_FILE} (Q57). Add ${missing.length > 1 ? 'them' : 'it'} there, with the values for the account the app signs in with, then run again. The values stay in ${ENV_FILE}; nothing prints them.`,
  );
}
