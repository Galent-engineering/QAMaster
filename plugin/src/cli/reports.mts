/**
 * qam report all | manual | <type>      builds into the QA project's reports/output/ (Q17)
 * qam feedback [<sha>]                  proposals for a verdict into reports/data/feedback-<sha>.json (Q19)
 * Exit 0 when something was written, 2 when no input exists (the message says which).
 */
import fs from 'node:fs';
import path from 'node:path';
import { propose } from '../feedback/feedback.mts';
import { buildReports } from '../reports/build.mts';
import { loadInputs, reportsDir } from '../reports/inputs.mts';
import { REPORT_TYPES } from '../reports/types.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';

export function report(cfg: Config, args: string[], json: boolean): number {
  const which = args[0];
  if (!which)
    throw new BlockedError(
      `Name the report: qam report all | manual | ${REPORT_TYPES.map((t) => t.name).join(' | ')}.`,
    );
  const run = buildReports(cfg, which);
  const blocked = !run.written.length;
  if (json) console.log(JSON.stringify({ result: blocked ? 'blocked' : 'pass', ...run }));
  else {
    for (const w of run.written) console.log(`Wrote ${w.file}`);
    for (const m of run.missing) console[blocked ? 'error' : 'log'](`Skipped ${m.type}: ${m.why}`);
  }
  return blocked ? 2 : 0;
}

export function feedback(cfg: Config, args: string[], json: boolean): number {
  const inputs = loadInputs(cfg);
  const sha = args.find((a) => !a.startsWith('-'));
  const verdict = sha ? inputs.verdicts.find((v) => v.head.startsWith(sha)) : inputs.verdicts[0];
  if (!verdict)
    throw new BlockedError(
      sha
        ? `No verdict for commit ${sha} in .qamaster/verdicts/. Run qam check there first.`
        : 'No verdict yet: run qam check in the app repo first.',
    );
  const fb = propose({
    verdict,
    plan: inputs.plans.get(verdict.planId) ?? null,
    runs: inputs.runs,
    ledger: inputs.ledger,
    screens: inputs.dsm ? inputs.dsm.page.nodes.map((n) => n.id) : null,
  });
  const dir = reportsDir(inputs.project, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `feedback-${verdict.head}.json`);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(fb, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  if (json) console.log(JSON.stringify({ result: 'pass', file, feedback: fb }));
  else {
    console.log(`Feedback for ${verdict.head.slice(0, 8)}, saved to ${file}`);
    console.log(
      `  coverage gaps ${fb.gaps.length}, stale cases ${fb.stale.length}, BROKEN ${fb.broken.length}, defect drafts ${fb.defects.length}`,
    );
    for (const p of fb.proposal) console.log(`  - ${p}`);
    for (const n of fb.notes) console.log(`  note: ${n}`);
    console.log('Nothing was written to a store. Run qam report summary to show it in the test summary report.');
  }
  return 0;
}
