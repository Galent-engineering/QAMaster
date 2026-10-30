/**
 * Settings for one run of qam. A developer sets only the app repo's git-ignored .env (QAMASTER_*); the QA project's
 * config/qamaster.json holds the team's choices. The shell wins over .env, and for the AI switch either "off" wins (Q24).
 */
import fs from 'node:fs';
import path from 'node:path';
import { type Env, loadEnv } from './env.mts';
import { BlockedError } from './errors.mts';
import { asProjectConfig, DEFAULT_PROJECT_CONFIG, type ProjectConfig } from './schema.mts';

export const ENV_FILE = '.env';
export const PROJECT_CONFIG = path.join('config', 'qamaster.json');

export type Config = {
  root: string; // the app repo: the gate reads its diff and keeps .qamaster/ there (Q22)
  // Which adapter does each job, by its name in adapters/registry.mts (Q4, Q23).
  store: string;
  requirements: string;
  runner: string;
  testRoot: string; // where the runner runs: QAMASTER_TEST_ROOT, else the repo root
  qaProject: string | null; // the folder holding config/qamaster.json, if there is one
  project: ProjectConfig;
  ai: 'on' | 'off';
  env: Env; // the settings each adapter factory reads its own QAMASTER_<NAME>_* keys from
};

/** The nearest folder at or above `start` that has config/qamaster.json. */
function findQaProject(start: string): string | null {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, PROJECT_CONFIG))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function readProjectConfig(qaProject: string | null): ProjectConfig {
  if (!qaProject) return structuredClone(DEFAULT_PROJECT_CONFIG);
  const file = path.join(qaProject, PROJECT_CONFIG);
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}). Fix it, then run the command again.`);
  }
  return asProjectConfig(data, file);
}

/**
 * Settings from the shell, then <root>/.env. The QA project is found from the test root upwards, so it works both when
 * the tests live in the app repo and when QAMASTER_TEST_ROOT points into a separate QA project.
 */
export function loadConfig(root: string, env: Env = process.env): Config {
  root = path.resolve(root);
  loadEnv(path.join(root, ENV_FILE), env);
  const testRoot = path.resolve(root, env.QAMASTER_TEST_ROOT || '.');
  if (!fs.existsSync(testRoot)) {
    // say which setting is wrong: the repo folder itself (a mistyped --repo), or QAMASTER_TEST_ROOT in .env
    throw new BlockedError(
      env.QAMASTER_TEST_ROOT
        ? `QAMASTER_TEST_ROOT points to ${testRoot}, which doesn't exist. Fix the line in ${ENV_FILE}.`
        : `${root} doesn't exist. Check --repo; to start a QA project there, create the folder first.`,
    );
  }
  const qaProject = findQaProject(testRoot) ?? findQaProject(root);
  const project = readProjectConfig(qaProject);
  const envAi = env.QAMASTER_AI?.toLowerCase();
  if (envAi && envAi !== 'on' && envAi !== 'off') {
    throw new BlockedError(`QAMASTER_AI=${env.QAMASTER_AI} isn't valid. Use QAMASTER_AI=off or remove the line.`);
  }
  return {
    root,
    store: env.QAMASTER_STORE || 'ado',
    requirements: env.QAMASTER_REQUIREMENTS || 'ado',
    runner: env.QAMASTER_RUNNER || 'playwright-bdd',
    testRoot,
    qaProject,
    project,
    ai: envAi === 'off' || project.ai === 'off' ? 'off' : 'on',
    env,
  };
}
