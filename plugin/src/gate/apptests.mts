/**
 * The app's own test suites (0.6.0, R1/R4/R17): pytest, jest and vitest found in a code source. QAMaster only says they
 * exist; the gate runs the test cases in the plan, never these. Each result reads "<tool>: N test file(s) in <folder>".
 */
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', '.next', 'coverage']);
const DEPTH = 4;

function walk(dir: string, depth = 0): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // not a folder, or not readable: no suite to name
  }
  return entries.flatMap((e) =>
    e.isDirectory()
      ? depth < DEPTH && !SKIP.has(e.name)
        ? walk(path.join(dir, e.name), depth + 1)
        : []
      : [path.join(dir, e.name)],
  );
}

const files = (n: number) => `${n} test file${n === 1 ? '' : 's'}`;
const rel = (root: string, dir: string) => path.relative(root, dir) || '.';

export function findAppTests(root: string): string[] {
  const all = walk(root);
  const out: string[] = [];
  // pytest: test_*.py and *_test.py, listed by the folder that holds them
  const py = new Map<string, number>();
  for (const f of all)
    if (/(^test_.*|.*_test)\.py$/.test(path.basename(f))) py.set(path.dirname(f), (py.get(path.dirname(f)) ?? 0) + 1);
  const pyDirs = [...py.keys()].sort();
  const top = pyDirs.length ? pyDirs.reduce((a, b) => (a.length <= b.length ? a : b)) : null;
  if (top) {
    const inTop = [...py].filter(([d]) => d === top || d.startsWith(`${top}${path.sep}`));
    out.push(`pytest: ${files(inTop.reduce((n, [, c]) => n + c, 0))} in ${rel(root, top)}`);
  }
  // jest and vitest: a package.json that names the tool, and the *.test.* / *.spec.* files below it
  for (const pkg of all.filter((f) => path.basename(f) === 'package.json')) {
    let deps: Record<string, unknown> = {};
    try {
      const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      deps = { ...j.dependencies, ...j.devDependencies };
    } catch {
      continue;
    }
    const dir = path.dirname(pkg);
    for (const tool of ['vitest', 'jest']) {
      if (!(tool in deps)) continue;
      const n = all.filter(
        (f) => f.startsWith(`${dir}${path.sep}`) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(f)),
      ).length;
      if (n) out.push(`${tool}: ${files(n)} in ${rel(root, dir)}`);
    }
  }
  return out;
}
