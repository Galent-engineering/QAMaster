#!/usr/bin/env node
/**
 * qam: the QAMaster command line. Commands, hooks, the MCP server, CI and terminals all call it (Q3).
 *
 *     qam [--repo PATH] [--json] <command> [args...]        qam help        qam version
 *
 * Exit codes: 0 pass, 1 fail, 2 blocked (settings, credentials, network, usage), 3 awaiting approval.
 * Run it as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`: hosted plugins may not put plugin/bin on the PATH.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AdoProjectUnset, noProjectError } from '../adapters/ado.mts';
import { loadConfig } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import { ado } from './ado.mts';
import { app, checkScripts } from './automation.mts';
import { dsm } from './dsm.mts';
import { gate } from './gate.mts';
import { autSkills } from './knowledge.mts';
import { doctor, integrations, pipeline, setup, store } from './project.mts';
import { publish } from './publish.mts';
import { feedback, report } from './reports.mts';
import { requirements } from './requirements.mts';
import { review, testgen } from './testgen.mts';

export const PASS = 0;
export const FAIL = 1;
export const BLOCKED = 2;
export const AWAITING = 3;

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '../..');

/** command -> one-line description. Commands not in HANDLERS block until their porting step lands. */
export const COMMANDS: Record<string, string> = {
  setup: 'Config, app URL and code sources, packages, browsers, launcher, entry points. Safe to re-run',
  pipeline: 'Onboarding pipeline: start | status | next | mark',
  status: 'Where the onboarding pipeline stands: the same as pipeline status',
  doctor:
    'Check settings, credentials, the test plan and the runner; --check-write asks whether the user may write (reads only)',
  store: "Which store test cases go to: (no argument) shows it | use ado|file switches it, keeping each store's IDs",
  integrations: 'Where QAMaster is plugged in: list [--all] | add <entry…> | remove <id> | verify',
  dsm: 'Design Structure Matrix: run [--routes GLOB…] [--estimate] | refresh | changes | impact <files…> | compare [old] [new] | scan | build | render',
  'aut-skills': 'Application knowledge skills (AUT_<App>) from the DSM; --check says whether they are current',
  requirements:
    'Requirements TestGen may cite: fetch (--sprint NAME | --current-sprint | --from D --to D) | import --file F | list',
  testgen: 'Test generation: context | validate <run> | render <run>',
  review:
    'Record the review of a run: asks for a yes on a terminal; with no terminal it needs --yes, after the person said yes',
  publish: 'Show what a reviewed run would publish to the test case store; --apply writes it',
  app: 'Create the automation folder: create --app NAME --web-url URL [--api-url URL]',
  'check-scripts': 'Quality gate for automation scripts',
  plan: 'Propose test cases for the change (--preset fast|standard|full, --all); runs nothing',
  automate:
    'List the scripts a plan needs drafted or updated; --try runs the new ones once and records nothing; --done records them and binds the plan (Q39)',
  approve:
    'Approve a plan, optionally adding or removing test cases (--allow-empty to run none); with no terminal it needs --yes',
  run: 'Run an approved plan and record the verdict',
  check: 'plan, then with --yes approve and run (--allow-empty approves a plan that runs none)',
  feedback: 'Coverage gaps, stale cases and defect drafts for a verdict',
  report: 'Build reports: all | manual | <type>',
  req: 'Requirements in the tracker: list | show | create | update | retire',
  tc: 'Test cases in the tracker: list | show | create | update | retire',
  ado: 'Azure DevOps: call <METHOD> <path> (one REST call; writes need --apply)',
  export: 'Export skills and commands to other AI tools',
  'mcp-serve': 'QAMaster MCP server (stdio) for other AI tools',
};

type Options = { json: boolean; repo: string };

/** The built commands. Each gets the global options and its own arguments, and returns the exit code. */
const HANDLERS: Record<string, (opts: Options, args: string[]) => number | Promise<number>> = {
  dsm: (opts, args) => dsm(loadConfig(opts.repo), args, opts.json),
  ado: (opts, args) => ado(loadConfig(opts.repo), args, opts.json),
  'aut-skills': (opts, args) => autSkills(loadConfig(opts.repo), args, opts.json),
  requirements: (opts, args) => requirements(loadConfig(opts.repo), args, opts.json),
  testgen: (opts, args) => testgen(loadConfig(opts.repo), args, opts.json),
  review: (opts, args) => review(loadConfig(opts.repo), args, opts.json),
  publish: (opts, args) => publish(loadConfig(opts.repo), args, opts.json),
  setup: (opts, args) => setup(loadConfig(opts.repo), args, opts.json),
  pipeline: (opts, args) => pipeline(loadConfig(opts.repo), args, opts.json),
  status: (opts, args) => pipeline(loadConfig(opts.repo), ['status', ...args], opts.json),
  doctor: (opts, args) => doctor(loadConfig(opts.repo), args, opts.json),
  store: (opts, args) => store(loadConfig(opts.repo), args, opts.json),
  integrations: (opts, args) => integrations(loadConfig(opts.repo), args, opts.json),
  app: (opts, args) => app(loadConfig(opts.repo), args, opts.json),
  'check-scripts': (opts, args) => checkScripts(loadConfig(opts.repo), args, opts.json),
  plan: (opts, args) => gate(loadConfig(opts.repo), 'plan', args, opts.json),
  approve: (opts, args) => gate(loadConfig(opts.repo), 'approve', args, opts.json),
  automate: (opts, args) => gate(loadConfig(opts.repo), 'automate', args, opts.json),
  run: (opts, args) => gate(loadConfig(opts.repo), 'run', args, opts.json),
  check: (opts, args) => gate(loadConfig(opts.repo), 'check', args, opts.json),
  feedback: (opts, args) => feedback(loadConfig(opts.repo), args, opts.json),
  report: (opts, args) => report(loadConfig(opts.repo), args, opts.json),
};

