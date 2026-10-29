import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sameRemote } from '../plugin/src/pipeline/sources.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const QAM = path.join(ROOT, 'plugin/bin/qam');
const tmp = (p = 'qam-project-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
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
  assert.equal(qam(qa, 'doctor').status, 0);
  assert.equal(read(path.join(qa, '.qamaster/doctor.json')).ok, true);
});
