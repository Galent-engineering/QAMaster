/**
 * A validated run as files people and tools read: testcases.md, one Gherkin <Component>.feature per component (tagged
 * @TC-<id>, so automation and the gate can find each case), and testcases.csv. Pure: returns name -> text.
 */
import { md } from '../knowledge/build.mts';
import type { Manifest, Report, Step, TestCase } from './validate.mts';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Python's str.isupper: at least one cased character, and no lower-case one. */
function isUpper(text: string): boolean {
  let cased = false;
  for (const ch of text) {
    if (ch.toLowerCase() !== ch.toUpperCase()) {
      cased = true;
      if (ch !== ch.toUpperCase()) return false;
    }
  }
  return cased;
}

/** The first letter in lower case, unless the text starts with an acronym ("URL", "SAVE10"). */
export function lowerFirst(text: unknown): string {
  const t = s(text);
  const cps = Array.from(t);
  const two = cps.slice(0, 2).join('');
  return two && !isUpper(two) ? (cps[0] ?? '').toLowerCase() + cps.slice(1).join('') : t;
}

const tagOf = (v: unknown) =>
  s(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A CSV row as Python's csv module writes it: quoted only when needed, CRLF. */
export function csvRow(values: unknown[]): string {
  const cells = values.map((v) => {
    const t = s(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  });
  if (cells.length === 1 && cells[0] === '') return '""\r\n';
  return `${cells.join(',')}\r\n`;
}

/** Gherkin text of one step: imperative actions read as first-person steps ("When I open the cart"). */
function stepPhrases(st: Step): [string, string] {
  let action = lowerFirst(st.action).replace(/\.$/, '');
  if (/^[a-z]/.test(action) && !/^(the|a|an|i|my|user|employee|admin|manager)\b/.test(action)) action = `I ${action}`;
  return [action, lowerFirst(st.expected).replace(/\.$/, '')];
}

/**
 * One feature per component, written for reuse:
 * - Background: the preconditions and leading steps every scenario shares;
 * - Scenario Outline + Examples: cases whose steps differ only in their test data values (one Examples table per case,
 *   tagged with its @TC id so traceability survives);
 * - Scenario: every other case. Tags: @TC-<id>, category, type, priority.
 */
export function featureText(app: string, comp: string, tcs: TestCase[]): string {
  type L = { kind: 'given' | 'action' | 'expect'; text: string };
  const lines = [`@${tagOf(app) || 'app'} @feature:${comp.replace(/\s+/g, '_')}`, `Feature: ${comp}`, ''];
  const stepLines = (tc: TestCase): L[] => {
    const out: L[] = (tc.preconditions ?? []).map((p) => ({ kind: 'given', text: s(p).replace(/\.$/, '') }));
    for (const st of tc.steps ?? []) {
      const [a, e] = stepPhrases(st);
      out.push({ kind: 'action', text: a }, { kind: 'expect', text: e });
    }
    return out;
  };
  // Given / When / Then from the line kinds, with And for a repeat of the same kind
  const keyed = (ls: L[], background = false): string[] => {
    let prev: string | null = null;
    return ls.map((l) => {
      const kw = background ? 'Given' : l.kind === 'given' ? 'Given' : l.kind === 'action' ? 'When' : 'Then';
      const word = kw === prev ? 'And' : kw;
      prev = kw;
      return `${word} ${l.text}`;
    });
  };
  // Background: the leading lines every scenario shares, ending after an outcome
  const all = tcs.map(stepLines);
  let common = 0;
  if (all.length > 1) {
    while (
      all.every(
        (l) =>
          l[common] !== undefined && l[common].text === all[0][common].text && l[common].kind === all[0][common].kind,
      )
    )
      common++;
    const shortest = Math.min(...all.map((l) => l.length));
    if (common >= shortest) common = shortest - 2;
    while (common > 0 && all[0][common - 1].kind === 'action') common--;
    if (common < 0) common = 0;
  }
  if (common > 0) lines.push('  Background:', ...keyed(all[0].slice(0, common), true).map((l) => `    ${l}`), '');
  // group cases whose remaining steps differ only in the values of their test data
  const signature = (tc: TestCase, ls: L[]): [L[], string[]] => {
    const data = Object.entries(tc.test_data ?? {}).filter(
      ([, v]) => typeof v === 'string' || typeof v === 'number',
    ) as [string, string | number][];
    let rest = ls.slice(common).map((l) => ({ ...l }));
    const used: string[] = [];
    for (const [k, v] of data.sort((x, y) => String(y[1]).length - String(x[1]).length)) {
      const sv = String(v);
      if (sv.length < 2 || !rest.some((l) => l.text.includes(sv))) continue;
      rest = rest.map((l) => ({ ...l, text: l.text.split(sv).join(`<${k}>`) }));
      used.push(k);
    }
    return [rest, used.sort()];
  };
  const groups = new Map<string, { cases: TestCase[]; keys: string[]; steps: L[] }>();
  tcs.forEach((tc, i) => {
    const [steps, keys] = signature(tc, all[i]);
    const id = keys.length ? `${steps.map((l) => l.kind + l.text).join('\n')}|${keys.join(',')}` : `single:${tc.id}`;
    const g = groups.get(id) ?? { cases: [], keys, steps };
    g.cases.push(tc);
    groups.set(id, g);
  });
  const tags = (tc: TestCase) =>
    [`@${s(tc.id)}`, `@${tagOf(tc.category)}`, `@${tagOf(tc.type)}`, `@${tagOf(tc.priority)}`]
      .filter((t) => t !== '@')
      .join(' ');
  for (const g of groups.values()) {
    if (g.cases.length > 1 && g.keys.length) {
      const title = s(g.cases[0].title).replace(/\s+(with|for|when|using)\s.*$/i, '') || comp;
      lines.push(
        `  @${tagOf(g.cases[0].type)}`,
        `  Scenario Outline: ${title} (${g.keys.join(', ')})`,
        ...keyed(g.steps).map((l) => `    ${l}`),
        '',
      );
      for (const tc of g.cases) {
        lines.push(
          `    ${tags(tc)}`,
          `    Examples: ${s(tc.title)}`,
          `      | ${g.keys.join(' | ')} |`,
          `      | ${g.keys.map((k) => String(tc.test_data?.[k]).replace(/\|/g, '\\|')).join(' | ')} |`,
          '',
        );
      }
    } else {
      for (const tc of g.cases) {
        const i = tcs.indexOf(tc);
        lines.push(
          `  ${tags(tc)}`,
          `  Scenario: ${s(tc.title)}`,
          ...keyed(all[i].slice(common)).map((l) => `    ${l}`),
          '',
        );
      }
    }
  }
  return lines.join('\n');
}

export function render(manifest: Manifest, cases: TestCase[], report: Report): Map<string, string> {
  const files = new Map<string, string>();
  const lines: string[] = [
    `# Test cases: ${s(manifest.app)} (${(manifest.components ?? []).join(', ')})`,
    '',
    `- Domain: ${s(manifest.domain)} · generated ${s(manifest.generated_at)} · validation: **${report.status}** ` +
      `(hallucination tolerance ${report.hallucination_tolerance}, ${report.errors.length} findings, ${report.gaps.length} coverage gaps)`,
    `- By category: ${Object.entries(report.by_category)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`,
    '',
  ];
  for (const tc of cases) {
    lines.push(
      `## ${s(tc.id)} · ${s(tc.title)}`,
      '',
      `**Component** ${s(tc.component)} · **Type** ${s(tc.type)} · **Category** ${s(tc.category)} · **Priority** ${s(tc.priority)}`,
      '',
      `**Objective** ${s(tc.objective)}`,
    );
    if (tc.business_scenario) lines.push(`\n**Business scenario** ${s(tc.business_scenario)}`);
    if (tc.preconditions?.length) lines.push('\n**Preconditions**', ...tc.preconditions.map((p) => `- ${s(p)}`));
    if (tc.test_data && Object.keys(tc.test_data).length)
      lines.push('\n**Test data**', ...Object.entries(tc.test_data).map(([k, v]) => `- ${k}: ${s(v)}`));
    lines.push('', '| # | Screen | Action | Element | Data | Expected |', '|---|---|---|---|---|---|');
    (tc.steps ?? []).forEach((st, i) => {
      lines.push(
        `| ${i + 1} | \`${s(st.screen)}\` | ${md(st.action)} | ${md(st.element ?? '')} | ${md(st.data ?? '')} | ${md(st.expected)} |`,
      );
    });
    lines.push(
      '',
      `**Expected result** ${s(tc.expected_result)}`,
      '',
      `**Traceability** ${(tc.evidence ?? []).map((e) => `\`${e}\``).join(', ')}`,
      '',
    );
  }
  files.set('testcases.md', lines.join('\n'));
  const byComp = new Map<string, TestCase[]>();
  for (const tc of cases) byComp.set(s(tc.component), [...(byComp.get(s(tc.component)) ?? []), tc]);
  for (const [comp, tcs] of byComp) files.set(`${comp}.feature`, featureText(s(manifest.app) || 'app', comp, tcs));
  let csv = csvRow([
    'ID',
    'Title',
    'Component',
    'Type',
    'Category',
    'Priority',
    'Objective',
    'Business scenario',
    'Preconditions',
    'Step',
    'Screen',
    'Action',
    'Element',
    'Data',
    'Step expected',
    'Expected result',
    'Traceability',
  ]);
  for (const tc of cases) {
    (tc.steps ?? []).forEach((st, idx) => {
      const first = idx === 0;
      csv += csvRow([
        tc.id,
        tc.title,
        tc.component,
        tc.type,
        tc.category,
        tc.priority,
        first ? tc.objective : '',
        first ? (tc.business_scenario ?? '') : '',
        first ? (tc.preconditions ?? []).join('; ') : '',
        idx + 1,
        st.screen,
        st.action,
        st.element ?? '',
        st.data ?? '',
        st.expected,
        first ? tc.expected_result : '',
        first ? (tc.evidence ?? []).join('; ') : '',
      ]);
    });
  }
  files.set('testcases.csv', csv);
  return files;
}
