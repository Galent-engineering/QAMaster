/**
 * 0.7.0 items 16 and 17 (K5): the framework template's API and Mobile Web channels. `playwright test --list` and
 * bddgen need npm install (network), so the template's projects are checked statically here; the checks of
 * `qam check-scripts` run on sample folders under tests/fixtures/bdd. The generated folder's run is for a machine with
 * the packages.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { playwrightBdd, TEMPLATE } from '../plugin/src/adapters/framework-bdd.mts';
import { staticFindings } from '../plugin/src/automation/quality.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'bin/qam');
const HOME = tmpDir('qam-home-');
const qam = (dir: string, ...args: string[]) => {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
const write = (dir: string, files: Record<string, string>) => {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
};
const SAMPLE = path.join(ROOT, 'tests/fixtures/bdd/api-ok');
const KNOWN = new Set(['TC-TODO-API-001', 'TC-LOGIN-M-001']);
/** A folder as qam app create makes it, plus the sample API and Mobile Web scripts. */
function folder(): string {
  const dir = tmpDir('qam-ch-');
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  fs.cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}
const config = () => fs.readFileSync(path.join(TEMPLATE, 'playwright.config.ts'), 'utf8');

// ---- the template

test('the template has the API layers and the channel folders', () => {
  for (const f of [
    'features/api/.gitkeep',
    'features/mobile-web/.gitkeep',
    'steps/api/.gitkeep',
    'src/api/services/.gitkeep',
    'src/api/base/BaseApiClient.ts',
    'src/api/base/ApiResponse.ts',
    'src/api/state.ts',
  ])
    assert.ok(fs.existsSync(path.join(TEMPLATE, f)), f);
});

test('the template adds no package and no Allure, Logger or Retry', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(TEMPLATE, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@playwright/test', 'playwright-bdd']);
  const base = fs.readFileSync(path.join(TEMPLATE, 'src/api/base/BaseApiClient.ts'), 'utf8');
  assert.doesNotMatch(base, /allure|zod|Logger|@core/i);
  assert.match(base, /test\.info\(\)\.attach/);
});

test('the template config makes the api and mobile-chrome projects only when their folders have a feature', () => {
  const c = config();
  assert.match(c, /hasFeatures\('api'\)\s*\?/);
  assert.match(c, /name: 'api'/);
  assert.match(c, /hasFeatures\('mobile-web'\)\s*\?/);
  assert.match(c, /name: 'mobile-chrome'/);
  assert.match(c, /devices\['Pixel 7'\]/);
  assert.doesNotMatch(c, /webkit|iPhone|firefox/i, 'Chromium only (D7)');
  // D8: the phone project runs its own channel's features and no others
  assert.match(c, /features: 'features\/mobile-web\/\*\*\/\*\.feature'/);
  assert.match(c, /features: 'features\/web\/\*\*\/\*\.feature'/);
  assert.match(c, /features: 'features\/api\/\*\*\/\*\.feature'/);
  assert.match(c, /apiUrl/);
});

test('the template itself passes the static checks, apart from having no feature yet', () => {
  assert.deepEqual(staticFindings(TEMPLATE, new Set()), {
    features: ['no feature files yet: draft the scripts for the selected test cases'],
  });
});

// ---- qam app create

function created(args: string[] = []): { qa: string; dir: string; out: string } {
  const qa = tmpDir('qam-app-');
  write(qa, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Todo', url: 'http://localhost:3000' } }) });
  const r = qam(qa, 'app', 'create', ...args);
  assert.equal(r.status, 0, r.err);
  return { qa, dir: path.join(qa, 'Todo'), out: r.out };
}

test('app create --api-url records the API base URL in app.json; without it there is none', () => {
  const a = created(['--api-url', 'http://localhost:8000']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a.dir, 'app.json'), 'utf8')), {
    name: 'Todo',
    webUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8000',
  });
  for (const f of ['src/api/base/BaseApiClient.ts', 'features/api/.gitkeep', 'steps/api/.gitkeep'])
    assert.ok(fs.existsSync(path.join(a.dir, f)), f);
  const b = created();
  assert.ok(!('apiUrl' in JSON.parse(fs.readFileSync(path.join(b.dir, 'app.json'), 'utf8'))));
});

test('app create --api-url must be an http(s) URL', () => {
  const qa = tmpDir('qam-app-');
  write(qa, { 'config/qamaster.json': JSON.stringify({ app: { name: 'Todo', url: 'http://localhost:3000' } }) });
  const r = qam(qa, 'app', 'create', '--api-url', 'localhost:8000');
  assert.equal(r.status, 2);
  assert.match(r.err, /--api-url/);
});

