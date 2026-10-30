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
| 2026-10-30 | 0.2.0 | Juice Shop, the reviewed Address run | [publish](2026-10-30-0.2.0-publish.md) | Not started |

## Findings and where they went

| Demo | Finding | Went to |
|---|---|---|
| 0.1.0 step 1 | The `/` menu lists every Domain_Test_Design skill. They should be used silently, not offered to the user unless asked for by name | 0.2.1 (releases.md) |
| 0.1.0 step 4 | A missing ADO project showed the raw TF200016 error, not the projects that exist, with a suggested or custom name, or a local store | 0.2.0: doctor lists projects and the ways forward; publish can create the project (Q35); the file store also takes JSON (Q36, proposed). xlsx goes to 0.2.1 |
| 0.1.0 step 4 | `qam ado call` couldn't list projects (it only works inside a project) | 0.2.0: an ADO-API recipe for `qam ado call GET projects --org-level` (the flag already existed; no recipe said so) |
| 0.1.0 (seen while preparing) | The scan found 489 routes in Juice Shop instead of ~48 (`data/static/codefixes/`) | 0.2.0: `codefixes/` in the default excludes; doctor warns when an existing config lacks it |
| 0.1.0 step 7 | The requirements stage pointed to the unbuilt `qam requirements fetch`, and a skipped store kept showing an old 404 | 0.2.0: hint fixed; a skipped stage shows "marked skipped" |
| 0.2.0 prep | A "push my test cases to ADO" prompt was answered by the account-synced autonomous-qe plugin, not QAMaster's Publish skill | Open. During demos, start with `/qamaster:publish` |
