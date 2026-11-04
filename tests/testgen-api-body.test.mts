/**
 * 0.4.1 A12 (AgentMesh run): an API step's test_data keys must appear in the code the case cites (the request model),
 * so an invented field such as workflow_type is a finding.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { domainRefs } from '../plugin/src/testgen/domain-refs.mts';
import { Facts } from '../plugin/src/testgen/facts.mts';
import { type Manifest, type TestCase, validate } from '../plugin/src/testgen/validate.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = path.join(ROOT, 'tests/fixtures/testgen');
const AUT = path.join(ROOT, 'tests/fixtures/knowledge/shop/aqe');
const PLUGIN_SKILLS = path.join(ROOT, 'plugin/skills');
const DOMAIN = domainRefs(PLUGIN_SKILLS);
const read = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const text = (f: string) => fs.readFileSync(f, 'utf8');

const SCHEMAS = [
  'class StartWorkflowRequest(BaseModel):',
  '    model_config = ConfigDict(extra="forbid")',
  '    conversation_id: str',
  '    goal: str',
  '    approval_required: bool = False',
  '',
].join('\n');
const FILES: Record<string, string> = {
  'shop:app/schemas.py': `${'\n'.repeat(10)}${SCHEMAS}`,
  'shop:app/orchestration.py': 'def start(request):\n    return request\n',
};

function facts(): Facts {
  const dsm: Dsm = read(path.join(ROOT, 'tests/fixtures/dsm/shop/dsm.expected.json'));
  return new Facts({
    dsm,
    codeFiles: [
      ...Object.keys(read(path.join(ROOT, 'tests/fixtures/dsm/shop/code-model.json')).files),
      ...Object.keys(FILES),
    ],
    settings: {},
    app: 'Shop',
    autSkills: fs.readdirSync(AUT),
    domainSkills: DOMAIN.names,
    skill: (name) => {
      const domain = DOMAIN.read(name);
      if (domain !== null) return domain;
      for (const dir of [AUT, PLUGIN_SKILLS]) {
        const f = path.join(dir, name, 'SKILL.md');
        if (fs.existsSync(f)) return text(f);
      }
      return null;
    },
    lines: (file) => (file in FILES ? FILES[file].split('\n').length : file === 'shop:src/Cart.tsx' ? 40 : null),
    text: (file) => FILES[file] ?? null,
    requirements: () => null,
  });
}

const BODY = /test_data key|API step's request body/;
function run(patch: (tc: TestCase) => void): string[] {
  const manifest: Manifest = read(path.join(FIX, 'shop/run/manifest.json'));
  const cases: TestCase[] = read(path.join(FIX, 'shop/run/testcases.json'));
  patch(cases[0]);
  const settings = read(path.join(FIX, 'shop/testgen.json'));
  return validate(manifest, cases, facts(), settings).errors.filter((e) => BODY.test(e));
}
const api = (tc: TestCase, data: Record<string, unknown>, cites: string[]) => {
  tc.test_data = data;
  const notCode = (refs: string[] = []) => refs.filter((r) => !String(r).startsWith('code:'));
  tc.evidence = [...notCode(tc.evidence), ...cites];
  const steps = tc.steps ?? [];
  for (const st of steps) st.evidence = notCode(st.evidence);
  steps[0] = { ...steps[0], action: 'Send POST /workflows with a JSON body of the goal and the approval flag' };
  tc.steps = steps;
};

test('A12: a test_data key that is not in the cited code is a finding (TC-STRT-001)', () => {
  const f = run((tc) =>
    api(tc, { workflow_type: 'x', approval_required: true }, [
      'code:shop:app/orchestration.py:1',
      'code:shop:app/schemas.py:11',
    ]),
  );
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(
    f[0],
    /test_data key "workflow_type" isn't in the cited code \(shop:app\/orchestration\.py, shop:app\/schemas\.py\)/,
  );
});

test('A12: keys that are fields of the cited request model pass', () => {
  assert.deepEqual(
    run((tc) => api(tc, { conversation_id: 'c1', goal: 'g' }, ['code:shop:app/schemas.py:11'])),
    [],
  );
});

test('A12: a UI-only case with test_data is not checked', () => {
  assert.deepEqual(
    run((tc) => {
      tc.test_data = { workflow_type: 'x' };
    }),
    [],
  );
});

test('A12: three API steps citing the same file give one finding per key, naming the steps', () => {
  const f = run((tc) => {
    api(tc, { workflow_type: 'x' }, ['code:shop:app/schemas.py:11']);
    const steps = tc.steps ?? [];
    for (const st of steps.slice(1, 3)) st.action = 'Send GET /workflows/1 and read the status';
    assert.ok(steps.length >= 3);
  });
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /API steps 1, 2, 3/);
});

test('A12: an API step that cites no code gets a finding', () => {
  const f = run((tc) => {
    api(tc, { goal: 'g' }, []);
    tc.evidence = (tc.evidence ?? []).filter((r) => !String(r).startsWith('code:'));
    for (const st of tc.steps ?? []) st.evidence = (st.evidence ?? []).filter((r) => !String(r).startsWith('code:'));
  });
  assert.equal(f.length, 1, f.join('\n'));
  assert.match(f[0], /an API step's request body needs code: evidence for its request model/);
});

test('A12: several API steps report an invented key once, not once per step', () => {
  const f = run((tc) => {
    api(tc, { workflow_type: 'x' }, ['code:shop:app/schemas.py:11']);
    for (const st of (tc.steps ?? []).slice(1)) st.action = 'Send GET /workflows/1 and read the status';
  });
  assert.equal(f.length, 1, f.join('\n'));
});
