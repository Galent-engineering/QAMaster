# Releases

What each plugin version holds, and what the next one is planned to hold. Scope by product version (v1, v1.1, v2) is in [product.md](product.md#scope); this file tracks the plugin's own releases inside it.

Findings come from the [demos](demos/README.md). From 0.2.1 on, each planned release has a versioned plan in [plans/](plans/README.md). This file keeps the summary.

Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

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

Plan: [plans/0.2.1.md](plans/0.2.1.md). Built on `feature/0.2.1-fixes`, released 2026-11-02. Findings from the [0.2.0 publish walkthrough](demos/2026-10-30-0.2.0-publish-feedback.md).

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

Plan: [plans/0.2.2.md](plans/0.2.2.md). Built on `feature/0.2.2-fixes` and released inside 0.3.0 (2026-11-02): there's no separate 0.2.2 package. Findings from the [0.2.1 verification](demos/2026-11-02-0.2.1-verification.md).

| Change | Where | Decision |
|---|---|---|
| A description that differs only in blank lines or trailing spaces is unchanged (ADO drops blank lines) | `publish/publish.mts` | Q7 |
| The credential check skips emails, plain words and step `data`, and reports every value in a text | `testgen/validate.mts` | Q10 |
| Credential-like `test_data` is masked in the store's description; the run keeps the value | `publish/publish.mts` | Q16 |
| A manifest `generated_at` in the future is a finding; the TestGen reference says to write UTC | `testgen/validate.mts`, `skills/TestGen/references/cases.md` | Q10 |

## 0.3.0: the first full working plugin

Plan: [plans/0.3.0.md](plans/0.3.0.md). Built on `feature/0.3.0-gate`, tested end to end ([report](demos/2026-11-02-0.3.0-end-to-end.md)), released 2026-11-02.

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

Plan: [plans/0.3.1.md](plans/0.3.1.md). Built on `feature/0.3.1-setup-gaps`, released 2026-11-02, and checked in a clean container ([re-run](demos/2026-11-02-0.3.0-docker-e2e.md#031-re-run-2026-11-02): 41 of 41 steps). It holds the prerequisites a clean machine needs, checked and explained, from the [clean Docker run](demos/2026-11-02-0.3.0-docker-e2e.md) (F1–F11):
- runner setup problems block instead of failing, and pytest never downloads without a yes (Q41);
- the gate's local files are kept out of the app repo's commits (Q42);
- `qam doctor` checks the gate's prerequisites;
- clear messages for git, uv, python3 and pytest;
- doctor no longer blocks the next plan.

## 0.3.2: fixes from the Toolshop run, `/qamaster:status`, and an installable zip

Plan: [plans/0.3.2.md](plans/0.3.2.md), with what went well, the feedback and what goes to the next release. Built on `feature/0.3.2-toolshop-fixes`, released 2026-11-03. Findings from the [Toolshop run](demos/2026-11-02-toolshop-analysis.md).

| Change | Where | Decision |
|---|---|---|
| A page with several password fields isn't a sign-in page off the sign-in route (T1) | `dsm/crawl-rules.mts` | Q15 |
| ULIDs fold into `:id` by default; doctor warns an older config (T2) | `templates/project/config/dsm-config.json`, `cli/project.mts` | |
| Pipeline stage 10 finds `app.json`; `qam check-scripts` records its result for stage 13 (T3, T4) | `pipeline/pipeline.mts`, `cli/automation.mts` | Q39 |
| Stages 10–13 are optional and never "next" (T5) | `pipeline/pipeline.mts` | Q39 |
| `/qamaster:status` | `commands/status.md` | |
| `scripts/package.sh`: the plugin zip (Claude desktop) and the marketplace zip (CLI), checked; [install.md](install.md) | `scripts/package.sh` | |
| Local first: with no `QAMASTER_STORE` the store is the one the ledger names, else the local file store, not Azure DevOps | `shared/config.mts` | Q44 |

Not in 0.3.0: Feedback, Reports and Requirements (`qam requirements fetch`), and the v1.1, v2 and v3 scope in product.md.
