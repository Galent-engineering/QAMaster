/**
 * Integrations (Q27): every place QAMaster plugs into is an adapter, and every install is recorded, so an upgrade can
 * update each one, an uninstall removes exactly what was added, and `qam doctor` verifies each one.
 *
 * Records live in the app repo's .qamaster/integrations.json (next to plans and verdicts, Q22) and in a per-user
 * index, ~/.qamaster/installs.json (QAMASTER_HOME overrides the folder), listing every repo installed from this machine.
 *
 * Entry points (Q29) are the checklist teams pick from; each maps to an integration kind. v1 has one kind,
 * claude-hooks. The others are listed as coming, so a team sees the plan.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';

export const QAMASTER_DIR = '.qamaster';
export type Availability = 'v1' | 'v1.1' | 'v2' | 'later';

export type EntryPoint = { id: string; label: string; kind: string; available: Availability; how: string };

/** The checklist (Q29). Several IDEs share the one git hook. */
export const ENTRY_POINTS: EntryPoint[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'claude-hooks',
    available: 'v1',
    how: 'the plugin: commands, skills, hooks',
  },
  { id: 'vscode', label: 'VS Code', kind: 'git-hook', available: 'v1.1', how: 'the shared git pre-push hook' },
  {
    id: 'visual-studio',
    label: 'Visual Studio',
    kind: 'git-hook',
    available: 'v1.1',
    how: 'the shared git pre-push hook',
  },
  {
    id: 'jetbrains',
    label: 'PyCharm / IntelliJ',
    kind: 'git-hook',
    available: 'v1.1',
    how: 'the shared git pre-push hook',
  },
  { id: 'terminal', label: 'Terminal', kind: 'git-hook', available: 'v1.1', how: 'the shared git pre-push hook' },
  {
    id: 'pr-checks',
    label: 'PR checks',
    kind: 'pr-check',
    available: 'v1.1',
    how: 'a CI system against the code host (Q28)',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    kind: 'mcp',
    available: 'v2',
    how: 'the QAMaster MCP server and exported instructions',
  },
  {
    id: 'cursor',
    label: 'Cursor / JetBrains AI',
    kind: 'mcp',
    available: 'v2',
    how: 'the QAMaster MCP server and exported instructions',
  },
  {
    id: 'ide-panel',
    label: 'IDE panel with its own UI',
    kind: 'extension',
    available: 'later',
    how: 'an IDE extension',
  },
];

export type IntegrationRecord = {
  id: string; // e.g. claude-hooks:shop, git-hook:pre-push:shop
  kind: string;
  app: string;
  target: string; // the repo, branch or pipeline it's installed on
  entries: string[]; // the entry points it serves
  version: string; // QAMaster version that installed it
  installed_at: string;
};

export type Context = { appRepo: string; app: string; version: string; now: Date };

/** One kind of integration. `verify` returns a problem, or null when it works. */
export interface Integration {
  kind: string;
  install(ctx: Context, entries: string[]): IntegrationRecord;
  remove(ctx: Context, rec: IntegrationRecord): void;
  verify(ctx: Context, rec: IntegrationRecord): string | null;
}

/** Claude Code: the plugin's hooks act in repos that have .qamaster/ (Q14), so installing creates it. */
export const claudeHooks: Integration = {
  kind: 'claude-hooks',
  install(ctx, entries) {
    const dir = path.join(ctx.appRepo, QAMASTER_DIR);
    fs.mkdirSync(dir, { recursive: true });
    const readme = path.join(dir, 'README.md');
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(
        readme,
        "# .qamaster\n\nQAMaster keeps this repo's plans, verdicts and integration records here. Commit `integrations.json`; plans and verdicts are local.\n",
      );
    }
    return {
      id: `claude-hooks:${ctx.app}`,
      kind: 'claude-hooks',
      app: ctx.app,
      target: ctx.appRepo,
      entries,
      version: ctx.version,
      installed_at: ctx.now.toISOString(),
    };
  },
  remove() {
    // Only the record goes: .qamaster/ also holds plans and verdicts. The hooks check the record (step 9).
  },
  verify(ctx) {
    return fs.existsSync(path.join(ctx.appRepo, QAMASTER_DIR))
      ? null
      : `${QAMASTER_DIR}/ is missing in ${ctx.appRepo}. Run qam integrations add claude-code.`;
  },
};

