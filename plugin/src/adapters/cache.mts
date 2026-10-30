/**
 * The store cache (Q34): a local copy of what a test case store last said, in .qamaster/cache/store.json (git-ignored).
 * It is never the master. Reads may come from it and say how old they are; writes always go to the live store, and an
 * update checks the revision against the live store, so a stale cache can make a preview miss a conflict but can never
 * make `--apply` overwrite one. Deleting the file is always safe, and a file that can't be read or written is ignored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { QAMASTER_DIR } from '../integrations/integrations.mts';
import type { Filter, Item, ItemChange, TestCase } from '../shared/models.mts';
import type { TestCaseStore, WriteCheck } from './base.mts';

export const cacheFile = (project: string) => path.join(project, QAMASTER_DIR, 'cache', 'store.json');

type Stamped<T> = { at: string; value: T };
type Snapshot = { where: string; plan?: Stamped<[number, TestCase][]>; items: Record<string, Stamped<Item>> };

export class CachedStore implements TestCaseStore {
  checkWrite?: () => Promise<WriteCheck>;
  private inner: TestCaseStore;
  private file: string;
  private refresh: boolean;
  private now: () => Date;
  private oldest: string | null = null;

  /** `refresh` reads the live store and overwrites what was cached; `now` is for tests. */
  constructor(inner: TestCaseStore, file: string, o: { refresh?: boolean; now?: () => Date } = {}) {
    this.inner = inner;
    this.file = file;
    this.refresh = !!o.refresh;
    this.now = o.now ?? (() => new Date());
    if (inner.checkWrite) this.checkWrite = () => (inner.checkWrite as () => Promise<WriteCheck>)();
  }

  /** When the oldest cached answer this store gave was read from the live store, or null if every read was live. */
  age(): string | null {
    return this.oldest;
  }

  where(): string {
    return this.inner.where();
  }
  url(id: number): string {
    return this.inner.url(id);
  }
  ensurePlan() {
    return this.inner.ensurePlan();
  }
  ensureSuite(name: string) {
    return this.inner.ensureSuite(name);
  }
  find(filter: Filter): Promise<Item[]> {
    return this.inner.find(filter); // searches aren't cached: a cached answer would miss new cases
  }

  async inPlan(): Promise<Map<number, TestCase>> {
    const snap = this.load();
    if (!this.refresh && snap.plan) {
      this.note(snap.plan.at);
      return new Map(snap.plan.value);
    }
    const live = await this.inner.inPlan();
    snap.plan = { at: this.stamp(), value: [...live] };
    this.save(snap);
    return live;
  }

  async show(id: number): Promise<Item> {
    const snap = this.load();
    const hit = snap.items[id];
    if (!this.refresh && hit) {
      this.note(hit.at);
      return structuredClone(hit.value);
    }
    const live = await this.inner.show(id);
    snap.items[id] = { at: this.stamp(), value: live };
    this.save(snap);
    return live;
  }

  async create(change: ItemChange): Promise<Item> {
    return this.wrote(await this.inner.create(change));
  }

  async update(read: Item, change: ItemChange): Promise<Item> {
    return this.wrote(await this.inner.update(read, change));
  }

  async retire(read: Item): Promise<string[]> {
    const done = await this.inner.retire(read);
    this.forget(read.id);
    return done;
  }

  async addToSuite(caseId: number, suite: string): Promise<void> {
    await this.inner.addToSuite(caseId, suite);
    this.forget(caseId);
  }

  private stamp = () => this.now().toISOString();
  private note(at: string) {
    if (!this.oldest || at < this.oldest) this.oldest = at;
  }

  /** A write changes what the plan holds, so the cached plan goes; the item the store returned is the newest copy. */
  private wrote(item: Item): Item {
    const snap = this.load();
    snap.items[item.id] = { at: this.stamp(), value: item };
    snap.plan = undefined;
    this.save(snap);
    return item;
  }

  private forget(id: number) {
    const snap = this.load();
    delete snap.items[id];
    snap.plan = undefined;
    this.save(snap);
  }

  private load(): Snapshot {
    const fresh: Snapshot = { where: this.inner.where(), items: {} };
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Snapshot;
      const ok = data && data.where === fresh.where && typeof data.items === 'object' && data.items !== null;
      return ok ? data : fresh;
    } catch {
      return fresh;
    }
  }

  private save(snap: Snapshot) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snap));
      fs.renameSync(tmp, this.file);
    } catch {
      // a cache that can't be written costs speed, never correctness
    }
  }
}

/** A store that is already a local file needs no cache (Q34); any other gets one. */
export function withCache(
  store: TestCaseStore,
  project: string,
  refresh: boolean,
): { store: TestCaseStore; age: () => string | null } {
  if ((store as { local?: boolean }).local) return { store, age: () => null };
  const cached = new CachedStore(store, cacheFile(project), { refresh });
  return { store: cached, age: () => cached.age() };
}
