/**
 * Keeps the DSM in step with the code: detect new commits, re-scan, map the changed files to screens, re-crawl only
 * what changed (or everything, when a shared file changed), rebuild, and write CHANGES.md. Ported from
 * Autonomous-QE's dsm_update (the same in 0.1.5 and 0.2.0) without its prompts for a URL or repository: qam setup
 * writes those (Q26).
 *
 * Outputs in the DSM folder: dsm.json, index.html, ui-model.json, code-model.json, CHANGES.md, state.json (the last
 * commit seen per repository) and history/ (earlier dsm.json files).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Crawler } from '../adapters/base.mts';
import { changesSince, type RepoChange, readRepo } from '../adapters/git.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CodeModel, UiModel } from '../shared/models.mts';
import { build, compareDsm, type Dsm, type DsmCompare, type DsmConfig, matchKey } from './build.mts';
import { type CrawlApp, DEFAULT_CONCURRENCY, idHints, matchRoutes } from './crawl-rules.mts';
import { render } from './render.mts';
import { MAX_FILE_BYTES, type ScanConfig, scan, wanted } from './scan.mts';

export type UpdateConfig = DsmConfig &
  ScanConfig & {
    application?: CrawlApp;
    change_detection?: {
      recrawl?: 'impacted' | 'full' | 'none';
      full_recrawl_every_runs?: number;
      keep_history?: number;
    };
  };

export type State = {
  repos: Record<string, { commit: string; ref: string | null; updated_at: string }>;
  runs: number;
  runs_since_full: number;
  last_run?: string;
};

/** The screens a set of changed files touches. Shared files may touch every screen; other files aren't UI source. */
export type Impact = { screens: string[]; shared: string[]; other: string[] };

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

/**
 * Maps changed files ("<repo>:<path>", path relative to the repo's folder) to screens through the code models' owners
 * (later models win). Unlike Autonomous-QE, files with no owner are returned as `shared`, not dropped: the gate needs
 * to know a change may affect every screen.
 */
export function impact(files: string[], ...models: (CodeModel | null)[]): Impact {
  const info = Object.assign({}, ...models.map((m) => m?.files ?? {})) as NonNullable<CodeModel['files']>;
  const screens: string[] = [];
  const shared: string[] = [];
  const other: string[] = [];
  for (const f of files) {
    const owners = info[f]?.owners;
    if (!owners) other.push(f);
    else if (!owners.length) shared.push(f);
    else screens.push(...owners.map(matchKey));
  }
  return { screens: sorted(screens), shared: sorted(shared), other: sorted(other) };
}

export type CrawlPlan = { crawl: 'full' | 'incremental' | null; why: string; routes: string[]; seeds: string[] };

/** Which crawl a rebuild needs: none, the impacted screens plus new routes, or everything. */
export function planCrawl(a: {
  baseUrl: string | null;
  noCrawl: boolean;
  full: boolean;
  config: UpdateConfig;
  state: State;
  previousUi: UiModel | null;
  rewritten: boolean;
  impact: Impact;
  newRoutes: string[];
}): CrawlPlan {
  const none = (why: string): CrawlPlan => ({ crawl: null, why, routes: [], seeds: [] });
  const cd = a.config.change_detection ?? {};
  const every = cd.full_recrawl_every_runs ?? 0;
  if (!a.baseUrl) return none('application.base_url is not set: code-only matrix');
  if (a.noCrawl || cd.recrawl === 'none') return none('crawl skipped: kept the previous crawl');
  if (
    a.full ||
    cd.recrawl === 'full' ||
    !a.previousUi ||
    a.rewritten ||
    (every > 0 && a.state.runs_since_full + 1 >= every)
  ) {
    return { crawl: 'full', why: 'full crawl', routes: [], seeds: [] };
  }
  if (a.impact.shared.length) {
    return {
      crawl: 'full',
      why: `full crawl: shared files changed (${a.impact.shared.slice(0, 5).join(', ')})`,
      routes: [],
      seeds: [],
    };
  }
  const keys = new Set(a.impact.screens);
  const routes = a.previousUi.pages.filter((p) => keys.has(matchKey(p.route))).map((p) => p.route);
  const seeds = a.newRoutes.filter((r) => !r.includes(':'));
  if (!routes.length && !seeds.length) return none('no screens mapped to the changed files: kept the previous crawl');
  return {
    crawl: 'incremental',
    why: `re-crawled ${routes.length} impacted screen(s), ${seeds.length} new route(s)`,
    routes,
    seeds,
  };
}

