import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { sameRemote } from '../plugin/src/pipeline/sources.mts';
import { tmpDir } from './tmp.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'plugin/bin/qam');
const tmp = (p = 'qam-project-') => tmpDir(p);
const HOME = tmp('qam-home-');

function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const json = (dir: string, ...args: string[]) => JSON.parse(qam(dir, '--json', ...args).out);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

function gitRepo(
  dir: string,
  files: Record<string, string> = { 'src/App.jsx': '<Route path="/home" component={Home} />\n' },
) {
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  const g = (...a: string[]) =>
    assert.equal(spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.test', ...a]).status, 0);
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-qm', 'init');
}

test('setup creates the project, is safe to re-run, and never overwrites an edited config', () => {
  const qa = tmp();
  const first = qam(qa, 'setup', '--no-install');
  assert.equal(first.status, 0, first.err);
  for (const f of [
    '.qamaster/plugin.json',
    '.qamaster/bin/qam.mjs',
    '.qamaster/bin/qam',
    'config/qamaster.json',
    'config/dsm-config.json',
    '.gitignore',
    'package.json',
  ]) {
    assert.ok(fs.existsSync(path.join(qa, f)), f);
  }
  assert.equal(read(path.join(qa, 'package.json')).devDependencies.playwright, '1.64.1');
  assert.deepEqual(read(path.join(qa, '.claude/settings.json')).permissions.deny, [
    'Read(./.env)',
    'Read(./.env.*)',
    'Read(./dsm/.auth/**)',
  ]);
  assert.match(fs.readFileSync(path.join(qa, '.gitignore'), 'utf8'), /^dsm\/\.auth\/$/m);
  assert.equal(read(path.join(qa, 'config/dsm-config.json')).application.base_url, '', 'the app is never pre-set');
  assert.match(first.out, /Entry points: tick the tools/);

  const edited = path.join(qa, 'config/qamaster.json');
  fs.writeFileSync(edited, JSON.stringify({ smoke: { max: 5 } }));
  const again = json(qa, 'setup', '--no-install');
  assert.ok(
    again.steps
      .filter((s: { step: string }) => s.step !== 'npm install')
      .every((s: { status: string }) => s.status === 'ok'),
    'nothing to add',
  );
  assert.deepEqual(read(edited), { smoke: { max: 5 } }, 'the edited config is kept');

  const check = qam(qa, 'setup', '--check');
  assert.equal(check.status, 2, 'blocked: Playwright is not installed');
  assert.match(check.out, /missing +npm install/);
});

test('the launcher runs the plugin CLI from a terminal', () => {
  const qa = tmp();
  qam(qa, 'setup', '--no-install');
  const r = spawnSync(path.join(qa, '.qamaster/bin/qam'), ['version'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^qam \d+\.\d+\.\d+/);
});

test('setup takes the app URL and a local git folder, and records the branch', () => {
  const qa = tmp();
  gitRepo(path.join(qa, 'app'));
  const r = json(
    qa,
    'setup',
    '--no-install',
    '--app',
    'Shop',
    '--url',
    'https://shop.example.test/',
    '--source',
    'app',
  );
  assert.equal(r.result, 'incomplete', 'Playwright is not installed (fix 2)');
  const dsm = read(path.join(qa, 'config/dsm-config.json'));
  assert.equal(dsm.application.base_url, 'https://shop.example.test/');
  assert.deepEqual(
    dsm.repositories.map((x: { name: string; path: string; branch: string }) => [x.name, x.path, x.branch]),
    [['app', 'app', 'main']],
  );
  assert.equal(read(path.join(qa, 'config/qamaster.json')).app.name, 'Shop');
  const scan = qam(qa, 'dsm', 'scan');
  assert.match(scan.out, /1 route/, 'the configured source scans');
});

test('setup checks each source and blocks with the fix', () => {
  const qa = tmp();
  gitRepo(path.join(qa, 'app'));
  fs.mkdirSync(path.join(qa, 'plain'));
  const cases: [string[], RegExp][] = [
    [['--source', 'nowhere'], /isn't a folder/],
    [['--source', 'app', '--branch', 'nope'], /Branch "nope" doesn't exist/],
    [
      ['--source', 'https://git.example.test/shop.git'],
      /Choose where its code is: --clone-to <new folder> .* --use-clone/,
    ],
    [
      ['--source', 'file:///nowhere/at/all.git', '--clone-to', 'x'],
      /Can't reach file:\/\/\/nowhere\/at\/all\.git with your git credentials/,
    ],
    [['--source', 'https://git.example.test/shop.git', '--use-clone', 'app'], /isn't a git clone with an origin/],
    [['--url', 'shop.example.test'], /--url must be the app's http\(s\) URL/],
    [['--branch', 'main'], /--branch, --name, --clone-to and --use-clone go with --source/],
  ];
  for (const [args, message] of cases) {
    const r = qam(qa, 'setup', '--no-install', ...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.err, message);
  }
  const plain = json(qa, 'setup', '--no-install', '--source', 'plain');
  assert.match(plain.warnings.join(), /isn't in git: it's read from disk/);
  fs.writeFileSync(path.join(qa, 'app/src/New.jsx'), 'x');
  assert.match(json(qa, 'setup', '--no-install', '--source', 'app').warnings.join(), /uncommitted changes/);
});

test('a git URL is cloned only into the chosen folder, a shallow clone is refused, an existing clone must match', () => {
  const qa = tmp();
  const origin = tmp('qam-origin-');
  gitRepo(origin);
  const url = `file://${origin}`;
  const r = json(qa, 'setup', '--no-install', '--source', url, '--clone-to', 'code');
  assert.match(r.notes.join(), /cloned file:\/\/.* into code/);
  assert.ok(fs.existsSync(path.join(qa, 'code/src/App.jsx')));
  assert.match(qam(qa, 'setup', '--no-install', '--source', url, '--clone-to', 'code').err, /already has files/);
  assert.match(
    json(qa, 'setup', '--no-install', '--source', url, '--use-clone', 'code').notes.join(),
    /using the existing clone code/,
  );
  assert.match(
    qam(qa, 'setup', '--no-install', '--source', 'https://other.example.test/x.git', '--use-clone', 'code').err,
    /is a clone of file:\/\/.*, not https:\/\/other/,
  );

  spawnSync('git', ['clone', '-q', '--depth', '1', url, path.join(qa, 'shallow')]);
  assert.match(qam(qa, 'setup', '--no-install', '--source', 'shallow').err, /shallow clone/);
});

test('sameRemote ignores .git, trailing slashes, ssh form and host case', () => {
  assert.ok(sameRemote('https://GitHub.com/galent/shop.git', 'https://github.com/galent/shop/'));
  assert.ok(sameRemote('git@github.com:galent/shop.git', 'ssh://git@github.com/galent/shop'));
  assert.ok(!sameRemote('https://github.com/galent/shop', 'https://github.com/galent/other'));
});

test('entry points: one checklist; available ones installed and recorded, the rest listed as coming', () => {
  const app = tmp();
  qam(app, 'setup', '--no-install');
  const r = json(app, 'setup', '--no-install', '--entry', 'claude-code,vscode,copilot');
  assert.deepEqual(
    r.entries.installed.map((x: { id: string }) => x.id),
    [`claude-hooks:${path.basename(app)}`],
  );
  assert.deepEqual(
    r.entries.coming.map((x: { id: string; available: string }) => `${x.id} ${x.available}`),
    ['vscode v1.1', 'copilot v2'],
  );
  const rec = read(path.join(app, '.qamaster/integrations.json')).integrations;
  assert.equal(rec[0].kind, 'claude-hooks');
  assert.deepEqual(rec[0].entries, ['claude-code']);
  assert.ok(read(path.join(HOME, 'installs.json')).repos[app], 'the user index lists the repo');

  assert.match(qam(app, 'integrations', 'add', 'claude-code').out, /Already installed/);
  assert.equal(qam(app, 'integrations', 'verify').status, 0);
  assert.match(qam(app, 'integrations', 'list', '--all').out, new RegExp(path.basename(app)));
  assert.match(qam(app, 'integrations', 'add', 'emacs').err, /Unknown entry point\(s\): emacs/);
  assert.match(qam(app, 'integrations', 'remove', `claude-hooks:${path.basename(app)}`).out, /Removed/);
  assert.deepEqual(read(path.join(app, '.qamaster/integrations.json')).integrations, []);
  assert.equal(read(path.join(HOME, 'installs.json')).repos[app], undefined);
  assert.ok(fs.existsSync(path.join(app, '.qamaster')), 'plans and verdicts are kept');
});

test('pipeline: stages from evidence, next step, marks and inputs', () => {
  const qa = tmp();
  let st = json(qa, 'pipeline', 'status');
  assert.equal(st.next, 'setup');
  assert.equal(st.stages.length, 15);
  assert.equal(st.stages.find((s: { stage: string }) => s.stage === 'context').status, 'skipped', 'v2 stage');

  qam(qa, 'setup', '--no-install');
  fs.mkdirSync(path.join(qa, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'node_modules/playwright/package.json'), '{}');
  st = json(qa, 'pipeline', 'status');
  assert.equal(st.stages[0].status, 'done');
  assert.equal(st.next, 'store');

  assert.equal(qam(qa, 'pipeline', 'mark', 'store', 'skipped', '--note', 'no ADO yet').status, 0);
  fs.mkdirSync(path.join(qa, 'dsm'));
  fs.writeFileSync(
    path.join(qa, 'dsm/dsm.json'),
    JSON.stringify({ generated_at: '2026-10-29T00:00:00+00:00', stats: { pages: 3, page_relations: 2 } }),
  );
  const next = json(qa, 'pipeline', 'next');
  assert.equal(next.next, 'knowledge', 'store skipped, DSM done from evidence');
  assert.match(qam(qa, 'pipeline', 'status').out, /Design Structure Matrix\s+done\s+3 screens/);

  assert.match(qam(qa, 'pipeline', 'mark', 'dsm', 'finished').err, /Use qam pipeline mark/);
  assert.match(qam(qa, 'pipeline', 'start').err, /Give at least one input/);
  assert.match(
    qam(qa, 'pipeline', 'start', '--url', 'https://x.test', '--channels', 'web,fax').err,
    /Unknown channel\(s\) fax/,
  );
  assert.equal(json(qa, 'pipeline', 'start', '--url', 'https://x.test').inputs.url, 'https://x.test');
  qam(qa, 'pipeline', 'reset');
  assert.equal(json(qa, 'pipeline', 'status').stages[1].status, 'pending');
});

test('doctor checks config, sources, Playwright and integrations, and records the result', () => {
  const qa = tmp();
  gitRepo(path.join(qa, 'app'));
  qam(qa, 'setup', '--no-install', '--url', 'https://shop.example.test/', '--source', 'app', '--entry', 'claude-code');
  const r = qam(qa, 'doctor');
  assert.equal(r.status, 2, 'Playwright is missing for a crawl');
  assert.match(r.out, /FIX +Playwright +not installed/);
  assert.match(r.out, /ok +source app/);
  assert.match(r.out, /ok +integration claude-hooks:/);
  fs.mkdirSync(path.join(qa, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(path.join(qa, 'node_modules/playwright/package.json'), '{}');
  // without ADO settings only the test case store needs attention, and the record says why (the pipeline reads it)
  const r2 = qam(qa, 'doctor');
  assert.equal(r2.status, 2);
  assert.match(r2.out, /ok +Playwright/);
  assert.match(r2.out, /FIX +test case store +Don't know which Azure DevOps project to use\. .*QAMASTER_ADO_ORG/);
  const record = read(path.join(qa, '.qamaster/doctor.json'));
  assert.deepEqual([record.ok, record.store.ok], [false, false]);
  const store = JSON.parse(qam(qa, '--json', 'pipeline', 'status').out).stages.find(
    (x: { stage: string }) => x.stage === 'store',
  );
  assert.match(store.evidence, /last check failed: Don't know which Azure DevOps project/);
});

// Found in the Real World App demo dry run (docs/porting-step3.md, feature 7).

test('dry run: a setup blocked by its code source writes nothing', () => {
  const qa = tmp();
  const r = qam(qa, 'setup', '--no-install', '--source', 'nowhere');
  assert.equal(r.status, 2);
  assert.deepEqual(fs.readdirSync(qa), [], 'no config, launcher or package.json');
});

test('review: a sibling source stays a relative path, so the committed config works for teammates', () => {
  const parent = tmp();
  gitRepo(path.join(parent, 'app'));
  const qa = path.join(parent, 'qa');
  fs.mkdirSync(qa);
  qam(qa, 'setup', '--no-install', '--source', '../app');
  assert.equal(read(path.join(qa, 'config/dsm-config.json')).repositories[0].path, '../app');
});

test('review: a broken config stops setup before it clones, so the same command works once it is fixed', () => {
  const origin = tmp('qam-origin-');
  gitRepo(origin);
  const qa = tmp();
  qam(qa, 'setup', '--no-install');
  const cfg = path.join(qa, 'config/dsm-config.json');
  const good = fs.readFileSync(cfg, 'utf8');
  fs.writeFileSync(cfg, '{bad');
  assert.equal(qam(qa, 'setup', '--no-install', '--source', `file://${origin}`, '--clone-to', 'code').status, 2);
  assert.ok(!fs.existsSync(path.join(qa, 'code')), 'nothing cloned');
  fs.writeFileSync(cfg, good);
  const r = qam(qa, 'setup', '--no-install', '--source', `file://${origin}`, '--clone-to', 'code');
  assert.equal(r.status, 0, r.err);
});

test('dry run and review: a missing --repo blocks every command, names --repo, and creates nothing', () => {
  const qa = tmp();
  qam(qa, 'setup', '--no-install');
  // a typo inside an existing QA project must not fall through to the parent project
  for (const typo of [path.join(tmp(), 'typo'), path.join(qa, 'confg')]) {
    for (const args of [
      ['setup', '--no-install', '--url', 'https://shop.example.test/'],
      ['setup', '--check'],
      ['doctor'],
      ['integrations', 'add', 'claude-code'],
      ['pipeline', 'status'],
    ]) {
      const r = qam(typo, ...args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.err, /doesn't exist\. Check --repo; to start a QA project there, create the folder first/);
      assert.doesNotMatch(r.err, /QAMASTER_TEST_ROOT/);
    }
    assert.ok(!fs.existsSync(typo), typo);
  }
  assert.equal(read(path.join(qa, 'config/dsm-config.json')).application.base_url, '', 'the parent is untouched');
});

test('dry run: test folders are left out of the scan, so a Cypress harness page is no screen', () => {
  const qa = tmp();
  gitRepo(path.join(qa, 'app'), {
    'src/App.jsx': '<Route path="/home" component={Home} />\n',
    'cypress/support/component-index.html': '<!DOCTYPE html><html><body><div data-cy-root></div></body></html>\n',
    // review: an app's own screens in folders named tests, and Welsh pages (.cy.html), are kept
    'src/tests/Tests.jsx': '<Route path="/tests" component={TestList} />\n',
    'site/about.cy.html': '<!DOCTYPE html><html><body><h1>Amdanom ni</h1></body></html>\n',
    'cypress/e2e/home.cy.ts': "cy.visit('/home')\n",
  });
  qam(qa, 'setup', '--no-install', '--source', 'app');
  qam(qa, 'dsm', 'scan');
  const routes = read(path.join(qa, 'dsm/code-model.json')).routes.map((r: { route: string }) => r.route);
  assert.deepEqual(routes.sort(), ['/home', '/site/about.cy.html', '/tests']);
});
