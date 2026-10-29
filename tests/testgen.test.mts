/**
 * Feature 7 goldens and fixes. tests/fixtures/testgen/shop/run is a six-case Cart run on the feature 1 shop DSM that
 * AQE's validator passes; shop/aqe holds AQE's own validation, context and rendered files for it (aqe-runs.json says
 * how they were made).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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
    lines: (file) => (file === 'shop:src/Cart.tsx' ? 40 : null), // the scanned Cart.tsx is 40 lines
    requirements: (scope) => (scope === 'sprint-24' ? ['US-001', 'US-002'] : null),
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

// One test per fix, each the matching case in tests/fixtures/testgen/aqe-runs.json, which AQE passed.

/** The golden run with one change; returns the validation's findings. */
function findings(change: (m: Manifest, cases: TestCase[]) => void, cfg = settings()): string[] {
  const { manifest, cases } = run();
  change(manifest, cases);
  const r = validate(manifest, cases, facts(), cfg);
  assert.equal(r.status, 'fail');
  return r.errors;
}
const lastStep = (cases: TestCase[], i = 0) => {
  const steps = cases[i].steps ?? [];
  return steps[steps.length - 1];
};

test('fix 1: an element must match a real one exactly, not be part of it', () => {
  const errors = findings((_, cases) => {
    lastStep(cases).element = 'Check';
  });
  assert.match(errors.join('\n'), /element "Check" is not on \/cart in the DSM/);
  const { manifest, cases } = run();
  lastStep(cases).element = 'Coupon field'; // a kind word after the name is fine
  assert.equal(validate(manifest, cases, facts(), settings()).status, 'pass');
});

test('fix 2: UI named in the action text is checked, and an acting step must name its element', () => {
  const quoted = findings((_, cases) => {
    lastStep(cases).action = 'Type SAVE10 in the Coupon field and press the "Apply voucher" button';
  });
  assert.match(quoted.join('\n'), /the action names "Apply voucher", which is not on \/cart/);
  const prose = findings((_, cases) => {
    const st = lastStep(cases);
    delete st.element;
    st.action = 'Click the Apply voucher button under the Coupon field';
  });
  assert.match(prose.join('\n'), /names no element/);
  assert.match(prose.join('\n'), /the action names "Apply voucher", which is not on \/cart/);
});

test('fix 3: a cited line must exist, and a business rule needs a line, heading or requirement', () => {
  const line = findings((_, cases) => {
    lastStep(cases, 1).evidence = ['code:shop:src/Cart.tsx:9999'];
  });
  assert.match(line.join('\n'), /shop:src\/Cart\.tsx has no line 9999 \(40 lines\)/);
  const bare = findings((_, cases) => {
    cases[2].evidence = ['aut:AUT_Shop', 'code:shop:src/Cart.tsx'];
  });
  assert.match(bare.join('\n'), /TC-CART-003: cite where the business rule is written/);
  const { manifest, cases } = run();
  cases[2].evidence = ['code:shop:src/Cart.tsx:12'];
  assert.equal(validate(manifest, cases, facts(), settings()).status, 'pass', 'a real line is precise enough');
});

test('fix 4: req: comes from the fetched requirements, by exact ID', () => {
  const invented = findings((m, cases) => {
    m.requirements_scope = 'sprint-24';
    cases[2].evidence?.push('req:US-999');
  });
  assert.match(invented.join('\n'), /requirement US-999 is not in requirements\/sprint-24\/requirements\.json/);
  const partial = findings((m, cases) => {
    m.requirements_scope = 'sprint-24';
    cases[2].evidence?.push('req:US-00');
  });
  assert.match(partial.join('\n'), /requirement US-00 is not in/);
  const noScope = findings((_, cases) => {
    cases[2].evidence?.push('req:US-001');
  });
  assert.match(noScope.join('\n'), /needs manifest\.requirements_scope/);
  const { manifest, cases } = run();
  manifest.requirements_scope = 'sprint-24';
  cases[2].evidence?.push('req:US-001');
  assert.equal(validate(manifest, cases, facts(), settings()).status, 'pass');
});

