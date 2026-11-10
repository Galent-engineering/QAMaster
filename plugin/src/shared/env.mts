/**
 * Loads a .env file (KEY=value lines) into an environment. Variables already set win, so a shell `export` always
 * overrides the file. Ported from CheckMaster's env.py.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

/**
 * What `az devops configure --defaults` set (R24): the organization and project, from AZURE_DEFAULTS_ORGANIZATION and
 * AZURE_DEFAULTS_PROJECT, else the [defaults] section of az's config file (AZURE_CONFIG_DIR, else ~/.azure). QAMaster's
 * own QAMASTER_ADO_* settings are read first by the caller; these are used only when both of those are unset.
 */
export function azDefaults(env: Env = process.env): { organization?: string; project?: string } {
  const out: { organization?: string; project?: string } = {
    organization: env.AZURE_DEFAULTS_ORGANIZATION || undefined,
    project: env.AZURE_DEFAULTS_PROJECT || undefined,
  };
  if (out.organization && out.project) return out;
  let text = '';
  try {
    const dir = env.AZURE_CONFIG_DIR || path.join(os.homedir(), '.azure');
    text = fs.readFileSync(path.join(dir, 'config'), 'utf8');
  } catch {
    return out; // no az config: nothing to add
  }
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^\[(.+)\]$/.exec(line);
    if (head) section = head[1].toLowerCase();
    else if (section === 'defaults' && line.includes('=') && !line.startsWith('#') && !line.startsWith(';')) {
      const eq = line.indexOf('=');
      const key = line.slice(0, eq).trim().toLowerCase();
      const value = line.slice(eq + 1).trim();
      if (value && (key === 'organization' || key === 'project')) out[key] ??= value;
    }
  }
  return out;
}
