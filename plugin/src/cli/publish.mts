/**
 * qam publish (Q7, Q8, Q34): what a reviewed run would write to the test case store, and with --apply, writing it.
 *
 *     qam publish <run> [--apply] [--retire] [--leave-out ID,…] [--skip-smoke ID,…]
 *
 * <run> is a folder, or a name under testgen/output/. Without --apply nothing is written. Exit codes: 0 nothing to
 * write, 3 something awaits the person's yes, 1 a conflict is left (the store was changed by someone since the last
 * publish), 2 blocked. The ledger is saved after every write, so a failure half way can't lose a created test case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildStore } from '../adapters/registry.mts';
import type { Dsm } from '../dsm/build.mts';
import { type Applied, checkStore, readLedger, record, writeLedger } from '../publish/ledger.mts';
import {
  type Derived,
  derive,
  diff,
  loadRun,
  type PlannedChange,
  type PublishContext,
  suggestSmoke,
} from '../publish/publish.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Item, Ledger } from '../shared/models.mts';
import { runDir } from './testgen.mts';

const ids = (xs: string[] | undefined) =>
  (xs ?? [])
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
const tc = (id: number) => `TC${id}`;

function readDsm(dir: string): Dsm {
  let out = 'dsm';
  try {
    out = JSON.parse(fs.readFileSync(path.join(dir, 'config', 'dsm-config.json'), 'utf8')).output_dir ?? out;
  } catch {}
  const file = path.join(dir, out, 'dsm.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Dsm;
  } catch {
    throw new BlockedError(`No DSM at ${path.relative(dir, file)}. Run qam dsm run first.`);
  }
}

/** The @TC-… tags of the scenarios in the automation suite, <App>/features (Q9). None before the suite exists. */
function scenarioIds(dir: string, app: string | undefined): Set<string> {
  const found = new Set<string>();
  const features = app ? path.join(dir, app, 'features') : '';
  if (!features || !fs.existsSync(features)) return found;
  for (const f of fs.readdirSync(features, { recursive: true, encoding: 'utf8' })) {
    if (!f.endsWith('.feature')) continue;
    for (const m of fs.readFileSync(path.join(features, f), 'utf8').matchAll(/@(TC-[\w-]+)/g)) found.add(m[1]);
  }
  return found;
}

