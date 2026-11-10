import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { build } from '../plugin/src/dsm/build.mts';
import {
  innermostComponent,
  MOST_MIN_SCREENS,
  type RepoConfig,
  scan,
  scanJsxRoutes,
  wanted,
} from '../plugin/src/dsm/scan.mts';
import { impact } from '../plugin/src/dsm/update.mts';
import { DEFAULT_EXCLUDE } from '../plugin/src/pipeline/sources.mts';
import { derive, type PublishCase, type PublishContext } from '../plugin/src/publish/publish.mts';

// 0.7.0 item 6 (R10, R16): each screen owns its own components, not the auth plumbing.
// The fixture is shaped like finsberg/fastapi-react-app's frontend: <Authenticated><TodoList /></Authenticated>.

const DIR = path.resolve(import.meta.dirname, 'fixtures/scan/fastapi-react/repo');

function files(prefix = ''): string[] {
  return fs.readdirSync(path.join(DIR, prefix), { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? files(rel) : [rel];
  });
}

function model() {
  const repo: RepoConfig = { name: 'app', path: '<repo>', branch: 'main', include: [], exclude: DEFAULT_EXCLUDE };
  return scan({ repositories: [repo] }, (r) => ({
    ref: 'main',
    commit: null,
    files: new Map(
      files()
        .sort()
        .filter((p) => wanted(p, r))
        .map((p) => [p, fs.readFileSync(path.join(DIR, p), 'utf8')]),
    ),
  }));
}

const owners = (m: ReturnType<typeof model>, file: string) =>
  `${m.files?.[`app:frontend/src/${file}`]?.confidence} ${m.files?.[`app:frontend/src/${file}`]?.owners?.join(',')}`;

test('a route owns the component inside its wrappers, not the wrapper', () => {
  const text = `<Route path="/todo" element={<Authenticated><TodoList /></Authenticated>} />
<Route path="/a" element={<Suspense fallback={<Spinner />}><Layout><Page /></Layout></Suspense>} />
<Route path="/b" element={<Plain />} />
<Route path="/c"><Guard><Screen /></Guard></Route>`;
  assert.deepEqual(
    scanJsxRoutes(text).map((r) => `${r.route} ${r.component}`),
    ['/todo TodoList', '/a Page', '/b Plain', '/c Screen'],
  );
  assert.equal(innermostComponent('<A><B /></A>', 0), 'B');
  assert.equal(innermostComponent('<A>text<B /></A>', 0), 'A', 'text between: the wrapper is the screen');
  assert.equal(innermostComponent('<A prop={<B />} />', 0), 'A', 'an attribute value is not a child');
  assert.equal(innermostComponent('nothing here', 0), null);
});

test('a screen owns its component and the files it alone imports; the auth plumbing is shared', () => {
  const m = model();
  assert.equal(owners(m, 'views/Todo/TodoList.tsx'), 'direct /todo');
  assert.equal(owners(m, 'views/Todo/TodoCard.tsx'), 'imported /todo');
  assert.equal(owners(m, 'views/Todo/AddUpdateTodoModal.tsx'), 'imported /todo');
  assert.equal(owners(m, 'views/Todo/TodoDetail.tsx'), 'direct /todo/:id');
  assert.equal(owners(m, 'views/Profile/ProfileForm.tsx'), 'imported /profile/edit');
  assert.equal(owners(m, 'views/Login/LoginForm.tsx'), 'imported /login');
  for (const shared of [
    'services/axios.ts',
    'context/JWTAuthContext.tsx',
    'hooks/useAuth.ts',
    'utils/jwt.ts',
    'utils/session.ts',
    'components/Auth/Authenticated.tsx',
    'components/Layout/Layout.tsx',
    'App.tsx',
  ]) {
    assert.equal(owners(m, shared), 'shared ', shared);
  }
});

