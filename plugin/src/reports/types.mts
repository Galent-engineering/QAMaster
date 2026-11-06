/**
 * The six report types (Q17): test summary, test cases, execution, defects, root cause analysis, DSM. AQE's own
 * templates drew its reports in the browser from a data file; these are written whole by the builders below, which
 * keeps each report one self-contained file. A builder with no data returns `missing`, naming the input to supply.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defectDrafts, type Feedback } from '../feedback/feedback.mts';
import type { Plan, TestResult, Verdict } from '../shared/models.mts';
import { badge, cards, esc, link, page, section, table } from './html.mts';
import type { Inputs } from './inputs.mts';

export type Built = { file: string; html: string } | { missing: string };
export type ReportType = { name: string; title: string; build: (i: Inputs) => Built };

const NO_VERDICT = 'No verdict yet: run qam check in the app repo (verdicts are in .qamaster/verdicts/).';
const short = (sha: string) => sha.slice(0, 8);
const stamp = (i: Inputs) => `Generated ${i.now.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const evidenceLinks = (i: Inputs, files: string[]) =>
  files.map((f) => link(pathToFileURL(path.resolve(i.root, f)).href, path.basename(f))).join('<br>') || '—';

const titles = (plan: Plan | undefined, id: number) =>
  [...(plan?.items ?? []).map((x) => x.testCase), ...(plan?.notRun ?? []).map((n) => n.testCase)].find(
    (t) => t.id === id,
  );
const caseCell = (plan: Plan | undefined, id: number) => {
  const t = titles(plan, id);
  return `TC${id}${t ? ` ${t.url ? link(t.url, t.title) : esc(t.title)}` : ''}`;
};

function counts(v: Verdict, plan?: Plan) {
  const n = (s: TestResult['status']) => v.results.filter((r) => r.status === s).length;
  const broken = (plan?.notRun ?? []).filter((x) => x.broken).length;
  return {
    passed: n('passed'),
    failed: n('failed'),
    flaky: n('flaky'),
    notRun: n('not_run') + n('skipped'),
    broken,
    manual: (plan?.notRun ?? []).length - broken,
  };
}

function feedbackSection(fb: Feedback | undefined): string {
  if (!fb)
    return section(
      'Feedback',
      '<p class="sub">No feedback saved for this verdict. Run qam feedback to propose gaps, stale cases and defect drafts.</p>',
    );
  const list = (xs: string[]) =>
    xs.length ? `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="sub">None.</p>';
  return section(
    'Feedback: proposals only',
    `<p class="sub">Nothing here was written to the test case store or the tracker. ${esc(fb.generatedAt)}</p>` +
      list(fb.proposal.map(esc)) +
      `<h3>Coverage gaps</h3>${list(fb.gaps.map((g) => `${esc(g.screen)}: ${esc(g.why)} (changed: ${esc(g.files.join(', '))})`))}` +
      `<h3>Stale cases</h3>${list(fb.stale.map((s) => `${esc(s.localId)} ${esc(s.title)}: missing ${esc(s.missing.join(', '))}`))}` +
      `<h3>BROKEN links</h3>${list(fb.broken.map((b) => `TC${b.testCaseId} ${esc(b.title)}: ${esc(b.why)}`))}` +
      `<h3>Defect drafts</h3>${list(fb.defects.map((d) => `${esc(d.title)}: ${esc(d.actual.split('\n')[0])}`))}` +
      (fb.notes.length ? `<p class="sub">${esc(fb.notes.join(' '))}</p>` : ''),
  );
}

const summary: ReportType = {
  name: 'summary',
  title: 'Test summary',
  build(i) {
    const v = i.verdicts[0];
    if (!v) return { missing: NO_VERDICT };
    const plan = i.plans.get(v.planId);
    const c = counts(v, plan);
    const notRun = (plan?.notRun ?? []).map((n) => [
      caseCell(plan, n.testCase.id),
      badge(n.broken ? 'BROKEN' : 'manual'),
      esc(n.why),
    ]);
    const body =
      `<p>${badge(v.result)} ${esc(v.reasons.join(' '))}</p>` +
      (v.warnings.length ? `<p class="flaky">${esc(v.warnings.join(' '))}</p>` : '') +
      cards([
        ['Passed', c.passed],
        ['Failed', c.failed],
        ['Flaky', c.flaky],
        ['Not run', c.notRun],
        ['BROKEN', c.broken],
        ['Manual', c.manual],
      ]) +
      (plan
        ? `<p class="sub">${esc(plan.change.branch)}: ${esc(short(plan.change.base))}..${esc(short(plan.change.head))}, ${plan.change.files.length} file(s) changed. Approved by ${esc(plan.approvedBy ?? 'nobody')}.</p>`
        : '') +
      section(
        'Results',
        table(
          'results',
          ['Case', 'Status', 'Seconds', 'Error', 'Evidence'],
          v.results.map((r) => [
            caseCell(plan, r.testCaseId),
            badge(r.status),
            esc(r.durationS),
            r.error ? `<pre>${esc(r.error)}</pre>` : '—',
            evidenceLinks(i, r.evidence),
          ]),
          'No automated case ran.',
        ),
      ) +
      section(
        'Not run: manual and BROKEN',
        table('notrun', ['Case', 'State', 'Why'], notRun, 'Every selected case ran.'),
      ) +
      feedbackSection(i.feedback.get(v.head)) +
      section(
        'Earlier verdicts',
        table(
          'history',
          ['Commit', 'Result', 'Passed', 'Failed'],
          i.verdicts.map((x) => [
            esc(short(x.head)),
            badge(x.result),
            esc(counts(x).passed + counts(x).flaky),
            esc(counts(x).failed),
          ]),
        ),
      );
    return { file: 'test-summary-report.html', html: page(`Test summary for ${short(v.head)}`, stamp(i), body) };
  },
};

const execution: ReportType = {
  name: 'execution',
  title: 'Test execution',
  build(i) {
    if (!i.verdicts.length) return { missing: NO_VERDICT };
    const rows = i.verdicts.flatMap((v) =>
      v.results.map((r) => [
        esc(short(v.head)),
        caseCell(i.plans.get(v.planId), r.testCaseId),
        badge(r.status),
        esc(r.durationS),
        esc(r.testIds.join(', ')),
        evidenceLinks(i, r.evidence),
      ]),
    );
    const total = i.verdicts.flatMap((v) => v.results);
    const body =
      cards([
        ['Verdicts', i.verdicts.length],
        ['Executions', total.length],
        ['Failed', total.filter((r) => r.status === 'failed').length],
        ['Seconds', Math.round(total.reduce((s, r) => s + r.durationS, 0))],
      ]) +
      section(
        'Every execution',
        table(
          'exec',
          ['Commit', 'Case', 'Status', 'Seconds', 'Tests', 'Evidence'],
          rows,
          'No test ran in any verdict.',
        ),
      );
    return { file: 'test-execution-report.html', html: page('Test execution', stamp(i), body) };
  },
};

const defects: ReportType = {
  name: 'defects',
  title: 'Defects',
  build(i) {
    const v = i.verdicts[0];
    if (!v) return { missing: NO_VERDICT };
    const drafts =
      i.feedback.get(v.head)?.defects ??
      defectDrafts({ verdict: v, plan: i.plans.get(v.planId) ?? null, runs: i.runs, ledger: i.ledger });
    const rows = drafts.map((d) => [
      esc(`TC${d.testCaseId}`),
      esc(d.title),
      `<ol>${d.steps.map((s) => `<li>${esc(s.replace(/^\d+\.\s*/, ''))}</li>`).join('')}</ol>`,
      esc(d.expected),
      `<pre>${esc(d.actual)}</pre>`,
      evidenceLinks(i, d.evidence),
    ]);
    const body =
      '<p class="sub">Drafts for a person to file. QAMaster files nothing (Q17).</p>' +
      cards([['Drafts', drafts.length]]) +
      section(
        `Failed on ${short(v.head)}`,
        table(
          'defects',
          ['Case', 'Title', 'Steps', 'Expected', 'Actual', 'Evidence'],
          rows,
          'No test case failed in the latest verdict.',
        ),
      );
    return { file: 'defect-report.html', html: page('Defect drafts', stamp(i), body) };
  },
};

