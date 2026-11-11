/**
 * qam publish (Q7, Q8, Q34): what a reviewed run would write to the test case store, and with --apply, writing it.
 *
 *     qam publish <run> [--to file,ado] [--apply] [--retire]  [--refresh] [--leave-out ID,…] [--skip-smoke ID,…]
 *                       [--take-store ID,…]
 *
 * <run> is a folder, or a name under testgen/output/. `--to` names the destinations (Q50; default: the store the project
 * is set up for): each is reached first, each gets a preview, and one --apply writes them all, the local file first. Without --apply nothing is written. A store that isn't a local
 * file is read through the cache (Q34) in a dry run, and --refresh, like --apply, reads it live. Exit codes: 0 nothing to
 * write, 3 something awaits the person's yes, 1 a conflict is left (the store was changed by someone since the last
 * publish), 2 blocked. `--take-store <localId>` accepts a store edit: the ledger takes the store's revision (only with
 * --apply), and nothing is written to the store. The ledger is saved after every write, so a failure half way can't lose a created test case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { NewProject } from '../adapters/base.mts';
import { cacheFile, withCache } from '../adapters/cache.mts';
import { playwrightBdd } from '../adapters/framework-bdd.mts';
import { buildStore, STORES } from '../adapters/registry.mts';
import type { Dsm } from '../dsm/build.mts';
import { stateDirs } from '../gate/state.mts';
import { type Applied, adopt, readLedger, record, switchLedger, writeLedger } from '../publish/ledger.mts';
import {
  type Derived,
  derive,
  diff,
  loadRun,
  type PlannedChange,
  type PublishContext,
  suggestSmoke,
} from '../publish/publish.mts';
import { publishable } from '../publish/scripts.mts';
import type { Config } from '../shared/config.mts';
import { BlockedError, NoPlanError, NoProjectError } from '../shared/errors.mts';
import type { Item, Ledger } from '../shared/models.mts';
import { appFolder } from './automation.mts';
import { runDir } from './testgen.mts';

const ids = (xs: string[] | undefined) =>
  (xs ?? [])
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);
const tc = (id: number) => `TC${id}`;

/** How to gate scripts that can't be pushed: the newest plan's id (by mtime), or how to get one. */
function gateHint(cfg: Config): string {
  let newest = '';
  let at = -1;
  for (const dir of stateDirs(cfg.root, cfg.qaProject).read) {
    const plans = path.join(dir, 'plans');
    try {
      for (const f of fs.readdirSync(plans)) {
        if (!f.endsWith('.json')) continue;
        const m = fs.statSync(path.join(plans, f)).mtimeMs;
        if (m > at) [newest, at] = [f.slice(0, -'.json'.length), m];
      }
    } catch {}
  }
  return newest
    ? `Run 'qam automate ${newest} --done' to gate them now.`
    : 'Run qam plan, then qam automate with its id and --done, to gate them now.';
}

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
  const destinations = chooseDestinations(cfg, v.to);
  const known = new Set(run.cases.map((c) => c.id));
  const leftOut = new Set(ids(v['leave-out']));
  const skipSmoke = new Set(ids(v['skip-smoke']));
  const takeStore = new Set(ids(v['take-store']));
  for (const id of [...leftOut, ...skipSmoke, ...takeStore]) {
    if (!known.has(id)) throw new BlockedError(`${id} isn't in ${run.name}. Its cases: ${[...known].join(', ')}.`);
  }
  // a script is linked only once it's committed and pushed to the QA repo's remote (Q39), with where it is (Q40)
  let app: string | null = null;
  try {
    app = appFolder(cfg);
  } catch {}
  const scripts = app && fs.existsSync(app) ? publishable(app, playwrightBdd.scripts(app)) : null;
  const ctx: PublishContext = {
    scope: run.scope,
    dsm,
    settings: cfg.project,
    scenarios: new Set(scripts?.linked.keys() ?? []),
    ...(scripts ? { scripts: scripts.linked } : {}),
  };
  const derived: Derived[] = run.cases.filter((c) => !leftOut.has(c.id)).map((c) => derive(c, ctx));

  // every destination is reached, and its access checked, before anything is shown or written (Q50)
  const reached: Reached[] = [];
  const failed: { dest: string; error: BlockedError }[] = [];
  for (const dest of destinations) {
    try {
      reached.push(await reach(cfg, dest, dir, !!(v.refresh || v.apply), !!v.to));
    } catch (e) {
      if (!(e instanceof BlockedError)) throw e;
      failed.push({ dest, error: e });
    }
  }
  if (failed.length) {
    if (destinations.length === 1) throw failed[0].error;
    throw new BlockedError(
      [
        `Can't publish to ${failed.map((f) => f.dest).join(' and ')}: access to ${failed.length} of ${destinations.length} destinations failed, so nothing was previewed or written.`,
        ...failed.map((f) => `${f.dest}: ${f.error.message}`),
        `Fix that, or leave it out with --to ${destinations.filter((d) => !failed.some((f) => f.dest === d)).join(',')}.`,
      ].join('\n'),
    );
  }
  const shared: Shared = {
    cfg,
    v,
    dir,
    run,
    derived,
    leftOut,
    skipSmoke,
    takeStore,
    scripts,
    multi: destinations.length > 1,
  };
  // every destination is read and its smoke checked before any is written: one yes applies to all, or to none (Q50)
  const prepared: Prepared[] = [];
  for (const r of reached) prepared.push(await prepare(shared, r));
  // a case named for --take-store that no destination holds a store edit of has nothing to take
  for (const id of takeStore) {
    if (!prepared.some((p) => p.taken.includes(id)))
      throw new BlockedError(
        `--take-store ${id}: the store hasn't been changed since ${id} was published, so there is nothing to take. It applies to a case in conflict, or one listed under 'Edited in the store only'.`,
      );
  }
  const stopped = prepared.flatMap((p) => (p.stop ? [p.stop] : []));
  const outcomes: Outcome[] = stopped.length ? stopped : [];
  try {
    for (const p of stopped.length ? [] : prepared) {
      try {
        outcomes.push(await p.finish());
      } catch (e) {
        if (!outcomes.length) throw e;
        throw new BlockedError(
          `${p.dest} stopped part way: ${(e as Error).message}\nWritten: ${destinations.slice(0, outcomes.length).join(', ')}. What was written is recorded, so once that's fixed, publish again with the same --to: only the rest is written.`,
        );
      }
    }
  } finally {
    // the store the project is set up for stays active, the others parked: --to never switches stores, even when a
    // destination stops part way (Q34, R23)
    const home = v.apply && !stopped.length ? homeStore(cfg, reached) : null;
    const after = home ? readLedger(dir) : null;
    if (home && after && after.store !== home) writeLedger(dir, switchLedger(after, home));
  }

  const code = outcomes.some((o) => o.code === 3) ? 3 : outcomes.some((o) => o.code === 1) ? 1 : outcomes[0].code;
  if (!shared.multi) {
    console.log(json ? JSON.stringify(outcomes[0].data) : outcomes[0].text);
    return code;
  }
  if (json) {
    console.log(
      JSON.stringify({
        result: code === 0 ? 'pass' : code === 3 ? 'awaiting approval' : 'fail',
        apply: !!v.apply,
        run: run.name,
        destinations: outcomes.map((o) => o.data),
      }),
    );
    return code;
  }
  const dests = destinations.join(',');
  console.log(
    [
      ...outcomes.map((o) => o.text),
      '',
      stopped.length
        ? `Nothing was written to any destination. Run the dry run again: publish ${run.name} --to ${dests}.`
        : !v.apply && code === 3
          ? `Reply yes once to apply to all ${destinations.length} destinations (${destinations.join(', ')}, in that order): publish ${run.name} --to ${dests} --apply.`
          : `Destinations: ${destinations.join(', ')}.`,
    ].join('\n\n'),
  );
  return code;
}

