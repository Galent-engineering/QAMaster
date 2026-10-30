/**
 * The `file` test case store (Q34): test cases in a CSV in the QA project, kept in git. It is the master copy when
 * QAMASTER_STORE=file. One row per step, in the layout of ADO Test Plans' own import, plus Rev and Signature columns
 * so "update refuses if it changed since it was read" works even when a person edits the file by hand.
 *
 * A row with an ID starts a test case; the rows below it with no ID and no title are its further steps. A row with
 * only a Suite declares that suite, so an empty suite survives. Every operation reads the file afresh and writes it
 * whole, through a temporary file, so a failed write leaves the file as it was.
 *
 * A path ending in .json holds the same cases as a JSON array of records instead, one per case with its steps inside
 * (Q36; schema.mts, asFileStoreRecords). Everything else, from IDs to revisions and hand edits, works as for the CSV.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../shared/config.mts';
import { BlockedError } from '../shared/errors.mts';
import { type Filter, type Item, type ItemChange, type ItemStep, retag, type TestCase } from '../shared/models.mts';
import { asFileStoreRecords, type FileCaseRecord, type FileStoreRecord } from '../shared/schema.mts';
import type { TestCaseStore, WriteCheck } from './base.mts';

export const FILE_STORE_PATH = path.join('testcases', 'testcases.csv');
/** Used instead when it is there and the CSV is not. */
const JSON_STORE_PATH = path.join('testcases', 'testcases.json');
/** Above ADO's usual IDs for a young project, so the two don't look alike in reports. */
const FIRST_ID = 1000;

const COLUMNS = [
  'ID',
  'Title',
  'Description',
  'State',
  'Suite',
  'Requirement',
  'Automated Test',
  'Tags',
  'Rev',
  'Signature',
  'Fields',
  'Step Action',
  'Step Expected',
] as const;
type Column = (typeof COLUMNS)[number];

type Case = {
  id: number;
  title: string;
  description: string;
  state: string;
  suites: string[];
  requirements: number[];
  automatedTest: string | null;
  tags: string[];
  rev: number; // as written in the file
  edited: boolean; // the content no longer matches its Signature: someone edited it by hand
  fields: Record<string, string>;
  steps: ItemStep[];
};
type Data = { cases: Map<number, Case>; suites: string[] };
/** What a file says before suites are merged and signatures checked: the suites it declares and each case's Signature. */
type Read = { cases: Map<number, Case>; declared: string[]; signatures: Map<number, string> };

const list = (s: string) =>
  s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function signature(c: Case): string {
  const content = [
    c.title,
    c.description,
    c.state,
    c.suites,
    c.requirements,
    c.automatedTest,
    c.tags,
    c.fields,
    c.steps,
  ];
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex').slice(0, 12);
}

/** The revision callers see: a hand edit counts as one change on top of the written Rev, until the next write. */
const revOf = (c: Case) => c.rev + (c.edited ? 1 : 0);

/** CSV records, each with the line it starts on. Quotes may hold commas, line breaks and doubled quotes. */
function parseCsv(text: string, shown: string): { cells: string[]; line: number }[] {
  const s = text.startsWith('﻿') ? text.slice(1) : text;
  const out: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  let quoteLine = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') {
        if (c === '\n') line++;
        cell += c;
      } else if (s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && cell === '') {
      quoted = true;
      quoteLine = line;
    } else if (c === ',') {
      cells.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      out.push({ cells: [...cells, cell], line: start });
      cells = [];
      cell = '';
      start = ++line;
    } else cell += c;
  }
  if (quoted) {
    throw new BlockedError(
      `${shown} has a quote that is never closed (it opens on row ${quoteLine}). Close it; a quote inside quoted text is written twice ("").`,
    );
  }
  if (cell !== '' || cells.length) out.push({ cells: [...cells, cell], line: start });
  return out;
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replaceAll('"', '""')}"` : v);

export class FileStore implements TestCaseStore {
  /** The file is already local, so a cache would only add a second copy (Q34). */
  readonly local = true;
  file: string;
  plan: string;
  shown: string;
  /** Chosen by the file's extension: .json, or the CSV for any other. */
  private json: boolean;

  /** `shown` is the file's path as a person and a ledger should see it: relative, with forward slashes. */
  constructor(file: string, plan: string, shown: string = file) {
    this.file = file;
    this.plan = plan;
    this.shown = shown;
    this.json = path.extname(file).toLowerCase() === '.json';
  }

