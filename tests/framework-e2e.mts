/** Shared by the tests that run the real framework template under Playwright (offline npm cache, installed Chromium). */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './tmp.mts';

export const FRAMEWORK = path.resolve(import.meta.dirname, '../plugin/framework/playwright-bdd');

/** A copy of the template with its packages installed from npm's cache, or null when Playwright or Chromium isn't there. */
export function installedFramework(prefix = 'qam-fw-e2e-'): string | null {
  const dir = tmpDir(prefix);
  fs.cpSync(FRAMEWORK, dir, { recursive: true });
  const npm = spawnSync('npm', ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts'], {
    cwd: dir,
    encoding: 'utf8',
  });
  if (npm.status !== 0) return null;
  const probe = "require('@playwright/test').chromium.launch().then((b) => b.close(), () => process.exit(1))";
  return spawnSync(process.execPath, ['-e', probe], { cwd: dir }).status === 0 ? dir : null;
}

export function write(dir: string, files: Record<string, string>) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
}
