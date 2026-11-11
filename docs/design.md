# QAMaster: Design

> Status: current at 0.7.0 (2026-11-10). Written as designed; what's built is in [releases.md](releases.md) and the [setup guide](v0.7.2-setup-guide.html). How QAMaster looks and behaves for each user. For the why, see [product.md](product.md). For how it's built, see [tech.md](tech.md).

## Principles

1. **Never a silent decision.** Every selected, skipped and BROKEN test case shows a reason. Every verdict shows the rule that decided it. Every test step shows its evidence. (CM + AQE)
2. **A person approves before anything is published or run.** The tool proposes, and approving the proposal as-is takes one action. (CM-D6, AQE)
3. **Facts or nothing.** No screen, step or rule without a source. A gap is reported, never filled by guessing. (AQE)
4. **Fail loudly and safely.** If a step can't finish, the result is never green. (CM)
5. **Same words everywhere.** The CLI, Claude Code, reports and the PR comment use the same terms and IDs.

## Vocabulary

| Term | Meaning |
|---|---|
| **DSM** | Design Structure Matrix: every screen, element and navigation, from the crawl and the code scan |
| **Run** | One TestGen output for a module: draft test cases plus their validation and review |
| **Draft case** | A generated test case, local ID `TC-LOGIN-001`, not yet in the tracker |
| **Test case** | A case in ADO Test Plans, shown as `TC5101` |
| **Ledger** | The record of which draft became which test case, with the tags QAMaster owns |
| **Change** | The diff being checked: `merge-base..HEAD` |
| **Plan** | The proposed test cases for a change, each with reasons, plus what won't run and the coverage gaps |
| **Gap** | A screen the change touched that no selected test case covers |
| **Verdict** | `pass`, `fail` or `blocked`, bound to one commit |

## Commands

Built today: `status`, `dsm`, `publish`, `check` and `report`. `onboard`, `setup` and `plan` are designed, not built: their work runs through the skills and the CLI (`qam setup`, `qam pipeline next`, `qam plan`).

| Command | Does | Writes |
|---|---|---|
| `/qamaster:onboard <url> <repo> [name] [--channels …]` (planned) | Runs the build stages in order and resumes after interruptions. Asks for anything missing, never for secrets | QA project |
| `/qamaster:status` | Every stage with its evidence, and the next step | Nothing |
| `/qamaster:setup` (planned) | Config, packages, browsers, launcher. Safe to re-run | QA project |
| `/qamaster:dsm [run\|refresh\|changes\|…]` | Build or refresh the DSM and show what changed | `dsm/` |
| `/qamaster:publish [run]` | Dry run of what goes to ADO, then waits for a yes, then applies | ADO, ledger |
| `/qamaster:plan [base]` (planned) | Shows the plan for the current change, with Claude's group picks. Runs nothing | `.qamaster/plans/` |
| `/qamaster:check [base]` | Plan, then drafts or updates scripts for the selected cases (Q39), shows the cases and scripts, waits for one approval, then runs and reports the verdict | `.qamaster/`, scripts in the test root (left uncommitted) |
| `/qamaster:report` | Builds every report there is data for | `reports/output/` |

Skills trigger on plain words: "write test cases for checkout", "which tests cover this change", "show test case 26", "retire TC34", "why did my push get blocked".

## CLI

