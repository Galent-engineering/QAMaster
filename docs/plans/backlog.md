# Backlog: every open fix and to-do, and the release it goes to

Compiled on 2026-11-04 from the plans (0.2.1 Later, 0.3.0–0.3.2), the demo findings (E, K, U, T, F), the decisions, product.md's scope, and the sessions that ran this work. Each item names where it came from. When a release ships, its items move to that plan's "What shipped" and leave this list.

Versions follow [Q46](../decisions.md): a fix-only release raises the patch (0.3.3), a release with a feature raises the minor (0.4.0), and 1.0.0 is the major release, product v1 complete. Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

## Shipped in 0.4.0 (2026-11-04)

The 0.3.3 fixes (items 1–11), the demo's missing pieces (the test summary report, Q47's folder suggestions, the crawl ETA), and the rest of the reports and feedback came forward from 0.6.0. See [0.4.0.md](0.4.0.md#what-shipped).

## The demo path

Ten steps from install to report. Every step is built as of 0.5.0.

| # | Demo step | Status |
|---|---|---|
| 1 | Install | Shipped |
| 2 | Setup, with folder suggestions | Shipped (0.4.0, Q47) |
| 3 | Doctor | Shipped |
| 4 | Map the app (DSM) | Shipped; forms, a closed browser, a 503 and an ETA in 0.4.0 |
| 5 | App knowledge | Shipped |
| 6 | Requirements | Shipped (0.5.0): fetch from Azure Boards or import a file; never run on a live app with stories |
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

## The road to 1.0.0 (replanned 2026-11-10, Q54)

Ordered with you on 2026-11-06 and regrouped on 2026-11-10 (Q54): the four feature releases left (0.6.0 to 0.9.0) become two, grouped by the code they touch, each followed by a patch release for what its live run finds. 1.0.0 adds no feature: it proves v1 on a second app. Native Android and iOS move to 1.1.0.

| Release | Kind | What | Source | Effort |
|---|---|---|---|---|
| 0.4.4 | Fixes | **Released 2026-11-10.** The run's messages and docs. See [0.4.4.md](0.4.4.md) | R2–R4, R11, R13–R15, R18–R20, R29 | M |
| 0.5.0 | Features | **Released 2026-11-10.** Requirements fetch from Azure Boards and import from a file; completes demo step 6. See [0.5.0.md](0.5.0.md) | K4, product v1 | L |
| 0.6.0 | Features | **Built 2026-11-10** on `release/0.6.0`, items 1–14: gate state in the QA project and a push hook that blocks from the app clone (Q52); an app error fails a passing case (Q53, `gate.allowErrors`); bindings kept across plans (Q49); every verdict kept; doctor names a second build and the app's own tests; `qam publish --to` several destinations (Q50, accepted); `qam store use`; `az devops` credentials; conflict fields and store-only edits; `qam status`; `qam review` asks on a terminal; `qam plan --all`. Not yet run live. See [0.6.0.md](0.6.0.md) | R1, R2, R4, R17, R22–R28, Q49, Q50, Q52, Q53, A15, W9, W10, W16, W19, E3, K6, K7 | L+ (two L halves) |
| 0.6.1 | Fixes | **Folded into the 0.7.x patches, not built separately:** 0.7.0 contains 0.6.0, so 0.6.0's open fixes shipped in 0.7.1 (items 10–13) and the bugs 0.6.0's live run finds (fastapi-react-app again, with imported stories) go to 0.7.2. `--take-store` and ADO credentials from a file (W8) are undecided; whichever is decided as a new flag or setting goes to a minor release (a patch adds none, Q46). See [0.7.1.md r3](0.7.1.md) | the run | — |
| 0.7.0 | Features | **Built 2026-11-10** on `release/0.7.0`, items 1–17: a signed-out pass merged with the signed-in one (`access`), dialog fields and limits, cards and sidebar links, `qam dsm compare`, each screen's own source files, heading labels; DOM-quiet settling, `crawl.concurrency`, `--routes`, `--estimate`; TestGen on sign-in and dialog forms; generic step wording; `qam plan --preset` (Q31); API cases and scripts; Mobile Web scripts. D1, D2, D4–D9 built to their recommendations and still to confirm; D3 not built. Not yet run live. See [0.7.0.md](0.7.0.md) | R5–R10, R12, R16, R30, S1–S4, S7, W11, Q31, K5 | L+ (two L halves) |
| 0.7.1 | Fixes | **Released 2026-11-10** on `release/0.7.1` ([plan r3](0.7.1.md)), before the live runs: Q56 (a republish replaces `path:` tags, 0.7.0's D3), the crawl and scan fixes, the `.feature` session tag and route text, `check-scripts` and `Selection:` fixes, and 0.6.0's small gaps; items 1–13. Follow-ups: acting on the `@signed-in` tag, an ADO recorded test of `path:` removal | 0.7.0 moved, 0.6.0 r5, Q56 | S–M |
| 0.7.2 | Fixes | **Built 2026-11-11** on `release/0.7.2` ([plan r2](0.7.2.md)), items 1–19, from the 0.7.1 walkthrough ([D1–D21](../demos/2026-11-10-0.7.1-todoapp.md)) and the observer's F1–F23: messages and states that hid the truth, `--help` and `--tag` parsing, the Q57 account check. The behaviour changes the walkthrough found (refuse an empty plan, shared path tags, API-error watcher, story-aware selection, flaky `--strict`, and the rest) are the plan's decision table, targeted at 0.8.0. Still owed: the live runs (0.6.0 and 0.7.0 checks, the Restful Booker rehearsal) | D1–D21, F1–F23, the runs |
| 0.8.0 | Features | **Built 2026-11-11** ([plan r2](0.8.0.md), [Q58](../decisions.md), amends Q54): the walkthrough's behaviour findings, D3, D4, D5, D8, D10, D16–D21, F4, F21, `@signed-in`, `--take-store`, W8 closed; built and tested on fixtures; the walkthrough before release is still owed | 0.7.2's decision table | L+ |
| **1.0.0** | **Major** | **Product v1 proven, no new feature:** the criteria below | below | M |
| 1.0.x | Fixes | Bugs found after 1.0.0, as they come | | |

Decisions to take before the item that needs them: `--take-store` (keep the store's copy in a conflict) and ADO credentials from a file (W8), both still open after 0.6.0. 0.7.0's D1–D9 were decided 2026-11-10 (Q55, Q56). Q50 was accepted 2026-11-10 and built in 0.6.0.

**Not v1:** Jira requirements over REST. Q20 keeps Jira to MCP during test design in v1; a Jira `RequirementSource` comes after 1.0.0 unless you change Q20.

**Verification still owed** (yours or needing Docker, carried into the release that touches each area):
- Load the 0.4.3 zip in Claude desktop, check the catalog lists 8 skills, and re-run setup so the launcher points at the same build (R27 ran two builds labelled 0.4.3).
- Re-run dummy-static-website's DSM on 0.4.2 or later (W3), and AgentMesh to regenerate its 13 cases with the wrong request body (A12).
- Run the Docker check once, with Docker and network.
- `/qamaster:status` and `/qamaster:report` from the uploaded zip; the push hook from a normal desktop push (K8; R25 found it never blocks: fixed in 0.6.0, not yet seen live).
- 0.6.0 under `claude --plugin-dir ./plugin`: the push hook blocking from an app clone, a plan binding a recorded script through the real playwright-bdd tools after a store switch (item 3), and the app-error fixture inside a real playwright-bdd project (item 4).
- 0.7.0 live: a fastapi-react-app crawl signed out and signed in (access, dialog fields, cards, sidebar, concurrency 3); `npm install`, `bddgen` and `playwright test --list` in a folder from `qam app create --api-url` with API and Mobile Web features; the TestGen, AutomationCode, Design-Structure-Matrix and Gate skills triggered under `--plugin-dir`.

## 1.0.0: the major release

Product v1 as [product.md](../product.md#v1) describes it, all of it (native Android and iOS are 1.1.0, Q54), plus:
- the clean-room Docker run passes from a plain checkout;
- the walkthrough passes on a second unknown app (Restful Booker Platform is saved for this), with the slash commands and skills as the front end, not direct `qam` calls;
- the failure path seen live: a FAIL, a retry and a flaky case, a BROKEN case, screenshots, defect drafts, and the defect and root-cause reports with real data (no run has failed yet);
- the store's life cycle seen live: a republish that updates, a conflict, `--retire` and `--leave-out`;
- no open High finding in [demos/](../demos/README.md);
- every decision accepted, and every doc current.

## After 1.0.0

| Release | Scope | Source |
|---|---|---|
| 1.1.0 | Native Android and iOS scripts through Appium, ported from Autonomous-QE's `framework/TestAutomation/src/mobile`; needs a machine with the Android SDK or Xcode (moved from v1 by Q54) | Q54, K5 |
| 1.2.0 | Product v1.1: the git pre-push hook for any terminal; each IDE and agent set up by ticking it, hooks included (Q43); PR checks on GitHub and Azure Repos; results published back to ADO as a Test Run | product v1.1, Q43, K8 |
| 1.x.y | A patch after each of these for what its first live use finds | |
| 2.0.0 | Context sources through MCP; the QAMaster MCP server and exports to other AI tools; importing existing cases and gap analysis; locators from the crawl; API discovery | product v2 |
| 3.0.0 | Generate into a team's existing framework; impact and traceability matrices; root-cause evidence; value metrics; a secrets vault and security scan; a Visio MCP server | product v3 |

## Later (not scheduled)

- From 0.8.0's scoping: `{len:N}` in case steps (D15); a gate-level reset command (`gate.beforeRun`); `required` from form code; Python imports in the scan (D8's backend half); ADO Tested By links for stories; per-field merge after `--take-store`; the reviewer as ADO account plus git email (Q12). Undecided: publish without `--to` always writing the file store; exempting a push from the QA project itself.

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
6. ~~**Merge and push 0.4.4 and 0.5.0.**~~ **Done 2026-11-10:** `main` holds 0.5.0 and is pushed. Next: run 0.4.4 and 0.5.0 on a live app (fastapi-react-app with imported stories), then build 0.6.0 ([plan](0.6.0.md)); Q49 was decided 2026-11-10.
7. ~~**Fewer releases to 1.0.0.**~~ **Decided 2026-11-10 (Q54):** 0.6.0 (gate and store), 0.6.1, 0.7.0 (coverage and the API and Mobile Web channels), 0.7.1, 1.0.0 (proof, no feature), then 1.1.0 native Android and iOS, 1.2.0 product v1.1.

## Sessions reviewed

- **Clean-room 0.3.0 end-to-end test in Docker** (`docker-e2e-0-3-0`): reported that F1, F2 and F6 were already fixed in 0.3.1 and changed nothing. No open items.
- **The Toolshop run** (subagent): stopped before the DSM finished. It published nothing to Azure DevOps and left no scratch files. Its findings came from your own run instead (T1–T5), all fixed in 0.3.2.
- **Main session:** its items are above.
