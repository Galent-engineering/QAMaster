# Handoff: where the work stands (2026-11-10)

Read this first in a new session, then [0.7.0.md](0.7.0.md) (r2) and [0.6.0.md](0.6.0.md) (r5). It's the state, the rules the session learned, and the next steps.

## Where things are
- `main` (pushed): 0.5.0 released, Q49 decided, the 0.6.0 plan.
- `release/0.6.0` (local, not pushed): **0.6.0 built**, items 1–14, version 0.6.0. Not merged to `main`, not tagged. Plan r5 has what shipped and what is open.
- `release/0.7.0` (local, not pushed): **0.7.0 built** on top of `release/0.6.0`, items 1–17, version 0.7.0 with the user's yes. Not merged, not tagged. Plan r2 has what shipped, the decisions built to their recommendations, and what moves to 0.7.1. Zips from `scripts/package.sh` are in `dist/` (not committed).
- Both releases were built with parallel worktrees; the worktrees and `wt/*` branches were removed once their commits were in the release branches.
- **Nothing is pushed.** Merging `release/0.7.0` to `main` (it contains 0.6.0) and pushing wait for the user.
- `docs/demos/demo_guideme/` is untracked and belongs to someone else: leave it.

## The road (Q54, accepted 2026-11-10)
0.6.0 gate and store (built) → 0.6.1 fixes → 0.7.0 coverage (built: sign-in apps, faster DSM, presets, API and Mobile Web scripts) → 0.7.1 fixes → 1.0.0 proof, no new feature → 1.1.0 native Android and iOS → 1.2.0 product v1.1 (git hook, IDEs, PR checks). Detail: [backlog.md](backlog.md#the-road-to-100-replanned-2026-11-10-q54).

## 0.6.0 status
All 14 items built and reviewed; 639 tests, typecheck and lint clean. Where the code is: gate state `gate/state.mts`; hook `hooks/pre-push.mts`; app errors `framework/playwright-bdd/src/app-errors.ts`; app tests `gate/apptests.mts`; destinations and `qam store` in `cli/publish.mts`, `cli/project.mts`, `publish/ledger.mts`; az credentials `shared/env.mts`.

**Open, for 0.6.1 or a decision** (detail in [0.6.0.md](0.6.0.md) r5):
- Not seen live: the hook under Claude Code from an app clone; item 3 through the real playwright-bdd tools after a store switch; item 4's fixture inside a real playwright-bdd project.
- Undecided: `--take-store`, ADO credentials from a file (W8); publish without `--to` always writing the file store too; exempting a push from the QA project itself; `qam review` with no terminal requiring `--yes`; watching a backend origin other than `baseURL`.
- Small: `allowErrors` missing from the settings template; `qam setup`'s `tty.isatty(0)` change has no test; a QA project set up before `~/.qamaster/installs.json` isn't found from its clone; the doctor test that fails when the shell sets `QAMASTER_ADO_*`.

## 0.7.0 status
All 17 items built and reviewed; 728 tests, typecheck and lint clean. Where the code is: the signed-out pass and merge `dsm/crawl-rules.mts` (`mergePasses`) and `adapters/crawler-playwright.mts`; compare and estimate `dsm/update.mts`, `cli/dsm.mts`; source ownership `dsm/scan.mts`; presets `gate/presets.mts` (types in `shared/models.mts`); TestGen access, dialogs and API evidence `testgen/facts.mts`, `testgen/validate.mts`; step wording `testgen/render.mts`; API and Mobile Web template `plugin/framework/playwright-bdd/`, checks `automation/quality.mts`.

**Open, for 0.7.1 or a decision** (detail in [0.7.0.md](0.7.0.md#moved-to-071-or-a-decision)):
- Decisions: confirm D1, D2, D4–D9 as built (D6 includes `fable`, which the Claude Code subagent docs list) and record them in decisions.md; D3 (narrower `path:` tags on a republish) needs a decision entry before it's built.
- Not seen live: a signed-in crawl of fastapi-react-app; a generated folder through `npm install`, `bddgen` and `playwright test --list`; the changed skills under `--plugin-dir`.

## What this session learned
- **Build order and checks.** One release branch per release, items test-first, `npm run check` before a release. Run the suite with `env -u QAMASTER_ADO_ORG -u QAMASTER_ADO_PROJECT -u QAMASTER_STORE`: the user's shell sets them and one existing doctor test (`tests/project.test.mts`, "doctor checks config…") fails with them. Fixing that test to ignore the environment is still open.
- **Release steps.** Bump the version, add a revision row to the plan, update `releases.md`, `plans/README.md`, the backlog, the README status line, and rename the setup guide (`v<version>-setup-guide.html`, fix its links with `sed`). Build zips with `scripts/package.sh` only after committing (it refuses uncommitted `plugin/` changes). No tags.
- **Pushing:** `env -u GH_TOKEN git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`. Push only when asked.
- **macOS sed:** `sed -i ''`. A regex with `app` inside a word needs `\b` (it matched "Apply").
- **ADO:** the user's four projects (fastapi-react-app, Toolshop, AgentMesh, dummy-static-website) have no stories; a live fetch needs a project with some, or `qam requirements import`. `work/teamsettings` is a team-level call (`{org}/{project}/{team}/_apis`); the fake in `tests/fake-ado.mts` answers it.
- **Test doubles:** every `requirements()` call now reads the team's bug setting; `tests/ado.test.mts`'s Mock answers "off" when a test doesn't script it.
- **0.7.0 replay:** plan, `dsm` (10 commits) and `gen` (5) cherry-picked onto `release/0.6.0`; the only conflicts were in item 14 (`cli/gate.mts`, `shared/schema.mts`, `skills/Gate`) against 0.6.0's `--all` and `gate.allowErrors`: both kept, `--preset full` now runs makePlan's `all`.
- **0.6.0 replay:** three branches cherry-picked in order (gate-a, gate-b, store); the only conflicts were import lines in `cli/publish.mts` and `cli/project.mts` (both sides kept). Reviewers found real faults in two of three branches; both were fixed on the branch before the replay.
- **`az devops` defaults** live in `~/.azure/azuredevops/config` (or `$AZURE_DEVOPS_EXT_CONFIG_DIR`), not `~/.azure/config`.
- **Working style the user wants:** short status updates when a step is slow; decisions asked with a recommendation first; docs updated with every release; answers kept plain.

## Still owed (the user's own runs)
Load the 0.7.0 zip from `dist/` in Claude desktop (8 skills); run 0.6.0 and 0.7.0 live (fastapi-react-app signed out and signed in, with imported stories; a generated folder with API and Mobile Web features); re-run dummy-static-website's DSM and AgentMesh's TestGen; the Docker check; `/qamaster:status`, `/qamaster:report` and the push hook from the installed plugin.
