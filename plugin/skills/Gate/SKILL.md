---
name: Gate
description: Checks a code change against the team's test cases before it's pushed. It plans the test cases the change touches, waits for the person's approval, runs them on pytest or playwright-bdd, and gives a pass or fail verdict that unlocks git push. Use when asked which tests cover this change, whether a branch is ready to push, to run the tests for my change, why a push was blocked, what a plan or verdict means, why a test case is not run or BROKEN, or to show a failure's screenshot.
---

# Gate

The gate reads the app repo's diff, picks the test cases in the test case store that the change touches, and runs them after a person approves. A `git push` from Claude Code is blocked until the verdict for HEAD passes, in repos set up with `qam setup --entry claude-code` (the QA project itself is never gated). To act, use `/qamaster:check`.

Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" <command>` from the app repo: `plan [--base REF] [--preset fast|standard|full] [--tag GROUP=WHY] [--all]` (`--all` is `--preset full`: every case with a script, with no git change needed, for a first run or a nightly check), `approve <id> [--add …] [--remove …] [--yes] [--allow-empty]`, `run <id>`, `automate <id> [--done | --try]`. When you hand the person a command to run in their own terminal, give one they can paste: every value (run name, plan id, path) filled in, never a `<placeholder>`, and the launcher by its absolute path, `node <absolute path of the QA project>/.qamaster/bin/qam.mjs <command>` (the launcher exists only in the QA project, written by `qam setup`). If `qam doctor` shows `WARN launcher`, hand over the plugin path instead and suggest running setup again from the plugin. The app repo has no launcher, so a command for the person's terminal always names the QA project.

## How it decides

1. **The store is read live** every time (test plan named like the app, or `QAMASTER_ADO_PLAN`).
2. **Selection**, every reason kept, in this order:
   - *covers <glob>*: a `path:<glob>` tag matched a changed file;
   - *smoke set*: the `smoke` tag, always included;
   - *visits <screen>*: the DSM says the change touches a screen this published case visits;
   - *story AB#<id>*: the change names a story (`AB#<id>` in a commit message since the merge base, or in the branch name) and the case is tagged `req:<id>`. The plan lists each story with its cases; a story no case is tagged for is a coverage gap in the plan and changes nothing in the verdict. `fast` ignores stories;
   - *group <tag>*: a plain tag picked for this change, by Claude from the diff or by the person.
   **Presets (Q31):** `--preset`, or `gate.preset` in config/qamaster.json, sets which of these run. `standard` (the default) is all of them, stories included. `fast` is path and smoke only: the DSM adds nothing. `full` is every case with a bound script, whatever changed (a first run, a nightly check). The plan's `Selection:` line names the preset, the selectors it used and the model that picked groups.
   **The groups model:** `gate.groupsModel` (`sonnet`, `opus`, `haiku`, `fable` or `inherit`, the Claude Code model names) is the model of the subagent `/qamaster:check` starts to pick groups from the diff; unset or `inherit` is the session's own model. Only `standard` with AI on picks groups: CI, the pre-push hook, `fast`, `full` and `QAMASTER_AI=off` never do.
3. **Shared files:** a changed file whose path tags cover more than `gate.sharedShare` (30%) of a plan of 20 or more cases selects nothing by path; smoke and the DSM cover it (Q37).
4. **Runner per case:** the automation link's prefix names it: `pytest:<node id>` or `bdd:@<TC id>` (Q9, Q38). Each runner runs in its own folder (`runners.<name>.root` in config/qamaster.json, else `QAMASTER_TEST_ROOT`). A link with no prefix, or a runner QAMaster doesn't have, blocks.
5. **Not run:** no link means manual. A link the runner doesn't collect is **BROKEN**, and the check fails until it's fixed.
6. **Just-in-time scripts (Q39):** `qam automate <id>` lists the selected cases that need a playwright-bdd script drafted or updated. The `AutomationCode` skill writes them, `qam check-scripts` must pass, and `qam automate <id> --done` records them and adds them to the plan. They stay uncommitted. Any edit after that voids the approval.
7. **Approval** is bound to HEAD and, when the tests live in a QA project, to its commit. A new commit voids it. With no terminal, `approve` needs `--yes` and blocks (exit 2) without it: pass `--yes` only after the person's yes to the plan shown. An approval that would run 0 cases is refused when the change matched cases that can't run (manual cases picked by path, the DSM, a group or `--all`, or the person removed every item): the plan prints a warning first. A plan that matched nothing, or only manual smoke cases, stays a pass with a warning. `--allow-empty` approves such a plan anyway, is recorded on the plan and named in the verdict, and is passed only on the person's explicit words.
8. **Verdict:** fail if any approved case failed, didn't run or was skipped, or a selected link is BROKEN. Failed then passed on retry is *flaky*: a pass with a warning (`gate.retries: 0` in `config/qamaster.json` turns retries off, so a flaky case fails: the strict setting; say so when someone asks how to make flaky cases fail). A failed case's reason names its kind before the first error line: *assertion failed* (the app showed something other than the case expects), *step couldn't act on the page* (a locator, the page or the app not answering) or *script error* (the script is wrong); an error that fits none gets no kind. A drafted script that fails is labelled *new script failed*, with the kind in brackets: check the script or the app. `qam automate <id> --try` runs the new scripts once before approval and records nothing; a trial pass doesn't make a script proven (Q39). Nothing matched is a pass with a coverage warning. A UI case whose steps passed still fails when the app or its API (`apiUrl`) answered 5xx, a request got no answer, or the page threw an error (Q53); the evidence has `app-errors.json`.

## Common answers

- **Push blocked:** no passing verdict for HEAD. Run `/qamaster:check`. Every new commit needs a new check.
- **Not run (manual):** the test case has no automation link. Link it in the store as `pytest:<node id>` or `bdd:@<TC id>`.
- **App error failed a passing case:** read `app-errors.json` in the evidence. A real backend fault is a fail. Known noise can be allowed by adding a string matching its URL or message to `gate.allowErrors` in `config/qamaster.json`, only after the person agrees.
- **BROKEN:** the test was renamed or moved. Update the link.
- **Coverage gap:** the change touches a screen no published case visits. Propose a TestGen run for it; never generate during a check.
- **A test failed:** the verdict lists its evidence: a screenshot (`.png`, which can be read), a video and a Playwright trace (`npx playwright show-trace <trace.zip>`). Start with the error line and the screenshot.
- **Blocked (exit 2):** read the message; it names the fix. It may be the machine's setup, not the code: a test environment to set up (`uv sync`), a browser to install, missing system libraries, or the app not running (Q41). No verdict is written, so nothing is blamed on the change. Offer the install command, and run it only after the person's yes. `qam doctor` checks the settings and the runners.

Never approve a plan, or install a runner's tools, without the person's explicit reply.
