# Releases

What each plugin version holds, and what the next one is planned to hold. Scope by product version (v1, v1.1, v2) is in [product.md](product.md#scope); this file tracks the plugin's own releases inside it.

Findings come from the [demos](demos/README.md). From 0.2.1 on, each planned release has a versioned plan in [plans/](plans/README.md). This file keeps the summary.

Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

**Version numbers: MAJOR.MINOR.PATCH** ([Q46](decisions.md), 2026-11-03).
- **1.0.0 is the major release:** product v1 complete, as [product.md](product.md#v1) describes it.
- **New feature → minor** (0.4.0, 0.5.0, …): resets the patch to 0. A release with a feature and fixes is a minor release.
- **Fixes only → patch** (0.3.3, 0.3.4, …): no new command, flag, config key, file format or behaviour a user must learn.
- **After 1.0.0 the same rules apply:** 1.1.0 for features, 1.0.1 for fixes. A change that breaks users (a command, flag, exit code, config key, tag or link format or manifest field) is a major release, 2.0.0. Before 1.0.0 it's a minor release and the release notes say so.
- Releases up to 0.3.2 keep their numbers, though 0.3.1 and 0.3.2 mixed fixes with features.
- Every release: bump `plugin/.claude-plugin/plugin.json`, name the plan `docs/plans/<version>.md`, add its row to [plans/README.md](plans/README.md) and to this file, and build the zips with `scripts/package.sh`. Open items live in [plans/backlog.md](plans/backlog.md).

## 0.2.0: publish, and fixes from the first walkthrough

Publish (Q33, Q34), plus the fixes the 0.1.0 walkthrough turned up (WALKTHROUGH-0.1.0, step 4 notes).

| Change | Where | Decision |
|---|---|---|
| `qam publish`: dry run, `--apply`, `--retire`, `--refresh`, `--leave-out`, `--skip-smoke`; the `file` store; the store cache | `cli/publish.mts`, `publish/`, `adapters/file.mts`, `adapters/cache.mts` | Q33, Q34 |
| Doctor: a missing ADO project lists the organization's projects, closest names first, with the next steps (pick one, a new name, the `file` store, or let publish create it) | `adapters/ado.mts`, `shared/errors.mts`, `cli/project.mts` | |
| Publish creates a missing ADO project, only with `--apply` after the preview | `adapters/ado.mts`, `cli/publish.mts` | Q35 |
| Scan skips `codefixes/` folders (copies of routers, as in Juice Shop) | `pipeline/sources.mts` | |
| The requirements stage no longer points to the unbuilt `qam requirements fetch` | `pipeline/pipeline.mts`, `testgen/facts.mts` | |
| A stage marked skipped shows its note, not the last failed check | `pipeline/pipeline.mts` | |
| ADO-API recipe: list the organization's projects | `skills/ADO-API/references/recipes.md` | |
| Doctor warns when an existing config misses a newer default (`pathDepth`, scan excludes) | `cli/project.mts` | |
| The `file` store also reads and writes `testcases/testcases.json`, used when there is no CSV | `adapters/file.mts`, `shared/schema.mts` | Q36 (proposed) |

## 0.2.1: fixes from the publish walkthrough that the gate depends on

Plan: [plans/0.2.1.md](plans/0.2.1.md). Built on `feature/0.2.1-fixes`, released 2026-11-02. Findings from the 0.2.0 publish walkthrough.

| Change | Where | Decision |
|---|---|---|
| Review needs an explicit yes to "Do you approve run X as reviewed?"; a request for the dry run isn't one, and publish never records a review | `skills/TestGen`, `skills/Publish`, `commands/publish.md` | Q12 |
| The ADO plan is named after `app.name`, else the folder; messages say "named like the app" | `adapters/ado.mts` | |
| Setup names the `claude-hooks` integration after the app it writes in the same run | `cli/project.mts` | Q27 |
| A file in a folder shallower than `pathDepth` is tagged `dir/*` (that folder's own files), not `dir/**`. Existing cases show as updates on the next publish | `publish/publish.mts` | Q37 |
| Smoke is counted across the whole plan; the preview names cases held back by a full cap; `--apply` exits 3 and writes nothing when the cap filled since the dry run (recorded in `.qamaster/cache/`); apply reports the smoke in the plan | `publish/publish.mts`, `cli/publish.mts`, `skills/Publish` | Q8 |
| A credential-like value in a title, objective, expected result or step is a validator finding | `testgen/validate.mts`, `skills/TestGen/references/cases.md` | Q10 |
| The `file` store blocks when `testcases.csv` and `testcases.json` both exist | `adapters/file.mts` | Q36 |

The other findings, and the earlier 0.2.1 backlog, are in that plan's [Later](plans/0.2.1.md#later) section.

## 0.2.2: fixes from the 0.2.1 verification

Plan: [plans/0.2.2.md](plans/0.2.2.md). Built on `feature/0.2.2-fixes` and released inside 0.3.0 (2026-11-02): there's no separate 0.2.2 package. Findings from the 0.2.1 verification.

| Change | Where | Decision |
|---|---|---|
| A description that differs only in blank lines or trailing spaces is unchanged (ADO drops blank lines) | `publish/publish.mts` | Q7 |
| The credential check skips emails, plain words and step `data`, and reports every value in a text | `testgen/validate.mts` | Q10 |
| Credential-like `test_data` is masked in the store's description; the run keeps the value | `publish/publish.mts` | Q16 |
| A manifest `generated_at` in the future is a finding; the TestGen reference says to write UTC | `testgen/validate.mts`, `skills/TestGen/references/cases.md` | Q10 |

## 0.3.0: the first full working plugin

Plan: [plans/0.3.0.md](plans/0.3.0.md). Built on `feature/0.3.0-gate`, tested end to end (report), released 2026-11-02.

| Change | Where | Decision |
|---|---|---|
| The gate: `qam plan`, `approve`, `run`, `check`. Selection by path, smoke, DSM impact and groups. Shared files (20+ case plans). Manual and BROKEN cases. Verdicts with retries and evidence. The store is read live | `gate/`, `cli/gate.mts`, `adapters/git.mts` | Q11–Q13, Q22, Q31, Q37 |
| A runner for each case from its link's prefix, in its own folder (`runners.<name>.root`). A missing runner blocks | `gate/gate.mts`, `shared/schema.mts` | Q38 |
| The pytest runner and shim | `adapters/runner-pytest.mts`, `runners/pytest/` | Q20 |
| The playwright-bdd framework: a minimal web template, `qam app create`, `qam check-scripts` | `framework/playwright-bdd/`, `automation/`, `adapters/framework-bdd.mts` | Q25, Q32 |
| The playwright-bdd runner | `adapters/runner-bdd.mts` | Q20 |
| Just-in-time automation: `qam automate <plan-id> [--done]`, recorded and hash-bound drafts, "new script failed" until a first pass | `gate/automate.mts`, `skills/AutomationCode` | Q39 |
| Publish links only pushed scripts, with a `Script:` line at the commit | `publish/scripts.mts` | Q39, Q40 |
| `/qamaster:check`, the Gate skill, and the push hook (only in repos with `claude-hooks` recorded) | `commands/check.md`, `skills/Gate`, `hooks/` | Q14 |

## 0.3.1: prerequisites a clean machine needs, checked and explained

Plan: [plans/0.3.1.md](plans/0.3.1.md). Built on `feature/0.3.1-setup-gaps`, released 2026-11-02, and checked in a clean container (re-run: 41 of 41 steps). It holds the prerequisites a clean machine needs, checked and explained, from the clean Docker run (F1–F11):
- runner setup problems block instead of failing, and pytest never downloads without a yes (Q41);
- the gate's local files are kept out of the app repo's commits (Q42);
- `qam doctor` checks the gate's prerequisites;
- clear messages for git, uv, python3 and pytest;
- doctor no longer blocks the next plan.

## 0.3.2: fixes from the Toolshop run, `/qamaster:status`, and an installable zip

Plan: [plans/0.3.2.md](plans/0.3.2.md), with what went well, the feedback and what goes to the next release. Built and released 2026-11-03. Findings from the [Toolshop run](demos/2026-11-02-toolshop-analysis.md).

| Change | Where | Decision |
|---|---|---|
| A page with several password fields isn't a sign-in page off the sign-in route (T1) | `dsm/crawl-rules.mts` | Q15 |
| ULIDs fold into `:id` by default; doctor warns an older config (T2) | `templates/project/config/dsm-config.json`, `cli/project.mts` | |
| Pipeline stage 10 finds `app.json`; `qam check-scripts` records its result for stage 13 (T3, T4) | `pipeline/pipeline.mts`, `cli/automation.mts` | Q39 |
| Stages 10–13 are optional and never "next" (T5) | `pipeline/pipeline.mts` | Q39 |
| `/qamaster:status` | `commands/status.md` | |
| `scripts/package.sh`: the plugin zip (Claude desktop) and the marketplace zip (CLI), checked; [install.md](install.md) | `scripts/package.sh` | |
| The plugin ships no `bin/`, so Claude desktop accepts the upload; a test keeps `plugin/` ready to zip | `bin/`, `tests/plugin-ship.test.mts`, `scripts/package.sh` | Q45 |
| Local first: with no `QAMASTER_STORE` the store is the one the ledger names, else the local file store, not Azure DevOps | `shared/config.mts` | Q44 |

Not in 0.3.0: Feedback, Reports and Requirements (`qam requirements fetch`), and the v1.1, v2 and v3 scope in product.md.

## 0.4.0: the 0.3.3 fixes and the demo's missing pieces, with reports and feedback

Plan: [plans/0.4.0.md](plans/0.4.0.md). Built on 2026-11-04. The fixes and features shipped as one minor release (Q46), so there is no 0.3.3.

| Change | Where | Decision |
|---|---|---|
| Six self-contained HTML reports, `qam report`, `/qamaster:report`; `qam feedback` | `reports/`, `feedback/`, `cli/reports.mts` | Q17, Q19 |
| Setup asks where, with three suggestions, when no code folder is given | `cli/project.mts`, `pipeline/sources.mts` | Q47 |
| Doctor warns on ADO settings with the local file store; a new `--app` replaces the old hooks record | `cli/project.mts`, `integrations/` | Q44, Q27 |
| Crawler: forms without `<form>`, a closed browser restarts, a 503 backs off, an ETA in the progress line | `adapters/crawler-playwright.mts`, `dsm/` | Q15 |
| Publish: held-back status (E7), skip-smoke remembered (E2), other runs' smoke counted (E1), the retire note (E5), the credential hint (E6) | `cli/publish.mts`, `pipeline/`, `testgen/` | |
| The `Domain_Test_Design_Skill` sub-skills hidden from the `/` menu | `plugin/skills/` | |


## 0.4.1: fixes from the AgentMesh run

Plan: [plans/0.4.1.md](plans/0.4.1.md). Built on 2026-11-04. Findings from the [AgentMesh run](demos/2026-11-04-0.3.2-agentmesh-feedback.md) (A1–A17). Fixes only, so a patch release (Q46).

| Change | Where | Decision |
|---|---|---|
| `QAMASTER_ADO_ORG` takes the org's URL; doctor lists projects when none is set; a launcher warning | `adapters/ado.mts`, `cli/project.mts` | |
| The vague-outcome check ignores quoted values; request bodies are checked against the cited code; `check-scripts` rejects positional selectors | `testgen/validate.mts`, `automation/quality.mts` | Q10 |
| FastAPI routes scanned; server-only routes are `kind: api`, not screens, not crawl seeds | `dsm/scan.mts`, `dsm/build.mts`, `dsm/update.mts` | Q48 |
| A single-page app's fallback shell isn't a screen | `adapters/crawler-playwright.mts` | Q15 |
| QAMaster's own folders aren't uncommitted changes or new commits | `pipeline/sources.mts`, `pipeline/pipeline.mts` | |
| First-gate-run, store and unpushed-scripts status read correctly | `pipeline/pipeline.mts`, `cli/publish.mts` | |
| Skills hand you paste-ready commands; TestGen works one component at a time | `plugin/skills/`, `plugin/commands/` | |
| The Docker check runs from a plain checkout (fixtures; container not run) | `scripts/docker-e2e/`, `tests/fixtures/docker-e2e/` | |

## 0.4.2: fixes from the dummy-static-website run

Plan: [plans/0.4.2.md](plans/0.4.2.md). Built on `release/0.4.2` on 2026-11-04. Findings W1–W20 from the [dummy-static-website run](demos/2026-11-04-0.4.1-dummy-static-website.md). Fixes only, so a patch release (Q46); the crawl records one new field, `text_hash`, in `ui-model.json`.

| Change | Where | Decision |
|---|---|---|
| A page isn't a single-page app's shell unless its text, title and headings match the start page too | `adapters/crawler-playwright.mts` | Q15 |
| The blocked-writes warning names the requests; `code:` evidence takes a line range | `dsm/update.mts`, `testgen/` | |
| The pipeline finds the automation folder under its PascalCase name; the gate reads settings from the QA project | `pipeline/pipeline.mts`, `shared/config.mts` | |
| Clear messages: no git repo, the app URL to start, binding a script; a code folder not in git warns | `adapters/git.mts`, `cli/gate.mts`, `gate/gate.mts`, `pipeline/sources.mts` | |
| Skills ask where the QA project goes; Publish offers the ADO project list | `plugin/skills/`, `plugin/commands/` | |

Not yet run on the real site after the last fix; see the plan's "How it was checked".

## 0.4.3: the domain sub-skills as reference files

Plan: [plans/0.4.3.md](plans/0.4.3.md). Released 2026-11-04. Fixes only, so a patch release (Q46).

| Change | Where | Decision |
|---|---|---|
| The 39 `Domain_Test_Design_Skill` sub-skills are reference files of the router skill, not skills, so an uploaded plugin's catalog lists QAMaster's 8 skills instead of 47. Their text, names and `domain:` citations are unchanged | `plugin/skills/Domain_Test_Design_Skill/references/`, `testgen/domain-refs.mts` | Q51 |
| The plugin description says what you get and how to start, with the `/qamaster:` commands, for the IDE and desktop plugin lists | `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | |

Not yet run in a live session.

## 0.4.4: messages and docs from the fastapi-react-app run

Plan: [plans/0.4.4.md](plans/0.4.4.md). Built on `release/0.4.4` on 2026-11-06; released 2026-11-10. Fixes only, so a patch release (Q46).

| Change | Where | Decision |
|---|---|---|
| `qam setup --help` prints usage; setup names the store it chose; doctor always shows the app URL and runner lines | `cli/project.mts` | |
| `qam aut-skills` checks the `code:` citations in curated blocks and names a bad one (exit 1) | `cli/knowledge.mts`, `cli/testgen.mts` | |
| Coverage gaps print the key that excludes them, an exclusion that matches nothing is a finding, and a step that only opens a URL needs no element | `testgen/validate.mts`, `skills/TestGen/references/cases.md` | Q10 |
| No domain fits: record `General`, use the Core, App and Test sub-skills | `skills/Domain_Test_Design_Skill`, `skills/TestGen` | |
| `check-scripts` shows the accepted locator shape; the AutomationCode skill covers the test account, API helpers and whole locators | `automation/quality.mts`, `skills/AutomationCode` | |
| The plan messages say to run the app on the committed code; Publish says what script links need | `cli/gate.mts`, `cli/publish.mts` | |

Not yet run on fastapi-react-app.

## 0.5.0: requirements, fetched or imported

Plan: [plans/0.5.0.md](plans/0.5.0.md). Built on `release/0.5.0` on 2026-11-06; released 2026-11-10. A new command, so a minor release (Q46).

| Change | Where | Decision |
|---|---|---|
| `qam requirements fetch` reads a sprint, the current sprint or a date range from Azure Boards and saves `requirements/<scope>/`; bugs follow the team's "bugs as requirements" setting | `cli/requirements.mts`, `adapters/ado.mts` | Q5, Q20 |
| `qam requirements import` reads stories from .xlsx, .csv, .json or .md (a Jira or spreadsheet export); `qam requirements list` | `requirements/` | Q20 |
| Pipeline stage 6 names fetch and import; TestGen asks for the sprint or file and cites `req:<id>` | `pipeline/pipeline.mts`, `skills/TestGen` | Q10 |
| The test case report shows each case's requirements and the requirements no case covers | `reports/` | |

Not yet run against a live organization.

## Planned

Every open item, with its source, is in [plans/backlog.md](plans/backlog.md).

| Release | Kind | What | Plan |
|---|---|---|---|
| 0.6.0 | Features | A gate you can trust: its state in the QA project and a push hook that blocks (Q52), app errors fail a case (Q53), every verdict kept, script bindings kept (Q49) | [backlog](plans/backlog.md#the-road-to-100-planned-2026-11-06) |
| 0.7.0 | Features | Apps with a sign-in: signed-out and signed-in crawls merged, dialog fields, clickable cards, each screen's own source files | [backlog](plans/backlog.md#the-road-to-100-planned-2026-11-06) |
| 0.8.0 | Features | Daily use: the local store first with several destinations (Q50), switching stores, `az` credentials, conflicts, review confirmation, presets, faster DSM | [backlog](plans/backlog.md#the-road-to-100-planned-2026-11-06) |
| 0.9.0 | Features | Scripts for API, Mobile Web, Android and iOS | [backlog](plans/backlog.md#the-road-to-100-planned-2026-11-06) |
| **1.0.0** | **Major** | Product v1 complete, a clean-room Docker run, and a walkthrough on a second unknown app | [backlog](plans/backlog.md#100-the-major-release) |
| 1.1.0 | Features | The git pre-push hook, each IDE and agent set up by ticking it (Q43), PR checks, ADO Test Run | [backlog](plans/backlog.md#after-100) |
