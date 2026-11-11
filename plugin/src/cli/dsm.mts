/**
 * qam dsm: the Design Structure Matrix in the QA project's dsm/ folder (config/dsm-config.json sets output_dir).
 *
 *     qam dsm run     [--config F] [--no-crawl] [--no-fetch] [--login-mode auto|manual|none]   full rebuild now
 *     qam dsm run     --routes <glob…>          crawl only those routes, merged into the last DSM (--routes /todo '/users/*')
 *     qam dsm run     --estimate                the routes, pages and minutes a crawl takes; crawls nothing
 *     qam dsm compare [<older>] [<newer>]       what changed between two DSMs of dsm/history/ (newer: the current DSM); no argument lists the history
 *     qam dsm refresh [--config F] [--no-crawl] [--no-fetch]   rebuild only if a repository has new commits; never asks
 *     qam dsm changes [--config F] [--no-fetch]                new commits per repository, without building
 *     qam dsm impact  [--config F] <files…>                    the screens those files touch, and shared files
 *     qam dsm scan    [--config F] [--out F]                   the configured repositories -> code-model.json
 *     qam dsm build   [--config F]                             ui-model.json + code-model.json (+ last dsm.json) -> dsm.json
 *     qam dsm render  [--config F] [--out F]                   dsm.json -> index.html
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import type { Crawler } from '../adapters/base.mts';
import { PlaywrightCrawler } from '../adapters/crawler-playwright.mts';
import { changesSince, readRepo } from '../adapters/git.mts';
import { build, compareDsm, type Dsm, type DsmConfig, emptyListHints, uncrawledHint } from '../dsm/build.mts';
import { render } from '../dsm/render.mts';
import { MAX_FILE_BYTES, type ScanConfig, scan, wanted } from '../dsm/scan.mts';
import { compareText, estimate, impact, type State, type UpdateConfig, update } from '../dsm/update.mts';
import { crawlEnv } from '../gate/automate.mts';
import { type Config, ENV_FILE } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CodeModel, UiModel } from '../shared/models.mts';

export const DSM_CONFIG = path.join('config', 'dsm-config.json');
const SUBCOMMANDS = ['run', 'refresh', 'changes', 'impact', 'scan', 'build', 'render', 'compare'];

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}).`);
  }
}

function writeAtomic(file: string, text: string): void {
  fs.writeFileSync(`${file}.tmp`, text);
  fs.renameSync(`${file}.tmp`, file);
}

/** The DSM settings and output folder: --config, else config/dsm-config.json in the QA project (or the repo). */
function locate(cfg: Config, configArg: string | undefined): { config: UpdateConfig; dir: string; project: string } {
  const project = cfg.qaProject ?? cfg.root;
  const file = configArg ? path.resolve(configArg) : path.join(project, DSM_CONFIG);
  const config = readJson<DsmConfig>(file);
  if (!config) throw new BlockedError(`No DSM settings at ${file}. Run qam setup, or pass --config <file>.`);
  return { config, dir: path.resolve(project, config.output_dir ?? 'dsm'), project };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Asks in the terminal; a hidden answer isn't echoed. */
function ask(question: string, hidden: boolean): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  if (hidden) {
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.includes(question)) process.stderr.write(s);
    };
  }
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stderr.write('\n');
      done(answer.trim());
    }),
  );
}

/** The Playwright crawler, with sign-in details from the environment or the QA project's .env (Q16, Q58). */
function crawlerFor(project: string, dir: string, config: UpdateConfig, interactive: boolean): () => Crawler {
  return () => {
    const app = config.application ?? {};
    const env = crawlEnv(project, app.secrets_file);
    const login = app.login ?? {};
    return new PlaywrightCrawler({
      app: { ...app, secrets_file: app.secrets_file || ENV_FILE }, // the crawler's messages name the file the account is in
      projectDir: project,
      authDir: path.join(dir, '.auth'),
      credentials: {
        username: env[login.username_env || 'DSM_APP_USERNAME'],
        password: env[login.password_env || 'DSM_APP_PASSWORD'],
      },
      ask: interactive ? ask : undefined,
      log: (line) => process.stderr.write(`${line}\n`),
    });
  };
}

