/**
 * 0.7.0 item 9 (W11): a rendered .feature uses the fixed step phrasings the framework's generic steps define, and the
 * published steps and case hashes do not change (Q39).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { derive } from '../plugin/src/publish/publish.mts';
import { featureText } from '../plugin/src/testgen/render.mts';
import type { TestCase } from '../plugin/src/testgen/validate.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const COMMON = fs.readFileSync(path.join(ROOT, 'plugin/framework/playwright-bdd/steps/shared/common.steps.ts'), 'utf8');

/** The generic steps' patterns as regexes: {string} is a double-quoted value. */
const PATTERNS = [...COMMON.matchAll(/\b(?:Given|When|Then)\(\s*'((?:\\.|[^'\\])*)'/g)].map(
  (m) => new RegExp(`^${m[1].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{string\}/g, '"[^"]*"')}$`),
);
const stepLines = (feature: string) =>
  feature
    .split('\n')
    .map((l) => /^\s*(?:Given|When|Then|And|But)\s+(.*)$/.exec(l)?.[1])
    .filter((l): l is string => !!l);

const kase = (over: Partial<TestCase> = {}): TestCase => ({
  id: 'TC-TODO-001',
  title: 'Adding a todo from the Add todo dialog',
  component: 'Todo',
  type: 'Functional',
  category: 'Positive',
  priority: 'P1',
  steps: [
    { screen: '/todo', action: 'Open the Todo screen', expected: 'The page shows "Todo"' },
    {
      screen: '/todo',
      action: 'Click the Add todo button',
      element: 'Add todo',
      expected: 'The dialog shows "Title"',
    },
    {
      screen: '/todo',
      action: 'Fill the Title field',
      element: 'Title',
      data: 'Buy milk',
      expected: 'The Title field shows "Buy milk"',
    },
    {
      screen: '/todo',
      action: 'Click the Back to sign in link',
      element: 'Back to sign in',
      leads_to: '/login',
      expected: 'The Sign in screen opens',
    },
  ],
  ...over,
});

test('the template defines the generic phrasings', () => {
  // open a path, click a button, click a link, fill a field, see a text, the URL contains
  assert.equal(PATTERNS.length, 6);
});

test('a rendered case uses only the generic step phrasings where one fits', () => {
  const text = featureText('Todo', 'Todo', [kase()]);
  assert.deepEqual(stepLines(text), [
    'I open the path "/todo"',
    'I should see the text "Todo"',
    'I click the "Add todo" button',
    'I should see the text "Title"',
    'I fill the "Title" field with "Buy milk"',
    'I should see the text "Buy milk"',
    'I click the "Back to sign in" link',
    'the URL should contain "/login"',
    'the Sign in screen opens',
  ]);
  for (const l of stepLines(text).filter((l) => l !== 'the Sign in screen opens'))
    assert.ok(
      PATTERNS.some((p) => p.test(l)),
      `no generic step matches: ${l}`,
    );
});

test('a step no generic phrasing fits keeps its own wording', () => {
  const text = featureText('Todo', 'Todo', [
    kase({
      steps: [
        {
          screen: '/todo',
          action: 'Drag the card to Done',
          element: 'Card',
          expected: 'The card moves to the Done column',
        },
      ],
    }),
  ]);
  assert.deepEqual(stepLines(text), ['I drag the card to Done', 'the card moves to the Done column']);
});

test('a step back to the root asserts its expected text, not a URL every page contains', () => {
  const text = featureText('Todo', 'Todo', [
    kase({
      steps: [
        {
          screen: '/todo',
          action: 'Click the Home link',
          element: 'Home',
          leads_to: '/',
          expected: 'The page shows "Welcome"',
        },
      ],
    }),
  ]);
  assert.deepEqual(stepLines(text), ['I click the "Home" link', 'I should see the text "Welcome"']);
});

test('a step that leads to a route keeps its own expected text beside the route check (0.7.1)', () => {
  const text = featureText('Todo', 'Todo', [
    kase({
      steps: [
        {
          screen: '/todo',
          action: 'Click the Back to sign in link',
          element: 'Back to sign in',
          leads_to: '/login',
          expected: 'The page shows "Sign in"',
        },
      ],
    }),
  ]);
  assert.deepEqual(stepLines(text), [
    'I click the "Back to sign in" link',
    'the URL should contain "/login"',
    'I should see the text "Sign in"',
  ]);
});

