/**
 * 0.8.0 item 19 (D5, R6): the scan reads field limits from form code (react-hook-form, yup, zod, Angular Validators)
 * into code-model.json, and the DSM merges them into the crawl's fields: the DOM wins, and a field the crawl did not
 * record keeps them as code_limits with file:line.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build, type Dsm, type DsmConfig } from '../plugin/src/dsm/build.mts';
import { scanFormLimits } from '../plugin/src/dsm/form-limits.mts';
import { type RepoConfig, scan } from '../plugin/src/dsm/scan.mts';
import { buildSkills } from '../plugin/src/knowledge/build.mts';
import type { UiModel } from '../plugin/src/shared/models.mts';
import { Facts } from '../plugin/src/testgen/facts.mts';

const by = (text: string) => Object.fromEntries(scanFormLimits(text).map((l) => [l.field, l]));

test('react-hook-form: register and Controller rules, as a value or as { value, message }', () => {
  const found = by(`
<input {...register('email', { required: 'Email is required', maxLength: { value: 60, message: 'too long' }, pattern: /^\\S+@(a|b)\\S+$/ })} />
<input {...register("password", { required: true, minLength: 8, maxLength: 32 })} />
<input {...register('nick', { required: false })} />
<Controller name="age" control={control} rules={{ required: true, min: 1, max: { value: 120, message: 'm' } }} render={() => <input />} />
<Controller render={({ field }) => <input {...field} />} rules={{ minLength: { value: 3, message: 'short' } }} name="title" />`);
  assert.deepEqual(found.email, {
    field: 'email',
    source: 'react-hook-form',
    line: 2,
    required: true,
    max_length: 60,
    pattern: '^\\S+@(a|b)\\S+$',
  });
  assert.deepEqual(found.password, {
    field: 'password',
    source: 'react-hook-form',
    line: 3,
    required: true,
    min_length: 8,
    max_length: 32,
  });
  assert.equal(found.nick, undefined, 'required: false declares nothing');
  assert.deepEqual(
    { r: found.age.required, min: found.age.min, max: found.age.max },
    { r: true, min: 1, max: 120 },
    'Controller rules',
  );
  assert.equal(found.title.min_length, 3, 'name after rules');
});

test('yup: a chain on a key; string min and max are lengths, number min and max are values', () => {
  const found = by(`const schema = yup.object({
  title: yup.string().required('Title is required').min(3, 'short').max(50),
  priority: yup.number().min(1).max(5),
  code: yup
    .string()
    .matches(/^[A-Z]{3}$/, 'three capitals'),
  note: yup.string(),
});`);
  assert.deepEqual(found.title, {
    field: 'title',
    source: 'yup',
    line: 2,
    required: true,
    min_length: 3,
    max_length: 50,
  });
  assert.deepEqual({ min: found.priority.min, max: found.priority.max }, { min: 1, max: 5 });
  assert.equal(found.code.pattern, '^[A-Z]{3}$');
  assert.equal(found.code.line, 4);
  assert.equal(found.note, undefined, 'no limit, no entry');
});

test('zod: min, max, regex and nonempty on a key', () => {
  const found = by(`const s = z.object({
  email: z.string().email().max(60),
  password: z.string().min(8, { message: 'short' }).max(32),
  qty: z.coerce.number().min(1).max(5).int(),
  code: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().nonempty(),
  address: z.object({ zip: z.string().length(5) }),
});`);
  assert.equal(found.email.max_length, 60);
  assert.deepEqual({ a: found.password.min_length, b: found.password.max_length }, { a: 8, b: 32 });
  assert.deepEqual({ a: found.qty.min, b: found.qty.max }, { a: 1, b: 5 });
  assert.equal(found.code.pattern, '^[A-Z]{3}$');
  assert.equal(found.name.min_length, 1);
  assert.deepEqual(
    { a: found.zip.min_length, b: found.zip.max_length },
    { a: 5, b: 5 },
    'a nested key is its own field',
  );
  assert.equal(found.password.source, 'zod');
});

test('Angular: Validators in an array, a FormControl, or fb.control', () => {
  const found = by(`this.form = this.fb.group({
  title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
  priority: new FormControl<number>(1, [Validators.min(1), Validators.max(5)]),
  code: ['', Validators.pattern('[A-Z]{3}')],
  owner: this.fb.control('', Validators.required),
  routes: ['/a', '/b'],
});`);
  assert.deepEqual(found.title, {
    field: 'title',
    source: 'angular',
    line: 2,
    required: true,
    min_length: 3,
    max_length: 50,
  });
  assert.deepEqual({ a: found.priority.min, b: found.priority.max }, { a: 1, b: 5 });
  assert.equal(found.code.pattern, '[A-Z]{3}');
  assert.equal(found.owner.required, true);
  assert.equal(found.routes, undefined);
});

test('a value that is a variable, not a literal, is not guessed', () => {
  assert.deepEqual(scanFormLimits(`register('x', { minLength: MIN, maxLength: LIMITS.name })`), []);
});

// ---- the scan puts them on the file, the DSM merges them

const repo: RepoConfig = { name: 'app', path: 'x', branch: 'main', include: [], exclude: [] };
const code = () =>
  scan({ repositories: [repo] }, () => ({
    ref: null,
    commit: null,
    files: new Map([
      [
        'src/App.tsx',
        `import { Routes } from 'react-router-dom';
import Todo from './Todo';
<Routes><Route path="/todo" element={<Todo />} /></Routes>`,
      ],
      [
        'src/Todo.tsx',
        `export default function Todo() {
  return <form>
    <input {...register('title', { required: true, minLength: 3, maxLength: 80 })} />
    <input {...register('priority', { min: 1, max: 9 })} />
    <input {...register('notes', { maxLength: 200 })} />
  </form>;
}`,
      ],
    ]),
  }));
const config: DsmConfig = { project: 'app', output_dir: 'dsm', repositories: [] };
const ui = (fields: object[]): UiModel =>
  ({
    generated_at: '',
    base_url: '',
    mode: 'full',
    truncated: false,
    edges: [],
    api_calls: [],
    pages: [
      {
        route: '/todo',
        url: 'http://a/todo',
        title: 'Todo',
        status: 200,
        forms: [{ key: 'form:todo', id: 'todo', method: 'post', fields }],
      },
    ],
  }) as unknown as UiModel;

test('the scan puts the limits on the file that holds them', () => {
  const limits = code().files?.['app:src/Todo.tsx']?.limits as { field: string }[];
  assert.deepEqual(limits.map((l) => l.field).sort(), ['notes', 'priority', 'title']);
});

test('the DSM fills what the DOM leaves out, the DOM wins, and a field the crawl missed keeps code_limits with file:line', () => {
  const dsm = build(
    ui([
      { key: 'field:title', name: 'title', label: 'Title', type: 'text', required: false, maxlength: 50 },
      { key: 'field:priority', name: 'priority', label: 'Priority', type: 'number', required: false },
    ]),
    code(),
    config,
    { now: new Date('2026-11-11T00:00:00Z') },
  );
  const todo = dsm.page.nodes.find((n) => n.id === '/todo');
  const [title, priority] = todo?.forms[0].fields ?? [];
  assert.equal(title.max_length, 50, 'the DOM value wins over code (80)');
  assert.equal(title.min_length, 3, 'a limit the DOM leaves out comes from code');
  assert.equal(title.required, true, 'the page does not mark it required, the code does');
  assert.equal(title.code_limit_at, 'app:src/Todo.tsx:3', 'the field says where the code limit is');
  assert.equal(priority.required, false, 'code says nothing about required');
  assert.deepEqual({ a: priority.min, b: priority.max }, { a: 1, b: 9 });
  assert.deepEqual(todo?.code_limits, [
    { field: 'notes', source: 'react-hook-form', file: 'app:src/Todo.tsx', line: 5, max_length: 200 },
  ]);
});

test('TestGen and the knowledge skills see the code limits, with their file:line', () => {
  const dsm = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, 'fixtures/dsm/shop/dsm.expected.json'), 'utf8'),
  ) as Dsm;
  const cart = dsm.page.nodes.find((n) => n.id === '/cart') as Dsm['page']['nodes'][number];
  cart.forms[0].fields[0].max_length = 12;
  cart.forms[0].fields[0].code_limit_at = 'shop:src/Cart.tsx:9';
  cart.code_limits = [{ field: 'note', source: 'zod', file: 'shop:src/Cart.tsx', line: 14, max_length: 200 }];
  const facts = new Facts({
    dsm,
    codeFiles: [],
    settings: {},
    app: 'Shop',
    autSkills: [],
    domainSkills: [],
    skill: () => null,
    lines: () => null,
    requirements: () => null,
  });
  assert.deepEqual(facts.limited.get('/cart'), ['Coupon', 'note'], 'both are fields a Boundary case can bound');
  const screen = (facts.context(null) as { components: Record<string, { screens: Record<string, unknown>[] }> })
    .components;
  const found = Object.values(screen)
    .flatMap((c) => c.screens)
    .find((x) => x.route === '/cart') as { code_limits: unknown; forms: { fields: Record<string, unknown>[] }[] };
  assert.equal(found.forms[0].fields[0].code_limit_at, 'shop:src/Cart.tsx:9');
  assert.deepEqual(found.code_limits, cart.code_limits);
  const md = [...buildSkills(dsm, {}, 'Shop', () => null, [], '2026-11-11T00:00:00Z').files.values()].join('\n');
  assert.match(
    md,
    /Limit in code for "note" \(zod, the crawl did not record the field\): max 200 chars \(`shop:src\/Cart.tsx:14`\)/,
  );
  assert.match(md, /\[limits from code: shop:src\/Cart.tsx:9\]/);
});
