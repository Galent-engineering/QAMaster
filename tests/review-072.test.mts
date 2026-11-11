/** 0.7.2 review fixes: each confirmed defect from the review of the first build, with the case that showed it. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { emptyListHints } from '../plugin/src/dsm/build.mts';
import { defectDrafts, propose } from '../plugin/src/feedback/feedback.mts';
import { accountVarsMissing } from '../plugin/src/gate/automate.mts';
import { decide } from '../plugin/src/gate/verdict.mts';
import type { Plan, Verdict } from '../plugin/src/shared/models.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const noAdo = { ...process.env, QAMASTER_HOME: tmpDir('qam-home-'), AZURE_CONFIG_DIR: tmpDir('qam-az-') };
for (const k of ['QAMASTER_ADO_ORG', 'QAMASTER_ADO_PROJECT', 'QAMASTER_STORE'])
  delete (noAdo as Record<string, unknown>)[k];

const plan1 = {
  id: 'p1',
  createdAt: '2026-11-11T00:00:00Z',
  change: { base: 'main', head: 'sha1', branch: 'b', files: [{ path: 'a.ts', status: 'M' }] },
  items: [
    {
      testCase: { id: 1, title: 'c', url: 'u', tags: [], automatedTest: null },
      reasons: [{ kind: 'group', detail: 'x' }],
      selected: true,
    },
  ],
  notRun: [],
  gaps: [],
  catalogSize: 3,
  otherGroups: {},
} as unknown as Plan;

test('a failed case reads the line after the runner header, not the scenario title or node id', () => {
  const bdd = decide(plan1, [
    {
      testCaseId: 1,
      status: 'failed',
      durationS: 1,
      testIds: [],
      evidence: [],
      error: 'Add a todo\nError: expect(locator) failed',
    },
  ]);
  assert.match(bdd.reasons.join('\n'), /Error: expect\(locator\) failed/);
  const py = decide(plan1, [
    {
      testCaseId: 1,
      status: 'failed',
      durationS: 1,
      testIds: [],
      evidence: [],
      error: 'tests/t.py::test_a\nFailed: DID NOT RAISE',
    },
  ]);
  assert.match(py.reasons.join('\n'), /Failed: DID NOT RAISE/);
});

const verdictWith = (error: string): Verdict => ({
  result: 'fail',
  head: 'abcdef0123456789',
  planId: 'p',
  reasons: [],
  warnings: [],
  results: [{ testCaseId: 1, status: 'failed', durationS: 1, error, testIds: [], evidence: [] }],
});
const draftsFor = (error: string) =>
  defectDrafts({ verdict: verdictWith(error), plan: null, runs: [], ledger: new Map() });

test('a defect is drafted unless every failed scenario in the error is a missing setting', () => {
  assert.equal(draftsFor('Login\nSet TODO_USER in .env').length, 0);
  assert.equal(
    draftsFor('Login works\nError: expect(page).toHaveURL failed\n\nList loads\nSet TODO_USER in .env').length,
    1,
  );
  assert.equal(draftsFor('Read\nSet the value from process.env').length, 1, 'process.env is not the .env file');
  assert.match(
    propose({
      verdict: verdictWith('Login\nSet TODO_USER in .env'),
      plan: null,
      runs: [],
      ledger: new Map(),
      screens: null,
    }).notes.join('\n'),
    /TODO_USER/,
  );
});

test('emptyListHints ignores a list that redirected or failed, and a detail screen the crawl reached another way', () => {
  const ui = (pages: object[], edges: object[] = []) => ({ pages, edges }) as never;
  const ok = (route: string) => ({ route, url: `http://a${route}`, title: route, status: 200 });
  assert.deepEqual(emptyListHints(ui([{ ...ok('/todo'), redirect_to: '/login' }]), ['/todo', '/todo/:id']), []);
  assert.deepEqual(emptyListHints(ui([{ ...ok('/todo'), error: 'timeout' }]), ['/todo', '/todo/:id']), []);
  assert.deepEqual(
    emptyListHints(ui([ok('/todo'), ok('/todo/:id')], [{ from: '/home', to: '/todo/:id', type: 'click' }]), [
      '/todo',
      '/todo/:id',
    ]),
    [],
  );
});

test('the account check: no sign-in (mode none) needs nothing, and .env.dsm no longer counts (0.8.0 item 12)', () => {
  const qa = (login: object, dsmEnv = '') => {
    const dir = tmpDir('qam-acct-');
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'config', 'dsm-config.json'), JSON.stringify({ application: { login } }));
    if (dsmEnv) fs.writeFileSync(path.join(dir, '.env.dsm'), dsmEnv);
    return dir;
  };
  const names = { username_env: 'DSM_APP_USERNAME', password_env: 'DSM_APP_PASSWORD' };
  assert.deepEqual(accountVarsMissing(qa({ mode: 'none', ...names }), {}), []);
  assert.deepEqual(accountVarsMissing(qa({ mode: 'auto', ...names }), {}), ['DSM_APP_USERNAME', 'DSM_APP_PASSWORD']);
  assert.deepEqual(accountVarsMissing(qa({ mode: 'auto', ...names }, 'DSM_APP_USERNAME=u\nDSM_APP_PASSWORD=p\n'), {}), [
    'DSM_APP_USERNAME',
    'DSM_APP_PASSWORD',
  ]);
});

test('feedback and report reject an unknown flag with one Blocked line', () => {
  const dir = tmpDir('qam-flag-');
  for (const args of [
    ['feedback', '--bogus'],
    ['report', 'all', '--bogus'],
  ]) {
    const r = spawnSync(QAM, ['--repo', dir, ...args], { encoding: 'utf8', env: noAdo });
    assert.equal(r.status, 2, r.stderr + r.stdout);
    assert.match(r.stderr, /Blocked: qam \w+: Unknown option '--bogus'/);
  }
});

test('an organization from az defaults alone keeps the message that names both QAMaster variables', () => {
  const dir = tmpDir('qam-az-org-');
  const r = spawnSync(QAM, ['--repo', dir, 'ado', 'call', 'GET', 'x'], {
    encoding: 'utf8',
    env: { ...noAdo, AZURE_DEVOPS_EXT__DEFAULTS_ORGANIZATION: 'acme-nonexistent', QAMASTER_ADO_TOKEN: 'fake' },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /QAMASTER_ADO_ORG/);
  assert.match(r.stderr, /QAMASTER_ADO_PROJECT/);
});
