# QAMaster: Design

> Status: draft v0.1 (2026-10-28). How QAMaster looks and behaves for each user. For the why, see [product.md](product.md). For how it's built, see [tech.md](tech.md).

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

| Command | Does | Writes |
|---|---|---|
| `/qamaster:onboard <url> <repo> [name] [--channels …]` | Runs the build stages in order and resumes after interruptions. Asks for anything missing, never for secrets | QA project |
| `/qamaster:status` | Every stage with its evidence, and the next step | Nothing |
| `/qamaster:setup` | Config, packages, browsers, launcher. Safe to re-run | QA project |
| `/qamaster:dsm [run\|refresh\|changes\|…]` | Build or refresh the DSM and show what changed | `dsm/` |
| `/qamaster:publish [run]` | Dry run of what goes to ADO, then waits for a yes, then applies | ADO, ledger |
| `/qamaster:plan [base]` | Shows the plan for the current change, with Claude's group picks. Runs nothing | `.qamaster/plans/` |
| `/qamaster:check [base]` | Plan, then waits for approval, then runs and reports the verdict | `.qamaster/` |
| `/qamaster:report` | Builds every report there is data for | `reports/output/` |

Skills trigger on plain words: "write test cases for checkout", "which tests cover this change", "show test case 26", "retire TC34", "why did my push get blocked".

## CLI

```bash
qam setup [--check] [--no-install] [--browsers chromium|all|none] [--app NAME] [--url URL]
          [--source FOLDER|GIT-URL [--branch B] [--clone-to DIR | --use-clone DIR]] [--entry claude-code,…]
qam integrations list [--all] | add <entry…> | remove <id> | verify
qam pipeline start|status|next|mark|reset ...
qam doctor                                    # settings, credentials, plan, runner
qam dsm run|refresh|changes|impact <files…>
qam requirements fetch --sprint NAME | --current-sprint | --from D --to D
qam testgen context|validate|render <run>
qam review <run>                              # records gate 1 with the ADO account + git email; commands call it only after the person's yes
qam publish <run> [--apply] [--retire] [--leave-out ID,…] [--skip-smoke ID,…]
qam app create --app NAME --web-url URL [--api-url URL]
qam check-scripts
qam plan    [--base REF] [--tag GROUP[=WHY]]
qam approve <plan-id> [--add TC…|GROUP] [--remove TC…|GROUP] [--by NAME]
qam run     <plan-id>
qam check   [--base REF] [--tag …] [--yes] [--all]
qam feedback [<sha>]
qam report all|manual|<type>
qam req|tc list|show|create|update|retire ... [--apply]
qam export --target kiro|codex|antigravity|cursor|gemini|copilot|agent-plugin|all
qam mcp-serve [--project DIR]
```

Global flags are `--repo <path>` and `--json`. Exit codes: `0` pass, `1` fail, `2` blocked, `3` awaiting approval. Without a TTY or `--yes`, `check` stops after the plan with exit code 3.

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
  TC5101 ← TC-CHECKOUT-002  steps changed (3 → 4)          automation link added: bdd:@TC-CHECKOUT-002

Conflict (1), not written
  TC5104 ← TC-CHECKOUT-007  changed in ADO by A. Rao on 2026-10-27; review it there or re-run with the ADO version

Unchanged (40)

Smoke suggestions (P1, Positive or E2E; the smoke set would be 7 of max 20)
  [x] TC-CHECKOUT-016  Card payment completes the order
  [x] TC5101           Coupon applies discount to cart total
  (TC5107 not suggested: QA removed smoke on 2026-10-21)

Reply yes to apply, untick smoke suggestions you don't want, or name the cases to leave out.
```

## The plan

Based on CheckMaster's layout, with one new section, **Coverage gaps**.

```
QAMaster plan 3f2a91c0 for feature/coupon-codes vs main (3 files changed)

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
```

Layout rules:
- Selected cases are ordered by reason: path match, then smoke, then groups.
- Groups Claude picked start checked, with a one-line reason tied to the diff.
- Manual and BROKEN cases are never dropped silently. BROKEN fails the check.
- Gaps don't change the verdict. They're shown so the person can start a design run.
- With `QAMASTER_AI=off`, the plan has no Claude-picked groups, and its header line ends with "Group picking off for this repo".

## Verdict rules

| Situation | Verdict |
|---|---|
| All approved tests passed | `pass` |
| Any approved test failed after one retry | `fail` |
| An approved test didn't run or was skipped | `fail` |
| A selected case is BROKEN | `fail` |
| No test case matched the change | `pass`, with a coverage-gap warning |
| Missing settings, credentials, ADO unreachable, no plan | `blocked` |
| The QA project (`QAMASTER_TEST_ROOT`) has uncommitted changes | `blocked` |
| HEAD or the QA project's commit moved since approval | plan void; approve again |
| Plan not approved | pending, never green |

A test that fails and then passes on retry is **flaky**. It's listed but doesn't fail the verdict. Evidence for each failed or flaky case (screenshot, video, trace) is listed under it, with the command to open the trace.

## Configuration

**App repo** `.env` (git-ignored). This is all a developer sets:

```bash
QAMASTER_ADO_ORG=galent
QAMASTER_ADO_PROJECT=Shop
# QAMASTER_ADO_PLAN=Shop Web            # only if no plan is named like the repo folder
# QAMASTER_TEST_ROOT=../shop-qa/Shop    # only if the tests live in a QA project
# QAMASTER_RUNNER=pytest                # default playwright-bdd
# QAMASTER_STORE=ado                    # or file: testcases.csv (or .json) in the QA project (Q34, Q36)
# QAMASTER_STORE=file                   # testcases/testcases.csv, or testcases.json when there is no CSV (Q34, Q36)
# QAMASTER_AI=off                       # turn off every AI step for this repo (Q24, data-handling.md)
# QAMASTER_ADO_TOKEN=…                  # or use az login
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
  "gate": { "retries": 1, "noMatch": "pass-with-warning" }
}
```

The DSM, TestGen and MCP config files keep Autonomous-QE's formats.

## Messages

- Say what happened, why, and what to do next, in one or two lines. Example: "Couldn't reach Azure DevOps (401). Check that QAMASTER_ADO_TOKEN has Work Items and Test Management (Read), or run `az login`. Then run `qam doctor`."
- Use IDs people can click: `TC5101` links to ADO, a gap's screen links to its DSM cell.
- No emoji in CLI output. Reports and PR comments use ✅ ❌ ⚠️ for results only.