type Values = ReturnType<typeof parse>['values'];
type Shared = {
  cfg: Config;
  v: Values;
  dir: string;
  run: ReturnType<typeof loadRun>;
  derived: Derived[];
  leftOut: Set<string>;
  skipSmoke: Set<string>;
  takeStore: Set<string>;
  scripts: ReturnType<typeof publishable> | null;
  multi: boolean;
};
type Reached = {
  dest: string;
  cached: ReturnType<typeof withCache>;
  where: string;
  planToCreate: string | null;
  projectToCreate: NewProject | null;
};
type Outcome = { code: number; text: string; data: Record<string, unknown> };
/** One destination read and diffed: `stop` when apply must not go on (smoke changed), else `finish` writes it. */
type Prepared = { dest: string; stop: Outcome | null; taken: string[]; finish: () => Promise<Outcome> };

/** The stores to publish to: `--to`, local file first (Q50), else the one the project is set up for. */
function chooseDestinations(cfg: Config, to: string[] | undefined): string[] {
  const names = [...new Set(ids(to))];
  if (!names.length) return [cfg.store];
  const known = Object.keys(STORES).sort();
  for (const n of names) {
    if (!known.includes(n)) throw new BlockedError(`--to ${n} isn't a store. Use one or more of: ${known.join(', ')}.`);
  }
  return [...names.filter((n) => n === 'file'), ...names.filter((n) => n !== 'file')];
}

