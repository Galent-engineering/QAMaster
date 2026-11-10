/**
 * 0.7.0 item 15 (Q48, K5): TestGen writes API cases. An API case cites dsm:api:<METHOD> <path>, checked against the code
 * model's kind: api routes, and the request model (code:, A12); it has no screen and needs no UI element.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Dsm } from '../plugin/src/dsm/build.mts';
import { Facts } from '../plugin/src/testgen/facts.mts';
import { type Manifest, type TestCase, type TestGenSettings, validate } from '../plugin/src/testgen/validate.mts';

const FIX = path.resolve(import.meta.dirname, '../tests/fixtures/testgen/signin');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const SCHEMAS =
  'from pydantic import BaseModel\n\n\nclass TodoCreate(BaseModel):\n    title: str\n    description: str = ""\n';
const FILES: Record<string, string> = { 'todo:server/schemas.py': SCHEMAS };

function facts(routes = read('code-model.json').routes): Facts {
  return new Facts({
    dsm: read('dsm.json') as Dsm,
    codeFiles: Object.keys(read('code-model.json').files),
    apiRoutes: routes,
    settings: {},
    app: 'Todo',
    autSkills: ['AUT_Todo', 'AUT_Todo-Auth', 'AUT_Todo-Todo'],
    domainSkills: [],
    skill: (n) => (n.startsWith('AUT_Todo') ? '# AUT\n## Screen details\n' : null),
    lines: (f) => (f in FILES ? FILES[f].split('\n').length : null),
    text: (f) => FILES[f] ?? null,
    requirements: () => null,
  });
}
const settings: TestGenSettings = {
  required_categories: [],
  require_every_screen_covered: false,
  require_every_form_positive_and_negative: false,
  require_every_journey_covered: false,
  require_report_fields: true,
};
const manifest = (): Manifest => ({ ...read('run/manifest.json'), components: ['Todo'], required_types: ['API'] });
const api = (over: Partial<TestCase> = {}): TestCase => ({
  id: 'TC-TODO-API-001',
  title: 'POST /api/todos creates a todo from a title',
  component: 'Todo',
  type: 'API',
  category: 'Positive',
  priority: 'P1',
  severity: 'High',
  sub_module: 'AUT_Todo-Todo',
  feature: 'TodoApi',
  channel: 'API',
  coverage: ['API'],
  objective: 'Create a todo through the API with a title',
  test_data: { title: 'Buy milk' },
  steps: [
    {
      action: 'POST /api/todos with the title Buy milk',
      expected: 'The response status is 201 and the body holds the title Buy milk',
      evidence: ['dsm:api:POST /api/todos'],
    },
  ],
  expected_result: 'The API answers 201 and returns the created todo with the title Buy milk',
  evidence: ['dsm:api:POST /api/todos', 'code:todo:server/schemas.py:4'],
  ...over,
});
const check = (c: TestCase, f = facts()) => validate(manifest(), [c], f, settings);

test('an API case validates with dsm:api evidence, the request model and no screen or element', () => {
  const r = check(api());
  assert.deepEqual(r.errors, []);
  assert.equal(r.status, 'pass');
});

test('a case whose DSM evidence is only dsm:api: but whose channel is not API is a finding (0.7.1)', () => {
  const r = check(api({ channel: 'Web' }));
  assert.match(
    r.errors.join('\n'),
    /TC-TODO-API-001: its DSM evidence is only dsm:api: .* channel Web.* set channel to API/,
  );
  assert.equal(r.status, 'fail');
  // a UI case that also cites a screen, and an API case, are not flagged by this check
  assert.doesNotMatch(
    check(api({ channel: 'Web', evidence: ['dsm:api:POST /api/todos', 'dsm:screen:/todo'] })).errors.join('\n'),
    /its DSM evidence is only dsm:api:/,
  );
  assert.doesNotMatch(check(api()).errors.join('\n'), /its DSM evidence is only dsm:api:/);
});

test('a route the code model does not have fails, by evidence and by the route named in a step', () => {
  const evidence = check(api({ evidence: ['dsm:api:POST /api/nope', 'code:todo:server/schemas.py:4'] }));
  assert.match(
    evidence.errors.join('\n'),
    /unverifiable evidence dsm:api:POST \/api\/nope \(API route POST \/api\/nope is not/,
  );
  const step = check(
    api({
      steps: [
        {
          action: 'PUT /api/todos with the title Buy milk',
          expected: 'The response status is 200 and the title is Buy milk',
        },
      ],
    }),
  );
  assert.match(step.errors.join('\n'), /step 1: API route PUT \/api\/todos is not in the code model/);
});

test('the verb must match: DELETE /api/todos is not the route DELETE /api/todos/:id', () => {
  const r = check(api({ evidence: ['dsm:api:DELETE /api/todos', 'code:todo:server/schemas.py:4'] }));
  assert.match(r.errors.join('\n'), /API route DELETE \/api\/todos is not/);
  const ok = check(api({ evidence: ['dsm:api:DELETE /api/todos/{id}', 'code:todo:server/schemas.py:4'] }));
  assert.deepEqual(ok.errors, [], '{id} and :id name the same route');
});

test('an API case without dsm:api evidence, or without its request model, fails', () => {
  assert.match(
    check(
      api({
        evidence: ['code:todo:server/schemas.py:4'],
        steps: [
          {
            action: 'POST /api/todos with the title Buy milk',
            expected: 'The response status is 201 and holds the title',
          },
        ],
      }),
    ).errors.join('\n'),
    /an API case needs dsm:api:<METHOD> <path> evidence/,
  );
  assert.match(
    check(api({ evidence: ['dsm:api:POST /api/todos'] })).errors.join('\n'),
    /request body needs code: evidence/,
  );
  assert.match(
    check(api({ test_data: { workflow: 'x1' } })).errors.join('\n'),
    /test_data key "workflow" isn't in the cited code/,
  );
});

test('a screen case still needs its screen and elements', () => {
  const r = check(api({ channel: 'Web', type: 'Functional', evidence: ['code:todo:server/schemas.py:4'] }));
  assert.match(r.errors.join('\n'), /step 1: no screen/);
});

test('the context pack lists the API routes and the evidence format; none for a code model without them', () => {
  const pack = JSON.parse(JSON.stringify(facts().context(null)));
  assert.deepEqual(pack.api_routes, [
    { method: 'GET', path: '/api/todos', source: 'todo:server/routes.py:10' },
    { method: 'POST', path: '/api/todos', source: 'todo:server/routes.py:18' },
    { method: 'DELETE', path: '/api/todos/:id', source: 'todo:server/routes.py:30' },
  ]);
  assert.ok(pack.evidence_formats.includes('dsm:api:<METHOD> <path>'));
  assert.ok(!('api_routes' in JSON.parse(JSON.stringify(facts([]).context(null)))));
});