test('fix 5: the tolerance is 0 whatever the settings say', () => {
  const cfg = { ...settings(), hallucination_tolerance: 2 } as TestGenSettings;
  const { manifest, cases } = run();
  lastStep(cases, 3).element = 'Voucher code';
  const r = validate(manifest, cases, facts(), cfg);
  assert.deepEqual([r.status, r.hallucination_tolerance, r.errors.length], ['fail', 0, 1]);
});

test('fix 6: a CSV cell that would run as a formula is neutralised', () => {
  const { manifest, cases } = run();
  cases[0].title = '=HYPERLINK("http://example.test","Cart") Cart screen shows the Coupon field';
  const csv = render(manifest, cases, validate(manifest, cases, facts(), settings())).get('testcases.csv') as string;
  assert.match(csv.split('\r\n')[1], /^TC-CART-001,"'=HYPERLINK\(/);
});

// ---- the commands, on a QA project set up as qam setup leaves it

const QAM = path.join(ROOT, 'plugin/bin/qam');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-home-'));
function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const git = (dir: string, ...a: string[]) =>
  spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=qa@example.test', ...a], { encoding: 'utf8' });

/** A QA project with the shop DSM, its knowledge skills, a git clone holding src/Cart.tsx, and the golden run. */
function project(): { dir: string; run: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-testgen-'));
  qam(dir, 'setup', '--no-install', '--app', 'Shop');
  const repo = path.join(dir, 'shop');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src/Cart.tsx'),
    `${Array.from({ length: 39 }, (_, i) => `// line ${i + 1}`).join('\n')}\n`,
  );
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'cart');
  const dsm = read(path.join(ROOT, 'tests/fixtures/dsm/shop/dsm.expected.json'));
  dsm.repos[0].commit = git(repo, 'rev-parse', 'HEAD').stdout.trim();
  fs.mkdirSync(path.join(dir, 'dsm'));
  fs.writeFileSync(path.join(dir, 'dsm/dsm.json'), JSON.stringify(dsm));
  fs.copyFileSync(path.join(ROOT, 'tests/fixtures/dsm/shop/code-model.json'), path.join(dir, 'dsm/code-model.json'));
  const cfg = read(path.join(dir, 'config/dsm-config.json'));
  cfg.repositories = [{ name: 'shop', path: 'shop', branch: 'main' }];
  fs.writeFileSync(path.join(dir, 'config/dsm-config.json'), JSON.stringify(cfg));
  fs.cpSync(AUT, path.join(dir, '.claude/skills'), { recursive: true });
  const run = path.join(dir, 'testgen/output/cart');
  fs.cpSync(path.join(FIX, 'shop/run'), run, { recursive: true });
  git(dir, 'init', '-q');
  return { dir, run };
}
const edit = (run: string, change: (cases: TestCase[]) => void) => {
  const cases = read(path.join(run, 'testcases.json'));
  change(cases);
  fs.writeFileSync(path.join(run, 'testcases.json'), JSON.stringify(cases));
};

test('qam testgen validates, renders and records what it checked; qam review records the reviewer', () => {
  const { dir, run } = project();
  const v = qam(dir, 'testgen', 'validate', 'cart');
  assert.equal(v.status, 0, v.out + v.err);
  const validation = read(path.join(run, 'validation.json'));
  assert.equal(validation.status, 'pass');
  assert.equal(validation.dsm_generated_at, read(path.join(dir, 'dsm/dsm.json')).generated_at);
  assert.match(validation.run_hash, /^[0-9a-f]{64}$/);
  assert.ok(!fs.existsSync(path.join(run, 'review.json')), 'validation is not called review');
  assert.equal(qam(dir, 'testgen', 'render', 'cart').status, 0);
  assert.ok(fs.existsSync(path.join(run, 'Cart.feature')));
  assert.match(
    JSON.parse(qam(dir, '--json', 'testgen', 'context', '--component', 'Cart').out).components.Cart.aut_skill,
    /AUT_Shop-Cart/,
  );

  git(dir, 'config', 'user.email', 'reviewer@example.test');
  assert.equal(qam(dir, 'review', 'cart').status, 0);
  assert.equal(read(path.join(run, 'run.json')).reviewedBy, 'reviewer@example.test');
  const stages = JSON.parse(qam(dir, '--json', 'pipeline', 'status').out).stages;
  const status = (id: string) => stages.find((s: { stage: string }) => s.stage === id).status;
  assert.deepEqual([status('test-cases'), status('review')], ['done', 'done']);
});

