/**
 * The ledger (Q7, Q34): .qamaster/ledger.json in the QA project maps each draft ID to its test case in the store, with
 * a content hash, the tags QAMaster owns and whether QA declined smoke. It belongs to one store. Losing it would make
 * the next publish create every test case again, so a file that can't be read blocks, and is never rebuilt quietly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import { BlockedError } from '../shared/errors.mts';
import type { Item, Ledger, LedgerEntry } from '../shared/models.mts';
import { asLedger } from '../shared/schema.mts';
import type { PlannedChange } from './publish.mts';

export const LEDGER_FILE = path.join(QAMASTER_DIR, 'ledger.json');
const SHOWN = `${QAMASTER_DIR}/ledger.json`;

export function readLedger(project: string): Ledger | null {
  let text: string;
  try {
    text = fs.readFileSync(path.join(project, LEDGER_FILE), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new BlockedError(`Can't read ${SHOWN}: ${(e as Error).message}.`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new BlockedError(
      `${SHOWN} isn't valid JSON (${(e as Error).message}): restore it from git. Deleting it would make the next publish create every test case again.`,
    );
  }
  return asLedger(data, SHOWN);
}

/** Written whole, sorted by ID so git diffs stay small, through a temporary file so a failed write keeps the old one. */
export function writeLedger(project: string, ledger: Ledger): void {
  const file = path.join(project, LEDGER_FILE);
  const sorted = { store: ledger.store, entries: [...ledger.entries].sort((a, b) => (a.localId < b.localId ? -1 : 1)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sorted, null, 1)}\n`);
  fs.renameSync(tmp, file);
}

/** IDs from one store mean nothing in another, so a ledger is only used with the store it was written for. */
export function checkStore(ledger: Ledger | null, store: string): void {
  if (!ledger || ledger.store === store) return;
  throw new BlockedError(
    `${SHOWN} belongs to ${ledger.store}, but the store is now ${store}. IDs from one store mean nothing in another. Switch back (QAMASTER_STORE), or move the ledger aside to start a new one: the next publish then creates every test case as new.`,
  );
}

/** One change after `--apply` ran it: the store's item for a create or update, and `done` for a retire. */
export type Applied = { change: PlannedChange; item?: Item; done?: boolean };

/**
 * The ledger as it stands after an apply. Entries the apply didn't touch (other modules) stay as they were. A
 * conflict changes nothing. `unchanged` keeps the revision, so a store edit nobody has dealt with stays a conflict
 * for the next change we want to write.
 */
export function record(
  prev: Ledger | null,
  store: string,
  applied: Applied[],
  declinedSmoke: string[],
  now: string,
): Ledger {
  checkStore(prev, store);
  const entries = new Map<string, LedgerEntry>((prev?.entries ?? []).map((e) => [e.localId, { ...e }]));
  for (const { change: c, item, done } of applied) {
    const old = entries.get(c.localId);
    if (c.kind === 'create' && item) {
      entries.set(c.localId, {
        localId: c.localId,
        trackerId: item.id,
        hash: c.hash,
        ownedTags: [...c.ownedTags],
        smokeDeclined: false,
        publishedAt: now,
        trackerRev: item.rev,
      });
    } else if (c.kind === 'update' && item && old) {
      entries.set(c.localId, {
        ...old,
        hash: c.hash,
        ownedTags: [...c.ownedTags],
        publishedAt: now,
        trackerRev: item.rev,
      });
    } else if (c.kind === 'unchanged' && old) {
      entries.set(c.localId, { ...old, hash: c.hash, ownedTags: [...c.ownedTags] });
    } else if (c.kind === 'retire' && done) {
      entries.delete(c.localId);
    }
  }
  for (const id of declinedSmoke) {
    const e = entries.get(id);
    if (e) {
      entries.set(id, { ...e, smokeDeclined: true, ownedTags: e.ownedTags.filter((t) => t.toLowerCase() !== 'smoke') });
    }
  }
  return { store, entries: [...entries.values()].sort((a, b) => (a.localId < b.localId ? -1 : 1)) };
}
