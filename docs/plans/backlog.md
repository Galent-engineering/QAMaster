# Backlog: every open fix and to-do, and the release it goes to

Compiled on 2026-11-04 from the plans (0.2.1 Later, 0.3.0–0.3.2), the demo findings (E, K, U, T, F), the decisions, product.md's scope, and the sessions that ran this work. Each item names where it came from. When a release ships, its items move to that plan's "What shipped" and leave this list.

Versions follow [Q46](../decisions.md): a fix-only release raises the patch (0.3.3), a release with a feature raises the minor (0.4.0), and 1.0.0 is the major release, product v1 complete. Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

## The demo path (priority since 2026-11-04)

The order below serves one goal first: a demo that runs end to end, from install to a report, on an app QAMaster hasn't seen. Each step shows what's shipped and what the demo still needs.

| # | Demo step | What the audience sees | Today | Still needed, and where |
|---|---|---|---|---|
| 1 | Install | The plugin uploaded in Claude desktop; `/qamaster:status` lists the stages | Shipped (0.3.2) | — |
| 2 | Setup | Pick the app's code and URL; setup suggests the folder | Works with flags | The three folder suggestions (Q47): 0.4.0 |
| 3 | Doctor | Every prerequisite checked, with the fix for each | Shipped | A warning when ADO settings exist but the store is local: 0.3.3 |
| 4 | Map the app (DSM) | The crawl runs with progress, then the screen map | Shipped | Forms without `<form>` (K1), a crawl that survives a closed browser and a 503: 0.3.3. An ETA in the progress line (S6): 0.4.0 |
| 5 | App knowledge | Skills that describe the app | Shipped | — |
| 6 | Requirements | Stories from Azure Boards, traced to cases | Not built | Requirements fetch: 0.5.0. Until then the demo skips this step |
| 7 | Test design and review | Cases with evidence, validated, then approved | Shipped | — |
| 8 | Publish | A preview, then the cases in the local CSV or Azure DevOps | Shipped | Status that says when cases were held back (E7): 0.3.3 |
| 9 | Gate a change | A diff, the plan, drafted scripts, approval, the run, the verdict, the push allowed | Shipped | — |
| 10 | Report | The test summary report in a browser | Not built | The test summary report and `qam report`: 0.4.0 |

## 0.3.3: fixes only (patch)

Plan: [0.3.3.md](0.3.3.md). No new command, flag, config key or file format. Demo-path fixes first.