/** The where() of the store the project is set up for, or null when it can't be built (then the ledger stays as is). */
function homeStore(cfg: Config, reached: Reached[]): string | null {
  const r = reached.find((x) => x.dest === cfg.store);
  if (r) return r.where;
  try {
    return buildStore(cfg).where();
  } catch (e) {
    if (e instanceof BlockedError) return null;
    throw e;
  }
}

/**
 * One destination, reached (Q50): its store built and read through the cache (Q34), the ledger checked against it, and
 * the project and plan it would still have to create. Nothing is written.
 */
async function reach(cfg: Config, dest: string, dir: string, live: boolean, chosen: boolean): Promise<Reached> {
  const cached = withCache(buildStore({ ...cfg, store: dest }), dir, live);
  const store = cached.store;
  const where = store.where();
  adopt(readLedger(dir), where, chosen); // a ledger of another store blocks before anything is read from this one
  // inPlan first: it fails loudly when the store can't be reached, so an ID missing below really is gone. A store with
  // no plan at all gets one on --apply (Q33); one with other plans is the person's choice, which doctor lists. A missing
  // project is created on --apply too, and then its plan (Q35).
  let planToCreate: string | null = null;
  let projectToCreate: NewProject | null = null;
  try {
    await store.inPlan();
  } catch (e) {
    if (e instanceof NoProjectError && store.ensureProject) {
      try {
        projectToCreate = await store.ensureProject(true);
      } catch (probe) {
        // the missing project is the news; a failed check of whether it can be created only adds to it
        if (!(probe instanceof BlockedError)) throw probe;
        throw new NoProjectError(
          `${e.message}\nCouldn't check whether publish can create it: ${probe.message}`,
          e.projects,
          e.suggestions,
        );
      }
      if (!projectToCreate) throw e;
      planToCreate = projectToCreate.plan;
    } else if (e instanceof NoPlanError && e.plans.length === 0) planToCreate = e.createName;
    else throw e;
  }
  return { dest, cached, where, planToCreate, projectToCreate };
}

