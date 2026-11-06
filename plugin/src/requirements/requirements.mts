/**
 * Requirements saved in the QA project, one folder per scope, for TestGen's `req:<id>` evidence (ported from
 * Autonomous-QE's tools/requirements/requirements.mts; it fetched through MCP, QAMaster reads Boards over REST, Q5).
 *
 *     requirements/<scope>/requirements.json   { scope, source, period, saved_at, count, notice?, requirements: [...] }
 *     requirements/<scope>/requirements.md     the same, for a person to read
 *
 * The folder name is the scope a TestGen manifest names in `requirements_scope`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BlockedError } from '../shared/errors.mts';
import type { Requirement } from '../shared/models.mts';
import { readCsv, readXlsx } from './xlsx.mts';

/** A scope as a folder name: lower case, letters, digits and dashes. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scope';

const COLUMNS: [string, string[]][] = [
  [
    'id',
    [
      'id',
      'key',
      'issue key',
      'story id',
      'user story id',
      'work item id',
      'requirement id',
      'req id',
      'us id',
      'ticket',
    ],
  ],
  ['title', ['title', 'summary', 'user story', 'story', 'name', 'requirement', 'feature']],
  ['description', ['description', 'details', 'story description', 'narrative']],
  ['ac', ['acceptance criteria', 'acceptance criterion', 'ac', 'criteria', 'acceptance']],
  ['priority', ['priority']],
  ['status', ['status', 'state']],
  ['type', ['type', 'issue type', 'work item type']],
  ['module', ['module', 'component', 'components', 'area', 'area path', 'epic', 'feature area']],
  ['sprint', ['sprint', 'iteration', 'iteration path', 'release']],
  ['labels', ['labels', 'tags']],
];
const TITLES = ['title', 'summary', 'user story', 'story'];
const splitList = (t: string) =>
  t
    .replace(/\r/g, '')
    .split(/\n|;\s|•/)
    .map((x) => x.replace(/^\s*(\d+[.)]|[-*]|AC\s*\d*[:.)-])\s*/i, '').trim())
    .filter(Boolean);

type Draft = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  ac?: string[];
  priority?: unknown;
  status?: unknown;
  type?: unknown;
  module?: unknown;
  sprint?: unknown;
  labels?: string[];
};