```bash
qam setup [--check] [--no-install] [--browsers chromium|all|none] [--app NAME] [--url URL] [--move-account]
          [--source FOLDER|GIT-URL [--branch B] [--clone-to DIR | --use-clone DIR]] [--entry claude-code,…]
qam integrations list [--all] | add <entry…> | remove <id> | verify
qam pipeline start|status|next|mark|reset ...
qam status                                    # R2: short for qam pipeline status
qam doctor                                    # settings, credentials, plan, runner
qam dsm run|refresh|changes|impact <files…>
qam dsm run --routes GLOB…                    # 0.7.0: crawl only those routes, merged into the last DSM
qam dsm run --estimate                        # 0.7.0: routes, pages and minutes a crawl would take; crawls nothing
qam dsm compare [OLDER] [NEWER]               # 0.7.0: what changed between two DSMs; no argument lists dsm/history/
qam requirements fetch (--sprint NAME | --current-sprint | --from D --to D) [--module AREA] [--scope NAME]
qam requirements import --file STORIES.xlsx|.csv|.json|.md [--sheet NAME] [--scope NAME]   # a Jira or spreadsheet export
qam requirements list                         # the saved scopes; a TestGen manifest names one in requirements_scope
qam testgen context|validate|render <run>
qam review <run> [--yes]                      # records gate 1 with the ADO account + git email; commands call it only after the person's yes
                                              # E3: on a terminal it shows the run and asks; --yes records without asking.
                                              # 0.8.0 (D10): with no terminal and no --yes it exits 2: nobody was asked
qam publish <run> [--to file,ado] [--apply] [--retire] [--leave-out ID,…] [--skip-smoke ID,…]
qam store [use ado|file]                      # R23: which store test cases go to; use writes QAMASTER_STORE in .env, the ledger keeps each store's IDs
qam app create [--app NAME] [--web-url URL] [--api-url URL]   # <App>/ in the QA project from the playwright-bdd template;
                                              # 0.7.0: on an existing folder, adds missing template files, never overwrites
qam check-scripts [--quick]
qam plan    [--base REF] [--preset fast|standard|full] [--tag GROUP[=WHY]] [--all]
                                              # Q31 (0.7.0): preset, else gate.preset; --all is --preset full:
                                              # every case with a script, recorded ones included (Q49)
qam automate <plan-id> [--done | --try]       # Q39: scripts to draft/update/keep; --done records them, binds the plan;
                                              # 0.8.0: --try runs the new scripts once, records nothing (exit 0/1)
qam approve <plan-id> [--add TC…|GROUP] [--remove TC…|GROUP] [--yes] [--allow-empty]
                                              # 0.8.0: with no terminal it needs --yes (the person's yes, passed on);
                                              # an approval that would run 0 cases is refused unless --allow-empty (D3)
qam run     <plan-id>
qam check   [--base REF] [--tag …] [--yes] [--all] [--allow-empty]   # plan, automate (Q39), approve, run
qam feedback [<sha>]
qam report all|manual|<type>
qam req|tc list|show|create|update|retire ... [--apply]
qam export --target kiro|codex|antigravity|cursor|gemini|copilot|agent-plugin|all
qam mcp-serve [--project DIR]
```