/** What one destination would write: read and checked now, written (with --apply) only by `finish`. */
async function prepare(o: Shared, r: Reached): Promise<Prepared> {
  const { cfg, v, dir, run, derived, leftOut, skipSmoke, takeStore, scripts } = o;
  const { cached, where, planToCreate, projectToCreate } = r;
  const store = cached.store;
  const before = readLedger(dir);
  const ledger = adopt(before, where, !!v.to);
  const fresh = !!before && before.store !== where && !Object.hasOwn(before.other ?? {}, where);
  const items = new Map<number, Item>();
  // a project still to be created holds nothing to read
  for (const e of projectToCreate ? [] : (ledger?.entries ?? [])) {
    try {
      items.set(e.trackerId, await store.show(e.trackerId));
    } catch (err) {
      if (!(err instanceof BlockedError)) throw err;
    }
  }
  // a case left out of this publish is not "no longer generated"
  const entries = (ledger?.entries ?? []).filter((e) => !leftOut.has(e.localId));
  const smokeInStore = projectToCreate
    ? 0
    : (await store.find({ kind: 'test_case', tag: 'smoke', limit: 1000 })).length;
  const suggestion = suggestSmoke(derived, entries, smokeInStore, cfg.project);
  const confirmed = new Set(suggestion.ids.filter((id) => !skipSmoke.has(id)));
  // the dry run records the smoke it offered; apply reads the store live, and a cap filled in between (another run
  // applied first) would otherwise write fewer smoke cases than the person approved, without a word
  const previewFile = path.join(path.dirname(cacheFile(dir)), `preview-${run.name}${o.multi ? `-${r.dest}` : ''}.json`);
  const offered = v.apply ? readPreview(previewFile) : null;
  const lost = (offered ?? []).filter((id) => !skipSmoke.has(id) && !confirmed.has(id));
  const result = diff({ derived, ledger: entries, items, module: run.scope.module, confirmedSmoke: confirmed, takeStore });
  const taken = result.changes.filter((c) => c.take).map((c) => c.localId);

  const by = (kind: PlannedChange['kind']) => result.changes.filter((c) => c.kind === kind);
  const [creates, updates, conflicts, retires, unchanged] = (
    ['create', 'update', 'conflict', 'retire', 'unchanged'] as const
  ).map(by);
  const notLinked = derived.filter((d) => d.notLinked).map((d) => d.id);
  const title = new Map(derived.map((d) => [d.id, d.title]));
  const fieldRows = (c: PlannedChange) =>
    (c.differences ?? []).map((d) => `    ${d.field}: store "${d.store}", run "${d.run}"`).join('\n');

  const lines: string[] = [
    `QAMaster publish ${run.name} → ${where} (${v.apply ? 'applying' : 'dry run'})`,
    `Reviewed by ${run.reviewedBy}${run.reviewedAt ? ` on ${run.reviewedAt.slice(0, 10)}` : ''}`,
    ...(run.ownerWarning ? [`Warning: ${run.ownerWarning}`] : []),
    ...(projectToCreate
      ? [
          `The ADO project '${projectToCreate.name}' doesn't exist (or this token can't see it); --apply will create it (process ${projectToCreate.process}, private).`,
        ]
      : []),
    ...(fresh ? [`Nothing recorded yet for ${where}: every case is created there.`] : []),
    ...(planToCreate ? [`The test plan '${planToCreate}' doesn't exist yet; --apply will create it.`] : []),
    ...(cached.age() ? [`Store as of ${cached.age()} (from the cache). Run with --refresh to read it again.`] : []),
  ];
  const section = (head: string, rows: string[]) => rows.length && lines.push('', head, ...rows.map((r) => `  ${r}`));
  section(
    `Create (${creates.length})`,
    creates.map((c) => `${c.localId}  ${title.get(c.localId)}  suite ${c.suite} · tags ${c.ownedTags.join(', ')}`),
  );
  section(
    `Update (${updates.length})`,
    updates.map(
      (c) =>
        `${tc(c.trackerId ?? 0)} ← ${c.localId}  ${c.fields.join(', ')} changed${c.differences?.length ? `\n${fieldRows(c)}` : ''}${(c.change?.removeTags ?? []).map((t) => `\n    removes tag ${t}`).join('')}`,
    ),
  );
  section(
    `Conflict (${conflicts.length}), not written`,
    conflicts.map(
      (c) =>
        `${c.trackerId ? `${tc(c.trackerId)} ← ` : ''}${c.localId}  ${c.reason}${c.differences?.length ? `\n${fieldRows(c)}` : ''}`,
    ),
  );
  // --take-store: the store's edit is accepted. The ledger takes its revision with --apply; the store isn't written (Q6)
  const takes = unchanged.filter((c) => c.take);
  section(
    `Take the store's version (${takes.length}), only with --apply`,
    takes.map(
      (c) =>
        `${tc(c.trackerId ?? 0)} ← ${c.localId}  ${c.reason}${c.differences?.length ? `\n${fieldRows(c)}` : ''}`,
    ),
  );
  // an edit made only in the store: nothing of ours to write, so it stays as it is, and the person is told (K7)
  const storeOnly = unchanged.filter((c) => c.differences?.length && !c.take);
  section(
    `Edited in the store only (${storeOnly.length}), kept as it is`,
    storeOnly.map(
      (c) =>
        `${tc(c.trackerId ?? 0)} ← ${c.localId}  differs from the run in ${c.differences?.map((d) => d.field).join(', ')}\n${fieldRows(c)}`,
    ),
  );
  section(
    `Retire (${retires.length}), only with --retire`,
    retires.map((c) => `${tc(c.trackerId ?? 0)} ← ${c.localId}  ${c.reason}`),
  );
  if (unchanged.length) lines.push('', `Unchanged (${unchanged.length})`);
  // the stories the cases cite, each a req: tag the gate selects by (0.8.0, D17)
  const stories = storyMap(derived);
  section(
    `Stories (${Object.keys(stories).length}), written as req: tags`,
    Object.entries(stories).map(([id, cases]) => `req:${id}  ${cases.join(', ')}`),
  );
  if (notLinked.length) lines.push('', `Not linked to code (no path: tag): ${notLinked.join(', ')}`);
  const unpushed = (scripts?.unpushed ?? []).filter((id) => title.has(id));
  if (unpushed.length)
    lines.push(
      '',
      `Scripts not pushed to the QA repo (${unpushed.length}): ${unpushed.join(', ')}`,
      `Their links reach the store once the QA project is committed and pushed to a remote (git add, git commit, git push in the QA project folder), then publish again. No push access? ${gateHint(cfg)}`,
    );
  const { priorities, categories, max } = cfg.project.smoke;
  if (suggestion.ids.length) {
    lines.push(
      '',
      `Smoke suggestions (${priorities.join(', ')}, ${categories.join(' or ')}; the plan has ${smokeInStore} smoke, ${confirmed.size} ticked here: ${smokeInStore + confirmed.size} of max ${max} for the whole plan)`,
      ...suggestion.ids.map((id) => `  [${skipSmoke.has(id) ? ' ' : 'x'}] ${id}  ${title.get(id)}`),
    );
  }
  // other runs previewed but not applied hold smoke suggestions of their own (E1)
  const others = otherPreviews(path.dirname(previewFile), previewFile);
  const heldElsewhere = others.reduce((n, o) => n + o.length, 0);
  if (!v.apply && heldElsewhere) {
    const exceeds = smokeInStore + confirmed.size + heldElsewhere > max;
    lines.push(
      '',
      `${heldElsewhere} more smoke case${heldElsewhere > 1 ? 's are' : ' is'} suggested by ${others.length} other previewed run${others.length > 1 ? 's' : ''} not applied yet${exceeds ? `: with them the plan could pass its max of ${max}` : ''}.`,
    );
  }
  if (suggestion.notOffered) {
    lines.push(
      '',
      `${suggestion.notOffered} more case${suggestion.notOffered > 1 ? 's match' : ' matches'} the smoke rule but weren't offered: the plan's smoke set is full (${suggestion.total} of max ${max}). Raise smoke.max in config/qamaster.json to offer them.`,
    );
  }
  if (lost.length) {
    lines.push(
      '',
      `Smoke changed since the dry run: the plan has ${smokeInStore} smoke now, so ${(offered ?? []).length - lost.length} of the ${(offered ?? []).length} suggested fit (max ${max}). Nothing was written. Run the dry run again and review the new smoke list.`,
    );
    const stop = {
      code: 3,
      text: lines.join('\n'),
      data: { result: 'awaiting approval', apply: true, run: run.name, store: where, smokeChanged: lost },
    };
    return { dest: r.dest, stop, taken, finish: async () => stop };
  }
  return {
    dest: r.dest,
    stop: null,
    taken,
    finish: () => finish(o, r, { items, lines, result, suggestion, confirmed, smokeInStore, previewFile }),
  };
}