test('cases that reach the same route but expect different text stay separate scenarios (0.7.1)', () => {
  const step = (expected: string) => ({
    screen: '/todo',
    action: 'Type the title',
    element: 'Title',
    data: 'Buy milk',
    leads_to: '/todo/saved',
    expected,
  });
  const text = featureText('Todo', 'Todo', [
    kase({
      id: 'TC-TODO-001',
      title: 'Save a todo',
      steps: [step('The page shows "Saved"')],
      test_data: { title: 'Buy milk' },
    }),
    kase({
      id: 'TC-TODO-002',
      title: 'Save a long todo',
      steps: [step('The page shows "Too long"')],
      test_data: { title: 'Buy milk' },
    }),
  ]);
  assert.doesNotMatch(text, /Scenario Outline/);
  assert.equal((text.match(/^\s*Scenario:/gm) ?? []).length, 2);
});

test("a case's session is a tag in the feature, and the published case does not change (0.7.1)", () => {
  const signedIn = kase({ session: 'signed-in' });
  const before = JSON.stringify(signedIn);
  const text = featureText('Todo', 'Todo', [
    signedIn,
    kase({ id: 'TC-TODO-002', session: 'signed-out' }),
    kase({ id: 'TC-TODO-003' }),
  ]);
  assert.match(text, /@TC-TODO-001 .*@signed-in\b/);
  assert.match(text, /@TC-TODO-002 .*@signed-out\b/);
  assert.doesNotMatch(text.split('@TC-TODO-003')[1].split('\n')[0], /@signed-/);
  assert.equal(JSON.stringify(signedIn), before);
});

test('the published steps and case hashes of an existing run are unchanged by the new wording', () => {
  const cases = read('tests/fixtures/testgen/shop/run/testcases.json') as TestCase[];
  const before = JSON.stringify(cases);
  const ctx = {
    scope: { module: 'Cart', subModule: '' },
    dsm: { page: { nodes: [] } },
    settings: { publish: { pathDepth: 2, suiteBy: 'module' } },
    scenarios: new Set<string>(),
  } as never;
  featureText('Shop', 'Cart', cases);
  assert.equal(JSON.stringify(cases), before, 'render does not touch the cases');
  const hashes = cases.map((c) => derive({ preconditions: [], test_data: {}, evidence: [], ...c } as never, ctx).hash);
  // recorded from 0.6.0 (a3b042d), before the feature wording changed
  assert.deepEqual(hashes, [
    '056317dcda7f5a8e',
    '8b7248d5690a3359',
    '1efc08189896ed8f',
    '122a8af7e7c1c58f',
    '88e6f8b55e8a4837',
    '2ead222a58f6398b',
  ]);
  assert.deepEqual(derive({ preconditions: [], test_data: {}, evidence: [], ...cases[0] } as never, ctx).steps[0], {
    action: 'Open the shop home page',
    expected: 'The home page shows the Products link',
  });
});

// 0.8.0 item 11 (Q58): the @signed-in hook signs in, so the sign-in precondition the session already states is dropped
test('a signed-in case drops the precondition that only states the sign-in, and keeps the others', () => {
  const text = featureText('Todo', 'Todo', [
    kase({
      session: 'signed-in',
      preconditions: ['The registered user is signed in.', 'The list has a todo "Buy milk"'],
    }),
  ]);
  assert.match(text, /@signed-in/);
  assert.doesNotMatch(text, /is signed in/);
  assert.match(text, /Given The list has a todo "Buy milk"/);
});

test('a precondition is kept for a signed-out case, when it says more, or when it is a negation', () => {
  const signedIn = 'The registered user is signed in';
  assert.match(
    featureText('Todo', 'Todo', [kase({ session: 'signed-out', preconditions: [signedIn] })]),
    /is signed in/,
  );
  assert.match(featureText('Todo', 'Todo', [kase({ preconditions: [signedIn] })]), /is signed in/, 'no session stated');
  const more = 'The user is signed in with two todos';
  assert.match(
    featureText('Todo', 'Todo', [kase({ session: 'signed-in', preconditions: [more] })]),
    /signed in with two todos/,
  );
  for (const p of ['The user is not signed in', 'The user signed out', 'The user is logged out'])
    assert.match(featureText('Todo', 'Todo', [kase({ session: 'signed-in', preconditions: [p] })]), new RegExp(p));
  assert.doesNotMatch(
    featureText('Todo', 'Todo', [
      kase({ session: 'signed-in', preconditions: ['The user is logged in and authenticated'] }),
    ]),
    /logged in/,
  );
});

test('the hook is not a generic phrasing: the template still defines six', () => {
  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, 'plugin/framework/playwright-bdd/steps/shared/session.steps.ts'), 'utf8'),
    /\b(?:Given|When|Then)\(/,
  );
});