**What `qam setup` writes into the QA project (0.8.0, Q58).**
- `.claude/settings.json` gets `deny` rules (Claude can't read `.env*` or `dsm/.auth/`) and `ask` rules for `qam review` and `qam approve`, called through `node …/main.mts` or the launchers: Claude Code asks the person to click Allow before either runs, so a chat "yes" can't record a review or an approval. Existing rules are kept. `qam doctor` warns when the ask rules are missing.
- `config/dsm-config.json` names the test account `<APP>_USER` / `<APP>_PASSWORD` (`login.username_env` / `password_env`; `TodoApp` gives `TODOAPP_USER`) and has no `secrets_file`. The account's values live only in the QA project's `.env`, which the crawl, the check and the scripts all read. A project that kept them in `.env.dsm` is told which two lines to move (names only); `qam setup --move-account` copies them to `.env` and removes them from `.env.dsm`, after the person's yes, and prints no value.

Global flags are `--repo <path>` and `--json`. Exit codes: `0` pass, `1` fail, `2` blocked, `3` awaiting approval. Without a TTY or `--yes`, `check` stops after the plan with exit code 3.

Where the gate keeps its files (Q52): run from an app clone that a QA project recorded, plans, verdicts, evidence and `drafts.json` go to that QA project's `.qamaster/gate/<source name>/`. From the clone, the QA project is found first from `QAMASTER_TEST_ROOT` in the clone's `.env` (then upwards from the clone), else through the per-user index (`~/.qamaster/installs.json`), which lists only QA projects with an integration installed (the push hook, for one). A QA project with none isn't found from its clone, so a run there keeps its files in the clone's own `.qamaster/`, as before 0.6.0, until an integration is installed in the QA project (`qam integrations add`). The push hook finds the QA project the same way as `qam`, so it reads the verdict where `qam` wrote it.

## The publish preview

```
QAMaster publish 20261028-1410-checkout → ADO plan "Shop Web" (dry run)
Reviewed by j.doe (ADO) · j.doe@example.com (git) on 2026-10-28 14:22
Warning: Checkout's owner is A. Rao (config/qamaster.json). Publishing anyway is allowed.

Create (3)
  TC-CHECKOUT-014  Apply a valid coupon at checkout        suite Checkout · tags checkout, checkout-coupon, path:src/coupon/**
  TC-CHECKOUT-015  Expired coupon shows an error            suite Checkout · tags checkout, checkout-coupon, path:src/coupon/**
  TC-CHECKOUT-016  Card payment completes the order         suite Checkout · tags checkout, path:src/checkout/**

Update (1)
  TC5101 ← TC-CHECKOUT-002  steps changed (3 → 4)          automation link added: bdd:@TC-CHECKOUT-002, script link added (Q40)
    removes tag path:src/**                                 a path: tag the run no longer derives (Q56)

Conflict (1), not written
  TC5104 ← TC-CHECKOUT-007  changed in ADO by A. Rao on 2026-10-27; review it there or re-run with the ADO version

Unchanged (40)

Smoke suggestions (P1, Positive or E2E; the plan has 5 smoke, 2 ticked here: 7 of max 20 for the whole plan)
  [x] TC-CHECKOUT-016  Card payment completes the order
  [x] TC5101           Coupon applies discount to cart total
  (TC5107 not suggested: QA removed smoke on 2026-10-21)

Reply yes to apply, untick smoke suggestions you don't want, or name the cases to leave out.
```

An update replaces the case's `path:` tags (Q56): every stored `path:` tag the run no longer derives is removed, including one added by hand in the store, and each removal is listed under the case as `removes tag …`. Other tags are removed only when QAMaster owned them and no longer derives them (Q8); tags people added stay. A case edited in the store since the last publish is a conflict, and nothing is removed from it.

## The plan

Based on CheckMaster's layout, with one new section, **Coverage gaps**.

```
QAMaster plan 3f2a91c0 for feature/coupon-codes vs main (3 files changed)
Selection: preset standard (path, smoke, dsm, group); groups picked by sonnet

Selected (5 of 212 test cases)
  [x] TC4410  Checkout completes with card payment      covers src/checkout/**
  [x] TC1001  Smoke: user can log in                    smoke set
  [x] TC5101  Coupon applies discount to cart total     group checkout-coupon: coupon rules changed in src/coupon/rules.ts
  [x] TC5102  Expired coupon shows an error             group checkout-coupon: coupon rules changed in src/coupon/rules.ts
  [x] TC5110  Coupon field accepts 20 characters        covers src/coupon/**

Not run
  TC5103  Coupon applies to gift cards                  manual (no automated test)
  TC5120  Remove coupon from order                      BROKEN: bdd:@TC-CHECKOUT-021 not found in the suite

Coverage gaps (from the DSM)
  /checkout/review   src/checkout/ReviewPanel.tsx changed; no test case visits this screen
                     → propose: TestGen for Checkout › Review

Other groups (add with --tag, or approve --add <group>)
  payments: Refund to card; Pay with gift card

Scripts (Q39; uncommitted in the test root, approved with the plan)
  new      TC5110  bdd:@TC-CHECKOUT-018   features/checkout/coupon.feature (+24)
  updated  TC4410  bdd:@TC-CHECKOUT-016   code under src/checkout/** changed (+3 −1)
  kept     TC1001  pytest:tests/test_login.py::test_login
  2 drafted scripts not pushed to the QA repo: their links stay unpublished
```

Layout rules:
- Selected cases are ordered by reason: path match, then smoke, then the DSM, then stories (`story AB#<id>`, 0.8.0), then groups.
- A **Stories in this change** section lists each `AB#<id>` the commits or branch name carry and the cases tagged `req:<id>` for it; a story with none is a coverage gap.
- When approval would run 0 cases, the plan prints a warning that approval will be refused.
- Groups Claude picked start checked, with a one-line reason tied to the diff.
- Manual and BROKEN cases are never dropped silently. BROKEN fails the check.
- Gaps don't change the verdict. They're shown so the person can start a design run.
- The `Selection:` line (0.7.0) names the preset, the selectors that ran and the model that picked groups. `fast` is path and smoke (the DSM adds nothing), `standard` (the default) all of them, stories included, `full` every case with a script whatever changed (the same as `--all`). The model is named only under `standard` with AI on.
- With `QAMASTER_AI=off`, the plan has no Claude-picked groups, and its header line ends with "Group picking off for this repo".

## Verdict rules

| Situation | Verdict |
|---|---|
| All approved tests passed | `pass` |
| Any approved test failed after one retry | `fail`; the reason names the failure's kind (assertion failed, step couldn't act on the page, script error) before the first error line (0.8.0) |
| A test failed, then passed on the retry (flaky) | `pass`, with a warning. `gate.retries: 0` turns the retry off, so the same case fails: the strict setting (0.8.0, Q13 unchanged) |
| A script drafted by this check, never passed before, failed | `fail`, labelled "new script failed: check the script or the app" (Q39) |
| A runner's tools are missing and the person didn't approve the download, or a link names a runner QAMaster doesn't have | `blocked`, with what to install or change (Q38) |
| An approved test didn't run or was skipped | `fail` |
| A selected case is BROKEN | `fail` |
| A UI case passed, but the app or its API answered 5xx, a request to them got no answer (anything but `net::ERR_ABORTED`), or the page threw an error that `gate.allowErrors` doesn't name | `fail`, with the request, status and body (or the error) in `app-errors.json` (Q53, Q58) |
| No test case matched the change | `pass`, with a coverage-gap warning |
| Approval would run 0 cases although the change matched cases that can't run (manual cases picked by path, the DSM, a group, a story or `--all`, or every item removed) | `qam approve` and `qam check --yes` are refused (`blocked`, exit 2), and the plan says so. `--allow-empty` approves it anyway; the plan records `allowEmpty` and the verdict warns (0.8.0, D3, amends Q13). A plan that matched nothing, or only manual smoke cases, is still a `pass` with a warning |
| The change names a story (`AB#<id>`) no case is tagged `req:<id>` for | the verdict is unchanged; the plan lists the story as a coverage gap (0.8.0) |
| Missing settings, credentials, ADO unreachable, no plan | `blocked` |
| The QA project (`QAMASTER_TEST_ROOT`) has uncommitted changes the plan didn't make | `blocked` |
| HEAD, the QA project's commit or the drafted scripts changed since approval | plan void; approve again |
| Plan not approved | pending, never green |