type Read = {
  items: Map<number, Item>;
  lines: string[];
  result: ReturnType<typeof diff>;
  suggestion: ReturnType<typeof suggestSmoke>;
  confirmed: Set<string>;
  smokeInStore: number;
  previewFile: string;
};

/** One prepared destination finished: its preview recorded, or with --apply, written. */
async function finish(o: Shared, r: Reached, read: Read): Promise<Outcome> {
  const { cfg, v, dir, run, derived, skipSmoke } = o;
  const { cached, where, projectToCreate } = r;
  const { items, lines, result, suggestion, confirmed, smokeInStore, previewFile } = read;
  const store = cached.store;
  // read afresh: an earlier destination may have written the ledger since this one was prepared
  let ledger: Ledger | null = adopt(readLedger(dir), where, !!v.to);
  const by = (kind: PlannedChange['kind']) => result.changes.filter((c) => c.kind === kind);
  const [creates, updates, conflicts, retires, unchanged] = (
    ['create', 'update', 'conflict', 'retire', 'unchanged'] as const
  ).map(by);
  const takes = unchanged.filter((c) => c.take);
  const pending = creates.length + updates.length + takes.length + (v.retire ? retires.length : 0);
  const notLinked = derived.filter((d) => d.notLinked).map((d) => d.id);
  const { max } = cfg.project.smoke;
  if (!v.apply) writePreview(previewFile, suggestion.ids);
  lines.push('');
  if (!pending && !conflicts.length) lines.push('Nothing to publish.');
  else if (!v.apply && pending) {
    lines.push(
      'Reply yes to apply. To untick a smoke suggestion use --skip-smoke ID; to leave a case out use --leave-out ID.',
    );
  }

  const applied = { created: 0, updated: 0, retired: 0 };
  let smokeWritten = 0;
  let heldBack = conflicts.length;
  if (v.apply) {
    const now = new Date().toISOString();
    const save = (done: Applied[], declined: string[] = []) => {
      ledger = record(ledger, where, done, declined, now);
      writeLedger(dir, ledger);
    };
    if (result.declinedSmoke.length) save([], result.declinedSmoke);
    if (creates.length || updates.length) {
      const made = projectToCreate && store.ensureProject ? await store.ensureProject() : null;
      if (made) lines.push(`Created ADO project ${made.name}.`);
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
        if (confirmed.has(c.localId)) smokeWritten++;
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
    // a smoke suggestion unticked now isn't offered again (E2); the ledger entry exists once the case is written
    if (skipSmoke.size) save([], [...skipSmoke]);
    // recorded even when cases were held back, so the pipeline can say so (E7)
    const published = { publishedAt: now, store: where, ...applied, unchanged: unchanged.length, heldBack };
    fs.writeFileSync(path.join(run.dir, 'published.json'), `${JSON.stringify(published, null, 1)}\n`);
    // the store was reached: the pipeline's store stage reads this entry (A16), as doctor writes it
    const doctorFile = path.join(dir, '.qamaster', 'doctor.json');
    let prev = {};
    try {
      prev = JSON.parse(fs.readFileSync(doctorFile, 'utf8'));
    } catch {}
    fs.mkdirSync(path.dirname(doctorFile), { recursive: true });
    fs.writeFileSync(
      doctorFile,
      `${JSON.stringify(
        {
          ...prev,
          store: {
            ok: true,
            at: now,
            detail: `${where}: reached by publish --apply (created ${applied.created}, updated ${applied.updated})`,
          },
        },
        null,
        2,
      )}\n`,
    );
    lines.push(
      `Created ${applied.created}, updated ${applied.updated}, retired ${applied.retired}, unchanged ${unchanged.length}; ${heldBack} held back by a conflict; smoke in the plan: ${smokeInStore + smokeWritten} of max ${max}.`,
    );
    fs.rmSync(previewFile, { force: true });
  }

  const code = v.apply ? (heldBack ? 1 : 0) : pending ? 3 : conflicts.length ? 1 : 0;
  return {
    code,
    text: lines.join('\n'),
    data: {
      result: code === 0 ? 'pass' : code === 3 ? 'awaiting approval' : 'fail',
      apply: !!v.apply,
      run: run.name,
      store: where,
      storeAsOf: cached.age(),
      reviewedBy: run.reviewedBy,
      ...(run.ownerWarning ? { warning: run.ownerWarning } : {}),
      ...(projectToCreate
        ? { createProject: { name: projectToCreate.name, process: projectToCreate.process, visibility: 'private' } }
        : {}),
      changes: result.changes.map(({ change: _write, ...c }) => c),
      notLinked,
      requirements: storyMap(derived),
      smoke: {
        suggested: suggestion.ids,
        skipped: [...skipSmoke],
        max,
        inPlan: smokeInStore,
        notOffered: suggestion.notOffered,
        ...(v.apply ? { written: smokeWritten } : {}),
      },
      ...(v.apply ? { applied, heldBack } : {}),
    },
  };
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      apply: { type: 'boolean' },
      refresh: { type: 'boolean' },
      retire: { type: 'boolean' },
      'leave-out': { type: 'string', multiple: true },
      'skip-smoke': { type: 'string', multiple: true },
      'take-store': { type: 'string', multiple: true },
      to: { type: 'string', multiple: true },
    },
    allowPositionals: true,
  });
}

/** Each story the cases cite (req:<id>) with the cases that cite it, in ID order. */
function storyMap(derived: Derived[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of derived) for (const r of d.requirements) (out[r] ??= []).push(d.id);
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function readPreview(file: string): string[] | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { smoke?: unknown };
    return Array.isArray(data.smoke) ? data.smoke.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null; // no dry run recorded (or an unreadable one): apply decides from the live store alone
  }
}

/** The smoke each other run's dry run offered and nobody applied yet: an applied run removes its preview. */
function otherPreviews(dir: string, own: string): string[][] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^preview-.*\.json$/.test(f) && path.join(dir, f) !== own)
      .map((f) => readPreview(path.join(dir, f)) ?? [])
      .filter((ids) => ids.length);
  } catch {
    return [];
  }
}

function writePreview(file: string, smoke: string[]): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ smoke })}\n`);
  } catch {
    // like the cache: a record that can't be written costs the check, never the preview
  }
}