test('fix 3 (command): a cited line is checked in the scanned commit of the clone', () => {
  const { dir, run } = project();
  edit(run, (cases) => {
    (cases[1].steps ?? [])[3].evidence = ['code:shop:src/Cart.tsx:40'];
  });
  const r = qam(dir, 'testgen', 'validate', 'cart');
  assert.equal(r.status, 1);
  assert.match(r.out, /shop:src\/Cart\.tsx has no line 40 \(39 lines\)/);
  edit(run, (cases) => {
    (cases[1].steps ?? [])[3].evidence = ['code:shop:src/Cart.tsx:39'];
  });
  assert.equal(qam(dir, 'testgen', 'validate', 'cart').status, 0);
});

test('fix 5 (command): a hallucination_tolerance setting blocks', () => {
  const { dir } = project();
  const f = path.join(dir, 'config/testgen.json');
  fs.writeFileSync(f, JSON.stringify({ ...read(f), hallucination_tolerance: 2 }));
  const r = qam(dir, 'testgen', 'validate', 'cart');
  assert.equal(r.status, 2);
  assert.match(r.err, /tolerance 0 \(decision Q10\)/);
});

test('fix 7: an edit or a DSM rebuild after validation makes it stale, and review refuses', () => {
  const { dir, run } = project();
  git(dir, 'config', 'user.email', 'reviewer@example.test');
  assert.equal(qam(dir, 'testgen', 'validate', 'cart').status, 0);
  edit(run, (cases) => {
    cases[0].title = 'Cart screen shows the Coupon field';
  });
  const r = qam(dir, 'review', 'cart');
  assert.equal(r.status, 2);
  assert.match(r.err, /changed since it was validated/);
  let stage = JSON.parse(qam(dir, '--json', 'pipeline', 'status').out).stages.find(
    (s: { stage: string }) => s.stage === 'test-cases',
  );
  assert.equal(stage.status, 'stale');

  assert.equal(qam(dir, 'testgen', 'validate', 'cart').status, 0);
  assert.equal(qam(dir, 'review', 'cart').status, 0);
  const dsmFile = path.join(dir, 'dsm/dsm.json');
  fs.writeFileSync(dsmFile, JSON.stringify({ ...read(dsmFile), generated_at: '2026-10-30T00:00:00+00:00' }));
  stage = JSON.parse(qam(dir, '--json', 'pipeline', 'status').out).stages.find(
    (s: { stage: string }) => s.stage === 'test-cases',
  );
  assert.match(stage.evidence, /the DSM was rebuilt since it was validated/);
  edit(run, (cases) => {
    cases[0].title = 'Cart screen shows the Coupon field again';
  });
  const reviewStage = JSON.parse(qam(dir, '--json', 'pipeline', 'status').out).stages.find(
    (s: { stage: string }) => s.stage === 'review',
  );
  assert.equal(reviewStage.status, 'stale');
});

test('fix 8: no DSM or no run is blocked, not failed', () => {
  const { dir } = project();
  assert.match(qam(dir, 'testgen', 'validate', 'nope').err, /No run nope/);
  fs.rmSync(path.join(dir, 'dsm/dsm.json'));
  const r = qam(dir, 'testgen', 'validate', 'cart');
  assert.equal(r.status, 2);
  assert.match(r.err, /No DSM at dsm\/dsm\.json\. Run qam dsm run first/);
});