  where(): string {
    return `File ${this.shown}, plan ${this.plan}`;
  }

  url(id: number): string {
    return `${pathToFileURL(this.file).href}#${id}`;
  }

  async inPlan(): Promise<Map<number, TestCase>> {
    const cases = [...this.load().cases.values()].filter((c) => c.suites.length > 0 && c.state !== 'Closed');
    return new Map(
      cases.map((c) => [
        c.id,
        { id: c.id, title: c.title, url: this.url(c.id), tags: [...c.tags], automatedTest: c.automatedTest },
      ]),
    );
  }

  async find(filter: Filter): Promise<Item[]> {
    if (filter.kind !== 'test_case') return [];
    return [...this.load().cases.values()]
      .filter(
        (c) =>
          (!filter.state || c.state === filter.state) &&
          (!filter.tag || c.tags.some((t) => same(t, filter.tag ?? ''))) &&
          (!filter.text || c.title.toLowerCase().includes(filter.text.toLowerCase())),
      )
      .slice(0, filter.limit ?? 50)
      .map((c) => this.toItem(c));
  }

  async show(id: number): Promise<Item> {
    return this.toItem(this.get(this.load(), id));
  }

  async create(change: ItemChange): Promise<Item> {
    if (!change.title) throw new BlockedError('A test case needs a title.');
    const data = this.load();
    const id = Math.max(FIRST_ID - 1, ...data.cases.keys()) + 1;
    const made: Case = {
      id,
      title: '',
      description: '',
      state: 'Design',
      suites: [],
      requirements: [],
      automatedTest: null,
      tags: [],
      rev: 1,
      edited: false,
      fields: {},
      steps: [],
    };
    this.apply(data, made, change);
    data.cases.set(id, made);
    this.save(data);
    return this.show(id);
  }

  async update(read: Item, change: ItemChange): Promise<Item> {
    const data = this.load();
    const c = this.get(data, read.id);
    if (revOf(c) !== read.rev) {
      throw new BlockedError(
        `Work item ${read.id} changed since it was read (rev ${read.rev} → ${revOf(c)}). Read it again and check the change.`,
      );
    }
    this.apply(data, c, change);
    c.rev = revOf(c) + 1;
    c.edited = false;
    this.save(data);
    return this.show(read.id);
  }

  async retire(read: Item): Promise<string[]> {
    const data = this.load();
    const c = this.get(data, read.id);
    const was = c.suites;
    c.state = 'Closed';
    c.suites = [];
    c.rev = revOf(c) + 1;
    c.edited = false;
    this.save(data);
    return [
      `Set ${c.id} to Closed`,
      ...(was.length ? [`Removed ${c.id} from ${was.map((s) => `'${s}'`).join(', ')}`] : []),
    ];
  }

  async addToSuite(caseId: number, suite: string): Promise<void> {
    const data = this.load();
    this.join(data, this.get(data, caseId), suite);
    this.save(data);
  }

  async ensurePlan(): Promise<{ id: number; name: string; created: boolean }> {
    return { id: 1, name: this.plan, created: false };
  }

  async ensureSuite(name: string): Promise<{ id: number; name: string; created: boolean }> {
    const data = this.load();
    const at = data.suites.findIndex((s) => same(s, name));
    if (at >= 0) return { id: at + 1, name: data.suites[at], created: false };
    data.suites.push(name);
    this.save(data);
    return { id: data.suites.length, name, created: true };
  }

