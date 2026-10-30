import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  expandPath,
  importedFile,
  type RepoConfig,
  type RepoSnapshot,
  type ScanConfig,
  scan,
  scanJsxRoutes,
  wanted,
} from '../plugin/src/dsm/scan.mts';
import { tmpDir } from './tmp.mts';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures/scan');

// biome-ignore lint/suspicious/noExplicitAny: fixtures are whatever AQE wrote
const read = (file: string): any => JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));

function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

/** The fixture folder as git would hand it over: paths in tree (byte) order, filtered like the adapter does. */
export function fixtureSnapshot(name: string, repo: RepoConfig, commit: string | null): RepoSnapshot {
  const dir = path.join(FIXTURES, name, 'repo');
  const paths = listFiles(dir)
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .filter((p) => wanted(p, repo));
  return { ref: 'main', commit, files: new Map(paths.map((p) => [p, fs.readFileSync(path.join(dir, p), 'utf8')])) };
}

function golden(name: string) {
  const expected = read(`${name}/code-model.expected.json`);
  const config: ScanConfig = read(`${name}/dsm-config.json`);
  const model = scan(
    config,
    (repo) => fixtureSnapshot(name, repo, expected.repos[0].commit),
    new Date(expected.generated_at),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(model)), expected);
}

test('golden: the Real World App subset', () => golden('rwa'));

test('golden: the polyglot repo, one app per framework', () => golden('polyglot'));

// ---- where QAMaster differs from AQE on purpose (fixes 2 and 3); code-model.aqe.json is AQE's own output

const routeKeys = (m: { routes: { route: string; file: string; component: string | null }[] }) =>
  m.routes.map((r) => `${r.route} ${r.file.split('/').pop()} ${r.component}`);

function differences(name: string) {
  const ours = routeKeys(read(`${name}/code-model.expected.json`));
  const aqe = routeKeys(read(`${name}/code-model.aqe.json`));
  return { added: ours.filter((k) => !aqe.includes(k)), removed: aqe.filter((k) => !ours.includes(k)) };
}

test('differs from AQE on the Real World App only by the routes fix 2 finds', () => {
  const { added, removed } = differences('rwa');
  assert.deepEqual(removed, [
    '/signup App.tsx null',
    '/signin App.tsx null',
    '/contacts TransactionsContainer.tsx null',
    '/personal TransactionsContainer.tsx null',
    '/(public) TransactionsContainer.tsx null',
  ]);
  assert.deepEqual(added, [
    '/signup App.tsx SignUpForm', // the screen is the route's child
    '/signin App.tsx SignInForm',
    '/ AppOkta.tsx null', // <SecureRoute>
    '/ PrivateRoutesContainer.tsx TransactionsContainer', // <PrivateRoute path="/(public|contacts|personal)?">
    '/public PrivateRoutesContainer.tsx TransactionsContainer',
    '/contacts PrivateRoutesContainer.tsx TransactionsContainer',
    '/personal PrivateRoutesContainer.tsx TransactionsContainer',
    '/user/settings PrivateRoutesContainer.tsx UserSettingsContainer',
    '/notifications PrivateRoutesContainer.tsx NotificationsContainer',
    '/bankaccounts PrivateRoutesContainer.tsx BankAccountsContainer', // path="/bankaccounts*"
    '/transaction/new PrivateRoutesContainer.tsx TransactionCreateContainer',
    '/transaction/:id PrivateRoutesContainer.tsx TransactionDetailContainer',
    '/contacts TransactionsContainer.tsx TransactionContactsList',
    '/personal TransactionsContainer.tsx TransactionPersonalList',
    '/ TransactionsContainer.tsx TransactionPublicList', // path="/(public)?"
    '/public TransactionsContainer.tsx TransactionPublicList',
  ]);
  const files = read('rwa/code-model.expected.json').files;
  assert.deepEqual(files['rwa:src/components/SignInForm.tsx'].owners, ['/signin'], 'AQE linked no file to a screen');
});

