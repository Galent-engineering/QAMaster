/**
 * 0.7.0 item 8 (R12): TestGen on sign-in, sign-up and add/edit forms. tests/fixtures/testgen/signin is a hand-made DSM
 * in the shape the dsm track adds (access on a screen, dialog on a form, limits on a field) and an eight-case run on it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { Facts } from '../plugin/src/testgen/facts.mts';
import { type Manifest, type TestCase, type TestGenSettings, validate } from '../plugin/src/testgen/validate.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/testgen/signin');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

const SKILL = '# AUT\n## Screen details\n';
const FILES: Record<string, string> = {
  'todo:src/pages/auth.tsx': `${'x\n'.repeat(30)}`,
};
export function facts(): Facts {
  const dsm: Dsm = read('dsm.json');
  return new Facts({
    dsm,
    codeFiles: Object.keys(read('code-model.json').files),
    settings: {},
    app: 'Todo',
    autSkills: ['AUT_Todo', 'AUT_Todo-Auth', 'AUT_Todo-Todo'],
    domainSkills: [],
    skill: (name) => (name.startsWith('AUT_Todo') ? SKILL : null),
    lines: (file) => (file in FILES ? FILES[file].split('\n').length : null),
    text: (file) => FILES[file] ?? null,
    requirements: () => null,
  });
}
export const run = (): { manifest: Manifest; cases: TestCase[] } => ({
  manifest: read('run/manifest.json'),
  cases: read('run/testcases.json'),
});
export const settings = (): TestGenSettings => read('testgen.json');
const byId = (cases: TestCase[], id: string) => cases.find((c) => c.id === id) as TestCase;

function findings(change: (m: Manifest, cases: TestCase[]) => void): string {
  const { manifest, cases } = run();
  change(manifest, cases);
  const r = validate(manifest, cases, facts(), settings());
  assert.equal(r.status, 'fail');
  return [...r.errors, ...r.gaps].join('\n');
}

test('the sign-in and dialog-form run validates with both screens and the dialog form covered', () => {
  const { manifest, cases } = run();
  const r = validate(manifest, cases, facts(), settings());
  assert.deepEqual([r.errors, r.gaps], [[], []]);
  assert.equal(r.status, 'pass');
});

test('a dialog form is a form to cover: form:<screen>:<dialog title>:positive|negative', () => {
  const out = findings((_, cases) => {
    cases.splice(cases.indexOf(byId(cases, 'TC-TODO-002')), 1);
    byId(cases, 'TC-TODO-003').category = 'Edge';
  });
  assert.match(
    out,
    /form Add todo on \/todo has no negative test \(to exclude: item "form:\/todo:Add todo:negative"\)/,
  );
  // and the key an exclusion may use is exactly that one
  const { manifest, cases } = run();
  cases.splice(cases.indexOf(byId(cases, 'TC-TODO-002')), 1);
  byId(cases, 'TC-TODO-003').category = 'Edge';
  manifest.coverage_exclusions = [
    { component: 'Todo', item: 'form:/todo:Add todo:negative', reason: 'covered by the API cases' },
    { component: 'Todo', item: 'category:Negative', reason: 'covered by the API cases' },
    { component: 'Todo', item: 'category:Boundary', reason: 'covered by the API cases' },
  ];
  assert.equal(validate(manifest, cases, facts(), settings()).status, 'pass');
});

test("a dialog's fields are elements of its page", () => {
  const f = facts();
  for (const label of ['Title', 'Description', 'Save', 'Add todo']) assert.ok(f.hasElement('/todo', label), label);
  assert.ok(!f.hasElement('/todo', 'Email'));
});

test('a case on a public screen starts signed out, on a signed-in screen from a session', () => {
  const wrongPublic = findings((_, cases) => {
    byId(cases, 'TC-AUTH-001').session = 'signed-in';
  });
  assert.match(wrongPublic, /TC-AUTH-001: .*\/login is a public screen.*session.*signed-out/);
  const wrongPrivate = findings((_, cases) => {
    byId(cases, 'TC-TODO-001').session = 'signed-out';
  });
  assert.match(wrongPrivate, /TC-TODO-001: .*\/todo needs a signed-in session.*session.*signed-in/);
  const missing = findings((_, cases) => {
    delete byId(cases, 'TC-TODO-001').session;
  });
  assert.match(missing, /TC-TODO-001: missing session/);
  const odd = findings((_, cases) => {
    byId(cases, 'TC-TODO-001').session = 'logged in';
  });
  assert.match(odd, /TC-TODO-001: session "logged in" is not signed-out or signed-in/);
});

test('a DSM without screen access (before 0.7.0) asks for no session', () => {
  const dsm: Dsm = read('dsm.json');
  for (const n of dsm.page.nodes as { access?: string }[]) delete n.access;
  const f = new Facts({ ...facts().input, dsm });
  const { manifest, cases } = run();
  for (const c of cases) delete c.session;
  assert.equal(validate(manifest, cases, f, settings()).status, 'pass');
});

test('a screen seen in both states accepts either session', () => {
  const dsm: Dsm = read('dsm.json');
  for (const n of dsm.page.nodes as { id: string; access?: string }[]) if (n.id === '/todo') n.access = 'both';
  const f = new Facts({ ...facts().input, dsm });
  const { manifest, cases } = run();
  byId(cases, 'TC-TODO-001').session = 'signed-out';
  assert.equal(validate(manifest, cases, f, settings()).status, 'pass');
});

test('a literal password in a step, title or result fails the run (A6); a named account passes', () => {
  const out = findings((_, cases) => {
    for (const st of byId(cases, 'TC-AUTH-001').steps ?? [])
      if (st.element === 'Password') st.action = 'Fill the Password field with Reg#Pass2026';
    byId(cases, 'TC-AUTH-002').title = 'Signing in with password Wrong#Pass9 shows an error on the Sign in screen';
  });
  assert.match(out, /TC-AUTH-001 step 2: action contains a credential-like value "Reg#Pass2026"/);
  assert.match(out, /TC-AUTH-002: title contains a credential-like value "Wrong#Pass9"/);
});

test('a Boundary case on a field with declared limits cites the field or the validation code', () => {
  const out = findings((_, cases) => {
    const c = byId(cases, 'TC-TODO-003');
    c.evidence = ['aut:AUT_Todo-Todo#Screen details'];
    for (const st of c.steps ?? []) if (st.element === 'Title') st.evidence = ['dsm:screen:/todo'];
  });
  assert.match(out, /TC-TODO-003: a Boundary case on \/todo must cite a declared field limit/);
  assert.match(out, /Title/);
  const { manifest, cases } = run();
  // the validation code in place of the field
  byId(cases, 'TC-TODO-003').evidence = ['code:todo:src/pages/auth.tsx:12'];
  assert.equal(validate(manifest, cases, facts(), settings()).status, 'pass');
  // a step's evidence counts as the case's
  const again = run();
  byId(again.cases, 'TC-TODO-003').evidence = ['aut:AUT_Todo-Todo#Screen details'];
  assert.equal(validate(again.manifest, again.cases, facts(), settings()).status, 'pass');
});

test('the context pack carries access, a form dialog and field limits, and nothing for a DSM without them', () => {
  const pack = JSON.parse(JSON.stringify(facts().context(null)));
  const todo = pack.components.Todo.screens[0];
  assert.equal(todo.access, 'signed-in');
  assert.equal(todo.forms[0].dialog, 'Add todo');
  assert.deepEqual(todo.forms[0].fields[0], {
    label: 'Title',
    name: 'title',
    type: 'text',
    required: true,
    min_length: 1,
    max_length: 100,
  });
  assert.equal(pack.components.Auth.screens.find((s: { route: string }) => s.route === '/login').access, 'public');
  assert.ok(!('dialog' in pack.components.Auth.screens[0].forms[0]));
});