  /** Whether the folder and the file can be written, asked of the file system with no write. */
  async checkWrite(): Promise<WriteCheck> {
    let dir = path.dirname(this.file);
    while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir);
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      if (fs.existsSync(this.file)) fs.accessSync(this.file, fs.constants.W_OK);
    } catch (e) {
      const detail = `${this.shown} can't be written: ${(e as Error).message}. Fix the folder's permissions, then run qam doctor again.`;
      return { state: 'blocked', detail, area: null, missing: [], testCaseType: 'present' };
    }
    return {
      state: 'allowed',
      detail: `${this.shown} can be written.`,
      area: null,
      missing: [],
      testCaseType: 'present',
    };
  }

  private get(data: Data, id: number): Case {
    const c = data.cases.get(id);
    if (!c) throw new BlockedError(`No work item ${id}.`);
    return c;
  }

  private apply(data: Data, c: Case, change: ItemChange): void {
    if (change.title !== undefined) c.title = change.title;
    if (change.description !== undefined) c.description = change.description;
    if (change.state !== undefined) c.state = change.state;
    if (change.steps !== undefined) c.steps = change.steps.filter((s) => s.action || s.expected).map((s) => ({ ...s }));
    if (change.automatedTest !== undefined) c.automatedTest = change.automatedTest || null;
    for (const r of change.requirements ?? []) if (!c.requirements.includes(r)) c.requirements.push(r);
    Object.assign(c.fields, change.fields);
    c.tags = retag(c.tags, change.addTags, change.removeTags);
    if (change.suite) this.join(data, c, change.suite);
  }

  private join(data: Data, c: Case, suite: string): void {
    const known = data.suites.find((s) => same(s, suite));
    if (!known) throw new BlockedError(`No static suite '${suite}' in test plan '${this.plan}'.`);
    if (!c.suites.some((s) => same(s, known))) c.suites.push(known);
  }

  private toItem(c: Case): Item {
    return {
      kind: 'test_case',
      id: c.id,
      rev: revOf(c),
      type: 'Test Case',
      title: c.title,
      state: c.state,
      url: this.url(c.id),
      tags: [...c.tags],
      description: c.description,
      parent: null,
      children: [],
      steps: c.steps.map((s) => ({ ...s })),
      automatedTest: c.automatedTest,
      tests: [...c.requirements],
      testedBy: [],
      suites: c.suites.map((s) => `${this.plan} / ${s}`),
      fields: { ...c.fields },
    };
  }

  private load(): Data {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new BlockedError(`Can't read ${this.shown}: ${(e as Error).message}.`);
      }
    }
    const { cases, declared, signatures } = this.json ? this.readJson(text) : this.readCsv(text);
    const data: Data = { cases, suites: [] };
    for (const s of [...declared, ...[...data.cases.values()].flatMap((c) => c.suites)]) {
      if (!data.suites.some((k) => same(k, s))) data.suites.push(s);
    }
    for (const c of data.cases.values()) {
      c.suites = c.suites.map((s) => data.suites.find((k) => same(k, s)) ?? s);
      const sig = signatures.get(c.id);
      c.edited = !!sig && sig !== signature(c);
    }
    return data;
  }

  private readJson(text: string): Read {
    const read: Read = { cases: new Map(), declared: [], signatures: new Map() };
    if (!text.trim()) return read;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new BlockedError(`${this.shown} isn't valid JSON: ${(e as Error).message}. Fix it or restore it from git.`);
    }
    for (const r of asFileStoreRecords(data, this.shown)) {
      if (!('id' in r)) {
        read.declared.push(r.suite);
        continue;
      }
      const { signature: sig, ...c } = r;
      read.cases.set(r.id, { ...c, edited: false });
      read.signatures.set(r.id, sig);
    }
    return read;
  }

  private readCsv(text: string): Read {
    const records = parseCsv(text, this.shown);
    const data = { cases: new Map<number, Case>() };
    if (!records.length) return { ...data, declared: [], signatures: new Map() };

    const head = records[0].cells.map((h) => h.trim());
    const missing = COLUMNS.filter((c) => !head.includes(c));
    if (missing.length) {
      throw new BlockedError(
        `${this.shown} is missing the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}. The header row is: ${COLUMNS.join(',')}.`,
      );
    }
    const odd = head.find((h, i) => !(COLUMNS as readonly string[]).includes(h) || head.indexOf(h) !== i);
    if (odd !== undefined) {
      throw new BlockedError(
        `${this.shown} has a column '${odd}' that QAMaster doesn't use, or has twice, and would lose on its next write. Remove it.`,
      );
    }
    const at = Object.fromEntries(COLUMNS.map((c) => [c, head.indexOf(c)])) as Record<Column, number>;

    const declared: string[] = [];
    const signatures = new Map<number, string>();
    let last: Case | undefined;
    for (const { cells, line } of records.slice(1)) {
      if (cells.every((x) => x === '')) continue;
      if (cells.length > head.length) {
        throw new BlockedError(
          `Row ${line} has ${cells.length} cells but the header has ${head.length}. Text with a comma in it goes in quotes.`,
        );
      }
      const cell = (c: Column) => cells[at[c]] ?? '';
      const id = cell('ID').trim();
      const title = cell('Title');
      const step = { action: cell('Step Action'), expected: cell('Step Expected') };
      if (!id) {
        if (!title && cell('Suite') && !step.action && !step.expected) declared.push(...list(cell('Suite')));
        else if (!title && (step.action || step.expected)) {
          if (!last) throw new BlockedError(`Row ${line} has a step but no test case above it.`);
          last.steps.push(step);
        } else {
          throw new BlockedError(
            `Row ${line} has no ID. Leave new test cases to qam publish, or give the row the next free number.`,
          );
        }
        continue;
      }
      if (!/^\d+$/.test(id)) throw new BlockedError(`Row ${line}: the ID '${id}' isn't a whole number.`);
      const n = Number(id);
      if (data.cases.has(n)) throw new BlockedError(`Row ${line}: test case ${n} is in the file twice.`);
      if (!title) throw new BlockedError(`Row ${line}: test case ${n} has no Title.`);
      const requirements = list(cell('Requirement')).map((r) => {
        if (!/^\d+$/.test(r)) throw new BlockedError(`Row ${line}: Requirement '${r}' isn't a work item number.`);
        return Number(r);
      });
      const rev = cell('Rev').trim();
      if (rev && !/^[1-9]\d*$/.test(rev)) throw new BlockedError(`Row ${line}: Rev '${rev}' isn't a whole number.`);
      last = {
        id: n,
        title,
        description: cell('Description'),
        state: cell('State') || 'Design',
        suites: list(cell('Suite')),
        requirements,
        automatedTest: cell('Automated Test') || null,
        tags: list(cell('Tags')),
        rev: rev ? Number(rev) : 1,
        edited: false,
        fields: this.fields(cell('Fields'), line),
        steps: step.action || step.expected ? [step] : [],
      };
      signatures.set(n, cell('Signature'));
      data.cases.set(n, last);
    }
    return { cases: data.cases, declared, signatures };
  }

  private fields(cell: string, line: number): Record<string, string> {
    if (!cell) return {};
    let v: unknown;
    try {
      v = JSON.parse(cell);
    } catch {
      v = null;
    }
    const ok =
      typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');
    if (!ok) throw new BlockedError(`Row ${line}: Fields isn't JSON like {"Priority":"2"}.`);
    return v as Record<string, string>;
  }

  private save(data: Data): void {
    const text = this.json ? this.jsonText(data) : this.csvText(data);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, this.file);
  }

  private jsonText(data: Data): string {
    const records: FileStoreRecord[] = data.suites.map((suite) => ({ suite }));
    for (const c of [...data.cases.values()].sort((a, b) => a.id - b.id)) {
      const record: FileCaseRecord = {
        id: c.id,
        title: c.title,
        description: c.description,
        state: c.state,
        suites: c.suites,
        requirements: c.requirements,
        automatedTest: c.automatedTest,
        tags: c.tags,
        rev: revOf(c),
        signature: signature(c),
        fields: c.fields,
        steps: c.steps,
      };
      records.push(record);
    }
    return `${JSON.stringify(records, null, 2)}\n`;
  }

  private csvText(data: Data): string {
    const rows: string[][] = [[...COLUMNS]];
    for (const s of data.suites) rows.push(COLUMNS.map((c) => (c === 'Suite' ? s : '')));
    for (const c of [...data.cases.values()].sort((a, b) => a.id - b.id)) {
      const [first, ...more] = c.steps;
      const values: Record<Column, string> = {
        ID: String(c.id),
        Title: c.title,
        Description: c.description,
        State: c.state,
        Suite: c.suites.join('; '),
        Requirement: c.requirements.join('; '),
        'Automated Test': c.automatedTest ?? '',
        Tags: c.tags.join('; '),
        Rev: String(revOf(c)),
        Signature: signature(c),
        Fields: Object.keys(c.fields).length ? JSON.stringify(c.fields) : '',
        'Step Action': first?.action ?? '',
        'Step Expected': first?.expected ?? '',
      };
      rows.push(COLUMNS.map((col) => values[col]));
      for (const s of more) {
        rows.push(COLUMNS.map((col) => (col === 'Step Action' ? s.action : col === 'Step Expected' ? s.expected : '')));
      }
    }
    return `${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
  }
}

export function makeFileStore(config: Config): TestCaseStore {
  const base = config.qaProject ?? config.root;
  const plan = config.project.app?.name ?? path.basename(config.root);
  const csv = path.join(base, FILE_STORE_PATH);
  const json = path.join(base, JSON_STORE_PATH);
  const rel = !fs.existsSync(csv) && fs.existsSync(json) ? JSON_STORE_PATH : FILE_STORE_PATH;
  return new FileStore(path.join(base, rel), plan, rel.split(path.sep).join('/'));
}
