/**
 * 0.4.1 A13 (AgentMesh run): positional (:nth-of-type, :nth-child) and bare 'form' locators are 'selectors' findings
 * unless the line is marked // custom: <why>.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { staticFindings } from '../plugin/src/automation/quality.mts';
import { tmpDir } from './tmp.mts';

const selectors = (line: string): string[] => {
  const dir = tmpDir('qam-loc-');
  const f = path.join(dir, 'src/web/locators/app.page.locators.ts');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `export const L = {\n${line}\n};\n`);
  return staticFindings(dir, new Set()).selectors ?? [];
};

test('a positional locator is a finding; // custom: marks it as chosen', () => {
  const f = selectors("  submit: 'div:nth-of-type(2) > div > button',");
  assert.equal(f.length, 1);
  assert.match(f[0], /app\.page\.locators\.ts:2: positional or guessed locator `/);
  assert.match(f[0], /copy a test id or label from the crawl, or mark it \/\/ custom: <why>/);
  assert.deepEqual(selectors("  submit: 'div:nth-of-type(2) > div > button', // custom: the grid has no test ids"), []);
  assert.equal(selectors("  row: 'li:nth-child(3)',").length, 1);
});

test('a bare form locator is a finding; a specific one is not', () => {
  assert.equal(selectors("  pageInputsForm: 'form',").length, 1);
  assert.equal(selectors('  pageInputsForm: "form",').length, 1);
  assert.equal(selectors('  pageInputsForm: `form`,').length, 1);
  assert.deepEqual(selectors("  pageInputsForm: 'form#login',"), []);
});

test('only a literal that is exactly form is guessed: role and attribute locators are not', () => {
  assert.deepEqual(selectors("  loginForm: { role: 'form', name: 'Log in' },"), []);
  assert.deepEqual(selectors('  loginForm: \'[data-testid="form"]\','), []);
  assert.deepEqual(selectors('  loginForm: \'input[name="form"]\','), []);
  assert.equal(selectors("  loginForm: page.locator('form'),").length, 1);
  assert.deepEqual(selectors("  loginForm: page.getByRole('form', { name: 'Login' }),"), []);
  assert.deepEqual(selectors("  loginForm: { role: 'form', name: 'Log in' }, // the labelled form"), []);
  assert.deepEqual(selectors("  loginForm: 'form#login', // the login form"), []);
});

test('a bare form literal is flagged before a trailing comment or as const', () => {
  assert.equal(selectors('  f: "form" // comment').length, 1);
  assert.equal(selectors("  f: 'form' as const").length, 1);
  assert.equal(selectors("  f: 'form', // the form").length, 1);
  assert.equal(selectors('  f: `form`;').length, 1);
});
