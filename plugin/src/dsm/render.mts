/**
 * Renders dsm.json as one self-contained interactive page (no external files): the DSM data replaces the
 * `/*__DATA__*\/null` placeholder in template.html, which is Autonomous-QE's dsm_template.html unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Dsm } from './build.mts';

export const TEMPLATE_FILE = path.join(import.meta.dirname, 'template.html');
const PLACEHOLDER = '/*__DATA__*/null';
const TITLE = '<title>UI Design Structure Matrix</title>';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** The page as text. Every "<" in the data is written as <, so no screen text can end or open a script tag. */
export function renderPage(dsm: Dsm, template = fs.readFileSync(TEMPLATE_FILE, 'utf8')): string {
  const data = JSON.stringify(dsm).replace(/</g, '\\u003c');
  let page = template.replace(PLACEHOLDER, () => data);
  if (dsm.project) page = page.replace(TITLE, `<title>${escapeHtml(String(dsm.project))} UI DSM</title>`);
  return page;
}

/** Writes the page through a temporary file, so a reader never sees half of it. Returns the path. */
export function render(dsm: Dsm, out: string): string {
  const tmp = `${out}.tmp`;
  fs.writeFileSync(tmp, renderPage(dsm));
  fs.renameSync(tmp, out);
  return out;
}