export function pluginVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function help(): string {
  const w = Math.max(...Object.keys(COMMANDS).map((c) => c.length));
  return (
    `qam ${pluginVersion()}: QAMaster command line\n\nusage: qam [--repo PATH] [--json] <command> [args...]\n\n` +
    Object.entries(COMMANDS)
      .map(([c, d]) => `  ${c.padEnd(w)}  ${d}`)
      .join('\n') +
    `\n\n  ${'help'.padEnd(w)}  This list\n  ${'version'.padEnd(w)}  Plugin version\n\n` +
    'Exit codes: 0 pass, 1 fail, 2 blocked, 3 awaiting approval.\n'
  );
}

/** Splits the global flags, which come before the command, from the command and its own arguments. */
function parseGlobals(argv: string[]): [Options, string | undefined, string[]] {
  const opts: Options = { json: false, repo: '.' };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--repo') {
      const value = argv[++i];
      if (!value) throw new BlockedError('--repo needs a path: qam --repo <path> <command>');
      opts.repo = value;
    } else if (a.startsWith('--repo=')) opts.repo = a.slice('--repo='.length);
    else break;
  }
  return [opts, argv[i], argv.slice(i + 1)];
}

async function dispatch(opts: Options, command: string | undefined, args: string[]): Promise<number> {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (opts.json) console.log(JSON.stringify({ version: pluginVersion(), commands: COMMANDS }, null, 2));
    else process.stdout.write(help());
    return command ? PASS : BLOCKED;
  }
  if (command === 'version' || command === '--version') {
    console.log(opts.json ? JSON.stringify({ version: pluginVersion() }) : `qam ${pluginVersion()}`);
    return PASS;
  }
  if (Object.hasOwn(HANDLERS, command)) {
    // 0.7.2: every subcommand answers --help (setup prints its own usage), and a bad flag is one Blocked line, not a Node stack
    const dashes = args.indexOf('--');
    if (
      command !== 'setup' &&
      args.slice(0, dashes < 0 ? undefined : dashes).some((a) => a === '--help' || a === '-h')
    ) {
      if (opts.json) console.log(JSON.stringify({ command, description: COMMANDS[command] }));
      else
        console.log(`qam ${command}: ${COMMANDS[command]}\n\nusage: qam [--repo PATH] [--json] ${command} [args...]`);
      return PASS;
    }
    try {
      return await HANDLERS[command](opts, args);
    } catch (e) {
      const code = (e as { code?: unknown }).code;
      if (typeof code !== 'string' || !code.startsWith('ERR_PARSE_ARGS')) throw e;
      const reason = (e as Error).message.split(/\. To specify/)[0];
      throw new BlockedError(`qam ${command}: ${reason}. Run qam ${command} --help.`);
    }
  }
  if (command in COMMANDS) throw new BlockedError(`qam ${command} isn't built yet.`);
  throw new BlockedError(`Unknown command "${command}". Run qam help for the list.`);
}

/** The organization's project names for an error that has none; the plain message stands when they can't be listed. */
async function withProjects(e: BlockedError, repo: string): Promise<BlockedError> {
  try {
    return (await noProjectError(loadConfig(repo))) ?? e;
  } catch {
    return e;
  }
}

export async function main(argv: string[]): Promise<number> {
  let opts: Options = { json: argv.includes('--json'), repo: '.' };
  try {
    const [parsed, command, args] = parseGlobals(argv);
    opts = parsed;
    return await dispatch(opts, command, args);
  } catch (caught) {
    if (!(caught instanceof BlockedError)) throw caught;
    let e: BlockedError = caught;
    if (e instanceof AdoProjectUnset) e = await withProjects(e, opts.repo);
    if (opts.json) console.log(JSON.stringify({ result: 'blocked', reasons: [e.message] }));
    else console.error(`Blocked: ${e.message}`);
    return BLOCKED;
  }
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