/** The first line of an error with numbers and quoted values blanked, so the same failure groups together. */
const signature = (e: string) =>
  e
    .split('\n')[0]
    .replace(/"[^"]*"|'[^']*'|\d+/g, '#')
    .trim()
    .slice(0, 120) || 'no error text';

const rootCause: ReportType = {
  name: 'root-cause',
  title: 'Root cause analysis',
  build(i) {
    const v = i.verdicts[0];
    if (!v) return { missing: NO_VERDICT };
    const plan = i.plans.get(v.planId);
    const failed = v.results.filter((r) => r.status === 'failed');
    const groups = new Map<string, TestResult[]>();
    for (const r of failed) groups.set(signature(r.error ?? ''), [...(groups.get(signature(r.error ?? '')) ?? []), r]);
    const changed = plan?.change.files.map((f) => f.path) ?? [];
    const rows = [...groups].map(([sig, rs]) => [
      esc(sig),
      rs.map((r) => caseCell(plan, r.testCaseId)).join('<br>'),
      esc(rs.length),
    ]);
    const body =
      '<p class="sub">Failures grouped by the shape of their error. Suspects are the files the change touched; they are where to look first, not a finding.</p>' +
      cards([
        ['Failures', failed.length],
        ['Causes', groups.size],
        ['Files changed', changed.length],
      ]) +
      section(
        'Causes',
        table('causes', ['Error shape', 'Cases', 'Count'], rows, 'No test case failed in the latest verdict.'),
      ) +
      section(
        'Suspect files',
        changed.length
          ? `<ul>${changed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
          : '<p class="sub">The plan is not on this machine.</p>',
      ) +
      section(
        'Flaky: passed on retry',
        `<p>${
          v.results
            .filter((r) => r.status === 'flaky')
            .map((r) => caseCell(plan, r.testCaseId))
            .join(', ') || 'None.'
        }</p>`,
      );
    return { file: 'root-cause-analysis-report.html', html: page('Root cause analysis', stamp(i), body) };
  },
};

const testCases: ReportType = {
  name: 'test-cases',
  title: 'Manual test cases',
  build(i) {
    const all = i.runs.flatMap((r) => r.cases.map((c) => ({ run: r.run, c })));
    if (!all.length)
      return { missing: 'No TestGen run yet: generate cases first (testgen/output/<run>/testcases.json).' };
    // the requirements a case cites (req:<id>, on the case or a step), and the saved ones no case cites
    const reqs = (c: (typeof all)[number]['c']) => [
      ...new Set(
        [...(c.evidence ?? []), ...(c.steps ?? []).flatMap((s) => s.evidence ?? [])]
          .map(String)
          .filter((e) => e.startsWith('req:'))
          .map((e) => e.slice(4)),
      ),
    ];
    const cited = new Set(all.flatMap(({ c }) => reqs(c)));
    const uncovered = i.requirements.flatMap((s) =>
      s.requirements.filter((r) => !cited.has(String(r.id))).map((r) => [esc(s.scope), esc(r.id), esc(r.title)]),
    );
    const rows = all.map(({ run, c }) => [
      esc(c.id),
      esc(c.title),
      esc(c.component),
      esc(c.priority),
      esc(c.category),
      esc(c.type),
      c.id && i.ledger.has(c.id) ? esc(`TC${i.ledger.get(c.id)}`) : badge('not published'),
      esc(reqs(c).join(', ')),
      `<ol>${(c.steps ?? []).map((s) => `<li>${esc(s.action)}${s.expected ? ` → ${esc(s.expected)}` : ''}</li>`).join('')}</ol>`,
      esc(run),
    ]);
    const published = all.filter(({ c }) => c.id && i.ledger.has(c.id)).length;
    const body =
      cards([
        ['Cases', all.length],
        ['Published', published],
        ['Runs', i.runs.length],
        ['Requirements with no case', uncovered.length],
      ]) +
      section(
        'Cases',
        table(
          'cases',
          ['ID', 'Title', 'Component', 'Priority', 'Category', 'Type', 'Store', 'Requirements', 'Steps', 'Run'],
          rows,
        ),
      ) +
      (i.requirements.length
        ? section(
            'Requirements with no test case',
            table('uncovered', ['Scope', 'ID', 'Title'], uncovered, 'Every saved requirement has a test case.'),
          )
        : '');
    return { file: 'test-case-report.html', html: page('Manual test cases', stamp(i), body) };
  },
};

const dsmReport: ReportType = {
  name: 'dsm',
  title: 'Design Structure Matrix',
  build(i) {
    const d = i.dsm;
    if (!d) return { missing: 'No DSM yet: run qam dsm run (it writes dsm/dsm.json).' };
    const flagged = d.page.nodes.filter((n) => n.flags.length);
    const mods = new Map<string, number>();
    for (const n of d.page.nodes) mods.set(n.module, (mods.get(n.module) ?? 0) + 1);
    const body =
      cards([
        ['Screens', d.stats.pages],
        ['Relations', d.stats.page_relations],
        ['Elements', d.stats.elements],
        ['Cycles', d.stats.cycles],
        ['Flagged', flagged.length],
      ]) +
      `<p class="sub">DSM built ${esc(d.generated_at)}. The interactive matrix is dsm/index.html.</p>` +
      section(
        'Modules',
        table(
          'mods',
          ['Module', 'Screens'],
          [...mods].sort().map(([m, n]) => [esc(m), esc(n)]),
        ),
      ) +
      section(
        'Flagged screens',
        table(
          'flags',
          ['Screen', 'Module', 'Flags', 'In', 'Out'],
          flagged.map((n) => [esc(n.label), esc(n.module), esc(n.flags.join(', ')), esc(n.fan_in), esc(n.fan_out)]),
          'No screen is flagged.',
        ),
      );
    return { file: 'dsm-report.html', html: page('Design Structure Matrix', stamp(i), body) };
  },
};

export const REPORT_TYPES: ReportType[] = [summary, testCases, execution, defects, rootCause, dsmReport];
