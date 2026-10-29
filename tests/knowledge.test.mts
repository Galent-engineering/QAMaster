/**
 * Feature 5 goldens and fixes. tests/fixtures/knowledge/*\/expected are AQE's own build_aut_skills output for the
 * feature 1 DSMs (aqe-runs.json says how they were made); QAMaster must write the same skills.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { buildSkills } from '../plugin/src/knowledge/build.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/knowledge');
const AQE_NOW = '2026-10-29 11:16 UTC'; // when AQE built the fixtures
const dsmOf = (name: string): Dsm =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/dsm', name, 'dsm.expected.json'), 'utf8'));

/** Every file in a skills folder: "AUT_X/SKILL.md" -> text. */
function folder(dir: string): Map<string, string> {
  return new Map(
    fs
      .readdirSync(dir)
      .flatMap((d) => fs.readdirSync(path.join(dir, d)).map((f) => `${d}/${f}`))
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
}
const existingIn = (dir: string | null) => (name: string) => {
  const f = dir && path.join(dir, name, 'SKILL.md');
  return f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
};

for (const [fixture, dsm, app, input] of [
  ['shop', 'shop', 'Shop', null],
  ['rwa', 'rwa', 'RealWorldApp', null],
  ['curated', 'shop', 'Shop', 'curated/input'],
] as const) {
  test(`golden: AQE's skills for ${fixture}`, () => {
    const inputDir = input && path.join(FIX, input);
    const r = buildSkills(dsmOf(dsm), {}, app, existingIn(inputDir), inputDir ? fs.readdirSync(inputDir) : [], AQE_NOW);
    const expected = folder(path.join(FIX, fixture, 'expected'));
    const aqeState = JSON.parse(expected.get(`AUT_${app}/.aut-build.json`) as string);
    expected.delete(`AUT_${app}/.aut-build.json`);
    assert.deepEqual([...r.files.keys()].sort(), [...expected.keys()].sort());
    for (const [f, text] of expected) assert.equal(r.files.get(f), text, f);
    assert.deepEqual(r.state, aqeState);
  });
}
