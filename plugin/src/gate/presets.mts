/**
 * Selection presets and the groups model (Q31, 0.7.0 item 14): `qam plan --preset fast|standard|full`, `gate.preset`
 * and `gate.groupsModel`. The plan records what it used (`selection`). The names live in shared/models.mts.
 *
 *     fast      path tags and smoke only: the DSM adds nothing
 *     standard  today's plan: path, smoke and the DSM, and the groups the session picks (the default)
 *     full      every case with a bound or recorded script (D5: the same as 0.6.0's `qam plan --all`)
 *
 * The groups model is the Claude Code model the /qamaster:check command gives the subagent that picks groups. The CLI
 * only records it; CI, the pre-push hook and QAMASTER_AI=off never pick groups.
 */
import { BlockedError } from '../shared/errors.mts';
import { type Plan, PRESETS, type Preset } from '../shared/models.mts';
import { type Gate, makePlan } from './gate.mts';

/** The preset a run uses: --all (0.6.0, D5: the same as full), else the flag, else gate.preset. */
export function choosePreset(flag: string | undefined, configured: Preset, all = false): Preset {
  if (all) {
    if (flag !== undefined && flag !== 'full')
      throw new BlockedError(`qam plan: --all is --preset full; drop one of --all and --preset ${flag}.`);
    return 'full';
  }
  if (flag === undefined) return configured;
  if (!(PRESETS as readonly string[]).includes(flag))
    throw new BlockedError(`qam plan: --preset must be one of ${PRESETS.join(', ')} (got "${flag}").`);
  return flag as Preset;
}

/** Whether the run is in CI (the CI variable CI systems set), where no model picks groups. */
export const inCI = (env: Record<string, string | undefined> = process.env): boolean =>
  !!env.CI && !['false', '0'].includes(env.CI.toLowerCase());

/**
 * A plan under a preset. `fast` drops the DSM; `full` is makePlan's `all` (D5: 0.6.0's `qam plan --all`), every case
 * with a bound or recorded script, whatever changed.
 */
export async function planWith(
  g: Gate,
  base: string,
  wanted: Record<string, string>,
  o: { preset: Preset; ai: 'on' | 'off'; groupsModel: string | null; ci?: boolean; recorded?: Set<number> },
): Promise<Plan> {
  const gate = o.preset === 'fast' ? { ...g, dsm: undefined } : g;
  const plan = await makePlan(gate, base, wanted, { all: o.preset === 'full', recorded: o.recorded });
  const groups = Object.keys(wanted).length ? ['group'] : [];
  plan.selection = {
    preset: o.preset,
    selectors: [
      ...(o.preset === 'full' ? ['all'] : []),
      'path',
      'smoke',
      ...(o.preset !== 'fast' && g.dsm ? ['dsm'] : []),
      ...groups,
    ],
    model: o.preset === 'standard' && o.ai === 'on' && !o.ci ? (o.groupsModel ?? 'inherit') : null,
  };
  return plan;
}

/** The plan's line naming what it used; empty for a plan made without a preset. */
export function renderSelection(plan: Plan): string {
  const s = plan.selection;
  if (!s) return '';
  const model = s.model ? `; groups picked by ${s.model === 'inherit' ? "the session's model" : s.model}` : '';
  return `Selection: preset ${s.preset} (${s.selectors.join(', ')})${model}`;
}
