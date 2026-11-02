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

/** Runs npx in the folder; [exit code, output]. A missing npx or package is the caller's blocked case. */
function npx(dir: string, args: string[]): [number, string] {
  const r = spawnSync('npx', ['--no-install', ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return [r.status ?? 1, `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim()];
}

export const playwrightBdd: Framework = {
  name: 'playwright-bdd',
  runners: ['playwright-bdd'],

  create(dir, app, webUrl) {
    if (fs.existsSync(dir)) return { created: false };
    copy(TEMPLATE, dir);
    fs.writeFileSync(path.join(dir, 'app.json'), `${JSON.stringify({ name: app, webUrl }, null, 1)}\n`);
    return { created: true };
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