/** User stories from a workbook (.xlsx), a CSV, a JSON list, or a Markdown or text document; no ID gets US-001, … */
export function storiesFromFile(file: string, sheet?: string): Requirement[] {
  const ext = path.extname(file).toLowerCase();
  const out: Requirement[] = [];
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  const push = (r: Draft) => {
    const title = str(r.title) || str(r.description);
    if (!title) return;
    out.push({
      id: str(r.id) || `US-${String(out.length + 1).padStart(3, '0')}`,
      source: 'document',
      title: title.split('\n')[0].slice(0, 200),
      type: str(r.type) || 'Story',
      status: str(r.status) || 'Provided',
      description: str(r.description),
      acceptance_criteria: r.ac ?? [],
      ...(str(r.priority) ? { priority: str(r.priority) } : {}),
      ...(str(r.module) ? { module: str(r.module) } : {}),
      ...(str(r.sprint) ? { sprint: str(r.sprint) } : {}),
      ...(r.labels?.length ? { labels: r.labels } : {}),
    });
  };
  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.csv') {
    const sheets = ext === '.csv' ? readCsv(file) : readXlsx(file);
    const norm = (h: string) =>
      String(h ?? '')
        .toLowerCase()
        .replace(/[_\-./()#]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    for (const sh of sheet ? sheets.filter((x) => x.name === sheet) : sheets) {
      const hi = sh.rows.slice(0, 15).findIndex((r) => (r ?? []).map(norm).some((h) => TITLES.includes(h)));
      if (hi < 0) continue;
      const head = sh.rows[hi].map(norm);
      const col = new Map(COLUMNS.map(([k, names]) => [k, head.findIndex((h) => names.includes(h))]));
      for (const row of sh.rows.slice(hi + 1)) {
        const g = (k: string) => {
          const c = col.get(k) ?? -1;
          return c >= 0 ? String(row?.[c] ?? '').trim() : '';
        };
        push({
          id: g('id'),
          title: g('title'),
          description: g('description'),
          ac: splitList(g('ac')),
          priority: g('priority'),
          status: g('status'),
          type: g('type'),
          module: g('module'),
          sprint: g('sprint'),
          labels: g('labels') ? g('labels').split(/[,;]\s*/) : [],
        });
      }
    }
    return out;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (ext === '.json') {
    let d: unknown;
    try {
      d = JSON.parse(text);
    } catch (e) {
      throw new BlockedError(`${file} isn't valid JSON (${(e as Error).message}).`);
    }
    const o = d as Record<string, unknown>;
    const list = Array.isArray(d) ? d : (o.requirements ?? o.stories ?? o.items ?? []);
    for (const r of (Array.isArray(list) ? list : []) as Record<string, unknown>[]) {
      const ac = r.acceptance_criteria ?? r.acceptanceCriteria ?? r.ac;
      push({
        ...r,
        ac: Array.isArray(ac) ? ac.map(String) : ac ? splitList(String(ac)) : [],
        labels: Array.isArray(r.labels) ? r.labels.map(String) : [],
      });
    }
    return out;
  }
  // Markdown or text: a heading or an "ID: title" line starts a story; "Acceptance criteria" starts its list
  for (const b of text.split(/\n(?=#{1,4}\s|(?:[A-Z][A-Z0-9]+-\d+|US-?\d+)\s*[:-])/)) {
    const lines = b.trim().split('\n');
    const head = lines[0].replace(/^#{1,4}\s*/, '').trim();
    if (!head) continue;
    const m = /^([A-Z][A-Z0-9]+-\d+|US-?\d+)\s*[:-]\s*(.*)$/.exec(head);
    const acAt = lines.findIndex((l) => /^\s*(\*\*)?acceptance criteria/i.test(l));
    const description = lines
      .slice(1, acAt >= 0 ? acAt : undefined)
      .join('\n')
      .trim();
    const ac =
      acAt >= 0
        ? lines
            .slice(acAt + 1)
            .map((l) =>
              l.replace(/^\s*([-*]|\d+[.)]|Given|When|Then|And)\s*/i, (x) =>
                /given|when|then|and/i.test(x) ? `${x.trim()} ` : '',
              ),
            )
            .map((l) => l.trim())
            .filter(Boolean)
        : [];
    if (!m && !description && !ac.length) continue; // a document title or an empty section, not a story
    push({ id: m?.[1], title: m ? m[2] : head, description, ac });
  }
  return out;
}

/** What's wrong with a list of requirements, one line each (empty when it can be saved). */
export function problems(list: Requirement[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  list.forEach((r, i) => {
    const w = `requirement ${i + 1}${r.id ? ` (${r.id})` : ''}`;
    for (const k of ['id', 'title', 'type', 'status'] as const) if (!r[k]) errs.push(`${w}: no ${k}`);
    if (r.id && seen.has(r.id)) errs.push(`${w}: the ID ${r.id} appears twice`);
    seen.add(r.id);
  });
  return errs;
}

export type Saved = {
  scope: string;
  source: string;
  period: string;
  saved_at: string;
  count: number;
  notice?: string;
  requirements: Requirement[];
};

function markdown(s: Saved): string {
  const lines = [
    `# Requirements: ${s.scope}`,
    '',
    `Source: ${s.source} · ${s.period} · saved ${s.saved_at} · ${s.count} item(s)`,
    '',
  ];
  if (s.notice) lines.push(`> ${s.notice}`, '');
  for (const r of s.requirements) {
    const meta = [r.type, r.status, r.priority && `priority ${r.priority}`, r.sprint, r.module, r.url].filter(Boolean);
    lines.push(`## ${r.id}: ${r.title}`, '', meta.join(' · '), '');
    if (r.description) lines.push(r.description.trim(), '');
    if (r.acceptance_criteria.length)
      lines.push('**Acceptance criteria**', '', ...r.acceptance_criteria.map((a) => `- ${a}`), '');
    else lines.push('_No acceptance criteria recorded: test only what the description states._', '');
  }
  return lines.join('\n');
}

/** Writes requirements/<scope>/requirements.json and .md; returns the folder. */
export function save(project: string, s: Saved): string {
  const dir = path.join(project, 'requirements', s.scope);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'requirements.json'), `${JSON.stringify(s, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'requirements.md'), markdown(s));
  return dir;
}

/** The saved scopes, by folder name. */
export function list(project: string): Omit<Saved, 'requirements'>[] {
  const root = path.join(project, 'requirements');
  if (!fs.existsSync(root)) return [];
  const out: Omit<Saved, 'requirements'>[] = [];
  for (const d of fs.readdirSync(root).sort()) {
    const f = path.join(root, d, 'requirements.json');
    if (!fs.existsSync(f)) continue;
    try {
      const { requirements: _, ...meta } = JSON.parse(fs.readFileSync(f, 'utf8')) as Saved;
      out.push({ ...meta, scope: d });
    } catch {
      throw new BlockedError(`${path.relative(project, f)} isn't valid JSON: fetch or import that scope again.`);
    }
  }
  return out;
}
