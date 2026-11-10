# Handoff: where the work stands (2026-11-10)

Read this first in a new session, then [0.6.0.md](0.6.0.md). It's the state, the rules the session learned, and the next steps.

## Where things are
- `main` (pushed): 0.5.0 released, Q49 decided, the 0.6.0 plan.
- `release/0.6.0` (pushed): `main` plus items 3 and 5 of 0.6.0, the Q54 road, and the 0.6.0 plan r3. Not merged to `main`.
- Plugin version in `plugin/.claude-plugin/plugin.json` is still **0.5.0**: bump to 0.6.0 at release, with the user's yes.
- `docs/demos/demo_guideme/` is untracked and belongs to someone else: leave it.

## The road (Q54, accepted 2026-11-10)
0.6.0 gate and store → 0.6.1 fixes → 0.7.0 coverage (sign-in apps, faster DSM, then API and Mobile Web scripts) → 0.7.1 fixes → 1.0.0 proof, no new feature → 1.1.0 native Android and iOS → 1.2.0 product v1.1 (git hook, IDEs, PR checks). Detail: [backlog.md](backlog.md#the-road-to-100-replanned-2026-11-10-q54).

## 0.6.0 status
| # | Item | State |
|---|---|---|
| 1 | Gate state in the QA project (Q52) | **Next.** Read both places for one release, write only to the QA project (decided) |
| 2 | Push hook blocks from the app clone (Q52) | Next, with item 1 |
| 3 | Bindings kept per test case (Q49) | Built: `rebind()` in `gate/automate.mts`, called by `rebound()` in `cli/gate.mts` |
| 4 | An app error fails a passing UI case (Q53) | To do; key `gate.allowErrors` (decided) |
| 5 | Every verdict kept | Built: `verdicts/<head>-<plan>.json`, the hook takes the newest |
| 6 | Doctor names a second build of the same version | To do |
| 7 | The app's own tests noticed | To do |
| 8–14 | The store half: Q50, switching stores, `az` credentials, conflicts, `qam status`, review confirm, `plan --all` | To do; **Q50 must be accepted first**, and `--take-store` and W8 need decisions |

Item 3 has a unit test but no end-to-end run through the real BDD tools: the live run must check it. Item 1 touches `stateDir` in `cli/gate.mts`, `reports/inputs.mts`, `pipeline/pipeline.mts` (stage 14 reads the app repo's verdicts) and `reports/types.mts`.

## What this session learned
- **Build order and checks.** One release branch per release, items test-first, `npm run check` before a release. Run the suite with `env -u QAMASTER_ADO_ORG -u QAMASTER_ADO_PROJECT -u QAMASTER_STORE`: the user's shell sets them and one existing doctor test (`tests/project.test.mts`, "doctor checks config…") fails with them. Fixing that test to ignore the environment is still open.
- **Release steps.** Bump the version, add a revision row to the plan, update `releases.md`, `plans/README.md`, the backlog, the README status line, and rename the setup guide (`v<version>-setup-guide.html`, fix its links with `sed`). Build zips with `scripts/package.sh` only after committing (it refuses uncommitted `plugin/` changes). No tags.
- **Pushing:** `env -u GH_TOKEN git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`. Push only when asked.
- **macOS sed:** `sed -i ''`. A regex with `app` inside a word needs `\b` (it matched "Apply").
- **ADO:** the user's four projects (fastapi-react-app, Toolshop, AgentMesh, dummy-static-website) have no stories; a live fetch needs a project with some, or `qam requirements import`. `work/teamsettings` is a team-level call (`{org}/{project}/{team}/_apis`); the fake in `tests/fake-ado.mts` answers it.
- **Test doubles:** every `requirements()` call now reads the team's bug setting; `tests/ado.test.mts`'s Mock answers "off" when a test doesn't script it.
- **Working style the user wants:** short status updates when a step is slow; decisions asked with a recommendation first; docs updated with every release; answers kept plain.

## Still owed (the user's own runs)
Load a 0.5.0 zip in Claude desktop and check the catalog (8 skills); run 0.4.4 and 0.5.0 live (fastapi-react-app with imported stories); re-run dummy-static-website's DSM and AgentMesh's TestGen; the Docker check; `/qamaster:status`, `/qamaster:report` and the push hook from the installed plugin.
