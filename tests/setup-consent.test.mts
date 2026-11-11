/** 0.8.0 item 8 (Q58 D10): qam setup writes ask rules for qam review and qam approve; doctor warns when they're missing. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ASK_RULES } from '../plugin/src/pipeline/setup.mts';
import { tmpDir } from './tmp.mts';

const QAM = path.resolve(import.meta.dirname, '..', 'bin/qam');
const HOME = tmpDir('qam-home-');
function qam(dir: string, ...args: string[]) {
  const r = spawnSync(QAM, ['--repo', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, QAMASTER_HOME: HOME },
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}
const settings = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));

test('the ask rules name review and approve through the CLI and the launchers, bare and with arguments', () => {
  assert.deepEqual(ASK_RULES.slice(0, 4), [
    'Bash(node *main.mts* review)',
    'Bash(node *main.mts* review *)',
    'Bash(*qam* review)',
    'Bash(*qam* review *)',
  ]);
  assert.equal(ASK_RULES.filter((r) => r.includes(' approve')).length, 4);
});

test("setup adds the ask rules, keeps the person's own rules, and a second run changes nothing", () => {
  const qa = tmpDir('qam-consent-');
  fs.mkdirSync(path.join(qa, '.claude'));
  fs.writeFileSync(
    path.join(qa, '.claude/settings.json'),
    JSON.stringify({ model: 'x', permissions: { ask: ['Bash(git push *)'], allow: ['Bash(ls *)'] } }),
  );
  const first = JSON.parse(qam(qa, '--json', 'setup', '--no-install').out);
  const step = first.steps.find((s: { step: string }) => s.step === 'Consent rules');
  assert.equal(step.status, 'updated');
  const s = settings(qa);
  assert.equal(s.model, 'x');
  assert.deepEqual(s.permissions.allow, ['Bash(ls *)']);
  assert.deepEqual(s.permissions.ask, ['Bash(git push *)', ...ASK_RULES]);
  assert.ok(s.permissions.deny.includes('Read(./.env)'), 'the deny rules are still written');
  const before = fs.readFileSync(path.join(qa, '.claude/settings.json'), 'utf8');
  const again = JSON.parse(qam(qa, '--json', 'setup', '--no-install').out);
  assert.equal(again.steps.find((x: { step: string }) => x.step === 'Consent rules').status, 'ok');
  assert.equal(fs.readFileSync(path.join(qa, '.claude/settings.json'), 'utf8'), before);
});

test('setup --check writes nothing and says the rules are missing', () => {
  const qa = tmpDir('qam-consent-');
  const r = JSON.parse(qam(qa, '--json', 'setup', '--check').out);
  assert.equal(r.steps.find((s: { step: string }) => s.step === 'Consent rules').status, 'missing');
  assert.equal(fs.existsSync(path.join(qa, '.claude/settings.json')), false);
});

test('doctor warns when the rules are missing and is quiet once setup added them', () => {
  const qa = tmpDir('qam-consent-');
  qam(qa, 'setup', '--no-install');
  const rules = path.join(qa, '.claude/settings.json');
  const withRules = fs.readFileSync(rules, 'utf8');
  const find = () =>
    (
      JSON.parse(qam(qa, '--json', 'doctor').out).checks as {
        check: string;
        ok: boolean;
        state?: string;
        detail: string;
      }[]
    ).find((c) => c.check === 'consent rules');
  assert.equal(find(), undefined);
  const s = JSON.parse(withRules);
  delete s.permissions.ask;
  fs.writeFileSync(rules, JSON.stringify(s));
  const c = find();
  assert.ok(c, 'a warning');
  assert.equal(c.state, 'unknown');
  assert.match(c.detail, /qam setup/);
});
