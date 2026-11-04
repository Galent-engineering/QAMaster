/**
 * The shell every report shares (Q17): one self-contained page with its CSS and JS inline, light and dark through
 * prefers-color-scheme, readable at phone width, and no fetch of any kind, so it opens from a file:// URL offline.
 */

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--bg:#fff;--fg:#1c2530;--muted:#5d6b7a;--card:#f4f6f9;--line:#d9dee5;--ok:#1a7f37;--bad:#c62828;--warn:#9a6700;--info:#0b62b8}
@media(prefers-color-scheme:dark){:root{--bg:#10151b;--fg:#e4e9ef;--muted:#93a0ae;--card:#1a212a;--line:#2d3743;--ok:#4cc26a;--bad:#ff7b72;--warn:#e3b341;--info:#6cb6ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}h1{margin:.2em 0}h2{margin-top:1.8em;border-bottom:1px solid var(--line);padding-bottom:.2em}
.sub{color:var(--muted)}a{color:var(--info)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.card b{display:block;font-size:1.6em}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;white-space:nowrap}
.badge{display:inline-block;padding:0 8px;border-radius:10px;font-size:.85em;border:1px solid currentColor;white-space:nowrap}
.passed,.pass{color:var(--ok)}.failed,.fail,.broken{color:var(--bad)}.flaky,.manual,.skipped,.not_run{color:var(--warn)}
input[type=search]{width:100%;max-width:340px;padding:6px 8px;margin:8px 0;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px}
pre{background:var(--card);padding:8px;border-radius:6px;overflow-x:auto;white-space:pre-wrap}
`;

const JS = `document.querySelectorAll('input[data-filter]').forEach(function(i){i.addEventListener('input',function(){
var q=i.value.toLowerCase();document.querySelectorAll(i.dataset.filter+' tbody tr').forEach(function(r){r.hidden=q&&r.textContent.toLowerCase().indexOf(q)<0})})});`;

export function page(title: string, subtitle: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><main><h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>
${body}
</main><script>${JS}</script></body></html>
`;
}

export const section = (heading: string, body: string): string => `<h2>${esc(heading)}</h2>\n${body}\n`;

export function cards(items: [string, string | number][]): string {
  return `<div class="cards">${items.map(([k, v]) => `<div class="card"><b>${esc(v)}</b>${esc(k)}</div>`).join('')}</div>`;
}

/** A status word as a coloured badge; the class is the word with spaces as underscores. */
export const badge = (status: string): string =>
  `<span class="badge ${esc(status.replace(/\s+/g, '_').toLowerCase())}">${esc(status)}</span>`;

/** Cells are HTML already (use esc, badge, link); the filter box searches every row's text. */
export function table(id: string, head: string[], rows: string[][], empty = 'Nothing to show.'): string {
  if (!rows.length) return `<p class="sub">${esc(empty)}</p>`;
  return (
    `<input type="search" placeholder="Filter" data-filter="#${id}" aria-label="Filter rows">` +
    `<div class="tablewrap"><table id="${id}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
    '</tbody></table></div>'
  );
}

export const link = (href: string, text: string): string => `<a href="${esc(href)}">${esc(text)}</a>`;
