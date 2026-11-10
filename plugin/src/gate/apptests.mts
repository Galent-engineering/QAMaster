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
  // pytest: test_*.py and *_test.py, listed by each top folder that holds them (sibling folders each get a line)
  const py = new Map<string, number>();
  for (const f of all)
    if (/(^test_.*|.*_test)\.py$/.test(path.basename(f))) py.set(path.dirname(f), (py.get(path.dirname(f)) ?? 0) + 1);
  const under = (d: string, top: string) => d === top || d.startsWith(`${top}${path.sep}`);
  const pyDirs = [...py.keys()].sort();
  for (const top of pyDirs.filter((d) => !pyDirs.some((o) => o !== d && under(d, o)))) {
    const n = [...py].filter(([d]) => under(d, top)).reduce((sum, [, c]) => sum + c, 0);
    out.push(`pytest: ${files(n)} in ${rel(root, top)}`);
  }
  // jest and vitest: a package.json that names the tool; each *.test.* / *.spec.* file counts once, under the nearest
  // such package.json, and for one tool (vitest when it names both)
  const pkgs = new Map<string, string>();
  for (const pkg of all.filter((f) => path.basename(f) === 'package.json')) {
    let deps: Record<string, unknown> = {};
    try {
      const j = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      deps = { ...j.dependencies, ...j.devDependencies };
    } catch {
      continue;
    }
    const tool = ['vitest', 'jest'].find((t) => t in deps);
    if (tool) pkgs.set(path.dirname(pkg), tool);
  }
  const counts = new Map<string, number>();
  for (const f of all) {
    if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(path.basename(f))) continue;
    const owner = [...pkgs.keys()]
      .filter((d) => f.startsWith(`${d}${path.sep}`))
      .sort((a, b) => b.length - a.length)[0];
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  for (const dir of [...counts.keys()].sort())
    out.push(`${pkgs.get(dir)}: ${files(counts.get(dir) ?? 0)} in ${rel(root, dir)}`);
  return out;
}
