/**
 * plugin/ is exactly what an install copies (Q2), so it must be ready to zip and ship at any time (Q45): a hosted plugin
 * may not ship a top-level bin/ (Claude desktop's upload refuses it), and nothing local, generated or secret may sit in it.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const PLUGIN = path.resolve(import.meta.dirname, '..', 'plugin');

/** File and folder names that never ship, with the reason the failure gives. */
const NEVER: [RegExp, string][] = [
  [/^node_modules$/, 'installed packages: the plugin has no runtime dependencies'],
  [/^\.env(\..*)?$/, 'a settings file that can hold secrets (Q16)'],
  [/^\.DS_Store$/, 'macOS folder metadata'],
  [/\.(log|tmp)$/, 'a log or temporary file'],
  [/^\.qamaster$/, "a QA project's local state"],
];

function walk(dir: string, found: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    found.push(p);
    if (e.isDirectory() && !/^(node_modules|\.qamaster)$/.test(e.name)) walk(p, found);
  }
  return found;
}

test('plugin/ has no top-level bin/: Claude desktop refuses hosted plugins that ship executables (Q45)', () => {
  assert.equal(
    fs.existsSync(path.join(PLUGIN, 'bin')),
    false,
    'plugin/bin/ exists. Hosted plugins may not ship bin/ executables; keep dev wrappers in the repo-root bin/.',
  );
});

test('plugin/ holds nothing local, generated or secret, so it can be zipped at any time', () => {
  const bad = walk(PLUGIN).flatMap((p) => {
    const hit = NEVER.find(([re]) => re.test(path.basename(p)));
    return hit ? [`${path.relative(PLUGIN, p)}: ${hit[1]}`] : [];
  });
  assert.deepEqual(bad, [], `remove these from plugin/:\n${bad.join('\n')}`);
});

test('plugin/ has no git-ignored files: a zip made from the folder would carry them', () => {
  const r = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', '.'], {
    cwd: PLUGIN,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const ignored = r.stdout.split('\n').filter(Boolean);
  assert.deepEqual(ignored, [], `remove these ignored files from plugin/:\n${ignored.join('\n')}`);
});

test("no skill, agent or command description has XML-like tags: Claude desktop's upload refuses them", () => {
  const files = ['skills', 'agents', 'commands'].flatMap((d) => {
    const dir = path.join(PLUGIN, d);
    if (!fs.existsSync(dir)) return [];
    return walk(dir).filter((f) => f.endsWith('.md') && (d !== 'skills' || path.basename(f) === 'SKILL.md'));
  });
  const bad = files.flatMap((f) => {
    const front = fs.readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    const desc = front.match(/^description:(.*(?:\n[ \t]+.*)*)/m)?.[1] ?? '';
    return /<[^>]*>/.test(desc) ? [`${path.relative(PLUGIN, f)}: ${desc.match(/<[^>]*>/)?.[0]}`] : [];
  });
  assert.deepEqual(bad, [], `use {Name} instead of <Name> in these descriptions:\n${bad.join('\n')}`);
});
