/**
 * 0.8.0 items 10 and 11 (Q58): check-scripts flags a step that creates data in a folder whose fixtures.ts has no cleanup
 * fixture, and a Background that signs in by hand when the framework already signs @signed-in scenarios in.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { TEMPLATE } from '../plugin/src/adapters/framework-bdd.mts';
import { staticFindings } from '../plugin/src/automation/quality.mts';
import { write } from './framework-e2e.mts';
import { tmpDir } from './tmp.mts';

const KNOWN = new Set(['TC-TODO-001', 'TC-TODO-002']);
/** The template as qam app create makes it, plus one feature and its steps. */
function folder(files: Record<string, string>): string {
  const dir = tmpDir('qam-q080-');
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  write(dir, files);
  return dir;
}
const ADD_STEP = `import { Given } from '../../src/fixtures';
Given('I add a todo {string}', async ({ page }, title: string) => {
  await page.getByLabel('Title').fill(title);
});
`;
const FEATURE = `@web
Feature: Todo

  @TC-TODO-001 @signed-in
  Scenario: Adds one
    Given I add a todo "Buy milk"
`;
const OLD_FIXTURES = `import { test as base, createBdd } from 'playwright-bdd';
export const test = base.extend<{}>({});
export const { Given, When, Then } = createBdd(test);
export { expect } from '@playwright/test';
`;

test('item 10: a create step in a folder with no cleanup fixture is flagged, once per step, with how to fix it', () => {
  const dir = folder({
    'src/fixtures.ts': OLD_FIXTURES,
    'steps/pages/todo.page.steps.ts': ADD_STEP,
    'features/web/todo.feature': FEATURE,
  });
  const f = staticFindings(dir, KNOWN);
  assert.equal(f.cleanup?.length, 1, JSON.stringify(f));
  assert.match(f.cleanup[0], /steps\/pages\/todo\.page\.steps\.ts:2: step "I add a todo \{string\}" creates data/);
  assert.match(f.cleanup[0], /src\/fixtures\.ts has no cleanup fixture/);
  assert.match(f.cleanup[0], /cleanup\.add\(label, undo\)/);
});

test("item 10: the template's own fixtures have the cleanup fixture, so the same step passes", () => {
  const dir = folder({ 'steps/pages/todo.page.steps.ts': ADD_STEP, 'features/web/todo.feature': FEATURE });
  assert.equal(staticFindings(dir, KNOWN).cleanup, undefined);
});

test('item 10: steps that only read or click are not creates; an API step calling a create method is', () => {
  const read = folder({
    'src/fixtures.ts': OLD_FIXTURES,
    'steps/pages/todo.page.steps.ts': `import { Then, When } from '../../src/fixtures';
When('I open the todo {string}', async ({ page }, t: string) => {});
Then('the list shows {string}', async ({ page }, t: string) => {});
`,
  });
  assert.equal(staticFindings(read, KNOWN).cleanup, undefined);
  const api = folder({
    'src/fixtures.ts': OLD_FIXTURES,
    'steps/api/todo.api.steps.ts': `import { When } from '../../src/fixtures';
import { TodoService } from '../../src/api/services/TodoService';
When('the client sends the todo {string}', async ({ request }, t: string) => {
  await new TodoService(request).create({ title: t });
});
`,
  });
  assert.match(
    staticFindings(api, KNOWN).cleanup?.[0] ?? '',
    /todo\.api\.steps\.ts:3: step "the client sends the todo/,
  );
});

test('item 11: a Background that signs in by hand next to @signed-in scenarios is flagged', () => {
  const dir = folder({
    'features/web/todo.feature': `@web
Feature: Todo

  Background:
    Given I am signed in as the registered user

  @TC-TODO-001 @signed-in
  Scenario: Lists todos
    Given I open the path "/todo"
`,
  });
  const f = staticFindings(dir, KNOWN);
  assert.equal(f.session?.length, 1, JSON.stringify(f));
  assert.match(
    f.session[0],
    /features\/web\/todo\.feature:5: the Background signs in \("I am signed in as the registered user"\)/,
  );
  assert.match(f.session[0], /steps\/shared\/session\.steps\.ts/);
});

test('item 11: no flag without @signed-in, without a sign-in Background, or when the hook file is missing', () => {
  const plain = `@web
Feature: Todo

  @TC-TODO-001 @signed-out
  Scenario: Lists todos
    Given I open the path "/todo"
`;
  assert.equal(staticFindings(folder({ 'features/web/todo.feature': plain }), KNOWN).session, undefined);
  const bg = (tag: string, step: string) =>
    `@web\nFeature: Todo\n\n  Background:\n    Given ${step}\n\n  @TC-TODO-001 ${tag}\n  Scenario: x\n    Given I open the path "/todo"\n`;
  assert.equal(
    staticFindings(
      folder({ 'features/web/todo.feature': bg('@signed-out', 'I am signed in as the registered user') }),
      KNOWN,
    ).session,
    undefined,
  );
  assert.equal(
    staticFindings(folder({ 'features/web/todo.feature': bg('@signed-in', 'I open the path "/todo"') }), KNOWN).session,
    undefined,
  );
  const old = folder({ 'features/web/todo.feature': bg('@signed-in', 'I am signed in as the registered user') });
  fs.rmSync(path.join(old, 'steps/shared/session.steps.ts'), { force: true });
  assert.equal(
    staticFindings(old, KNOWN).session,
    undefined,
    'the hook is not there: the hand sign-in is all there is',
  );
});
