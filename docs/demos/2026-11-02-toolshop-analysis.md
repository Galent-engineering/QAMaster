# Toolshop run: analysis of the results you brought back

> **Update 2026-11-03:** the folders this analysis reads (`DemoTest-Toolshop-internal`, `DemoTest-Toolshop-app` and its local remote) were deleted in the Downloads cleanup. The findings, counts and quotes below are kept as written, but the paths no longer exist. See [plans/0.3.2.md, Cleanup](../plans/0.3.2.md#cleanup).

On 2026-11-02 a full run of QAMaster 0.3.1 on Practice Software Testing ("Toolshop") was done outside this session: the QA project (`~/Downloads/DemoTest-Toolshop-internal`) and the app clone (`~/Downloads/DemoTest-Toolshop-app`), with Azure DevOps as the store. The hand-written summary is `reports/output/toolshop-walkthrough-report.html` in the QA project.

Claude analysed those files without re-running anything. It read the report, the DSM files, the crawl log, `doctor.json`, the git history and `qam pipeline status` (read-only), then checked each oddity against QAMaster's code.

A subagent that was also running Toolshop in scratch was stopped. It had not got past the DSM, and its scratch project has no ledger, so it published nothing to ADO.

## What worked (live, on an app QAMaster had not seen)

| | Evidence |
|---|---|
| The whole loop ran on ADO: project, plan, suites and 13 cases created, then the automation links and `Script:` lines applied | doctor: "Azure DevOps sarvagyameel/Toolshop: 13 test case(s) in the plan" |
| **Publishing again changes nothing on live ADO** (0.2.2 B1) | "A publish dry run reported all 13 unchanged." This is the first live proof. The 0.2.1 dry runs showed a description change on every case |
| **Scripts are kept, not redrafted, once published** (0.3.0 case-hash fix) | The second gate plan "reused all 13 ADO-linked cases with no draft or update proposal" |
| **`qam doctor` checks what the gate needs** (0.3.1 F4) | doctor lists `runner playwright-bdd`, `runner playwright-bdd browser` (Chromium starts) and `app URL` (HTTP 200) |
| **A subfolder of a monorepo works (watch-for U1)** | "sprint5/UI is the folder sprint5/UI of a bigger repository; routes start at this folder" |
| **Forms were captured (known limitation K1 did not bite here)** | 23 forms and 83 fields from 43 pages. Toolshop's Angular forms sit inside `<form>` tags |
| Two gates passed 13 of 13 in 6.5 s of case time, and the push hook blocked before a pass and allowed after | The report's results table |
| A new script that failed was caught on the first run | 11 of 13 passed first. Two search assertions read the input after a successful submit had cleared it, and were reordered |

## Issues found, confirmed against the code

| # | Issue | Evidence | Impact | Fix | Effort |
|---|---|---|---|---|---|
| T1 | **The crawl treats a profile page as a sign-in page.** `isSignInPage` returns true for any page with a visible password field. Toolshop's `/account/profile` has a change-password form | Crawl log: "sign-in page at http://localhost:4200/account/profile", then `locator.fill: Timeout 30000ms exceeded`. Eleven pages later every navigation fails with "browser has been closed". The close's own cause is not confirmed | High: a signed-in crawl is cut short, so screens are missing | A password field means "sign-in page" only on the known login route or a sign-in-named route, or after a redirect from a page that needed login. A form on any other page is just a form (`plugin/src/dsm/crawl-rules.mts`, `isSignInPage`) | S |
| T2 | **ULID IDs aren't folded into `:id` by default.** The project template folds UUIDs and numbers only. Toolshop's product and invoice IDs are ULIDs (26 characters, Crockford base32) | Run 2 crawled every product and invoice page: 87 pages, "112 screens, 468 relations, 1,118 elements". With a ULID rule added to the config, run 3 had 43 pages and 67 screens (`dsm/state.json`: `runs: 3`) | High on data-heavy apps: crawl time, and a bloated DSM that feeds TestGen | Add the ULID pattern (and the 24-hex ObjectId) to `plugin/templates/project/config/dsm-config.json`. Doctor's "config defaults" warning tells older projects to add it. A crawl that sees many sibling pages differing only in an ID-like segment could suggest the rule (the ID-dedupe item, S1, in Later) | XS, S for the hint |
| T3 | **The pipeline says the automation folder doesn't exist when it does.** Stage 10 looks for `.aut-app.json`, which was Autonomous-QE's marker. `qam app create` writes `app.json` | `pipeline status`: "10. Automation folder pending: Toolshop/ not created", while `Toolshop/app.json` is there | Medium: wrong status for everyone who uses `qam app create` | Look for `app.json` (`plugin/src/pipeline/pipeline.mts`, around line 238) | XS |
| T4 | **The pipeline says the script gate was never run.** Stage 13 reads `.qamaster/check-scripts.json`, which nothing writes | `pipeline status`: "13. Script gate pending: not run yet", although `qam check-scripts` passed. A grep of `plugin/src` finds only the reader | Medium: same as T3 | `qam check-scripts` writes `{status, at}` there, or the stage reads the gate's verdicts instead | XS |
| T5 | **Optional automation stages show as pending** (this is K10: stages 10–13 are optional since `/qamaster:check` drafts scripts) | Same status output | Low | Show them as "on demand" once the folder exists, or hide them | S |

## Not a QAMaster bug

- **"DSM count mismatch"** (the report's open item). The report quotes run 2 (112 screens), and `qam pipeline status` reads the latest `dsm.json` from run 3 (67 screens, 305 relations, 43 crawled pages plus 49 routes from the code). The report should have cited run 3. Fix the report, not QAMaster.
- **Two scripts failing on the first run.** That's what "new script failed" is for. It's a script problem found by the first run, then fixed.

## Not verified here

- **The ADO side.** I can't read the ADO project: no token was used. The 13 cases, links and `Script:` lines rest on doctor's count and the report's "13 unchanged". Check the project in ADO.
- **The push hook.** The report says it blocked and then allowed. The first app commit "had already reached" the local remote before the gating step, so it wasn't active then. Whether the hook fired inside Claude Code or was fed an event is not stated.
- **Where the browser close came from** (T1). The crawl log shows the order of events, not the cause.
- **Pipeline stage 14** ("First gate run") showed "no verdict yet" when I ran status on the copy, while the report calls it done. Verdicts live in the app repo, and the copy's app path points elsewhere. Likely an artefact of copying the folders.
- **Forms with no `<form>` tag, lazy-loaded routes and Material controls** (K1, U2, U3). Nothing in these files tests them.

## Where each went

| Finding | Went to |
|---|---|
| T1, T2, T3, T4 | 0.3.2 ([releases.md](../releases.md)): bug fixes |
| T5 | 0.3.2, with K10 |
| The crawl speed (S1–S7), including the ETA projector | [plan 0.2.1 Later](../plans/0.2.1.md#later). T2 is S1's first, cheapest part |
| Report claims to reconcile | The report in the QA project: cite run 3's 67 screens and 305 relations |

## Reading list

- The hand-written report: `reports/output/toolshop-walkthrough-report.html` in the QA project.
- The crawl logs it kept: `reports/evidence/dsm-run2.log` there.
- The generic walkthrough: [2026-11-02-0.3.2-unknown-app.md](2026-11-02-0.3.2-unknown-app.md).
