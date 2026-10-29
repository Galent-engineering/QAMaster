#!/usr/bin/env node
/**
 * qem: the QeMaster command line. Commands, hooks, the MCP server, CI and terminals all call it (Q3).
 *
 *     qem [--repo PATH] [--json] <command> [args...]        qem help        qem version
 *
 * Exit codes: 0 pass, 1 fail, 2 blocked (settings, credentials, network, usage), 3 awaiting approval.
 * Run it as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`: hosted plugins may not put plugin/bin on the PATH.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';

export const PASS = 0;
export const FAIL = 1;
export const BLOCKED = 2;
export const AWAITING = 3;

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '../..');

/** command -> one-line description. None is built yet; each one blocks until its porting step lands. */
export const COMMANDS: Record<string, string> = {
  setup: 'Config, packages, browsers, launcher. Safe to re-run',
  pipeline: 'Onboarding pipeline: start | status | next | mark',
  doctor: 'Check settings, credentials, the test plan and the runner',
  dsm: 'Design Structure Matrix: run | refresh | changes | impact <files…>',
  requirements: 'Fetch requirements: --sprint NAME | --current-sprint | --from D --to D',
  testgen: 'Test generation: context | validate <run> | render <run>',
  review: 'Record the review of a run (only after the person says yes)',
  publish: 'Show what a run would publish to ADO; --apply writes it',
  app: 'Create the automation folder: create --app NAME --web-url URL',
  'check-scripts': 'Quality gate for automation scripts',
  plan: 'Propose test cases for the change; runs nothing',
  approve: 'Approve a plan, optionally adding or removing test cases',
  run: 'Run an approved plan and record the verdict',
  check: 'plan, approve (interactive or --yes), run',
  feedback: 'Coverage gaps, stale cases and defect drafts for a verdict',
  report: 'Build reports: all | manual | <type>',
  req: 'Requirements in the tracker: list | show | create | update | retire',
  tc: 'Test cases in the tracker: list | show | create | update | retire',
  export: 'Export skills and commands to other AI tools',
  'mcp-serve': 'QeMaster MCP server (stdio) for other AI tools',
};

type Options = { json: boolean; repo: string };

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
    `qem ${pluginVersion()}: QeMaster command line\n\nusage: qem [--repo PATH] [--json] <command> [args...]\n\n` +
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
      if (!value) throw new BlockedError('--repo needs a path: qem --repo <path> <command>');
      opts.repo = value;
    } else if (a.startsWith('--repo=')) opts.repo = a.slice('--repo='.length);
    else break;
  }
  return [opts, argv[i], argv.slice(i + 1)];
}

function dispatch(opts: Options, command: string | undefined): number {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (opts.json) console.log(JSON.stringify({ version: pluginVersion(), commands: COMMANDS }, null, 2));
    else process.stdout.write(help());
    return command ? PASS : BLOCKED;
  }
  if (command === 'version' || command === '--version') {
    console.log(opts.json ? JSON.stringify({ version: pluginVersion() }) : `qem ${pluginVersion()}`);
    return PASS;
  }
  if (command in COMMANDS) throw new BlockedError(`qem ${command} isn't built yet.`);
  throw new BlockedError(`Unknown command "${command}". Run qem help for the list.`);
}

export function main(argv: string[]): number {
  let opts: Options = { json: argv.includes('--json'), repo: '.' };
  try {
    const [parsed, command] = parseGlobals(argv);
    opts = parsed;
    return dispatch(opts, command);
  } catch (e) {
    if (!(e instanceof BlockedError)) throw e;
    if (opts.json) console.log(JSON.stringify({ result: 'blocked', reasons: [e.message] }));
    else console.error(`Blocked: ${e.message}`);
    return BLOCKED;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
