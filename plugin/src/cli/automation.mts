/**
 * The automation folder (Q25):
 *     qam app create [--app NAME] [--web-url URL] [--api-url URL]
 *                                                     <App>/ in the QA project from the playwright-bdd template; in an
 *                                                     existing folder it adds the template files that are missing
 *     qam check-scripts [--quick]                     the scripts' quality gate (0 pass, 1 fail, 2 blocked: packages missing)
 * The app name and URL default to config/qamaster.json's app.name and app.url.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { playwrightBdd } from '../adapters/framework-bdd.mts';
import { requireAccountVars } from '../gate/automate.mts';
import { runCases } from '../gate/dsm.mts';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { pascal } from '../knowledge/build.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';

/** The QA project's automation folder: <project>/<App>, named after app.name. */
export function appFolder(cfg: Config): string {
  const name = cfg.project.app?.name;
  if (!name) throw new BlockedError('No app name in config/qamaster.json. Run qam setup --app <name> first.');
  return path.join(cfg.qaProject ?? cfg.root, pascal(name));
}

/** A playwright.config.ts from before 0.7.0 has no api or mobile-chrome project; it is the person's file, so say so. */
function stale(dir: string): string {
  const file = path.join(dir, 'playwright.config.ts');
  return fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes('defineBddProject')
    ? ' playwright.config.ts was not changed: it has no api or mobile-chrome project; compare it with the template (framework/playwright-bdd/playwright.config.ts in the plugin).'
    : '';
}

export function app(cfg: Config, argv: string[], json: boolean): number {
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { app: { type: 'string' }, 'web-url': { type: 'string' }, 'api-url': { type: 'string' } },
  });
  if (positionals[0] !== 'create')
    throw new BlockedError('Usage: qam app create [--app NAME] [--web-url URL] [--api-url URL]');
  const name = v.app ?? cfg.project.app?.name;
  const url = v['web-url'] ?? cfg.project.app?.url;
  if (!name)
    throw new BlockedError('Name the application: qam app create --app <name> (or set app.name with qam setup).');
  if (!url || !/^https?:\/\/\S+$/.test(url))
    throw new BlockedError(
      "Give the application's URL: qam app create --web-url <http(s) URL> (or set app.url with qam setup).",
    );
  const apiUrl = v['api-url'];
  if (apiUrl !== undefined && !/^https?:\/\/\S+$/.test(apiUrl))
    throw new BlockedError(
      "Give the API's base URL as an http(s) URL: qam app create --api-url http://localhost:8000.",
    );
  requireAccountVars(cfg.qaProject ?? cfg.root, cfg.env);
  const dir = path.join(cfg.qaProject ?? cfg.root, pascal(name));
  const { created, added, replaced } = playwrightBdd.create(dir, name, url, { apiUrl });
  const rel = path.relative(cfg.qaProject ?? cfg.root, dir) || '.';
  console.log(
    json
      ? JSON.stringify({ folder: dir, created, added, replaced })
      : created
        ? `Created ${rel}/ from the playwright-bdd template for ${url}${apiUrl ? ` (API ${apiUrl})` : ''}. Next: npm install in ${rel}/ (it downloads @playwright/test and playwright-bdd).`
        : added.length || replaced.length
          ? `${rel}/ already exists.${added.length ? ` Added to ${rel}/: ${added.join(', ')}.` : ''}${replaced.length ? ` Replaced ${replaced.join(', ')} with QAMaster's current version (it is QAMaster's file: a change of yours there is gone; the app-error watcher now also watches the API and requests that got no answer).` : ''} Nothing else that was there changed.${stale(dir)}`
          : `${rel}/ already exists; left as it is.`,
  );
  return 0;
}

export function checkScripts(cfg: Config, argv: string[], json: boolean): number {
  const { values: v } = parseArgs({ args: argv, options: { quick: { type: 'boolean' } } });
  const dir = appFolder(cfg);
  const known = new Set(runCases(cfg.qaProject ?? cfg.root).map((c) => c.localId));
  const r = playwrightBdd.check(dir, { known, quick: !!v.quick });
  // the pipeline's script-gate stage reads this record (0.3.2 T4); blocked is a setup problem, not a pass
  const project = cfg.qaProject ?? cfg.root;
  fs.mkdirSync(path.join(project, QAMASTER_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(project, QAMASTER_DIR, 'check-scripts.json'),
    `${JSON.stringify({ status: r.findings.install ? 'blocked' : r.status, at: new Date().toISOString() }, null, 1)}\n`,
  );
  if (json) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`Script check: ${r.findings.install ? 'blocked' : r.status} (${path.basename(dir)}/)`);
    for (const [gate, list] of Object.entries(r.findings))
      for (const f of list) console.log(`  ${gate.padEnd(10)} ${f}`);
  }
  // packages not installed is a setup problem to fix first, not a failed check (exit 2)
  return r.status === 'pass' ? 0 : r.findings.install ? 2 : 1;
}
