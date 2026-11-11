/**
 * The playwright-bdd framework (Q20, Q25): QAMaster's template in plugin/framework/playwright-bdd, copied into the QA
 * project as <App>/ by `qam app create`. Its scripts are features tagged @TC-<id>, linked as bdd:@TC-<id> (Q9), and run
 * by the playwright-bdd runner (Q32). The gate is quality.mts's static checks, then bddgen (every step has a
 * definition) and `playwright test --list` (unless quick), with the folder's own node_modules.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { files, staticFindings } from '../automation/quality.mts';
import type { Framework, ScriptCheck } from './base.mts';

export const TEMPLATE = path.resolve(import.meta.dirname, '..', '..', 'framework', 'playwright-bdd');
const SKIP = new Set(['node_modules', '.features-gen', 'test-results', 'playwright-report']);

function copy(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const [src, dst] = [path.join(from, e.name), path.join(to, e.name)];
    if (e.isDirectory()) copy(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

/**
 * The template's files that are not in `to` yet, copied there (D9: a folder made before 0.7.0 gains the API and Mobile
 * Web layers). A file that exists is never touched, and a .gitkeep is not brought back into a folder that exists: it
 * only keeps an empty folder in git. Returns the added paths, relative with /.
 */
function addMissing(from: string, to: string, rel = ''): string[] {
  const added: string[] = [];
  const present = fs.existsSync(to);
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const [src, dst, name] = [path.join(from, e.name), path.join(to, e.name), path.posix.join(rel, e.name)];
    if (e.isDirectory()) added.push(...addMissing(src, dst, name));
    else if (!fs.existsSync(dst) && !(present && e.name === '.gitkeep')) {
      fs.copyFileSync(src, dst);
      added.push(name);
    }
  }
  return added;
}

/**
 * QAMaster's own files in the folder (Q58: the app-error watcher): replaced when they differ from the template, since
 * the person's own code lives elsewhere (fixtures.ts, steps, pages). Returns the replaced paths, relative with /.
 */
const OWNED = ['src/app-errors.ts'];
function replaceOwned(from: string, to: string): string[] {
  return OWNED.filter((rel) => {
    const [src, dst] = [path.join(from, rel), path.join(to, rel)];
    if (!fs.existsSync(dst) || fs.readFileSync(src, 'utf8') === fs.readFileSync(dst, 'utf8')) return false;
    fs.copyFileSync(src, dst);
    return true;
  });
}

/** Runs npx in the folder; [exit code, output]. A missing npx or package is the caller's blocked case. */
function npx(dir: string, args: string[]): [number, string] {
  const r = spawnSync('npx', ['--no-install', ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [r.status ?? 1, `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim()];
}

/** The framework, with a create that takes the API's base URL and reports what it added to an existing folder. */
export const playwrightBdd: Framework & {
  create(
    dir: string,
    app: string,
    webUrl: string,
    o?: { apiUrl?: string },
  ): { created: boolean; added: string[]; replaced: string[] };
} = {
  name: 'playwright-bdd',
  runners: ['playwright-bdd'],

  /**
   * A new folder is the template plus app.json. In an existing folder what the template has and the folder lacks is
   * added (`added`), QAMaster's own files are replaced when they differ (`replaced`), and `apiUrl` is recorded when
   * app.json has none; nothing else changes.
   */
  create(dir, app, webUrl, o: { apiUrl?: string } = {}): { created: boolean; added: string[]; replaced: string[] } {
    const appJson = path.join(dir, 'app.json');
    if (!fs.existsSync(dir)) {
      copy(TEMPLATE, dir);
      const record = { name: app, webUrl, ...(o.apiUrl ? { apiUrl: o.apiUrl } : {}) };
      fs.writeFileSync(appJson, `${JSON.stringify(record, null, 1)}\n`);
      return { created: true, added: [], replaced: [] };
    }
    const added = addMissing(TEMPLATE, dir);
    const replaced = replaceOwned(TEMPLATE, dir);
    if (o.apiUrl && fs.existsSync(appJson)) {
      try {
        const record = JSON.parse(fs.readFileSync(appJson, 'utf8')) as Record<string, unknown>;
        if (!('apiUrl' in record)) {
          fs.writeFileSync(appJson, `${JSON.stringify({ ...record, apiUrl: o.apiUrl }, null, 1)}\n`);
          added.push('app.json (apiUrl)');
        }
      } catch {
        /* an app.json that isn't JSON is the person's to fix; it is left as it is */
      }
    }
    return { created: false, added, replaced };
  },

  check(dir, o): ScriptCheck {
    const findings = staticFindings(dir, o.known);
    const add = (k: string, msg: string) => {
      findings[k] = [...(findings[k] ?? []), msg];
    };
    if (!fs.existsSync(path.join(dir, 'node_modules', 'playwright-bdd')))
      add(
        'install',
        `playwright-bdd isn't installed in ${dir}: run npm install there (it downloads the packages), then check again`,
      );
    else if (files(dir, 'features', /\.feature$/).length) {
      const [code, out] = npx(dir, ['bddgen']);
      if (code !== 0)
        for (const line of new Set(out.split('\n').map((l) => l.trim())))
          if (line && !line.startsWith('npm')) add('bddgen', line);
      if (!o.quick && !findings.bddgen) {
        const [listCode, listOut] = npx(dir, ['playwright', 'test', '--list']);
        if (listCode !== 0) add('list', listOut.split('\n').filter(Boolean).at(-1) ?? 'playwright test --list failed');
      }
    }
    return { status: Object.keys(findings).length ? 'fail' : 'pass', findings };
  },

  scripts(dir) {
    const out = new Map<string, string[]>();
    for (const f of files(dir, 'features', /\.feature$/))
      for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/@(TC-[\w-]+)/g))
        out.set(m[1], [...new Set([...(out.get(m[1]) ?? []), f])]);
    return out;
  },

  link: (localId) => `bdd:@${localId}`,
};