test('differs from AQE on the polyglot repo only by the nested route fix 3 corrects', () => {
  assert.deepEqual(differences('polyglot'), {
    added: ['/projects/:id App.jsx ProjectPage'],
    removed: ['/:id App.jsx ProjectPage'],
  });
});

test('fix 2: route children, custom route components and path patterns', () => {
  const text = `
    <Switch>
      <Route exact path="/signin"><SignInForm service={s} /></Route>
      <PrivateRoute isLoggedIn={x} exact path={"/(public|contacts)?"}>
        <TransactionsContainer />
      </PrivateRoute>
      <ProtectedRoute path="/files*"><Files /></ProtectedRoute>
      <Route path="/*"><Redirect to="/signin" /></Route>
    </Switch>`;
  assert.deepEqual(
    scanJsxRoutes(text).map((r) => `${r.route} ${r.component}`),
    [
      '/signin SignInForm',
      '/ TransactionsContainer',
      '/public TransactionsContainer',
      '/contacts TransactionsContainer',
      '/files Files',
      '/* Redirect',
    ],
  );
  assert.deepEqual(expandPath('/a/(b|c)/d'), ['/a/b/d', '/a/c/d']);
  assert.deepEqual(expandPath('/(x)?'), ['/', '/x']);
  assert.deepEqual(expandPath('/*'), ['/*'], 'a catch-all stays for normRoute to drop');
});

test('fix 3: element={<X />} no longer ends the route tag, so nesting holds', () => {
  const text = `
    <Route path="/" element={<Layout />}>
      <Route index element={<Home />} />
      <Route path="projects" element={<Projects />}>
        <Route path=":projectId" element={<Project />} />
      </Route>
    </Route>`;
  assert.deepEqual(
    scanJsxRoutes(text).map((r) => `${r.route} ${r.component}`),
    ['/ Layout', '/ Home', '/projects Projects', '/projects/:projectId Project'],
  );
});

test('fix 5: a screen owns what its component imports; the folder rule is gone', () => {
  const owners = (rel: string) => {
    const f = read('rwa/code-model.expected.json').files[`rwa:${rel}`];
    return `${f.confidence} ${f.owners.join(',')}`;
  };
  assert.equal(owners('src/components/BankAccountForm.tsx'), 'imported /bankaccounts', 'AQE guessed /signin,/signup');
  assert.equal(owners('src/machines/authMachine.ts'), 'imported /bankaccounts,/signin,/signup');
  assert.equal(owners('src/components/NavBar.tsx'), 'shared ', 'layout is rendered by the router file, not a screen');
  for (const name of ['rwa', 'polyglot']) {
    const confidences = Object.values(read(`${name}/code-model.expected.json`).files).map(
      (f) => (f as { confidence: string }).confidence,
    );
    assert.ok(!confidences.includes('inferred'), name);
  }
});

test('fix 5: a route component is found through the router file imports, whatever the file declares', () => {
  const files = new Map([
    ['src/Routes.tsx', "import Detail from './screens/DetailContainer';\nimport { List as Txns } from './screens';\n"],
    ['src/screens/DetailContainer.tsx', 'const DetailsContainer = () => null; export default DetailsContainer;'],
    ['src/screens/index.ts', "export { List } from './List';"],
  ]);
  assert.equal(importedFile('src/Routes.tsx', 'Detail', files), 'src/screens/DetailContainer.tsx');
  assert.equal(importedFile('src/Routes.tsx', 'Txns', files), 'src/screens/index.ts');
  assert.equal(importedFile('src/Routes.tsx', 'Missing', files), null);
});

// ---- through git and the CLI

const QAM = path.resolve(import.meta.dirname, '../plugin/bin/qam');
const tmp = () => tmpDir('qam-scan-');
const DATE = { GIT_AUTHOR_DATE: '2026-10-29T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-29T00:00:00Z' };

function gitIn(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.test', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...DATE },
  });
  assert.equal(r.status, 0, r.stderr);
}