/** A DSM named on the command line: a file of dsm/history/ (with or without .json, or the start of its name), `current`, or a path. */
function findDsm(dir: string, name: string): { file: string; label: string } {
  const history = path.join(dir, 'history');
  const names = fs.existsSync(history)
    ? fs
        .readdirSync(history)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : [];
  if (name === 'current' || name === 'dsm.json') return { file: path.join(dir, 'dsm.json'), label: 'the current DSM' };
  const exact = names.find((f) => f === name || f === `${name}.json`);
  const starts = names.filter((f) => f.startsWith(name));
  const one = exact ?? (starts.length === 1 ? starts[0] : undefined);
  if (one) return { file: path.join(history, one), label: one };
  if (starts.length > 1) {
    throw new BlockedError(`"${name}" starts ${starts.length} history files (${starts.join(', ')}). Name one in full.`);
  }
  if (fs.existsSync(name)) return { file: path.resolve(name), label: name };
  throw new BlockedError(`No DSM "${name}" in ${history}. Run qam dsm compare with no argument to list them.`);
}

function readDsm(found: { file: string; label: string }): Dsm {
  const dsmFile = readJson<Dsm>(found.file);
  if (!dsmFile?.page) throw new BlockedError(`${found.file} (${found.label}) isn't a DSM. Run qam dsm run first.`);
  return dsmFile;
}

/** "<repo>:<path>" keys for files given on the command line, relative to the app repo or absolute. */
function repoKeys(
  cfg: Config,
  project: string,
  config: UpdateConfig,
  files: string[],
): { keys: string[]; outside: string[] } {
  const keys: string[] = [];
  const outside: string[] = [];
  for (const f of files) {
    const abs = path.resolve(cfg.root, f);
    const repo = (config.repositories ?? []).find((r) => {
      const rel = path.relative(path.resolve(project, r.path), abs);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    });
    if (repo)
      keys.push(`${repo.name}:${path.relative(path.resolve(project, repo.path), abs).split(path.sep).join('/')}`);
    else outside.push(f);
  }
  return { keys, outside };
}

