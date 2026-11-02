/**
 * Which automation scripts publish may link (Q39, Q40): a test case gets its automation link only when every feature
 * file tagged with it is committed, unchanged, and on a branch of the QA repo's remote, so a teammate can pull what the
 * link points at. Each linked case also gets a Script line: the feature's web address at that commit, for Bitbucket,
 * GitHub and Azure Repos, else its path and commit.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (dir: string, args: string[]) => {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** The web address of `file` (relative to the repo's top) at `sha`, from the origin URL; null for an unknown host. */
export function webUrl(origin: string, file: string, sha: string): string | null {
  const o = origin.replace(/\.git$/, '');
  let m = /github\.com[:/]([^/]+)\/([^/]+)$/.exec(o);
  if (m) return `https://github.com/${m[1]}/${m[2]}/blob/${sha}/${file}`;
  m = /bitbucket\.org[:/]([^/]+)\/([^/]+)$/.exec(o);
  if (m) return `https://bitbucket.org/${m[1]}/${m[2]}/src/${sha}/${file}`;
  m =
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)$/.exec(o) ??
    /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(o);
  if (m) return `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}?path=/${file}&version=GC${sha}`;
  m =
    /([^/@]+)\.visualstudio\.com.*?\/([^/]+)\/_git\/([^/]+)$/.exec(o) ??
    /vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(o);
  if (m) return `https://dev.azure.com/${m[1]}/${m[2]}/_git/${m[3]}?path=/${file}&version=GC${sha}`;
  return null;
}

export type PublishableScripts = {
  /** TC ID -> the Script line's value, for every case whose scripts are pushed. */
  linked: Map<string, string>;
  /** TC IDs with scripts that aren't committed and pushed yet: their links stay unpublished. */
  unpushed: string[];
};

/** `scripts` maps each TC ID to its feature files, relative to `appDir`. */
export function publishable(appDir: string, scripts: Map<string, string[]>): PublishableScripts {
  // git answers with the real path (macOS: /private/var for /var), so compare real paths
  appDir = fs.realpathSync(appDir);
  const out: PublishableScripts = { linked: new Map(), unpushed: [] };
  const top = git(appDir, ['rev-parse', '--show-toplevel']);
  const origin = top ? git(top, ['remote', 'get-url', 'origin']) : null;
  for (const [id, files] of [...scripts].sort(([a], [b]) => a.localeCompare(b))) {
    let line: string | null = null;
    for (const f of files) {
      const rel = top ? path.relative(top, path.join(appDir, f)).split(path.sep).join('/') : null;
      const dirty = rel === null || git(top as string, ['status', '--porcelain', '--', rel]) !== '';
      const sha = rel && !dirty ? git(top as string, ['log', '-1', '--format=%H', '--', rel]) : null;
      const pushed = !!sha && !!git(top as string, ['branch', '-r', '--contains', sha]);
      if (!pushed || !rel || !sha) {
        line = null;
        break;
      }
      line ??= (origin && webUrl(origin, rel, sha)) || `${rel} @ ${sha.slice(0, 12)}`;
    }
    if (line) out.linked.set(id, line);
    else out.unpushed.push(id);
  }
  return out;
}