| # | Item | Source | Effort | Demo step |
|---|---|---|---|---|
| 1 | Forms without a `<form>` tag reach the DSM: the crawler collects `looseFields` but `dsm/build.mts` drops them. Also warn when there's no `.env.dsm` (forms behind login aren't crawled) | K1, 0.2.1 Later | M + XS | 4 |
| 2 | Restart the browser when it closes mid-crawl, and find why it closed (seen on Toolshop after T1) | S5, T1 follow-up | S | 4 |
| 3 | Crawl backs off on a 503 (public demos rate-limit) | 0.2.1 Later | S–M | 4 |
| 4 | `qam doctor` warns when Azure DevOps settings exist but the store is the local file (Q44's cost: `QAMASTER_STORE=ado` is now needed) | Q44 | XS | 3 |
| 5 | Pipeline status says "done, 1 held back by a conflict" when the last apply held cases back | E7 | S | 8 |
| 6 | Hide the `Domain_Test_Design_Skill*` sub-skills from the `/` menu, so the menu shows QAMaster's own commands | 0.2.1 Later | XS | 1 |
| 7 | Setup with a new `--app` replaces the old `claude-hooks:` record instead of adding a second | E4 | XS | 2 |
| 8 | `--skip-smoke` is remembered in the ledger, so the "not offered" note stops repeating | E2 | XS | — |
| 9 | The Publish skill explains retiring a required case: add a coverage exclusion first | E5 | XS | — |
| 10 | The credential hint adapts to the value (an email is "the registered user's email", not "password") | E6 | XS | — |
| 11 | The dry run counts smoke offered by other previewed, unapplied runs | E1 | S | — |
| 12 | The Docker check runs from a plain checkout: a small pytest demo, a Juice Shop reference and a recorded QA project under `tests/fixtures/` | 0.3.2 point 9 | M | — |

Fixes from your agentmesh test join this list, demo-path ones first.

**Verify, with no code:** `/qamaster:status` in Claude desktop on the uploaded zip · the push hook from a normal desktop push, not a test event (K8) · a signed-in re-crawl on a data-heavy app, for time per page and whether the browser still closes (T1, T2).

## 0.4.0: the demo's missing pieces (minor)

Plan: [0.4.0.md](0.4.0.md). After this release the demo runs end to end, except requirements (step 6).

| # | Item | Source | Effort | Demo step |
|---|---|---|---|---|
| 1 | The test summary report from the gate's verdicts and the published cases, and `qam report`: the first of the six HTML reports | K9, Q17, product v1 | L | 10 |
| 2 | With no code folder, setup asks where, with three suggestions: this folder, the usual folder (most used in past setups), or a path you type | Q47 | S | 2 |
| 3 | An ETA in the crawl's progress line | S6 | XS–S | 4 |

## 0.5.0 to 0.8.0: the rest of product v1 (minor)

Product v1 isn't complete until these exist. Reordered on 2026-11-04 for the demo path: the test summary report moved up to 0.4.0, and the features that don't change the demo moved last.

| Release | Feature | Source | Effort |
|---|---|---|---|
| 0.5.0 | Requirements fetch (`qam requirements fetch`, stage 6) from Azure Boards, then Jira: completes demo step 6 | K4, product v1 | L |
| 0.6.0 | The other five HTML reports, and Feedback: coverage gaps, stale cases, BROKEN links, defect drafts a person files | K9, Q19, product v1 | L |
| 0.7.0 | Daily-use features: a conflict shows its fields (S); a store-only edit is reported (S); `--take-store <TC-ID…>`, which needs a decision (M); `qam review` confirms on a terminal (E3, S); selection presets and a model choice (Q31, M); DSM speed: an ID-shape hint, smarter waiting, parallel tabs, a scope option, `--estimate` (S1–S4, S7) | K7, E3, K6, S1–S4, S7 | L in all |
| 0.8.0 | Scripts for the other channels in v1: Mobile Web, API, Android, iOS | product v1, K5 | L |

## 1.0.0: the major release

Product v1 as [product.md](../product.md#v1) describes it, all of it, plus:
- the clean-room Docker run passes from a plain checkout;
- the walkthrough passes on a second unknown app (Restful Booker Platform is saved for this);
- no open High finding in [demos/](../demos/README.md);
- every decision accepted, and every doc current.

## After 1.0.0

| Release | Scope | Source |
|---|---|---|
| 1.1.0 | The git pre-push hook for any terminal; each IDE and agent set up by ticking it, hooks included (Q43); PR checks on GitHub and Azure Repos; results published back to ADO as a Test Run | product v1.1, Q43, K8 |
| 2.0.0 | Context sources through MCP; the QAMaster MCP server and exports to other AI tools; importing existing cases and gap analysis; locators from the crawl; API discovery | product v2 |
| 3.0.0 | Generate into a team's existing framework; impact and traceability matrices; root-cause evidence; value metrics; a secrets vault and security scan; a Visio MCP server | product v3 |

## Later (not scheduled)

- Field-level merge when the run and the store changed different fields (L).
- The xlsx `file` store (M); then Jira through Xray or Zephyr.
- Upgrade an old config on request (S).
- More server stacks in the code scan: Express, Laravel, Rails (K2).
- Appium crawler; Cypress, Cucumber-JVM and SpecFlow generation; a VS Code extension; Bitbucket and GitLab hosts and CI; learning from history which tests fail for which files.

## By design, not backlog

Signed-in crawls need your `.env.dsm` and block writes (K3, Q15) · a file counts as shared only in plans of 20+ cases (K12, Q37) · drafted scripts are labelled "new script failed" until a first pass, and your review of the draft is the safeguard (K11, Q39).

## Needs your answer

1. ~~**The order of 0.5.0 to 0.8.0.**~~ Accepted 2026-11-04 (requirements, reports, feedback, scripts), then **reordered the same day around the demo path:** the test summary report in 0.4.0, then requirements, the other reports with feedback, the daily-use features, and scripts for the other channels.
2. ~~**The Toolshop cases in Azure DevOps.**~~ **Decided 2026-11-04: leave them as they are.** Project Toolshop holds 13 cases from a QA project that has since been deleted, so no ledger links them, and publishing Toolshop again would create 13 more. QAMaster never deletes. Revisit when a new Toolshop QA project exists: relink them, or retire them by hand in ADO.
3. ~~**Setup using the folder you're in.**~~ **Accepted 2026-11-04 as Q47:** three suggestions (this folder, the usual folder, a path you type).
4. **Merge and push, after your agentmesh testing and its fixes (your call, 2026-11-04).** `feature/0.3.2-toolshop-fixes` is not on `main` or GitHub. Then: update `main`, and push or keep it local.

## Sessions reviewed

- **Clean-room 0.3.0 end-to-end test in Docker** (`docker-e2e-0-3-0`): reported that F1, F2 and F6 were already fixed in 0.3.1 and changed nothing. No open items.
- **The Toolshop run** (subagent): stopped before the DSM finished. It published nothing to Azure DevOps and left no scratch files. Its findings came from your own run instead (T1–T5), all fixed in 0.3.2.
- **Main session:** its items are above.
