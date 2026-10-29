// Reproduces the holes in aqe-runs.json: node aqe-repro.mjs <absolute aqe.mts> <shop project copy> <golden run dir>
// Each case copies the passing golden run, changes one thing that should fail, and records AQE's verdict.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [AQE, PROJECT, GOLDEN] = process.argv.slice(2);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
function variant(change, cfgChange) {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-repro-'));
  fs.cpSync(PROJECT, proj, { recursive: true });
  const run = path.join(proj, 'testgen', 'output', 'golden');
  fs.rmSync(run, { recursive: true, force: true });
  fs.cpSync(GOLDEN, run, { recursive: true });
  const m = read(path.join(run, 'manifest.json'));
  const cases = read(path.join(run, 'testcases.json'));
  change(m, cases);
  fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(run, 'testcases.json'), JSON.stringify(cases));
  if (cfgChange) {
    const f = path.join(proj, 'config', 'testgen.json');
    const c = read(f);
    cfgChange(c);
    fs.writeFileSync(f, JSON.stringify(c));
  }
  return { proj, run };
}
function validate(proj, run, cmd = 'validate') {
  const r = spawnSync(process.execPath, [AQE, 'testgen', cmd, run], { encoding: 'utf8', env: { ...process.env, AQE_PROJECT_DIR: proj } });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { out = { raw: (r.stdout + r.stderr).trim().slice(0, 200) }; }
  return { exit: r.status, status: out.status ?? null, errors: out.errors ?? null };
}
const last = (cases, i = 0) => cases[i].steps[cases[i].steps.length - 1];
const runs = [];
const rec = (id, problem, change, result) => runs.push({ id, problem, change, ...result });

{ const { proj, run } = variant(() => {});
  rec('golden', 'none: the hand-written Cart run passes', 'tests/fixtures/testgen/shop run as it is', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { last(cases).element = 'Check'; last(cases).action = 'Click the Check button'; });
  rec('element-substring', 'an invented element passes when its name is part of a real one: "Check" is inside "checkout"', 'TC-CART-001 last step: element "Check" on /cart (the DSM has Coupon, checkout, Keep shopping)', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { const s = last(cases); delete s.element; s.action = 'Click the Apply voucher button under the Coupon field'; });
  rec('ui-in-prose', 'UI named in the action text is never checked: only the optional element field is', 'TC-CART-001 last step: no element field; action names an "Apply voucher" button that is not in the DSM', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => {
    const s = last(cases, 1); s.expected = 'The order total drops by 10 percent and a SAVE10 badge appears'; s.evidence = ['code:shop:src/Cart.tsx:9999', 'aut:AUT_Shop'];
    cases[1].expected_result = 'The total on /checkout is 10 percent lower than on /cart';
  });
  rec('invented-rule', 'an invented business rule passes when it cites a real file at a line that does not exist, and a skill without a heading', 'TC-CART-002 last step: expected "total drops by 10 percent", evidence code:shop:src/Cart.tsx:9999 (the file is in the code model) and aut:AUT_Shop', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { m.requirements = { 'US-999': { title: 'Coupons stack' } }; cases[2].evidence.push('req:US-999'); });
  rec('invented-requirement', 'a requirement ID passes if the manifest lists it; the manifest is written by the same model, and nothing checks requirements/', 'manifest.requirements gains US-999 (no requirements/ folder at all); TC-CART-003 cites req:US-999', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { m.requirements = 'US-12'; cases[2].evidence.push('req:US-1'); });
  rec('requirement-substring', 'with requirements given as a string, req:US-1 passes because "US-12" contains it', 'manifest.requirements "US-12"; TC-CART-003 cites req:US-1', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { last(cases, 3).element = 'Voucher code'; last(cases, 4).element = 'Gift card'; }, (c) => { c.hallucination_tolerance = 2; });
  rec('tolerance-config', 'raising hallucination_tolerance in config/testgen.json lets invented elements through, and the run still reports pass', 'config hallucination_tolerance 2; TC-CART-004 and 005 last steps name elements Voucher code and Gift card (not in the DSM)', validate(proj, run)); }

{ const { proj, run } = variant((m, cases) => { cases[0].title = '=HYPERLINK("http://example.test","Cart") Cart screen shows the Coupon field'; });
  const v = validate(proj, run, 'render');
  const csv = fs.readFileSync(path.join(run, 'testcases.csv'), 'utf8').split('\n')[1];
  rec('csv-formula', 'a cell starting with = is written as it is into testcases.csv, which a spreadsheet runs as a formula', 'TC-CART-001 title starts with =HYPERLINK(...); testgen render', { ...v, csv_row_starts: csv.slice(0, 60) }); }

{ const { proj, run } = variant(() => {});
  validate(proj, run);
  const review = read(path.join(run, 'review.json'));
  rec('unbound-result', 'review.json does not say which DSM it was checked against, and its name says "review" though no person reviewed anything (AQE\'s pipeline counts it as the reviewed stage)', 'validate the golden run, read review.json', { review_keys: Object.keys(review) }); }

{ const { proj, run } = variant(() => {});
  fs.rmSync(path.join(proj, 'dsm', 'dsm.json'));
  rec('no-dsm-exit', 'no DSM exits 1 (QAMaster: fail) instead of blocked', 'remove dsm/dsm.json; testgen validate', validate(proj, run)); }

console.log(JSON.stringify(runs, null, 2));
