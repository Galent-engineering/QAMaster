/**
 * The adapters QAMaster is built from, by the name a repo's .env picks them with (Q4, Q23).
 *
 * To add one (a spreadsheet store, Jira, another runner): implement the interface in base.mts, write a factory that
 * reads only its own QAMASTER_<NAME>_* settings from config.env, register it here, and test it with recorded responses.
 */
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import { makeAdoRequirements, makeAdoStore } from './ado.mts';
import type { RequirementSource, Runner, TestCaseStore } from './base.mts';

type Factory<T> = (config: Config) => T;

/** Stands in for an adapter whose porting step hasn't landed yet. */
function notBuilt(name: string): Factory<never> {
  return () => {
    throw new BlockedError(`The ${name} adapter isn't built yet.`);
  };
}

export const STORES: Record<string, Factory<TestCaseStore>> = { ado: makeAdoStore };
export const REQUIREMENTS: Record<string, Factory<RequirementSource>> = { ado: makeAdoRequirements };
export const RUNNERS: Record<string, Factory<Runner>> = {
  'playwright-bdd': notBuilt('playwright-bdd'),
  pytest: notBuilt('pytest'),
};

function pick<T>(registry: Record<string, Factory<T>>, key: string, name: string, config: Config): T {
  if (!Object.hasOwn(registry, name)) {
    const known = Object.keys(registry).sort().join(', ');
    throw new BlockedError(`${key}=${name} isn't a known adapter. Use one of: ${known}.`);
  }
  return registry[name](config);
}

export function buildStore(config: Config): TestCaseStore {
  return pick(STORES, 'QAMASTER_STORE', config.store, config);
}

export function buildRequirements(config: Config): RequirementSource {
  return pick(REQUIREMENTS, 'QAMASTER_REQUIREMENTS', config.requirements, config);
}

export function buildRunner(config: Config): Runner {
  return pick(RUNNERS, 'QAMASTER_RUNNER', config.runner, config);
}