test('a file most screens import is shared; one only a few import is not', () => {
  assert.equal(MOST_MIN_SCREENS, 4);
  const routes = ['a', 'b', 'c', 'd', 'e'];
  const app = routes.map((r) => `<Route path="/${r}" element={<${r.toUpperCase()}Page />} />`).join('\n');
  const src = new Map<string, string>([
    [
      'src/App.tsx',
      `import { Routes } from 'react-router-dom';\n${routes.map((r) => `import ${r.toUpperCase()}Page from './${r}';`).join('\n')}\n<Routes>${app}</Routes>`,
    ],
    ...routes.map((r, i): [string, string] => [
      `src/${r}.tsx`,
      `import http from './http';\n${i < 2 ? "import chart from './chart';\n" : ''}export default function ${r.toUpperCase()}Page() {}`,
    ]),
    ['src/http.ts', 'export default {};'],
    ['src/chart.ts', 'export default {};'],
  ]);
  const repo: RepoConfig = { name: 'r', path: 'x', branch: 'main', include: [], exclude: [] };
  const code = scan({ repositories: [repo] }, () => ({ ref: null, commit: null, files: src }));
  assert.deepEqual(code.files?.['r:src/http.ts']?.owners, [], 'five of five screens');
  assert.equal(code.files?.['r:src/http.ts']?.confidence, 'shared');
  assert.deepEqual(code.files?.['r:src/chart.ts']?.owners, ['/a', '/b'], 'two of five screens');
});

test('a change to the HTTP client is a shared change; a change to a screen is that screen', () => {
  const code = model();
  assert.deepEqual(impact(['app:frontend/src/services/axios.ts'], code), {
    screens: [],
    shared: ['app:frontend/src/services/axios.ts'],
    other: [],
  });
  assert.deepEqual(impact(['app:frontend/src/views/Todo/TodoCard.tsx'], code).screens, ['/todo']);
});

test('the DSM and a publish derivation give the screen its own files and no path tag on the shared folders', () => {
  const code = model();
  const dsm = build(
    { generated_at: '', base_url: '', mode: 'full', truncated: false, pages: [], edges: [], api_calls: [] },
    code,
    { project: 'app', output_dir: 'dsm', repositories: [] },
    { now: new Date('2026-11-10T00:00:00Z') },
  );
  const todo = dsm.page.nodes.find((n) => n.id === '/todo');
  assert.deepEqual(todo?.files, [
    'app:frontend/src/views/Todo/AddUpdateTodoModal.tsx',
    'app:frontend/src/views/Todo/TodoCard.tsx',
    'app:frontend/src/views/Todo/TodoList.tsx',
  ]);
  const kase: PublishCase = {
    id: 'TC-TODO-001',
    title: 'Add a todo',
    component: 'Todo',
    category: 'Positive',
    priority: 'P1',
    objective: 'Add a todo',
    preconditions: [],
    test_data: {},
    steps: [{ screen: '/todo', action: 'Click Add todo', element: 'Add todo', expected: 'The dialog opens' }],
    expected_result: 'The todo is listed',
    evidence: ['dsm:/todo'],
  };
  const ctx: PublishContext = {
    scope: { module: 'Todo', subModule: '' },
    dsm: dsm as never,
    settings: {
      publish: { pathDepth: 3, suiteBy: 'module' },
      smoke: { max: 2, priorities: ['P1'], categories: ['Positive'] },
      owners: {},
    },
    scenarios: new Set<string>(),
  };
  const tagsAt = (pathDepth: number) =>
    derive(kase, { ...ctx, settings: { ...ctx.settings, publish: { pathDepth, suiteBy: 'module' } } }).tags.filter(
      (t) => t.startsWith('path:'),
    );
  assert.deepEqual(tagsAt(4), ['path:frontend/src/views/Todo/**']);
  const paths = tagsAt(3);
  assert.deepEqual(paths, ['path:frontend/src/views/**'], 'at the default depth, the views folder and nothing shared');
  for (const shared of ['services', 'context', 'hooks', 'utils', 'components/Auth']) {
    assert.ok(!paths.some((p) => p.includes(shared)), `no path tag on ${shared}`);
  }
});