/** `qam dsm run --routes <glob...>` (0.7.0 item 12): crawl the routes the globs match and merge them into the last crawl. */
export function routesPlan(
  globs: string[],
  baseUrl: string | null,
  noCrawl: boolean,
  previousUi: UiModel | null,
  codeRoutes: string[],
): CrawlPlan {
  if (noCrawl) throw new BlockedError('--routes crawls; it cannot be used with --no-crawl.');
  if (!baseUrl) throw new BlockedError('--routes needs application.base_url in dsm-config.json. Run qam setup.');
  if (!previousUi) {
    throw new BlockedError(
      '--routes crawls only those routes and merges them into the last crawl, and there is none yet. Run qam dsm run first.',
    );
  }
  const known = sorted([...previousUi.pages.map((p) => p.route), ...codeRoutes]);
  const routes = matchRoutes(globs, known);
  if (!routes.length) {
    const some = known.slice(0, 12).join(', ');
    throw new BlockedError(
      `--routes ${globs.join(' ')} matches no route. Routes known so far: ${some}${known.length > 12 ? `, and ${known.length - 12} more` : ''}. * stays inside one path segment, ** crosses them.`,
    );
  }
  return { crawl: 'incremental', why: `crawled ${routes.length} route(s) matching --routes`, routes, seeds: [] };
}

/** What `qam dsm run --estimate` says: the routes the code has, the pages a crawl expects and the minutes it takes. */
export type Estimate = {
  routes: string[];
  pages: number;
  minutes: number;
  seconds_per_page: number;
  basis: 'last crawl' | 'default';
  concurrency: number;
};

/** Seconds a page costs when no past crawl says (settle, sign-in checks and clicks), before the tabs share it. */
export const DEFAULT_SECONDS_PER_PAGE = 6;

/** The estimate of a full crawl. Scans the code in memory, reads the last ui-model.json, crawls nothing, writes nothing. */
export function estimate(project: string, dir: string, config: UpdateConfig): Estimate {
  const repoDir = (p: string) => path.resolve(project, p);
  const code = (config.repositories ?? []).length
    ? scan(config, (r) => readRepo(repoDir(r.path), r.branch ?? 'main', (p) => wanted(p, r), MAX_FILE_BYTES))
    : null;
  const previousUi = readJson<UiModel>(path.join(dir, 'ui-model.json'));
  const fromCode = (code?.routes ?? []).filter((r) => r.kind !== 'api').map((r) => r.route);
  const routes = sorted(fromCode.length ? fromCode : (previousUi?.pages ?? []).map((p) => p.route));
  const concurrency = Math.max(1, Math.floor(Number(config.application?.crawl?.concurrency) || DEFAULT_CONCURRENCY));
  const maxPages = config.application?.max_pages ?? 300;
  const t = previousUi?.timing;
  const timed = !!t && t.pages > 0 && t.elapsed_ms > 0;
  const pages = Math.min(maxPages, t?.pages ?? previousUi?.pages.length ?? Math.max(routes.length, 1));
  const secondsPerPage = timed ? t.elapsed_ms / t.pages / 1000 : DEFAULT_SECONDS_PER_PAGE / concurrency;
  return {
    routes,
    pages,
    minutes: Math.max(1, Math.ceil((pages * secondsPerPage) / 60)),
    seconds_per_page: Math.round(secondsPerPage * 10) / 10,
    basis: timed ? 'last crawl' : 'default',
    concurrency: timed ? t.concurrency : concurrency,
  };
}