export async function publish(cfg: Config, argv: string[], json: boolean): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    throw new BlockedError(`qam publish: ${(e as Error).message}`);
  }
  const { values: v, positionals } = parsed;
  const dir = cfg.qaProject ?? cfg.root;
  const dsm = readDsm(dir);
  const run = loadRun(runDir(dir, positionals[0]), { dsmGeneratedAt: dsm.generated_at, owners: cfg.project.owners });
  const store = buildStore(cfg);
  const where = store.where();
  let ledger: Ledger | null = readLedger(dir);
  checkStore(ledger, where);

  const known = new Set(run.cases.map((c) => c.id));
  const leftOut = new Set(ids(v['leave-out']));
  const skipSmoke = new Set(ids(v['skip-smoke']));
  for (const id of [...leftOut, ...skipSmoke]) {
    if (!known.has(id)) throw new BlockedError(`${id} isn't in ${run.name}. Its cases: ${[...known].join(', ')}.`);
  }
  const ctx: PublishContext = {
    scope: run.scope,
    dsm,
    settings: cfg.project,
    scenarios: scenarioIds(dir, cfg.project.app?.name),
  };
  const derived: Derived[] = run.cases.filter((c) => !leftOut.has(c.id)).map((c) => derive(c, ctx));

  // inPlan first: it fails loudly when the store can't be reached, so an ID missing below really is gone
  await store.inPlan();
  const items = new Map<number, Item>();
  for (const e of ledger?.entries ?? []) {
    try {
      items.set(e.trackerId, await store.show(e.trackerId));
    } catch (err) {
      if (!(err instanceof BlockedError)) throw err;
    }
  }
  // a case left out of this publish is not "no longer generated"
  const entries = (ledger?.entries ?? []).filter((e) => !leftOut.has(e.localId));
  const smokeInStore = (await store.find({ kind: 'test_case', tag: 'smoke', limit: 1000 })).length;
  const suggestion = suggestSmoke(derived, entries, smokeInStore, cfg.project);
  const confirmed = new Set(suggestion.ids.filter((id) => !skipSmoke.has(id)));
  const result = diff({ derived, ledger: entries, items, module: run.scope.module, confirmedSmoke: confirmed });

  const by = (kind: PlannedChange['kind']) => result.changes.filter((c) => c.kind === kind);
  const [creates, updates, conflicts, retires, unchanged] = (
    ['create', 'update', 'conflict', 'retire', 'unchanged'] as const
  ).map(by);
  const pending = creates.length + updates.length + (v.retire ? retires.length : 0);
  const notLinked = derived.filter((d) => d.notLinked).map((d) => d.id);
  const title = new Map(derived.map((d) => [d.id, d.title]));

  const lines: string[] = [
    `QAMaster publish ${run.name} → ${where} (${v.apply ? 'applying' : 'dry run'})`,
    `Reviewed by ${run.reviewedBy}${run.reviewedAt ? ` on ${run.reviewedAt.slice(0, 10)}` : ''}`,
    ...(run.ownerWarning ? [`Warning: ${run.ownerWarning}`] : []),
  ];
  const section = (head: string, rows: string[]) => rows.length && lines.push('', head, ...rows.map((r) => `  ${r}`));
  section(
    `Create (${creates.length})`,
    creates.map((c) => `${c.localId}  ${title.get(c.localId)}  suite ${c.suite} · tags ${c.ownedTags.join(', ')}`),
  );
  section(
    `Update (${updates.length})`,
    updates.map((c) => `${tc(c.trackerId ?? 0)} ← ${c.localId}  ${c.fields.join(', ')} changed`),
  );
  section(
    `Conflict (${conflicts.length}), not written`,
    conflicts.map((c) => `${c.trackerId ? `${tc(c.trackerId)} ← ` : ''}${c.localId}  ${c.reason}`),
  );
  section(
    `Retire (${retires.length}), only with --retire`,
    retires.map((c) => `${tc(c.trackerId ?? 0)} ← ${c.localId}  ${c.reason}`),
  );
  if (unchanged.length) lines.push('', `Unchanged (${unchanged.length})`);
  if (notLinked.length) lines.push('', `Not linked to code (no path: tag): ${notLinked.join(', ')}`);
  if (suggestion.ids.length) {
    const { priorities, categories, max } = cfg.project.smoke;
    lines.push(
      '',
      `Smoke suggestions (${priorities.join(', ')}, ${categories.join(' or ')}; the smoke set would be ${smokeInStore + confirmed.size} of max ${max})`,
      ...suggestion.ids.map((id) => `  [${skipSmoke.has(id) ? ' ' : 'x'}] ${id}  ${title.get(id)}`),
    );
  }
  lines.push('');
  if (!pending && !conflicts.length) lines.push('Nothing to publish.');
  else if (!v.apply && pending) {
    lines.push(
      'Reply yes to apply. To untick a smoke suggestion use --skip-smoke ID; to leave a case out use --leave-out ID.',
    );
  }

  const applied = { created: 0, updated: 0, retired: 0 };
  let heldBack = conflicts.length;
  if (v.apply) {
    const now = new Date().toISOString();
    const save = (done: Applied[], declined: string[] = []) => {
      ledger = record(ledger, where, done, declined, now);
      writeLedger(dir, ledger);
    };
    if (result.declinedSmoke.length) save([], result.declinedSmoke);
    if (creates.length || updates.length) {
      const plan = await store.ensurePlan();
      if (plan.created) lines.push(`Created test plan ${plan.name}.`);
    }
    for (const c of [...creates, ...updates]) {
      if (c.suite) await store.ensureSuite(c.suite);
      try {
        if (c.kind === 'create' && c.change) {
          save([{ change: c, item: await store.create(c.change) }]);
          applied.created++;
        } else if (c.kind === 'update' && c.change && c.trackerId) {
          // the copy read for the diff, so a change made since then is refused, not overwritten
          const read = items.get(c.trackerId);
          if (!read) throw new BlockedError(`Test case ${c.trackerId} disappeared from the store.`);
          save([{ change: c, item: await store.update(read, c.change) }]);
          applied.updated++;
        }
      } catch (e) {
        if (!(e instanceof BlockedError)) throw e;
        heldBack++;
        lines.push(`Not written: ${c.localId}: ${e.message}`);
      }
    }
    if (v.retire) {
      for (const c of retires) {
        const read = c.trackerId ? items.get(c.trackerId) : undefined;
        if (!read) continue;
        lines.push(...(await store.retire(read)).map((s) => `Retired: ${s}`));
        save([{ change: c, done: true }]);
        applied.retired++;
      }
    }
    if (unchanged.length) save(unchanged.map((change) => ({ change })));
    lines.push(
      `Created ${applied.created}, updated ${applied.updated}, retired ${applied.retired}, unchanged ${unchanged.length}; ${heldBack} held back by a conflict.`,
    );
  }

  const code = v.apply ? (heldBack ? 1 : 0) : pending ? 3 : conflicts.length ? 1 : 0;
  if (json) {
    console.log(
      JSON.stringify({
        result: code === 0 ? 'pass' : code === 3 ? 'awaiting approval' : 'fail',
        apply: !!v.apply,
        run: run.name,
        store: where,
        reviewedBy: run.reviewedBy,
        ...(run.ownerWarning ? { warning: run.ownerWarning } : {}),
        changes: result.changes.map(({ change: _write, ...c }) => c),
        notLinked,
        smoke: { suggested: suggestion.ids, skipped: [...skipSmoke], max: cfg.project.smoke.max },
        ...(v.apply ? { applied, heldBack } : {}),
      }),
    );
  } else console.log(lines.join('\n'));
  return code;
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      apply: { type: 'boolean' },
      retire: { type: 'boolean' },
      'leave-out': { type: 'string', multiple: true },
      'skip-smoke': { type: 'string', multiple: true },
    },
    allowPositionals: true,
  });
}
