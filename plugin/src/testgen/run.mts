/**
 * A TestGen run folder (testgen/output/<run>/): what Claude wrote (manifest.json, testcases.json), the validator's
 * result (validation.json) and the person's review (run.json reviewedBy, Q12). The hash of the two written files binds
 * a validation and a review to exactly what was checked: change either file and both are out of date.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Report } from './validate.mts';

export type Validation = Report & { dsm_generated_at: string; run_hash: string; validated_at: string };
export type RunRecord = { reviewedBy?: string; reviewedAt?: string; run_hash?: string; [key: string]: unknown };

const text = (dir: string, f: string) => {
  const file = path.join(dir, f);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};
function json<T>(dir: string, f: string): T | null {
  try {
    return JSON.parse(text(dir, f)) as T;
  } catch {
    return null;
  }
}

/** sha256 of manifest.json and testcases.json as they are on disk. */
export function runHash(dir: string): string {
  return createHash('sha256')
    .update(text(dir, 'manifest.json'))
    .update('\0')
    .update(text(dir, 'testcases.json'))
    .digest('hex');
}
export const readValidation = (dir: string) => json<Validation>(dir, 'validation.json');
export const readRunRecord = (dir: string) => json<RunRecord>(dir, 'run.json');

/** Why a run's validation doesn't stand for it now, or null when it does. */
export function validationProblem(dir: string, dsmGeneratedAt: string | null): string | null {
  const v = readValidation(dir);
  if (!v) return 'not validated yet';
  if (v.status !== 'pass') return `the last validation failed (${v.errors.length} findings, ${v.gaps.length} gaps)`;
  if (v.run_hash !== runHash(dir)) return 'manifest.json or testcases.json changed since it was validated';
  if (dsmGeneratedAt && v.dsm_generated_at !== dsmGeneratedAt) return 'the DSM was rebuilt since it was validated';
  return null;
}