/** The text of `qam dsm compare`: what changed between two DSMs. */
export function compareText(older: Dsm, newer: Dsm, label: { older: string; newer: string }): string {
  const d: DsmCompare = compareDsm(older, newer);
  const lines = [`Compared ${label.older} (${older.generated_at}) with ${label.newer} (${newer.generated_at}).`];
  const sections: [string, string[]][] = [
    ['Screens added', d.nodes_added],
    ['Screens removed', d.nodes_removed],
    ['Screens changed', d.nodes_changed.map((x) => `${x.id}: ${x.what.join(', ')}`)],
    ['Relations added', d.relations_added],
    ['Relations removed', d.relations_removed],
    ['Relations changed', d.relations_changed],
    ['Elements added', d.elements_added],
    ['Elements removed', d.elements_removed],
  ];
  let any = false;
  for (const [title, items] of sections) {
    if (!items.length) continue;
    any = true;
    lines.push('', `${title} (${items.length})`, ...items.slice(0, 50).map((x) => `  ${x}`));
    if (items.length > 50) lines.push(`  and ${items.length - 50} more`);
  }
  if (!any) lines.push('', 'No difference in screens, elements, relations or access.');
  return `${lines.join('\n')}\n`;
}

export type Change = {
  reason: string;
  crawl: string;
  warnings: string[];
  commits: Pick<RepoChange, 'repo' | 'branch' | 'from' | 'to' | 'log' | 'files'>[];
  impacted_routes: string[];
  shared_files: string[];
  new_code_routes: string[];
};

/** CHANGES.md: what triggered the update, what it touched, and how the matrix changed. */
export function summary(dsm: Dsm, change: Change): string {
  const s = dsm.stats;
  const lines = [
    '# UI DSM update',
    '',
    `- Generated: ${dsm.generated_at}`,
    `- Trigger: ${change.reason}`,
    `- Crawl: ${change.crawl}`,
    `- Screens: ${s.pages}, relations: ${s.page_relations}, UI elements: ${s.elements}, cycles: ${s.cycles}`,
    `- Flags: ${Object.entries(s.flags)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    '',
    ...change.warnings.map((w) => `> Warning: ${w}`),
  ];
  for (const c of change.commits) {
    lines.push(
      '',
      `## ${c.repo} ${(c.from ?? '').slice(0, 8)}..${(c.to ?? '').slice(0, 8)}`,
      ...c.log.slice(0, 30).map((l) => `- ${l}`),
    );
    if (c.files.length) lines.push(`- ${c.files.length} changed file(s)`);
  }
  if (change.impacted_routes.length)
    lines.push('', '## Screens impacted by the code change', ...change.impacted_routes.map((r) => `- ${r}`));
  if (change.shared_files.length) {
    lines.push('', '## Shared files changed (may affect every screen)', ...change.shared_files.map((f) => `- ${f}`));
  }
  const d = dsm.diff;
  if ('first_run' in d) lines.push('', 'First build: no previous matrix to compare.');
  else {
    const sections: [string, string[]][] = [
      ['Screens added', d.nodes_added],
      ['Screens removed', d.nodes_removed],
      ['Relations added', d.relations_added],
      ['Relations removed', d.relations_removed],
      ['Relations changed', d.relations_changed],
    ];
    for (const [title, items] of sections) {
      if (items.length) lines.push('', `## ${title} (${items.length})`, ...items.slice(0, 100).map((x) => `- ${x}`));
    }
    if (d.nodes_changed.length) {
      lines.push(
        '',
        `## Screens changed (${d.nodes_changed.length})`,
        ...d.nodes_changed.slice(0, 100).map((x) => `- ${x.id}: ${x.what.join(', ')}`),
      );
    }
  }
  lines.push('', 'Open `index.html` in this folder for the interactive matrix.');
  return `${lines.join('\n')}\n`;
}

