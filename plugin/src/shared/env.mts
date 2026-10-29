/**
 * Loads a .env file (KEY=value lines) into an environment. Variables already set win, so a shell `export` always
 * overrides the file. Ported from CheckMaster's env.py.
 */
import fs from 'node:fs';

export type Env = Record<string, string | undefined>;

export function loadEnv(file: string, env: Env = process.env): void {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eq = line.indexOf('=');
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value[0] === value.at(-1) && `'"`.includes(value[0])) value = value.slice(1, -1);
    // An empty placeholder must not hide a real variable.
    if (value && env[key] === undefined) env[key] = value;
  }
}
