# Backlog: every open fix and to-do, and the release it goes to

Compiled on 2026-11-04 from the plans (0.2.1 Later, 0.3.0–0.3.2), the demo findings (E, K, U, T, F), the decisions, product.md's scope, and the sessions that ran this work. Each item names where it came from. When a release ships, its items move to that plan's "What shipped" and leave this list.

Versions follow [Q46](../decisions.md): a fix-only release raises the patch (0.3.3), a release with a feature raises the minor (0.4.0), and 1.0.0 is the major release, product v1 complete. Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

## 0.3.3: fixes only (patch)

Plan: [0.3.3.md](0.3.3.md). No new command, flag, config key or file format.

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | Forms without a `<form>` tag reach the DSM: the crawler collects `looseFields` but `dsm/build.mts` drops them. Also warn when there's no `.env.dsm` (forms behind login aren't crawled) | K1, 0.2.1 Later | M + XS |
| 2 | Restart the browser when it closes mid-crawl, and find why it closed (seen on Toolshop after T1) | S5, T1 follow-up | S |
| 3 | Crawl backs off on a 503 (public demos rate-limit) | 0.2.1 Later | S–M |
| 4 | Hide the `Domain_Test_Design_Skill*` sub-skills from the `/` menu | 0.2.1 Later | XS |
| 5 | `--skip-smoke` is remembered in the ledger, so the "not offered" note stops repeating | E2 | XS |
| 6 | Setup with a new `--app` replaces the old `claude-hooks:` record instead of adding a second | E4 | XS |
| 7 | The Publish skill explains retiring a required case: add a coverage exclusion first | E5 | XS |
| 8 | The credential hint adapts to the value (an email is "the registered user's email", not "password") | E6 | XS |
| 9 | Pipeline status says "done, 1 held back by a conflict" when the last apply held cases back | E7 | S |
| 10 | The dry run counts smoke offered by other previewed, unapplied runs | E1 | S |
| 11 | `qam doctor` warns when Azure DevOps settings exist but the store is the local file (Q44's cost: `QAMASTER_STORE=ado` is now needed) | Q44 | XS |
| 12 | The Docker check runs from a plain checkout: a small pytest demo, a Juice Shop reference and a recorded QA project under `tests/fixtures/` | 0.3.2 point 9 | M |

**Verify, with no code:** `/qamaster:status` in Claude desktop on the uploaded zip · the push hook from a normal desktop push, not a test event (K8) · a signed-in re-crawl on a data-heavy app, for time per page and whether the browser still closes (T1, T2).

## 0.4.0: features (minor)

Plan: [0.4.0.md](0.4.0.md).

| # | Item | Source | Effort |
|---|---|---|---|
| 1 | A conflict shows which fields differ | K7, 0.2.1 Later | S |
| 2 | An edit made only in the store is reported ("1 case edited in the store since publish (kept)") | K7 | S |
| 3 | Accept the store's version of a conflicted case: `--take-store <TC-ID…>`, with your yes | K7 | M |
| 4 | `qam review` prints the run's counts and asks to confirm on a terminal (`--yes` for scripts) | E3 | S |
| 5 | Selection presets `fast`, `standard`, `full`, switchable selectors and a model choice | K6, Q31 | M |
| 6 | DSM speed: a hint for ID shapes other than ULIDs, smarter waiting, parallel tabs, a crawl scope option | S1 (rest), S2, S3, S4 | S + S + M + S |
| 7 | An ETA in the crawl's progress line, and `qam dsm run --estimate` | S6, S7 | XS–S + S |
| 8 | Setup uses the folder you're in when it's the app's git repo or a clone of the URL. Needs a decision first (shown as Proposed on the setup page) | v3.1 step 2 | S |

## 0.5.0 to 0.8.0: the rest of product v1 (minor, order proposed)

Product v1 isn't complete until these exist. The order below is a proposal for you to set.

| Release | Feature | Source | Effort |
|---|---|---|---|
| 0.5.0 | Requirements fetch (`qam requirements fetch`, stage 6) from Azure Boards, then Jira | K4, product v1 | L |
| 0.6.0 | The six HTML reports and `qam report` | K9, product v1 | L |
| 0.7.0 | Feedback: coverage gaps, stale cases, BROKEN links, defect drafts a person files | K9, Q19 | L |
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

1. **The order of 0.5.0 to 0.8.0.**
2. **The Toolshop cases in Azure DevOps.** Project Toolshop holds 13 cases created from a QA project that has since been deleted, so there's no ledger linking them. Publishing Toolshop again would create 13 more. QAMaster never deletes: leave them, retire them by hand in ADO, or relink them once a new QA project exists.
3. **Setup using the folder you're in** (0.4.0 item 8): accept it as a decision, or drop it.
4. **`feature/0.3.2-toolshop-fixes` is not on `main` or GitHub.** Update `main` and push, or keep it local.

## Sessions reviewed

- **Clean-room 0.3.0 end-to-end test in Docker** (`docker-e2e-0-3-0`): reported that F1, F2 and F6 were already fixed in 0.3.1 and changed nothing. No open items.
- **The Toolshop run** (subagent): stopped before the DSM finished. It published nothing to Azure DevOps and left no scratch files. Its findings came from your own run instead (T1–T5), all fixed in 0.3.2.
- **Main session:** its items are above.
