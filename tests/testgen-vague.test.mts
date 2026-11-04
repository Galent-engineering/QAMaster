/**
 * 0.4.1 A3 (AgentMesh run): "ok" inside a quoted API response was flagged as a vague outcome.
 * Vague phrases are matched outside quotes and the case's test_data values only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { DOMAIN_SKILL, Facts } from '../plugin/src/testgen/facts.mts';
import { type Manifest, type TestCase, type TestGenSettings, validate } from '../plugin/src/testgen/validate.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/testgen');
const AUT = path.join(ROOT, 'tests/fixtures/knowledge/shop/aqe');
const PLUGIN_SKILLS = path.join(ROOT, 'plugin/skills');
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const text = (f: string) => fs.readFileSync(f, 'utf8');

function facts(): Facts {
  const dsm: Dsm = read(path.join(ROOT, 'tests/fixtures/dsm/shop/dsm.expected.json'));
  return new Facts({
    dsm,
    codeFiles: Object.keys(read(path.join(ROOT, 'tests/fixtures/dsm/shop/code-model.json')).files),
    settings: {},
    app: 'Shop',
    autSkills: fs.readdirSync(AUT),
    domainSkills: fs.readdirSync(PLUGIN_SKILLS).filter((d) => d === DOMAIN_SKILL || d.startsWith(`${DOMAIN_SKILL}-`)),
    skill: (name) => {
      for (const dir of [AUT, PLUGIN_SKILLS]) {
        const f = path.join(dir, name, 'SKILL.md');
        if (fs.existsSync(f)) return text(f);
      }
      return null;
    },
    lines: (file) => (file === 'shop:src/Cart.tsx' ? 40 : null),
    requirements: (scope) => (scope === 'sprint-24' ? ['US-001', 'US-002'] : null),
  });
}

test('0.4.1 A3: vague phrases are matched outside quotes and test_data values only', () => {
  const settings: TestGenSettings = {
    ...read(path.join(FIX, 'shop/testgen.json')),
    vague_expected_phrases: ['ok', 'works'],
  };
  const errorsFor = (expected: string, data?: Record<string, string>) => {
    const manifest: Manifest = read(path.join(FIX, 'shop/run/manifest.json'));
    const cases: TestCase[] = read(path.join(FIX, 'shop/run/testcases.json'));
    cases[0].expected_result = expected;
    if (data) cases[0].test_data = data;
    return validate(manifest, cases, facts(), settings).errors.join('\n');
  };
  assert.match(errorsFor('The page shows that everything is ok for the user'), /vague or too short expected_result/);
  assert.doesNotMatch(errorsFor('The response body is {"status": "ok"} with HTTP 200'), /vague or too short/);
  assert.doesNotMatch(errorsFor("The response status field equals 'ok' exactly"), /vague or too short/);
  assert.doesNotMatch(errorsFor('The response status field equals `ok` exactly'), /vague or too short/);
  assert.doesNotMatch(
    errorsFor('The service answers with works for the given input', { answer: 'works' }),
    /vague or too short/,
  );
  assert.match(errorsFor('The page works and says "ok" in a banner'), /vague or too short/);
});

test('0.4.1 A3: an apostrophe inside a word does not open a quote, and a short test_data value hides nothing', () => {
  const settings: TestGenSettings = {
    ...read(path.join(FIX, 'shop/testgen.json')),
    vague_expected_phrases: ['ok', 'works'],
  };
  const errorsFor = (expected: string, data?: Record<string, string>) => {
    const manifest: Manifest = read(path.join(FIX, 'shop/run/manifest.json'));
    const cases: TestCase[] = read(path.join(FIX, 'shop/run/testcases.json'));
    cases[0].expected_result = expected;
    if (data) cases[0].test_data = data;
    return validate(manifest, cases, facts(), settings).errors.filter((e) => /vague or too short/.test(e));
  };
  assert.equal(errorsFor("The user's basket works and it's fine for the shopper").length, 1);
  assert.equal(errorsFor("The page works for the shopper and the customer's cart is empty").length, 1);
  // a quoted value after a space, colon, bracket or equals is still data
  assert.equal(errorsFor("The status field equals 'ok' exactly in the response").length, 0);
  assert.equal(errorsFor("The response is {status:'ok'} with HTTP 200 returned").length, 0);
  assert.equal(errorsFor('The response status=`ok` is returned with HTTP 200').length, 0);
  // a one- or two-character value is not cut out of other words
  assert.equal(errorsFor('The page works for the shopper in the cart view', { qty: 'r' }).length, 1);
  assert.equal(errorsFor('The page works for the shopper in the cart view', { qty: 'ks' }).length, 1);
  // a longer value is removed only as a whole token
  assert.equal(errorsFor('The service answers works for the given input', { answer: 'works' }).length, 0);
});