test('app create on a folder made before 0.7.0 adds the missing template files, never overwrites, and says what it added (D9)', () => {
  const a = created();
  fs.rmSync(path.join(a.dir, 'src/api'), { recursive: true });
  fs.rmSync(path.join(a.dir, 'features/api'), { recursive: true });
  fs.writeFileSync(path.join(a.dir, 'src/fixtures.ts'), '// mine\n');
  fs.writeFileSync(path.join(a.dir, 'playwright.config.ts'), '// mine too\n');
  const r = qam(a.qa, 'app', 'create', '--api-url', 'http://localhost:8000');
  assert.equal(r.status, 0, r.err);
  assert.match(r.out, /Added to Todo\/: .*src\/api\/base\/BaseApiClient\.ts/);
  assert.match(r.out, /features\/api\/\.gitkeep/);
  assert.match(r.out, /playwright\.config\.ts .*not changed/s);
  assert.equal(fs.readFileSync(path.join(a.dir, 'src/fixtures.ts'), 'utf8'), '// mine\n');
  assert.equal(fs.readFileSync(path.join(a.dir, 'playwright.config.ts'), 'utf8'), '// mine too\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(a.dir, 'app.json'), 'utf8')).apiUrl, 'http://localhost:8000');
  // a second run has nothing to add
  assert.match(qam(a.qa, 'app', 'create').out, /already exists; left as it is/);
});

test('app create keeps an apiUrl already in app.json, and does not bring back a .gitkeep a folder has outgrown', () => {
  const a = created(['--api-url', 'http://localhost:8000']);
  fs.rmSync(path.join(a.dir, 'features/web/.gitkeep'));
  write(a.dir, { 'features/web/todo.feature': '@web\nFeature: x\n' });
  const r = qam(a.qa, 'app', 'create', '--api-url', 'http://other:9000');
  assert.equal(JSON.parse(fs.readFileSync(path.join(a.dir, 'app.json'), 'utf8')).apiUrl, 'http://localhost:8000');
  assert.ok(!fs.existsSync(path.join(a.dir, 'features/web/.gitkeep')));
  assert.match(r.out, /already exists; left as it is/);
});

// ---- check-scripts on the API and Mobile Web layers

test('sample API and Mobile Web scripts pass the static checks, and scripts() maps their TC IDs', () => {
  const dir = folder();
  assert.deepEqual(staticFindings(dir, KNOWN), {});
  assert.deepEqual([...playwrightBdd.scripts(dir)].sort(), [
    ['TC-LOGIN-M-001', ['features/mobile-web/login.feature']],
    ['TC-TODO-API-001', ['features/api/todos.feature']],
  ]);
});

test('an API step that calls request.fetch (or any request method) directly is a finding', () => {
  const dir = folder();
  write(dir, {
    'steps/api/todos.api.steps.ts':
      "import { When } from '../../src/fixtures';\nimport { TodoService } from '../../src/api/services/TodoService';\nWhen('I list the todos', async ({ request }) => {\n  new TodoService(request);\n  await request.fetch('/api/todos');\n  await request.get('/api/todos');\n});\n",
  });
  const f = staticFindings(dir, KNOWN);
  assert.match(
    (f.api ?? []).join('\n'),
    /steps\/api\/todos\.api\.steps\.ts:5: calls request\.fetch directly; call a service/,
  );
  assert.match((f.api ?? []).join('\n'), /todos\.api\.steps\.ts:6: calls request\.get directly/);
});

test('an API step file that imports no service, a service that is not a BaseApiClient, and an unused service are findings', () => {
  const dir = folder();
  write(dir, {
    'steps/api/other.api.steps.ts': "import { When } from '../../src/fixtures';\nWhen('I wait', async () => {});\n",
    'src/api/services/LooseService.ts': 'export class LooseService {}\n',
    'src/api/services/UnusedService.ts':
      "import { BaseApiClient } from '../base/BaseApiClient';\nexport class UnusedService extends BaseApiClient {}\n",
  });
  const out = (staticFindings(dir, KNOWN).api ?? []).join('\n');
  assert.match(out, /steps\/api\/other\.api\.steps\.ts: does not use a service from src\/api\/services\//);
  assert.match(out, /src\/api\/services\/LooseService\.ts: a service extends BaseApiClient/);
  assert.match(out, /src\/api\/services\/UnusedService\.ts: no step uses it/);
});

test('a service may not call the request context directly either', () => {
  const dir = folder();
  write(dir, {
    'src/api/services/TodoService.ts':
      "import { BaseApiClient } from '../base/BaseApiClient';\nexport class TodoService extends BaseApiClient {\n  create(title: string) { return this.request.fetch('/api/todos', { data: { title } }); }\n}\n",
  });
  assert.match((staticFindings(dir, KNOWN).api ?? []).join('\n'), /TodoService\.ts:3: calls request\.fetch directly/);
});

test("a feature in a channel folder carries that channel's tag", () => {
  const dir = folder();
  write(dir, {
    'features/api/todos.feature':
      '@web\nFeature: Todos API\n  @TC-TODO-API-001\n  Scenario: x\n    When I create a todo with the title "a"\n',
    'features/mobile-web/login.feature':
      '@web\nFeature: Login\n  @TC-LOGIN-M-001\n  Scenario: x\n    Given I open the path "/login"\n',
  });
  const out = (staticFindings(dir, KNOWN).features ?? []).join('\n');
  assert.match(out, /features\/api\/todos\.feature: a feature in features\/api should be tagged @api/);
  assert.match(
    out,
    /features\/mobile-web\/login\.feature: a feature in features\/mobile-web should be tagged @mobile-web/,
  );
});

test('a service imported with double quotes or a .ts extension counts as used', () => {
  const dir = folder();
  write(dir, {
    'steps/api/notes.api.steps.ts':
      'import { When } from "../../src/fixtures";\nimport { NoteService } from "../../src/api/services/NoteService.ts";\nWhen("I list the notes", async ({ request }) => {\n  await new NoteService(request).list();\n});\n',
    'src/api/services/NoteService.ts':
      "import { BaseApiClient } from '../base/BaseApiClient';\nexport class NoteService extends BaseApiClient {}\n",
  });
  const out = (staticFindings(dir, KNOWN).api ?? []).join('\n');
  assert.doesNotMatch(out, /notes\.api\.steps\.ts: does not use a service/);
  assert.doesNotMatch(out, /NoteService\.ts: no step uses it/);
});