A test that fails and then passes on retry is **flaky**. It's listed but doesn't fail the verdict. Evidence for each failed or flaky case (screenshot, video, trace) is listed under it, with the command to open the trace.

## Configuration

**App repo** `.env` (git-ignored). This is all a developer sets:

```bash
QAMASTER_ADO_ORG=galent
QAMASTER_ADO_PROJECT=Shop
# QAMASTER_ADO_PLAN=Shop Web            # only if no plan is named like app.name (else the folder)
# QAMASTER_TEST_ROOT=../shop-qa/Shop    # only if the tests live in a QA project
# QAMASTER_RUNNER=pytest                # runner for new links; default playwright-bdd (Q38)
# QAMASTER_STORE=ado                    # Azure DevOps Test Plans, with the QAMASTER_ADO_* lines above
# QAMASTER_STORE=file                   # testcases/testcases.csv, or testcases.json when there is no CSV (Q34, Q36)
#                                       # unset: the store the ledger already names, else file (Q44)
# QAMASTER_AI=off                       # turn off every AI step for this repo (Q24, data-handling.md)
# QAMASTER_ADO_TOKEN=…                  # or use az login
#   unset: AZURE_DEVOPS_EXT_PAT, then az login; an unset org and project come, as a pair, from
#   `az devops configure --defaults` (~/.azure/azuredevops/config) (R24, 0.6.0)
```

