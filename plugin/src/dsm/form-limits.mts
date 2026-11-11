/**
 * Field limits written in form code (0.8.0 item 19): react-hook-form `register` and `Controller` rules, yup and zod
 * schemas, Angular `Validators`. Read from the text, no AI. Only literals count: a limit held in a variable is not
 * guessed. The scan puts each file's limits in code-model.json; the DSM merges them into the crawl's fields.
 */
import type { CodeLimit } from '../shared/models.mts';

type Limits = Omit<CodeLimit, 'field' | 'source' | 'line'>;

/** Index of the bracket that closes the one at `open`, skipping strings, regex literals and comments. */
function closeOf(text: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const stack: string[] = [];
  let prev = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      if (i < 0) return -1;
      i++;
    } else if (c === '/' && '(,:=[{!&|?'.includes(prev) && prev !== '') {
      let inClass = false;
      for (i++; i < text.length && (inClass || text[i] !== '/'); i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
      }
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
    if (!/\s/.test(c)) prev = text[i];
  }
  return -1;
}

/** The text inside the bracket at `open`. */
const inside = (text: string, open: number) => {
  const close = closeOf(text, open);
  return close < 0 ? '' : text.slice(open + 1, close);
};

/** `key: value` pairs of an object body, split at commas of depth 0. */
function pairsOf(body: string): [string, string][] {
  const out: [string, string][] = [];
  let start = 0;
  const push = (end: number) => {
    const m = /^\s*['"]?([\w$]+)['"]?\s*:\s*([\s\S]*)$/.exec(body.slice(start, end));
    if (m) out.push([m[1], m[2].trim()]);
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if ('([{'.includes(c)) {
      const close = closeOf(body, i);
      if (close < 0) break;
      i = close;
    } else if (c === '"' || c === "'" || c === '`') {
      for (i++; i < body.length && body[i] !== c; i++) if (body[i] === '\\') i++;
    } else if (c === ',') {
      push(i);
      start = i + 1;
    }
  }
  push(body.length);
  return out;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/;
/** The number a rule or argument holds: `3`, `{ value: 3, message }` or `3, 'message'`. */
function num(arg: string): number | undefined {
  const text = arg.trim();
  const first = /^\{/.test(text)
    ? (pairsOf(text.slice(1, text.lastIndexOf('}')))
        .find(([k]) => k === 'value')?.[1]
        .trim() ?? '')
    : (pairsOfList(text)[0] ?? '').trim();
  return NUMBER.test(first) ? Number(first) : undefined;
}
/** Arguments split at commas of depth 0. */
function pairsOfList(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) {
      const close = closeOf(text, i);
      if (close < 0) break;
      i = close;
    } else if (c === '"' || c === "'" || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === ',') {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}
/** The pattern a rule or argument holds: a regex literal or a string, bare or as `{ value: ... }`. */
function pattern(arg: string): string | undefined {
  let text = arg.trim();
  if (text.startsWith('{')) {
    const v = pairsOf(text.slice(1, text.lastIndexOf('}'))).find(([k]) => k === 'value');
    if (!v) return undefined;
    text = v[1];
  }
  const re = /^\/((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+)\/[a-z]*/.exec(text);
  if (re) return re[1];
  const str = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(text);
  return str?.[2];
}
/** `required: true`, `required: 'message'` or `{ value: true }` say required; false and anything else do not. */
function isRequired(value: string): boolean {
  const v = value.trim();
  if (v === 'true') return true;
  if (/^(['"`])[\s\S]+\1/.test(v)) return true;
  const inner = v.startsWith('{') ? pairsOf(v.slice(1, v.lastIndexOf('}'))).find(([k]) => k === 'value')?.[1] : '';
  return inner?.trim() === 'true';
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
const has = (l: Limits) => Object.keys(l).length > 0;

/** react-hook-form rules: required, minLength, maxLength, min, max, pattern. */
function rhfRules(body: string): Limits {
  const out: Limits = {};
  for (const [key, value] of pairsOf(body)) {
    if (key === 'required' && isRequired(value)) out.required = true;
    else if (key === 'minLength' || key === 'maxLength') {
      const n = num(value);
      if (n !== undefined) out[key === 'minLength' ? 'min_length' : 'max_length'] = n;
    } else if (key === 'min' || key === 'max') {
      const n = num(value);
      if (n !== undefined) out[key] = n;
    } else if (key === 'pattern') {
      const p = pattern(value);
      if (p !== undefined) out.pattern = p;
    }
  }
  return out;
}

function scanReactHookForm(text: string): CodeLimit[] {
  const found: CodeLimit[] = [];
  for (const m of text.matchAll(/\bregister\(\s*(['"`])([^'"`]+)\1\s*,\s*\{/g)) {
    const limits = rhfRules(inside(text, m.index + m[0].length - 1));
    if (has(limits)) found.push({ field: m[2], source: 'react-hook-form', line: lineOf(text, m.index), ...limits });
  }
  for (const m of text.matchAll(/<Controller\b/g)) {
    // the tag runs to its closing ">" outside any braces
    let end = m.index + m[0].length;
    while (end < text.length && text[end] !== '>' && text[end] !== '/') {
      if ('{"\''.includes(text[end])) {
        const close = text[end] === '{' ? closeOf(text, end) : text.indexOf(text[end], end + 1);
        if (close < 0) break;
        end = close;
      }
      end++;
    }
    const tag = text.slice(m.index, end);
    const name = /\bname\s*=\s*(?:\{\s*)?(['"`])([^'"`]+)\1/.exec(tag);
    const rules = /\brules\s*=\s*\{\s*\{/.exec(tag);
    if (!name || !rules) continue;
    const limits = rhfRules(inside(tag, rules.index + rules[0].length - 1));
    if (has(limits)) found.push({ field: name[2], source: 'react-hook-form', line: lineOf(text, m.index), ...limits });
  }
  return found;
}

/** The calls chained after `open` (the "(" of `yup.string(`), as [method, argument text]. */
function chain(text: string, open: number): [string, string][] {
  const calls: [string, string][] = [];
  let at = closeOf(text, open);
  while (at >= 0) {
    const next = /^\s*\.\s*(\w+)\s*\(/.exec(text.slice(at + 1));
    if (!next) break;
    const paren = at + 1 + next[0].length - 1;
    calls.push([next[1], inside(text, paren)]);
    at = closeOf(text, paren);
  }
  return calls;
}

/** yup and zod: `key: yup.string().required().min(3)`, `key: z.number().min(1)`. */
function scanSchemas(text: string): CodeLimit[] {
  const found: CodeLimit[] = [];
  const re =
    /(?:^|[\s,{(])['"]?([A-Za-z_$][\w$]*)['"]?\s*:\s*(yup|Yup|y|z|zod)\s*\.\s*(coerce\s*\.\s*)?(string|number)\s*\(/g;
  for (const m of text.matchAll(re)) {
    const numeric = m[4] === 'number';
    const limits: Limits = {};
    for (const [method, args] of chain(text, m.index + m[0].length - 1)) {
      if (method === 'required' && /^(yup|Yup|y)$/.test(m[2])) limits.required = true;
      else if (method === 'nonempty' && !numeric) limits.min_length = 1;
      else if ((method === 'min' || method === 'max') && num(args) !== undefined)
        limits[numeric ? method : method === 'min' ? 'min_length' : 'max_length'] = num(args);
      else if (method === 'length' && !numeric && num(args) !== undefined) {
        limits.min_length = num(args);
        limits.max_length = num(args);
      } else if ((method === 'matches' || method === 'regex') && !numeric) {
        const p = pattern(args);
        if (p !== undefined) limits.pattern = p;
      }
    }
    if (has(limits)) {
      const key = m[0].lastIndexOf(m[1]);
      found.push({
        field: m[1],
        source: /^(yup|Yup|y)$/.test(m[2]) ? 'yup' : 'zod',
        line: lineOf(text, m.index + key),
        ...limits,
      });
    }
  }
  return found;
}

/** Angular: `key: ['', [Validators.required, Validators.minLength(3)]]`, `key: new FormControl(v, validators)`, `fb.control`. */
function scanAngular(text: string): CodeLimit[] {
  const found: CodeLimit[] = [];
  const re =
    /(?:^|[\s,{(])['"]?([A-Za-z_$][\w$]*)['"]?\s*:\s*(\[|(?:new\s+)?(?:Form)?Control(?:<[^>]*>)?\s*\(|(?:this\.)?\w*[fF]ormBuilder\.control\s*\(|(?:this\.)?(?:fb|_fb|builder)\.control\s*\()/g;
  for (const m of text.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    const body = inside(text, open);
    const limits: Limits = {};
    for (const v of body.matchAll(/Validators\s*\.\s*(required|requiredTrue|minLength|maxLength|min|max|pattern)\b/g)) {
      const paren = /^\s*\(/.exec(body.slice(v.index + v[0].length));
      const args = paren ? inside(body, v.index + v[0].length + paren[0].length - 1) : '';
      if (v[1] === 'required' || v[1] === 'requiredTrue') limits.required = true;
      else if (v[1] === 'minLength' || v[1] === 'maxLength') {
        const n = num(args);
        if (n !== undefined) limits[v[1] === 'minLength' ? 'min_length' : 'max_length'] = n;
      } else if (v[1] === 'min' || v[1] === 'max') {
        const n = num(args);
        if (n !== undefined) limits[v[1]] = n;
      } else {
        const p = pattern(args);
        if (p !== undefined) limits.pattern = p;
      }
    }
    if (has(limits))
      found.push({
        field: m[1],
        source: 'angular',
        line: lineOf(text, m.index + m[0].lastIndexOf(m[1])),
        ...limits,
      });
  }
  return found;
}

/** Every limit the file's form code declares, in file order. */
export function scanFormLimits(text: string): CodeLimit[] {
  if (!/register\(|<Controller|\b(?:yup|Yup|y|z|zod)\s*\.|Validators/.test(text)) return [];
  return [...scanReactHookForm(text), ...scanSchemas(text), ...scanAngular(text)].sort((a, b) => a.line - b.line);
}