/** A QA project whose dsm-config.json points at `repoPath`, relative to the project. */
function qaProject(fixture: string, repoPath: string): string {
  const qa = tmp();
  fs.mkdirSync(path.join(qa, 'config'));
  const config = read(`${fixture}/dsm-config.json`);
  config.repositories[0].path = repoPath;
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(qa, 'config/qamaster.json'), '{}');
  return qa;
}

function qamScan(qa: string) {
  const r = spawnSync(QAM, ['--repo', qa, 'dsm', 'scan'], { encoding: 'utf8' });
  const file = path.join(qa, 'dsm/code-model.json');
  return { ...r, model: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null };
}

test('qam dsm scan reads the committed repo and matches the golden output', () => {
  const qa = qaProject('polyglot', 'app');
  fs.cpSync(path.join(FIXTURES, 'polyglot/repo'), path.join(qa, 'app'), { recursive: true });
  gitIn(path.join(qa, 'app'), 'init', '-q', '-b', 'main');
  gitIn(path.join(qa, 'app'), 'add', '-A');
  gitIn(path.join(qa, 'app'), 'commit', '-qm', 'fixture');
  fs.writeFileSync(path.join(qa, 'app/react/src/Uncommitted.jsx'), '<Route path="/draft" component={Draft} />');

  const r = qamScan(qa);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Scanned 31 files: 32 routes, 34 links/);
  const expected = read('polyglot/code-model.expected.json');
  expected.repos[0].path = 'app'; // as configured
  assert.deepEqual({ ...r.model, generated_at: null }, { ...expected, generated_at: null });
});

test('fix 1: an app in a subfolder of a bigger repo is scanned as its own root', () => {
  const qa = qaProject('polyglot', 'mono/apps/web');
  const mono = path.join(qa, 'mono');
  fs.cpSync(path.join(FIXTURES, 'polyglot/repo'), path.join(mono, 'apps/web'), { recursive: true });
  fs.mkdirSync(path.join(mono, 'apps/api'));
  fs.writeFileSync(path.join(mono, 'apps/api/server.py'), "@app.route('/not-this-app')\n");
  gitIn(mono, 'init', '-q', '-b', 'main');
  gitIn(mono, 'add', '-A');
  gitIn(mono, 'commit', '-qm', 'mono');

  const { model } = qamScan(qa);
  const expected = read('polyglot/code-model.expected.json');
  assert.equal(model.repos[0].files_scanned, 31, 'AQE read 0 files here');
  assert.deepEqual(model.routes, expected.routes);
  assert.deepEqual(model.edges, expected.edges);
});

test('fix 4: a page-file app configured as its own folder gets routes from its root', () => {
  const qa = qaProject('polyglot', 'site/next');
  fs.cpSync(path.join(FIXTURES, 'polyglot/repo'), path.join(qa, 'site'), { recursive: true });
  gitIn(path.join(qa, 'site'), 'init', '-q', '-b', 'main');
  gitIn(path.join(qa, 'site'), 'add', '-A');
  gitIn(path.join(qa, 'site'), 'commit', '-qm', 'site');
  const { model } = qamScan(qa);
  assert.deepEqual(model.routes.map((r: { route: string }) => r.route).sort(), ['/', '/blog/:id', '/pricing']);
});

test('a folder outside git is read from disk', () => {
  const qa = qaProject('rwa', 'app');
  fs.cpSync(path.join(FIXTURES, 'rwa/repo'), path.join(qa, 'app'), { recursive: true });
  const { model, status } = qamScan(qa);
  assert.equal(status, 0);
  assert.deepEqual([model.repos[0].ref, model.repos[0].files_scanned], [null, 17]);
  assert.deepEqual(model.routes, read('rwa/code-model.expected.json').routes);
});

test('qam dsm scan blocks on a missing repository path and on no repositories', () => {
  const qa = qaProject('rwa', 'nowhere');
  const r = qamScan(qa);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /repository rwa: path not found: .*nowhere\. Fix the path in dsm-config\.json/);
  fs.writeFileSync(path.join(qa, 'config/dsm-config.json'), '{}');
  assert.match(qamScan(qa).stderr, /No repositories in dsm-config\.json/);
});