**QA project** `config/qamaster.json`:

```json
{
  "app": { "name": "Shop", "url": "https://shop.example.test", "repo": "../shop", "channels": ["web", "api"] },
  "publish": { "pathDepth": 4, "suiteBy": "module" },
  "smoke": { "max": 20, "priorities": ["P1"], "categories": ["Positive", "E2E"] },
  "testgen": { "hallucination_tolerance": 0 },
  "ai": "on",
  "owners": { "Checkout": "a.rao@example.com" },
  "gate": { "retries": 1, "noMatch": "pass-with-warning", "sharedShare": 0.3, "allowErrors": [], "preset": "standard", "groupsModel": null },
  "runners": { "pytest": { "root": "../shop/tests" }, "playwright-bdd": { "root": "Shop" } }
}
```

`gate.retries` (default 1) is how many times a failed case runs again: failed, then passed is *flaky*, a pass with a warning. Set it to `0` for no retry, so a flaky case is a failure. `gate.sharedShare` (Q37) and `runners` (Q38) are built in [0.3.0](plans/0.3.0.md). A runner without a `runners` entry uses `QAMASTER_TEST_ROOT`.

`gate.allowErrors` (Q53, 0.6.0) lists strings matched against an app error's URL or message; a match is ignored. Empty by default: every 5xx from the app's origin or the API's (`apiUrl` in `app.json`, or `API_BASE_URL`), every request to them that got no answer, and every uncaught page error fails the case. An empty string is refused, since it would allow everything.

`gate.preset` (Q31, 0.7.0) is `fast`, `standard` (default) or `full`; `qam plan --preset` overrides it. `gate.groupsModel` names the Claude Code model `/qamaster:check` gives the subagent that picks groups: `sonnet`, `opus`, `haiku`, `fable` or `inherit`; unset (`null`), the session's own. The CLI only records it; CI, the push hook and `QAMASTER_AI=off` never pick groups. The plan's `Selection:` line names the model only when one can pick groups: not in CI (`CI` set, or Azure Pipelines' `TF_BUILD=True`) and not with AI off (0.7.1).

The DSM, TestGen and MCP config files keep Autonomous-QE's formats. 0.7.0 adds to `dsm-config.json`: `application.login.signed_out_pass` (default on: with sign-in configured, crawl signed out first and merge the two passes, each screen recording `access`: `public`, `signed-in` or `both`; `--login-mode none` crawls only signed out) and `application.crawl.concurrency` (tabs crawled at once in one session, default 3; 1 is the old behaviour).

**Channels (0.7.0).** The automation folder has a folder per channel: `features/web` (the `chromium` project), `features/api` with `steps/api` and `src/api` (a base client, a response wrapper, one service per resource; the `api` project, base URL from `app.json`'s API URL) and `features/mobile-web` (the `mobile-chrome` project, Chromium with a `Pixel 7` viewport and touch). A channel's project exists only when its folder has a feature, and a case runs only in its own channel's project. TestGen's API cases cite `dsm:api:<METHOD> <path>`, checked against the code model's API routes; they have no screen.

## Messages

- Say what happened, why, and what to do next, in one or two lines. Example: "Couldn't reach Azure DevOps (401). Check that QAMASTER_ADO_TOKEN has Work Items and Test Management (Read), or run `az login`. Then run `qam doctor`."
- Use IDs people can click: `TC5101` links to ADO, a gap's screen links to its DSM cell.
- No emoji in CLI output. Reports and PR comments use ✅ ❌ ⚠️ for results only.
