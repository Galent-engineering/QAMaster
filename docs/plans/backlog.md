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

## Shipped in 0.4.3 (2026-11-04)

The 39 domain sub-skills as reference files (Q51). See [0.4.3.md](0.4.3.md#what-shipped).

## The road to 1.0.0 (planned 2026-11-06)

Ordered with you on 2026-11-06: fixes from the [fastapi-react-app run](../demos/2026-11-04-0.4.3-fastapi-react-todo.md) (R1–R30) first, then requirements, then the gate's trust, apps with a sign-in, daily use and the other channels.

| Release | Kind | What | Source | Effort |
|---|---|---|---|---|
| 0.4.4 | Fixes | The run's messages and docs. See [0.4.4.md](0.4.4.md) | R2–R4, R11, R13–R15, R18–R20, R29 | M |
| 0.5.0 | Features | Requirements fetch from Azure Boards (`qam requirements fetch`, stage 6), so `req:` evidence and the requirements in the reports are real; completes demo step 6. See [0.5.0.md](0.5.0.md) | K4, product v1 | L |
| 0.6.0 | Features | **A gate you can trust.** Its state in the QA project and a push hook that blocks from the app clone (Q52); an app error during a passing case fails it (Q53); every verdict kept, not one per commit; script bindings kept per test case across plans (Q49, to decide first); doctor names a second, different build of the same version; the app's own test suite noticed by doctor and offered to the plan | R22, R25–R28, R17, R1, R4, Q49, A15, W16, W19 | L |
| 0.7.0 | Features | **Apps with a sign-in.** A signed-out crawl merged with the signed-in one, so public forms keep their fields; two crawls kept and compared; fields inside dialogs; clickable cards and sidebar links followed; each screen's own source files, not the shared sign-in code, so tags narrow; screens named by their heading. Then TestGen covers sign-in, sign-up and add/edit forms | R5–R10, R12, R16, R30 | L |
| 0.8.0 | Features | **Daily use.** Q50, the local store first and several publish destinations (W9); switching stores with a command (R23); `az devops`'s own credential variables read (R24); `qam status` as a short name (R2); a conflict shows its fields; a store-only edit reported; `--take-store` (needs a decision); `qam review` confirms on a terminal (E3); selection presets and a model choice (Q31); DSM speed (S1–S4, S7); a verdict with no git change (W10); shared step wording (W11); ADO credentials from a file, after a decision (W8) | K6, K7, E3, S1–S7, W8–W11, R2, R23, R24 | L in all |
| 0.9.0 | Features | **The other v1 channels.** API and Mobile Web scripts, then Android and iOS through Appium, ported from Autonomous-QE's `framework/TestAutomation/src/api` and `src/mobile`. Native runs need a machine with the Android SDK or Xcode | product v1, K5, Q20 | L |

**Not v1:** Jira requirements over REST. Q20 keeps Jira to MCP during test design in v1; a Jira `RequirementSource` comes after 1.0.0 unless you change Q20.

**Verification still owed** (yours or needing Docker, carried into the release that touches each area):
- Load the 0.4.3 zip in Claude desktop, check the catalog lists 8 skills, and re-run setup so the launcher points at the same build (R27 ran two builds labelled 0.4.3).
- Re-run dummy-static-website's DSM on 0.4.2 or later (W3), and AgentMesh to regenerate its 13 cases with the wrong request body (A12).
- Run the Docker check once, with Docker and network.
- `/qamaster:status` and `/qamaster:report` from the uploaded zip; the push hook from a normal desktop push (K8; R25 found it never blocks: 0.6.0).

## 1.0.0: the major release

Product v1 as [product.md](../product.md#v1) describes it, all of it, plus:
- the clean-room Docker run passes from a plain checkout;
- the walkthrough passes on a second unknown app (Restful Booker Platform is saved for this), with the slash commands and skills as the front end, not direct `qam` calls;
- the failure path seen live: a FAIL, a retry and a flaky case, a BROKEN case, screenshots, defect drafts, and the defect and root-cause reports with real data (no run has failed yet);
- the store's life cycle seen live: a republish that updates, a conflict, `--retire` and `--leave-out`;
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
4. ~~**Merge and push.**~~ **Done 2026-11-04:** `main` holds 0.4.3 and is pushed to GitHub, with `release/0.4.2` and `release/0.4.3`.
5. ~~**The order to 1.0.0.**~~ **Decided 2026-11-06:** fixes (0.4.4), requirements (0.5.0), the gate's trust (0.6.0, Q52, Q53), apps with a sign-in (0.7.0), daily use (0.8.0), the other channels with native Android and iOS kept in v1 (0.9.0).

## Sessions reviewed

- **Clean-room 0.3.0 end-to-end test in Docker** (`docker-e2e-0-3-0`): reported that F1, F2 and F6 were already fixed in 0.3.1 and changed nothing. No open items.
- **The Toolshop run** (subagent): stopped before the DSM finished. It published nothing to Azure DevOps and left no scratch files. Its findings came from your own run instead (T1–T5), all fixed in 0.3.2.
- **Main session:** its items are above.