/** A history file name for a DSM, unique even when two builds share a second. */
export function historyName(dir: string, generatedAt: string): string {
  const base = `dsm-${generatedAt.replace(/:/g, '').replace('+', '_')}`;
  let name = `${base}.json`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}.json`;
  return name;
}

// ---- the update itself

export type UpdateOptions = {
  mode: 'run' | 'refresh'; // run: full rebuild now; refresh: only when a repository has new commits
  noCrawl?: boolean;
  fetch?: boolean;
  loginMode?: 'auto' | 'manual' | 'none';
  routes?: string[]; // 0.7.0: crawl only the routes these globs match, merged into the last DSM (run only)
  now?: Date;
};

export type UpdateResult = {
  status: 'updated' | 'no-change' | 'skipped';
  reason?: string;
  crawl?: string;
  stats?: Dsm['stats'];
  impact?: Impact;
  warnings: string[];
  repos: { repo: string; commit: string | null }[];
};

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}).`);
  }
}

function writeJson(file: string, data: unknown, indent: number | undefined = 1) {
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, indent)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

const LOCK_HOURS = 3;

/**
 * Brings the DSM in `dir` up to date. `project` is the QA project (relative repository paths start there).
 * `crawler` is only called when a crawl is needed, so Playwright loads only then.
 */
/** The crawl's blocked writes, named: each method and URL (without its query), most frequent first, at most five. */
export function blockedWarning(blocked: { method: string; url: string }[]): string {
  const counts = new Map<string, number>();
  for (const b of blocked) {
    const key = `${b.method} ${b.url.split(/[?#]/)[0]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const named = [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k} (${n})` : k));
  const more = named.length > 5 ? `, and ${named.length - 5} more` : '';
  return `${blocked.length} write request(s) blocked during the crawl: ${named.slice(0, 5).join(', ')}${more}; if a page needs one to render, add it to safety.allow_mutating_patterns`;
}

