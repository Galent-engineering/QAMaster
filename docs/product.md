# QAMaster: Product

> Status: draft v0.1 (2026-10-28). Decisions are in [decisions.md](decisions.md); open questions are at the end of that file.

## One line

QAMaster builds a team's test cases and automation from the application and its code, puts them in Azure DevOps Test Plans, and then checks every code change against them before it's pushed.

## Problem

- **Test cases are slow to write, and they drift.** Writing them by hand from requirements and screens takes weeks. They go stale as the app changes, and nobody knows which ones.
- **Generated tests stay local.** Autonomous-QE can generate validated test cases and scripts, but they sit in a QA folder. Nothing runs them when a developer changes the code.
- **Change-based testing needs a catalog first.** CheckMaster can pick and run the right tests for a change, but only if test cases already exist in Test Plans with tags and automation links. Most teams don't have that, and tagging by hand is the biggest setup cost.
- **Nothing connects code changes to test coverage.** When a commit touches a screen with no tests, nobody is told.

## Users

| User | What they want |
|---|---|
| **QA engineer** | A grounded first set of test cases and scripts for an app, kept in Test Plans where they already work, and told when coverage falls behind the code |
| **Developer** | Before pushing, know which tests cover the change and whether they pass, without leaving the IDE |
| **Tech lead / reviewer** | See which test cases a change touched, that the right ones ran, and where coverage is missing |
| **QA lead / manager** | Reports on design coverage, execution, defects and root causes, per sprint or release |

## Core loop

1. **Build:** from the app URL and its read-only repo, QAMaster maps every screen, learns the app's flows, reads the sprint's requirements and writes test cases. Every step cites evidence. A person reviews them.
2. **Publish:** the reviewed cases go into the Azure DevOps test plan. Selection tags and automation links are filled in from what QAMaster already knows.
3. **Gate:** on every push, QAMaster reads the diff and picks the test cases it touches. A person approves the pick, the tests run, and the push goes through only on a pass.
4. **Feedback:** results feed the reports and defect drafts. Screens a change touched with no tests become a proposed test design run.

## Scope

### v1
- One Claude Code plugin, `qamaster`, and the `qam` CLI behind it.
- Build stages from Autonomous-QE: DSM, AUT skills, requirements, TestGen with tolerance 0, playwright-bdd scripts for Web, Mobile Web, API, Android and iOS, the script gate.
- Publish to Azure DevOps Test Plans, with derived tags and automation links.
- The CheckMaster gate: plan, approve, run, verdict, push hook. Runners: playwright-bdd and pytest.
- Feedback: coverage gaps, stale cases, BROKEN links, defect drafts.
- Six HTML reports.
- Export to other AI tools and the MCP server, carried over from Autonomous-QE.

### v1.1
- git pre-push hook (`qam install-hooks`), so pushes from any terminal are gated.
- GitHub and Azure Pipelines PR checks, with one plan comment per PR and approval by comment.
- In CI, run the QA project branch named like the app branch, else `main` (Q22).
- Publishing gate results back to ADO as a Test Run.

### Later
- More test case stores (Q23): first a project spreadsheet (`testcases.xlsx` / `.csv`) for teams with no tracker, then Jira through Xray or Zephyr.
- Cypress and other runners.
- A VS Code extension that calls the CLI.
- Learning from history: which tests failed for which files.

### Not doing
- Filing bugs automatically. Failures become drafts a person files.
- Changing the application's repository.
- Running tests that have no automation. They are listed, not run.
- Replacing CI or the test runner.

## Success criteria

| Area | Target | From |
|---|---|---|
| Test design | 0 validator findings; every DSM screen and journey in scope covered or excluded with a reason | AQE |
| Selection | On real changes, at least 90% of the tests a QA engineer would pick are in the plan, at no more than 30% of the suite | CM |
| Setup cost | No hand-typed tags or automation links for generated cases | New |
| Speed | Trigger to plan in under 30 seconds, excluding the test run | CM |
| Approval | One action to approve a plan as proposed | CM |
| Trust | Every selected, skipped and BROKEN case shows a reason. The check is never green when a selected test failed or didn't run | CM |
| Coverage | Every impacted screen without a case is reported on the plan | New |

## Constraints

- Secrets come only from environment variables, git-ignored `.env` files or `az login`. They never appear in chat, plugin files or reports.
- The application repo is only read.
- Tracker writes happen only on `publish --apply` or a confirmed `work-items` change.
- Code, diffs and requirements reach Claude only inside the user's own Claude Code session. The CLI, hooks and CI make no AI calls. `QAMASTER_AI=off` turns every AI step off for a repo (Q24). [data-handling.md](data-handling.md) has the details.
