/**
 * qam dsm: the Design Structure Matrix in the QA project's dsm/ folder (config/dsm-config.json sets output_dir).
 *
 *     qam dsm build  [--config FILE]               ui-model.json + code-model.json (+ the last dsm.json) -> dsm.json
 *     qam dsm render [--config FILE] [--out FILE]  dsm.json -> index.html
 *
 * run, refresh, changes and impact (crawl, scan and change impact) come with features 2 and 3.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { build, type Dsm, type DsmConfig } from '../dsm/build.mts';
import { render } from '../dsm/render.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import type { CodeModel, UiModel } from '../shared/models.mts';

export const DSM_CONFIG = path.join('config', 'dsm-config.json');
const LATER = ['run', 'refresh', 'changes', 'impact'];

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
function locate(cfg: Config, configArg: string | undefined): { config: DsmConfig; dir: string } {
  const project = cfg.qaProject ?? cfg.root;
  const file = configArg ? path.resolve(configArg) : path.join(project, DSM_CONFIG);
  const config = readJson<DsmConfig>(file);
  if (!config) throw new BlockedError(`No DSM settings at ${file}. Run qam setup, or pass --config <file>.`);
  return { config, dir: path.resolve(project, config.output_dir ?? 'dsm') };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function dsm(cfg: Config, argv: string[], json: boolean): number {
  const [sub, ...rest] = argv;
  if (LATER.includes(sub)) throw new BlockedError(`qam dsm ${sub} isn't built yet.`);
  if (sub !== 'build' && sub !== 'render') {
    throw new BlockedError('Use qam dsm build or qam dsm render (run, refresh, changes and impact are coming).');
  }
  let values: { config?: string; out?: string };
  try {
    ({ values } = parseArgs({ args: rest, options: { config: { type: 'string' }, out: { type: 'string' } } }));
  } catch (e) {
    throw new BlockedError(`qam dsm ${sub}: ${(e as Error).message}`);
  }
  if (sub === 'build' && values.out)
    throw new BlockedError('--out is for qam dsm render; build always writes dsm.json.');
  const { config, dir } = locate(cfg, values.config);
  const dsmFile = path.join(dir, 'dsm.json');

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