export async function update(
  project: string,
  dir: string,
  config: UpdateConfig,
  crawler: () => Crawler,
  opts: UpdateOptions,
): Promise<UpdateResult> {
  const now = opts.now ?? new Date();
  fs.mkdirSync(path.join(dir, 'history'), { recursive: true });
  const lock = path.join(dir, '.lock');
  if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < LOCK_HOURS * 3600_000) {
    return { status: 'skipped', reason: `another update is running (${lock})`, warnings: [], repos: [] };
  }
  fs.writeFileSync(lock, String(process.pid));
  try {
    return await updateLocked(project, dir, config, crawler, opts, now);
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

async function updateLocked(
  project: string,
  dir: string,
  config: UpdateConfig,
  crawler: () => Crawler,
  opts: UpdateOptions,
  now: Date,
): Promise<UpdateResult> {
  const file = (name: string) => path.join(dir, name);
  const state = readJson<State>(file('state.json')) ?? { repos: {}, runs: 0, runs_since_full: 0 };
  const repoDir = (p: string) => path.resolve(project, p);
  const changes = (config.repositories ?? []).map((r) =>
    changesSince(
      repoDir(r.path),
      r.name,
      r.branch ?? 'main',
      state.repos[r.name]?.commit ?? null,
      opts.fetch !== false && r.fetch !== false,
    ),
  );
  const changed = changes.filter((c) => c.to && c.to !== c.from);
  const previousDsm = readJson<Dsm>(file('dsm.json'));
  const repos = changes.map((c) => ({ repo: c.repo, commit: c.to }));
  const warnings = changes.flatMap((c) => (c.error ? [c.error] : []));
  if (opts.mode === 'refresh' && previousDsm && !changed.length) return { status: 'no-change', warnings, repos };

  const previousCode = readJson<CodeModel>(file('code-model.json'));
  const code = scan(
    config,
    (r) => readRepo(repoDir(r.path), r.branch ?? 'main', (p) => wanted(p, r), MAX_FILE_BYTES),
    now,
  );
  warnings.push(...code.errors);
  const previousUi = readJson<UiModel>(file('ui-model.json'));
  const touched = impact(
    changed.flatMap((c) => c.files.map((f) => `${c.repo}:${f}`)),
    previousCode,
    code,
  );
  const previousRoutes = new Set((previousCode?.routes ?? []).map((r) => r.route));
  // Q48: an API route has no screen, so it is neither a crawl seed nor a "new route"
  const screenRoutes = (code.routes ?? []).filter((r) => r.kind !== 'api').map((r) => r.route);
  const newRoutes = sorted(screenRoutes.filter((r) => !previousRoutes.has(r)));
  const baseUrl = config.application?.base_url || null;
  const plan = opts.routes?.length
    ? routesPlan(opts.routes, baseUrl, !!opts.noCrawl, previousUi, screenRoutes)
    : planCrawl({
        baseUrl,
        noCrawl: !!opts.noCrawl,
        full: opts.mode === 'run',
        config,
        state,
        previousUi,
        rewritten: changes.some((c) => c.rewritten),
        impact: touched,
        newRoutes,
      });
  let why = plan.why;
  if (!baseUrl) warnings.push(why);

  if (plan.crawl && baseUrl) {
    const codeSeeds = sorted(screenRoutes.filter((r) => !r.includes(':'))).slice(0, 500);
    const incremental = plan.crawl === 'incremental';
    try {
      const ui = await crawler().crawl({
        baseUrl,
        loginMode: opts.loginMode,
        routes: incremental ? plan.routes : undefined,
        previous: incremental ? previousUi : null,
        seeds: incremental ? plan.seeds : codeSeeds,
        now,
      });
      writeJson(file('ui-model.json'), ui);
      why += ` (${ui.pages.length} pages, ${ui.edges.length} navigations)`;
      warnings.push(...idHints(ui.pages.map((p) => p.route)));
      if (ui.truncated)
        warnings.push('the crawl stopped at application.max_pages; raise it to cover the remaining routes');
      if (ui.blocked_requests?.length) {
        warnings.push(blockedWarning(ui.blocked_requests));
      }
    } catch (e) {
      if (e instanceof BlockedError) throw e; // sign-in problems: nothing is rebuilt, the previous DSM stands
      warnings.push(`crawl failed: ${(e as Error).message}`);
      why += ' (failed; previous crawl kept)';
    }
  }
  writeJson(file('code-model.json'), code);

  const reason =
    opts.mode === 'run'
      ? 'full rebuild'
      : !previousDsm
        ? 'first build'
        : `repository change: ${changed.map((c) => `${c.repo} ${(c.from ?? '').slice(0, 8)}..${(c.to ?? '').slice(0, 8)}`).join(', ')}`;
  const change: Change = {
    reason,
    crawl: why,
    warnings,
    commits: changed.map(({ repo, branch, from, to, log, files }) => ({ repo, branch, from, to, log, files })),
    impacted_routes: touched.screens,
    shared_files: touched.shared,
    new_code_routes: newRoutes.slice(0, 200),
  };
  const dsm = build(readJson<UiModel>(file('ui-model.json')), code, config, { previous: previousDsm, change, now });
  if (previousDsm) {
    const history = path.join(dir, 'history');
    writeJson(path.join(history, historyName(history, previousDsm.generated_at)), previousDsm, undefined);
    const keep = config.change_detection?.keep_history ?? 30;
    for (const old of fs.readdirSync(history).sort().slice(0, -keep)) fs.rmSync(path.join(history, old));
  }
  writeJson(file('dsm.json'), dsm);
  render(dsm, file('index.html'));
  fs.writeFileSync(file('CHANGES.md'), summary(dsm, change));

  const stamp = now.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  for (const c of changes) if (c.to) state.repos[c.repo] = { commit: c.to, ref: c.ref, updated_at: stamp };
  state.runs += 1;
  state.runs_since_full = plan.crawl === 'full' ? 0 : state.runs_since_full + 1;
  state.last_run = stamp;
  writeJson(file('state.json'), state);
  return { status: 'updated', reason, crawl: why, stats: dsm.stats, impact: touched, warnings, repos };
}
