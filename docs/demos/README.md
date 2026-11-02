# Demos

Every hands-on walkthrough of a QAMaster build, with the tester's feedback, kept so each demo teaches the next release. A walkthrough is run in a separate QA project (today `~/Downloads/DemoTest1`). Its filled-in copy, with the feedback, is kept here.

**How a demo feeds a release:**
1. Before the demo, add the walkthrough here as `<date>-<version>-<topic>.md`, with empty feedback boxes.
2. After each step, copy the tester's feedback into this file: words, scores, screenshots (next to the file, linked).
3. Triage each finding into [releases.md](../releases.md) (effort, impact, what has to be decided first), and record below where it went.

## Demos

| Date | Build | App | Walkthrough | Status |
|---|---|---|---|---|
| 2026-10-30 | 0.1.0 | OWASP Juice Shop v20.3.0 | [setup to reviewed test cases](2026-10-30-0.1.0-juice-shop.md) | Done through step 9. Feedback written for steps 1 and 4 |
| 2026-10-30 | 0.2.0 | Juice Shop online demo, app `JuiceShopOnline`, 243 cases in ADO | [publish](2026-10-30-0.2.0-publish.md), [feedback](2026-10-30-0.2.0-publish-feedback.md) | Steps 0–5 and 8 done, step 6 part 1, step 7 not run. Score 3/5 |
| 2026-11-02 | 0.2.1 | Copies of the 0.2.0 project (ADO read-only, plus the file store) | [verification](2026-11-02-0.2.1-verification.md), run by Claude | All 7 fixes pass. 5 bugs (B1–B5) and 7 enhancements noted. Score 4/5 |
| 2026-11-02 | 0.3.0 (unreleased) | CheckMasterDemo (pytest), local Juice Shop v20.3.0 (playwright-bdd) | [end to end](2026-11-02-0.3.0-end-to-end.md), run by Claude | D3 and D4 pass. 7 bugs found and fixed with tests |
| 2026-11-02 | 0.3.0 | The same two flows in a clean `node:24-bookworm-slim` container | [Docker end to end](2026-11-02-0.3.0-docker-e2e.md), run by Claude; reproduce with `scripts/docker-e2e/run.sh` | Both paths pass once the prerequisites are in. 11 findings (F1–F11), not fixed |

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
| 0.2.1 verification E1–E7 | Enhancements: cross-run smoke warning, remember `--skip-smoke`, `qam review` confirmation, and others | Later ([verification](2026-11-02-0.2.1-verification.md#enhancements-for-later)) |