export async function dsm(cfg: Config, argv: string[], json: boolean): Promise<number> {
  const [sub, ...rest] = argv;
  if (!SUBCOMMANDS.includes(sub)) throw new BlockedError(`Use qam dsm ${SUBCOMMANDS.join(', ')}.`);
  let values: {
    config?: string;
    out?: string;
    'no-crawl'?: boolean;
    'no-fetch'?: boolean;
    'login-mode'?: string;
    routes?: string[];
    estimate?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: rest,
      allowPositionals: sub === 'impact' || sub === 'compare' || sub === 'run',
      options: {
        config: { type: 'string' },
        out: { type: 'string' },
        'no-crawl': { type: 'boolean' },
        'no-fetch': { type: 'boolean' },
        'login-mode': { type: 'string' },
        routes: { type: 'string', multiple: true },
        estimate: { type: 'boolean' },
      },
    }));
  } catch (e) {
    throw new BlockedError(`qam dsm ${sub}: ${(e as Error).message}`);
  }
  if (values.out && sub !== 'scan' && sub !== 'render') throw new BlockedError(`--out is for qam dsm scan or render.`);
  if ((values.routes || values.estimate) && sub !== 'run')
    throw new BlockedError('--routes and --estimate are for qam dsm run.');
  if (sub === 'run' && positionals.length && !values.routes) {
    throw new BlockedError(
      `qam dsm run: unexpected "${positionals[0]}". Routes go after --routes: qam dsm run --routes /todo '/users/*'.`,
    );
  }
  if (values.routes && values.estimate)
    throw new BlockedError('--estimate crawls nothing; it cannot be used with --routes.');
  const routeGlobs = [...(values.routes ?? []), ...(values.routes ? positionals : [])]
    .flatMap((g) => g.split(','))
    .map((g) => g.trim())
    .filter(Boolean);
  if (values.routes && !routeGlobs.length)
    throw new BlockedError('--routes needs a route or a glob: --routes /todo or --routes "/users/*".');
  const loginMode = values['login-mode'];
  if (loginMode !== undefined && !['auto', 'manual', 'none'].includes(loginMode)) {
    throw new BlockedError(`--login-mode must be auto, manual or none, not "${loginMode}".`);
  }
  const { config, dir, project } = locate(cfg, values.config);
  const dsmFile = path.join(dir, 'dsm.json');

  if (sub === 'compare') {
    if (positionals.length > 2) throw new BlockedError('qam dsm compare takes at most two DSMs: [<older>] [<newer>].');
    const history = path.join(dir, 'history');
    const names = fs.existsSync(history)
      ? fs
          .readdirSync(history)
          .filter((f) => f.endsWith('.json'))
          .sort()
      : [];
    if (!positionals.length) {
      const rows = names.map((f) => {
        const d = readJson<Dsm>(path.join(history, f));
        return {
          name: f,
          generated_at: d?.generated_at ?? null,
          screens: d?.stats?.pages ?? null,
          elements: d?.stats?.elements ?? null,
        };
      });
      const current = readJson<Dsm>(dsmFile);
      if (json) {
        console.log(
          JSON.stringify({
            result: 'pass',
            history: rows,
            current: current ? { generated_at: current.generated_at } : null,
          }),
        );
      } else {
        if (!rows.length) console.log(`No history yet in ${history}: it fills from the second qam dsm run.`);
        for (const r of rows)
          console.log(
            `${r.name}  ${r.generated_at}  ${plural(r.screens ?? 0, 'screen')}, ${plural(r.elements ?? 0, 'element')}`,
          );
        if (current)
          console.log(
            `current  ${current.generated_at}  ${plural(current.stats.pages, 'screen')}, ${plural(current.stats.elements, 'element')}`,
          );
        if (rows.length) console.log('Compare: qam dsm compare <older> [<newer>] (newer defaults to the current DSM).');
      }
      return 0;
    }
    const older = findDsm(dir, positionals[0]);
    const newer = findDsm(dir, positionals[1] ?? 'current');
    const a = readDsm(older);
    const b = readDsm(newer);
    if (json)
      console.log(JSON.stringify({ result: 'pass', older: older.label, newer: newer.label, ...compareDsm(a, b) }));
    else process.stdout.write(compareText(a, b, { older: older.label, newer: newer.label }));
    return 0;
  }

  if (sub === 'run' && values.estimate) {
    const e = estimate(project, dir, config);
    if (json) console.log(JSON.stringify({ result: 'pass', estimate: e }));
    else {
      const shown = e.routes.slice(0, 15).join(', ');
      console.log(
        `Routes from the code scan: ${e.routes.length}${e.routes.length ? ` (${shown}${e.routes.length > 15 ? ', ...' : ''})` : ''}.`,
      );
      console.log(
        `Expected: about ${plural(e.pages, 'page')}, about ${e.minutes} min at ${plural(e.concurrency, 'tab')}, ${e.seconds_per_page} s a page (${e.basis === 'last crawl' ? "from the last crawl's timings" : 'no past crawl: a default'}).`,
      );
      console.log('Nothing was crawled.');
    }
    return 0;
  }

  if (sub === 'run' || sub === 'refresh') {
    if (!config.application?.base_url && !(config.repositories ?? []).length) {
      throw new BlockedError(
        'dsm-config.json has no application.base_url and no repositories. Run qam setup to add them.',
      );
    }
    const interactive = sub === 'run' && !!process.stdin.isTTY;
    const r = await update(project, dir, config, crawlerFor(project, dir, config, interactive), {
      mode: sub,
      noCrawl: values['no-crawl'],
      fetch: !values['no-fetch'],
      loginMode: loginMode as 'auto' | 'manual' | 'none' | undefined,
      routes: routeGlobs.length ? routeGlobs : undefined,
    });
    // 0.7.2 item 15: a list the crawl reached with no rows warns, so its detail screens are not taken as covered
    if (r.status === 'updated' && !values['no-crawl']) {
      const ui = readJson<UiModel>(path.join(dir, 'ui-model.json'));
      const code = readJson<CodeModel>(path.join(dir, 'code-model.json'));
      const screens = (code?.routes ?? []).filter((x) => x.kind !== 'api').map((x) => x.route);
      r.warnings.push(...emptyListHints(ui, screens), ...uncrawledHint(ui, screens));
    }
    if (json) console.log(JSON.stringify({ result: 'pass', ...r, html: path.join(dir, 'index.html') }));
    else if (r.status === 'no-change') {
      console.log(
        `No new commits in ${r.repos.map((x) => x.repo).join(', ') || 'the repositories'}; the DSM is unchanged.`,
      );
    } else if (r.status === 'skipped') console.log(`Skipped: ${r.reason}.`);
    else {
      const s = r.stats as Dsm['stats'];
      console.log(`Updated ${path.join(dir, 'index.html')} (${r.reason}).`);
      console.log(`Crawl: ${r.crawl}.`);
      console.log(
        `${plural(s.pages, 'screen')}, ${plural(s.page_relations, 'relation')}, ${plural(s.elements, 'element')}, ${plural(s.cycles, 'cycle')}.`,
      );
      if (r.impact?.screens.length) console.log(`Impacted screens: ${r.impact.screens.join(', ')}`);
      if (r.impact?.shared.length)
        console.log(`Shared files changed (may affect every screen): ${r.impact.shared.join(', ')}`);
      for (const w of r.warnings) console.log(`Warning: ${w}`);
    }
    for (const w of r.warnings)
      if (/path not found/.test(w)) console.error(`Blocked: ${w}. Fix the path in dsm-config.json.`);
    return r.warnings.some((w) => /path not found/.test(w)) ? 2 : 0;
  }

  if (sub === 'changes') {
    const state = readJson<State>(path.join(dir, 'state.json'));
    const changes = (config.repositories ?? []).map((r) =>
      changesSince(
        path.resolve(project, r.path),
        r.name,
        r.branch ?? 'main',
        state?.repos[r.name]?.commit ?? null,
        !values['no-fetch'] && r.fetch !== false,
      ),
    );
    if (json) console.log(JSON.stringify({ result: 'pass', changes }));
    else {
      for (const c of changes) {
        const head = `${c.repo} (${c.branch})`;
        if (c.error) console.log(`${head}: ${c.error}`);
        else if (!c.from) console.log(`${head}: not built yet; at ${c.to?.slice(0, 8) ?? 'no commit'}`);
        else if (c.from === c.to) console.log(`${head}: no new commits`);
        else
          console.log(
            `${head}: ${c.from.slice(0, 8)}..${c.to?.slice(0, 8)}, ${plural(c.files.length, 'changed file')}\n${c.log.map((l) => `  ${l}`).join('\n')}`,
          );
      }
    }
    return changes.some((c) => /path not found/.test(c.error ?? '')) ? 2 : 0;
  }

  if (sub === 'impact') {
    if (!positionals.length) throw new BlockedError('Name the changed files: qam dsm impact <file>…');
    const code = readJson<CodeModel>(path.join(dir, 'code-model.json'));
    if (!code) throw new BlockedError(`No code-model.json in ${dir}. Run qam dsm run (or qam dsm scan) first.`);
    const { keys, outside } = repoKeys(cfg, project, config, positionals);
    const r = impact(keys, code);
    r.other.push(...outside);
    if (json) console.log(JSON.stringify({ result: 'pass', ...r }));
    else {
      console.log(r.screens.length ? `Screens: ${r.screens.join(', ')}` : 'Screens: none');
      if (r.shared.length) console.log(`Shared (may affect every screen): ${r.shared.join(', ')}`);
      if (r.other.length) console.log(`Not UI source: ${r.other.join(', ')}`);
    }
    return 0;
  }

  if (sub === 'scan') {
    const repos = config.repositories ?? [];
    if (!repos.length)
      throw new BlockedError('No repositories in dsm-config.json. Add one: { "name", "path", "branch" }.');
    // A relative repository path is relative to the QA project, like output_dir.
    const model = scan(config as ScanConfig, (repo) =>
      readRepo(path.resolve(project, repo.path), repo.branch ?? 'main', (p) => wanted(p, repo), MAX_FILE_BYTES),
    );
    const out = values.out ? path.resolve(values.out) : path.join(dir, 'code-model.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    writeAtomic(out, `${JSON.stringify(model, null, 1)}\n`);
    const summary = {
      file: out,
      routes: model.routes?.length ?? 0,
      edges: model.edges?.length ?? 0,
      errors: model.errors,
    };
    if (json) console.log(JSON.stringify({ result: model.errors.length ? 'blocked' : 'pass', ...summary }));
    else {
      const files = Object.keys(model.files ?? {}).length;
      console.log(
        `Scanned ${plural(files, 'file')}: ${plural(summary.routes, 'route')}, ${plural(summary.edges, 'link')} -> ${out}`,
      );
      for (const e of model.errors) console.error(`Blocked: ${e}. Fix the path in dsm-config.json.`);
    }
    return model.errors.length ? 2 : 0;
  }

  if (sub === 'build') {
    const ui = readJson<UiModel>(path.join(dir, 'ui-model.json'));
    const code = readJson<CodeModel>(path.join(dir, 'code-model.json'));
    if (!ui && !code) throw new BlockedError(`No ui-model.json or code-model.json in ${dir}. Run qam dsm run first.`);
    const built = build(ui, code, config, { previous: readJson<Dsm>(dsmFile) });
    writeAtomic(dsmFile, `${JSON.stringify(built, null, 1)}\n`);
    const s = built.stats;
    if (json) console.log(JSON.stringify({ result: 'pass', file: dsmFile, stats: s }));
    else {
      const counts = [plural(s.pages, 'screen'), plural(s.page_relations, 'relation'), plural(s.elements, 'element')];
      console.log(`Built ${dsmFile}: ${counts.join(', ')}, ${plural(s.cycles, 'cycle')}.`);
    }
    return 0;
  }

  const built = readJson<Dsm>(dsmFile);
  if (!built) throw new BlockedError(`No dsm.json in ${dir}. Run qam dsm build first.`);
  const out = render(built, values.out ? path.resolve(values.out) : path.join(dir, 'index.html'));
  console.log(json ? JSON.stringify({ result: 'pass', file: out }) : `Rendered ${out}`);
  return 0;
}
