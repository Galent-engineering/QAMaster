import fs from 'node:fs';
import path from 'node:path';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import { loadInputs, reportsDir } from './inputs.mts';
import { REPORT_TYPES } from './types.mts';

export type ReportRun = { written: { type: string; file: string }[]; missing: { type: string; why: string }[] };

/** Builds `which`: "all", "manual" (the test case report) or one type's name. Nothing is invented for a type with no data. */
export function buildReports(cfg: Config, which: string, now = new Date()): ReportRun {
  const names = REPORT_TYPES.map((t) => t.name);
  const wanted =
    which === 'all' ? REPORT_TYPES : REPORT_TYPES.filter((t) => t.name === (which === 'manual' ? 'test-cases' : which));
  if (!wanted.length)
    throw new BlockedError(`Unknown report "${which}". Use all, manual or one of: ${names.join(', ')}.`);
  const inputs = loadInputs(cfg, now);
  const out = reportsDir(inputs.project, 'output');
  const run: ReportRun = { written: [], missing: [] };
  for (const t of wanted) {
    const r = t.build(inputs);
    if ('missing' in r) {
      run.missing.push({ type: t.name, why: r.missing });
      continue;
    }
    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, r.file);
    fs.writeFileSync(`${file}.tmp`, r.html);
    fs.renameSync(`${file}.tmp`, file);
    run.written.push({ type: t.name, file });
  }
  return run;
}
