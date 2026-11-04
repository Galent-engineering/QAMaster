/**
 * The static gates of `qam check-scripts` for a playwright-bdd folder, ported from AQE 0.2.0's check_scripts.mts and
 * shared/bdd-quality.mts: no inline selectors, page objects use their locator files, steps in their place, features
 * tagged with a platform and with @TC IDs a TestGen run has, and no duplicate or copy-paste steps or scenarios that
 * differ only in values. Pure: it reads files and runs nothing. bddgen and `playwright test --list` are the adapter's.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SELECTOR =
  /(\.locator\(\s*['"`]|getBy(?:TestId|Role|Text|Label|Placeholder|AltText|Title)\(\s*['"`]|\.\$\$?\(\s*['"`]|xpath=|\bcss=)/;
export const PLATFORM_TAGS = new Set(['@web', '@mobile-web', '@api', '@native']);
const PLACEMENT = [
  /^steps\/pages\/[\w-]+\.(page|component)\.steps\.ts$/,
  /^steps\/api\/[\w-]+\.api\.steps\.ts$/,
  /^steps\/shared\/[\w.-]+\.ts$/,
];

/** Files under `dir` (relative, with /) whose path matches. */
export function files(root: string, dir: string, match: RegExp): string[] {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) return [];
  return (fs.readdirSync(base, { recursive: true, encoding: 'utf8' }) as string[])
    .map((f) => path.posix.join(dir, f.split(path.sep).join('/')))
    .filter((f) => match.test(f) && fs.statSync(path.join(root, f)).isFile())
    .sort();
}
const read = (root: string, f: string) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n?/g, '\n');

type StepDef = { pattern: string; file: string; line: number };
const isParam = (t: string) => /^\{\w*\}$|^\(.*\)$|^<\w+>$/.test(t);
const tokens = (p: string) => p.match(/"[^"]*"|'[^']*'|\{\w*\}|\S+/g) ?? [];

