// Writes setup.aqe.json and pipeline/status.aqe.json: node aqe-goldens.mjs <absolute aqe.mts> <absolute tests/fixtures/setup>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [AQE, FIX] = process.argv.slice(2); // aqe.mts, tests/fixtures/setup
const aqe = (dir, ...args) => {
  const r = spawnSync(process.execPath, [AQE, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, AQE_PROJECT_DIR: dir } });
  return JSON.parse(r.stdout.replaceAll(dir, '<project>'));
};
const write = (f, data) => fs.writeFileSync(path.join(FIX, f), `${JSON.stringify(data, null, 2)}\n`);

// setup --no-install on an empty folder; tool versions and the plugin folder vary by machine
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-golden-'));
const s = aqe(empty, 'setup', '--no-install', '--json');
for (const st of s.steps) if (['Node.js', 'npm', 'git'].includes(st.step)) st.detail = '<version>';
write('setup.aqe.json', { status: s.status, steps: s.steps });

// pipeline status on a copy of the fixture project, with Playwright present
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-golden-'));
fs.cpSync(path.join(FIX, 'pipeline', 'project'), proj, { recursive: true });
fs.mkdirSync(path.join(proj, 'node_modules', 'playwright'), { recursive: true });
fs.writeFileSync(path.join(proj, 'node_modules', 'playwright', 'package.json'), '{}');
const p = aqe(proj, 'pipeline', 'status', '--json');
write('pipeline/status.aqe.json', p);
