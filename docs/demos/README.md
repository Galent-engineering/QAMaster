# Demos

Every hands-on walkthrough of a QAMaster build, with the tester's feedback, kept so each demo teaches the next release. A walkthrough is run in a separate QA project (today `~/Downloads/DemoTest1`). Its filled-in copy, with the feedback, is kept here.

**How a demo feeds a release:**
1. Before the demo, add the walkthrough here as `<date>-<version>-<topic>.md`, with empty feedback boxes.
2. After each step, copy the tester's feedback into this file: words, scores, screenshots (next to the file, linked). Keep the record that holds findings; once its findings are in a plan, the walkthrough script can go.
3. Triage each finding into [releases.md](../releases.md) (effort, impact, what has to be decided first), and record below where it went.

## Demos

| Date | Build | App | Result | Record |
|---|---|---|---|---|
| 2026-10-30 | 0.1.0 | OWASP Juice Shop v20.3.0 | Walked to reviewed test cases; findings went to 0.2.0 | Removed 2026-11-04 (git history) |
| 2026-10-30 | 0.2.0 | Juice Shop online demo, 243 cases in ADO | Publish walkthrough, 3/5; findings went to 0.2.1 | Removed 2026-11-04 |
| 2026-11-02 | 0.2.1 | Copies of the 0.2.0 project | All 7 fixes pass; B1–B5 and E1–E7 found | Removed 2026-11-04 |
| 2026-11-02 | 0.3.0 | CheckMasterDemo (pytest) and Juice Shop (playwright-bdd) | Both flows pass; 7 bugs fixed | Removed 2026-11-04 |
| 2026-11-02 | 0.3.0 | A clean `node:24` Docker container | Both paths pass once prerequisites are in; F1–F11 went to 0.3.1 | Removed 2026-11-04 |
| 2026-11-02 | 0.3.1 | Practice Software Testing (Toolshop), ADO store | Worked end to end; T1–T5 went to 0.3.2 | [analysis](2026-11-02-toolshop-analysis.md) |
| 2026-11-04 | 0.3.2 | AgentMesh (FastAPI + Streamlit), ADO store | A1–A17 went to 0.4.1; A12 needs a re-run | [analysis](2026-11-04-0.3.2-agentmesh-feedback.md) |
| 2026-11-04 | 0.4.1 | dummy-static-website, ADO store | PASS 36 of 36; W1–W20 went to 0.4.2 | [findings](2026-11-04-0.4.1-dummy-static-website.md) |

The walkthrough scripts and run logs of the older demos were removed on 2026-11-04. Their findings are in the table below and in each release's plan; the full text is in git history before that date.

## Findings and where they went

| Demo | Finding | Went to |
|---|---|---|
| 0.1.0 step 1 | The `/` menu lists every Domain_Test_Design skill. They should be used silently, not offered to the user unless asked for by name | Moved 2026-11-02 to after 0.3.0 ([plans/0.2.1.md, Later](../plans/0.2.1.md#later)) |
| 0.1.0 step 4 | A missing ADO project showed the raw TF200016 error, not the projects that exist, with a suggested or custom name, or a local store | 0.2.0: doctor lists projects and the ways forward; publish can create the project (Q35); the file store also takes JSON (Q36, proposed). xlsx goes to 0.2.1 |
| 0.1.0 step 4 | `qam ado call` couldn't list projects (it only works inside a project) | 0.2.0: an ADO-API recipe for `qam ado call GET projects --org-level` (the flag already existed; no recipe said so) |
| 0.1.0 (seen while preparing) | The scan found 489 routes in Juice Shop instead of ~48 (`data/static/codefixes/`) | 0.2.0: `codefixes/` in the default excludes; doctor warns when an existing config lacks it |
| 0.1.0 step 7 | The requirements stage pointed to the unbuilt `qam requirements fetch`, and a skipped store kept showing an old 404 | 0.2.0: hint fixed; a skipped stage shows "marked skipped" |
| 0.2.0 prep | A "push my test cases to ADO" prompt was answered by the account-synced autonomous-qe plugin, not QAMaster's Publish skill | Open. During demos, start with `/qamaster:publish` |
| 0.2.0 publish A8 | The review was recorded when the tester said "Show dry run", not after an explicit approval | 0.2.1 A1 ([plan](../plans/0.2.1.md)) |
| 0.2.0 publish step 3 | The ADO plan name defaulted to the folder name, not `app.name` | 0.2.1 A2 |
| 0.2.0 publish A2 | The `claude-hooks` integration was named after the folder | 0.2.1 A3 |
| 0.2.0 publish step 3 | Path tags too broad: `environments/**` on 86% of cases, `Services/**` on 58%, `app/**` from files directly in `app/` | 0.2.1 A4 (shallow-folder tags), 0.3.0 B4 (the gate's shared-file rule); Q37 |
| 0.2.0 publish steps 4–5 | Smoke: 38 promised across 4 previews, 20 written (the cap is plan-wide), with no warning; a full cap isn't shown | 0.2.1 A5 |
| 0.2.0 publish step 3 | Synthetic passwords in titles went to ADO | 0.2.1 A6 (validator finding) |
| 0.2.0 publish A4, A7 | Thin form coverage: Angular forms have no `<form>` tag, and the crawl wasn't signed in (no `.env.dsm`) | After 0.3.0, first in line ([Later](../plans/0.2.1.md#later)) |
| 0.2.0 publish step 6 | A conflict doesn't say which fields differ; no command to take the store's version; a store-only edit is never reported | After 0.3.0 ([Later](../plans/0.2.1.md#later)) |
| 0.2.0 publish A4 | The public demo answered 503 (rate limiting), and the crawl was slow | Not scheduled; demos use localhost |
| 0.2.0 publish, overall | Steps 6 (conflict `--apply`) and 7 (retire) weren't run | Re-run in the 0.2.1 walkthrough |
| 0.2.1 verification B1 | Every update rewrites the ADO description (blank lines lost on the round trip), and conflicts list `description` wrongly | 0.2.2 ([plan](../plans/0.2.2.md)) |
| 0.2.1 verification B2–B3 | The credential check flags emails, hyphenated words and step `data`, and reports only the first value per text | 0.2.2 |
| 0.2.1 verification B4 | Passwords in `test_data` still reach ADO through the description | 0.2.2: masked as "(kept in the run's test data, not published)" |
| 0.2.1 verification B5 | The TestGen manifest's `generated_at` is local time marked as UTC | 0.2.2: validator finding, and the reference says UTC |
| 0.2.1 verification E1–E7 | Enhancements: cross-run smoke warning, remember `--skip-smoke`, `qam review` confirmation, and others | Later (verification) |
| 0.3.0 Docker F1–F11 | Prerequisites not checked or explained on a clean machine (setup problems as test failures, silent uv downloads, doctor gaps, a crash without git, files left in the app repo) | 0.3.1 ([plan](../plans/0.3.1.md)); decisions Q41, Q42 and a Q14 amendment |
| Toolshop run T1–T4 | A profile page taken for a sign-in page; ULID IDs not folded; the pipeline's automation-folder and script-gate stages never turn done | 0.3.2 ([releases.md](../releases.md)) |
| 0.4.1 dummy-static-website W1–W20 | Real pages dropped as a single-page app's shell, two names for the automation folder, gate settings read from the clone, messages without a next step; requests for a local store first, several destinations and a no-diff gate run | 0.4.2 items 1–10 ([plan](../plans/0.4.2.md)); Q50 proposed and the features in 0.6.0; W16 and W19 to Q49. Per finding: [the record](2026-11-04-0.4.1-dummy-static-website.md#where-each-went) |