/** Duplicate step patterns, and patterns that differ only in a quoted value or a number (AQE bdd-quality). */
export function reuseFindings(steps: StepDef[]): string[] {
  const out: string[] = [];
  const byPattern = new Map<string, StepDef[]>();
  for (const s of steps) byPattern.set(s.pattern, [...(byPattern.get(s.pattern) ?? []), s]);
  for (const [p, list] of byPattern)
    if (list.length > 1)
      out.push(
        `duplicate step "${p}" defined ${list.length} times: ${list.map((s) => `${s.file}:${s.line}`).join(', ')}; keep one and reuse it`,
      );
  const uniq = [...byPattern].map(([p, list]) => ({ p, t: tokens(p), at: list[0] }));
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) {
      const [a, b] = [uniq[i], uniq[j]];
      if (a.t.length !== b.t.length || a.t.length < 3) continue;
      const diff = a.t.map((_, k) => k).filter((k) => a.t[k] !== b.t[k]);
      if (!diff.length || diff.length > 3 || diff[diff.length - 1] - diff[0] !== diff.length - 1) continue;
      if (diff.some((k) => isParam(a.t[k]) || isParam(b.t[k]))) continue;
      const quoted = diff.every((k) => /^["']/.test(a.t[k]) && /^["']/.test(b.t[k]));
      const numeric = diff.every((k) => /^-?\d+(\.\d+)?$/.test(a.t[k]) && /^-?\d+(\.\d+)?$/.test(b.t[k]));
      if (!quoted && !numeric) continue;
      const merged = [
        ...a.t.slice(0, diff[0]),
        numeric ? '{int}' : '{string}',
        ...a.t.slice(diff[diff.length - 1] + 1),
      ];
      out.push(
        `copy-paste steps "${a.p}" (${a.at.file}:${a.at.line}) and "${b.p}" (${b.at.file}:${b.at.line}) differ only in a value: make one reusable step "${merged.join(' ')}"`,
      );
    }
  return out;
}

/** Scenarios of a feature with their step texts. */
export function scenariosOf(text: string): { name: string; line: number; outline: boolean; steps: string[] }[] {
  const out: { name: string; line: number; outline: boolean; steps: string[] }[] = [];
  let cur: (typeof out)[number] | null = null;
  text.split('\n').forEach((raw, i) => {
    const l = raw.trim();
    const m = /^(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*)$/.exec(l);
    if (m) {
      cur = { name: m[2], line: i + 1, outline: /Outline|Template/.test(m[1]), steps: [] };
      out.push(cur);
      return;
    }
    if (/^(Background|Rule|Feature):/.test(l)) cur = null;
    const s = /^(Given|When|Then|And|But|\*)\s+(.*)$/.exec(l);
    if (s && cur) cur.steps.push(s[2]);
  });
  return out;
}

/** Two or more scenarios of a feature that differ only in values should be one Scenario Outline. */
export function outlineFindings(feature: string, text: string): string[] {
  const groups = new Map<string, ReturnType<typeof scenariosOf>>();
  for (const s of scenariosOf(text).filter((x) => !x.outline && x.steps.length)) {
    const sig = s.steps.map((t) => t.replace(/"[^"]*"|'[^']*'/g, '"…"').replace(/\b\d+(\.\d+)?\b/g, '#')).join('\n');
    if (sig === s.steps.join('\n')) continue;
    groups.set(sig, [...(groups.get(sig) ?? []), s]);
  }
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map(
      (g) =>
        `${feature}: scenarios ${g.map((s) => `"${s.name}" (line ${s.line})`).join(', ')} differ only in their values: make one Scenario Outline with an Examples block per test case`,
    );
}

/** The static gates; `known` is every TC ID of the TestGen runs. */
// a string literal that is exactly 'form': it opens after : , ( [ or a space (not inside a longer selector after =),
// closes before , ) ] } ; // as const or the end of the line, and is not a role (role: 'form', getByRole('form', ...))
const bareForm = (line: string): boolean =>
  [...line.matchAll(/(?:^|[:,([\s])(['"`])form\1\s*(?:[,)\]};]|\/\/|as\s+const\b|$)/g)].some(
    (m) => !/(?:\brole\s*:|getByRole\s*\()\s*$/.test(line.slice(0, m.index + m[0].indexOf(m[1]))),
  );

export function staticFindings(root: string, known: Set<string>): Record<string, string[]> {
  const findings: Record<string, string[]> = {};
  const add = (k: string, msg: string) => {
    findings[k] = [...(findings[k] ?? []), msg];
  };
  const features = files(root, 'features', /\.feature$/);
  if (!features.length) add('features', 'no feature files yet: draft the scripts for the selected test cases');

  for (const f of [...files(root, 'src/web/pages', /\.ts$/), ...files(root, 'steps', /\.ts$/)])
    read(root, f)
      .split('\n')
      .forEach((line, i) => {
        const t = line.trim();
        if (!t.startsWith('//') && !t.startsWith('*') && SELECTOR.test(line))
          add('selectors', `${f}:${i + 1}: inline selector \`${t.slice(0, 110)}\`; move it to the page's locator file`);
      });

  // A13: a positional or bare-tag locator breaks when the page changes; a test id or label from the crawl doesn't
  for (const f of files(root, 'src/web/locators', /\.locators\.ts$/))
    read(root, f)
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('// custom:')) return;
        if (/:nth-(?:of-type|child)\(/.test(line) || bareForm(line))
          add(
            'selectors',
            `${f}:${i + 1}: positional or guessed locator \`${line.trim().slice(0, 110)}\`: copy a test id or label from the crawl, or mark it // custom: <why>`,
          );
      });

  const used = new Set<string>();
  for (const f of files(root, 'src/web/pages', /\.ts$/)) {
    const text = read(root, f);
    if (!/export class/.test(text)) continue; // the abstract BasePage drives no screen
    const imports = [...text.matchAll(/from '\.\.\/locators\/([\w.]+)'/g)].map((m) => `src/web/locators/${m[1]}.ts`);
    if (!imports.length) add('locators', `${f}: does not import a locator file from src/web/locators/`);
    for (const i of imports) used.add(i);
  }
  for (const f of files(root, 'src/web/locators', /\.locators\.ts$/))
    if (!used.has(f)) add('locators', `${f}: no page object uses it`);

  for (const f of files(root, 'steps', /\.ts$/))
    if (!PLACEMENT.some((p) => p.test(f)))
      add(
        'placement',
        `${f}: put screen steps in steps/pages/<page>.page.steps.ts (or .component.steps.ts), API steps in steps/api/<service>.api.steps.ts, generic ones in steps/shared/`,
      );

  for (const f of features) {
    const text = read(root, f);
    const head = text.includes('Feature:') ? text.slice(0, text.indexOf('Feature:')) : '';
    if (!(head.match(/@[\w:.-]+/g) ?? []).some((t) => PLATFORM_TAGS.has(t)))
      add('features', `${f}: the feature has no platform tag (${[...PLATFORM_TAGS].sort().join(', ')})`);
    for (const m of text.matchAll(/@(TC-[\w-]+)/g))
      if (!known.has(m[1])) add('features', `${f}: @${m[1]} is not a test case in any TestGen run`);
    for (const o of outlineFindings(f, text)) add('reuse', o);
  }

  const STEP_DEF = /\b(?:Given|When|Then|Step)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const defs = files(root, 'steps', /\.ts$/).flatMap((f) => {
    const text = read(root, f);
    return [...text.matchAll(STEP_DEF)].map((m) => ({
      pattern: m[2],
      file: f,
      line: text.slice(0, m.index).split('\n').length,
    }));
  });
  for (const m of reuseFindings(defs)) add('reuse', m);
  return findings;
}