/** The kinds that can be installed now, by name. */
export const KINDS: Record<string, Integration> = { 'claude-hooks': claudeHooks };

const recordFile = (appRepo: string) => path.join(appRepo, QAMASTER_DIR, 'integrations.json');
const homeIndex = () => path.join(process.env.QAMASTER_HOME || path.join(os.homedir(), QAMASTER_DIR), 'installs.json');

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

export function list(appRepo: string): IntegrationRecord[] {
  return readJson<{ integrations: IntegrationRecord[] }>(recordFile(appRepo), { integrations: [] }).integrations;
}

function save(ctx: Context, records: IntegrationRecord[]) {
  writeJson(recordFile(ctx.appRepo), { integrations: records });
  const index = readJson<{ repos: Record<string, { app: string; integrations: string[]; updated_at: string }> }>(
    homeIndex(),
    { repos: {} },
  );
  if (records.length)
    index.repos[ctx.appRepo] = {
      app: ctx.app,
      integrations: records.map((r) => r.id),
      updated_at: ctx.now.toISOString(),
    };
  else delete index.repos[ctx.appRepo];
  writeJson(homeIndex(), index);
}

/** All repos this machine installed QAMaster into (the user index). */
export function installs(): Record<string, { app: string; integrations: string[]; updated_at: string }> {
  return readJson<{ repos: Record<string, { app: string; integrations: string[]; updated_at: string }> }>(homeIndex(), {
    repos: {},
  }).repos;
}

export type AddResult = { installed: IntegrationRecord[]; coming: EntryPoint[]; already: string[] };

/** Installs the integrations for these entry points; the ones not available yet are returned as coming. */
export function add(ctx: Context, entryIds: string[]): AddResult {
  const unknown = entryIds.filter((id) => !ENTRY_POINTS.some((e) => e.id === id));
  if (unknown.length) {
    throw new BlockedError(
      `Unknown entry point(s): ${unknown.join(', ')}. Choose from ${ENTRY_POINTS.map((e) => e.id).join(', ')}.`,
    );
  }
  const picked = ENTRY_POINTS.filter((e) => entryIds.includes(e.id));
  const coming = picked.filter((e) => !KINDS[e.kind]);
  const records = list(ctx.appRepo);
  const installed: IntegrationRecord[] = [];
  const already: string[] = [];
  const byKind = new Map<string, string[]>();
  for (const e of picked.filter((x) => KINDS[x.kind])) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e.id]);
  for (const [kind, entries] of byKind) {
    const rec = KINDS[kind].install(ctx, entries);
    const i = records.findIndex((r) => r.id === rec.id);
    if (i >= 0) {
      already.push(rec.id);
      records[i] = {
        ...rec,
        entries: [...new Set([...records[i].entries, ...entries])],
        installed_at: records[i].installed_at,
      };
    } else {
      records.push(rec);
      installed.push(rec);
    }
  }
  save(ctx, records);
  return { installed, coming, already };
}

/** Removes one integration by ID; its kind undoes what it added. */
export function remove(ctx: Context, id: string): IntegrationRecord {
  const records = list(ctx.appRepo);
  const rec = records.find((r) => r.id === id);
  if (!rec)
    throw new BlockedError(`No integration ${id} in ${ctx.appRepo}. qam integrations list shows the installed ones.`);
  KINDS[rec.kind]?.remove(ctx, rec);
  save(
    ctx,
    records.filter((r) => r.id !== id),
  );
  return rec;
}

/** Each installed integration and its problem, if any. */
export function verify(ctx: Context): { id: string; problem: string | null }[] {
  return list(ctx.appRepo).map((rec) => ({
    id: rec.id,
    problem: KINDS[rec.kind]
      ? KINDS[rec.kind].verify(ctx, rec)
      : `${rec.kind} isn't supported by this QAMaster version (${ctx.version}).`,
  }));
}
