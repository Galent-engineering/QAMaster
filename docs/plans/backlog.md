# Backlog: every open fix and to-do, and the release it goes to

Compiled on 2026-11-04 from the plans (0.2.1 Later, 0.3.0–0.3.2), the demo findings (E, K, U, T, F), the decisions, product.md's scope, and the sessions that ran this work. Each item names where it came from. When a release ships, its items move to that plan's "What shipped" and leave this list.

Versions follow [Q46](../decisions.md): a fix-only release raises the patch (0.3.3), a release with a feature raises the minor (0.4.0), and 1.0.0 is the major release, product v1 complete. Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

## Shipped in 0.4.0 (2026-11-04)

The 0.3.3 fixes (items 1–11), the demo's missing pieces (the test summary report, Q47's folder suggestions, the crawl ETA), and the rest of the reports and feedback came forward from 0.6.0. See [0.4.0.md](0.4.0.md#what-shipped).

## The demo path

Ten steps from install to report. After 0.4.0 every step is built except requirements.

| # | Demo step | Status |
|---|---|---|
| 1 | Install | Shipped |
| 2 | Setup, with folder suggestions | Shipped (0.4.0, Q47) |
| 3 | Doctor | Shipped |
| 4 | Map the app (DSM) | Shipped; forms, a closed browser, a 503 and an ETA in 0.4.0 |
| 5 | App knowledge | Shipped |
| 6 | Requirements | **Not built: 0.5.0** |
| 7 | Test design and review | Shipped |
| 8 | Publish | Shipped |
| 9 | Gate a change | Shipped |
| 10 | Reports and feedback | Shipped (0.4.0); never run on a live app |

## Shipped in 0.4.1 (2026-11-04)

The AgentMesh fixes A1–A16 (A7 and A17 were already fixed in 0.4.0) and the Docker check's fixtures. See [0.4.1.md](0.4.1.md#what-shipped).

## Shipped in 0.4.2 (2026-11-04)

The dummy-static-website fixes, items 1–10 of [0.4.2.md](0.4.2.md#what-shipped), from [W1–W20](../demos/2026-11-04-0.4.1-dummy-static-website.md). Built on `release/0.4.2`; not yet run on a live application at 0.4.2.

## Next: run 0.4.2 live, then release it

| # | Item | Source |
|---|---|---|
| 1 | Run 0.4.2 end to end on a live application, in a new session, and fix what it finds (the crawl fix failed once on the real site and was corrected) | 0.4.2 |
| 2 | Re-run dummy-static-website's DSM on 0.4.2; check cats, landscapes and videogames are kept | W3 |
| 3 | Re-run AgentMesh on 0.4.1 or later: regenerate the 13 published cases with the wrong request body and re-publish (yours) | A12 |
| 4 | Run the Docker check once, with Docker and network (the container was never run) | 0.4.1 item 11 |
| 5 | A signed-in crawl on a data-heavy app, and the reports read by a person | 0.4.0, 0.4.1 |
| 6 | `/qamaster:status` and `/qamaster:report` in Claude desktop on the uploaded zip; the push hook from a normal desktop push (K8) | 0.4.0, 0.3.2 |
| 7 | Load the 0.4.2 plugin zip in Claude desktop (bumped and built 2026-11-04) and re-run setup in a QA project so its launcher points at it | 0.4.2 |
| 8 | Q49: linking local scripts without a push, and keeping a script's binding per test case across plans, needs a decision (a flag or setting makes it a minor release) | A15, W16, W19 |
| 9 | Q51: ship the domain sub-skills as reference files of `Domain_Test_Design_Skill` (built on `refactor/domain-references`; goes in the next release) | Q51 |

## 0.5.0 to 0.7.0: the rest of product v1 (minor)

| Release | Feature | Source | Effort |
|---|---|---|---|
| 0.5.0 | Requirements fetch (`qam requirements fetch`, stage 6) from Azure Boards, then Jira: completes demo step 6 | K4, product v1 | L |
| 0.6.0 | Daily-use features: a conflict shows its fields (S); a store-only edit is reported (S); `--take-store <TC-ID…>`, which needs a decision (M); `qam review` confirms on a terminal (E3, S); selection presets and a model choice (Q31, M); DSM speed: an ID-shape hint, smarter waiting, parallel tabs, a scope option, `--estimate` (S1–S4, S7); Q50, the local store first and several publish destinations (W9, L); a verdict for every reviewed case with no git change (W10, M); shared step wording between TestGen's `.feature` files and the automation (W11, M); ADO credentials from a file, after a decision (W8) | K7, E3, K6, S1–S4, S7, W8–W11 | L in all |
| 0.7.0 | Scripts for the other channels in v1: Mobile Web, API, Android, iOS | product v1, K5 | L |

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
4. ~~**Merge and push.**~~ `main` was fast-forwarded to 0.4.2 on 2026-11-04. **Still open:** push it, or keep it local (local `main` is ahead of GitHub).

## Sessions reviewed

- **Clean-room 0.3.0 end-to-end test in Docker** (`docker-e2e-0-3-0`): reported that F1, F2 and F6 were already fixed in 0.3.1 and changed nothing. No open items.
- **The Toolshop run** (subagent): stopped before the DSM finished. It published nothing to Azure DevOps and left no scratch files. Its findings came from your own run instead (T1–T5), all fixed in 0.3.2.
- **Main session:** its items are above.
