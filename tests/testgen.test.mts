/**
 * Feature 7 goldens and fixes. tests/fixtures/testgen/shop/run is a six-case Cart run on the feature 1 shop DSM that
 * AQE's validator passes; shop/aqe holds AQE's own validation, context and rendered files for it (aqe-runs.json says
 * how they were made).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { DOMAIN_SKILL, Facts } from '../plugin/src/testgen/facts.mts';
import { render } from '../plugin/src/testgen/render.mts';
import { type Manifest, type TestCase, type TestGenSettings, validate } from '../plugin/src/testgen/validate.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/testgen');
const AUT = path.join(ROOT, 'tests/fixtures/knowledge/shop/aqe'); // the skills AQE validated against
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
  });
}
const run = (): { manifest: Manifest; cases: TestCase[] } => ({
  manifest: read(path.join(FIX, 'shop/run/manifest.json')),
  cases: read(path.join(FIX, 'shop/run/testcases.json')),
});
const settings = (): TestGenSettings => read(path.join(FIX, 'shop/testgen.json'));

test("golden: the validation of the shop run is AQE's", () => {
  const { manifest, cases } = run();
  assert.deepEqual(validate(manifest, cases, facts(), settings()), read(path.join(FIX, 'shop/aqe/review.json')));
});

test("golden: the context pack is AQE's, without its v2 parts", () => {
  const aqe = read(path.join(FIX, 'shop/aqe/context.json'));
  // AQE's API model, locator files and their evidence formats are v2 or feature 8
  for (const k of ['api_endpoints', 'api_context', 'locator_files']) delete aqe[k];
  aqe.evidence_formats = aqe.evidence_formats.filter((f: string) => !/^(locator|tc|api):/.test(f));
  // feature 5 fix 7: link text in a journey is quoted page text, in backticks
  for (const j of aqe.journeys) j.path = j.path.replace(/\("([^"]*)"\)/g, '(`$1`)');
  assert.deepEqual(JSON.parse(JSON.stringify(facts().context(null))), aqe);
});

test("golden: the rendered files are AQE's", () => {
  const { manifest, cases } = run();
  const files = render(manifest, cases, validate(manifest, cases, facts(), settings()));
  assert.deepEqual([...files.keys()].sort(), ['Cart.feature', 'testcases.csv', 'testcases.md']);
  for (const [name, body] of files) assert.equal(body, text(path.join(FIX, 'shop/aqe', name)), name);
});
