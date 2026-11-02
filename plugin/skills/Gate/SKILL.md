---
name: Gate
description: Checks a code change against the team's test cases before it's pushed. It plans the test cases the change touches, waits for the person's approval, runs them on pytest or playwright-bdd, and gives a pass or fail verdict that unlocks git push. Use when asked which tests cover this change, whether a branch is ready to push, to run the tests for my change, why a push was blocked, what a plan or verdict means, why a test case is not run or BROKEN, or to show a failure's screenshot.
---

# Gate

The gate reads the app repo's diff, picks the test cases in the test case store that the change touches, and runs them after a person approves. A `git push` from Claude Code is blocked until the verdict for HEAD passes, in repos set up with `qam setup --entry claude-code` (the QA project itself is never gated). To act, use `/qamaster:check`.

Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" <command>` from the app repo: `plan [--base REF] [--tag GROUP=WHY]`, `approve <id> [--add …] [--remove …]`, `run <id>`.

## How it decides

1. **The store is read live** every time (test plan named like the app, or `QAMASTER_ADO_PLAN`).
2. **Selection**, every reason kept, in this order:
   - *covers <glob>*: a `path:<glob>` tag matched a changed file;
   - *smoke set*: the `smoke` tag, always included;
   - *visits <screen>*: the DSM says the change touches a screen this published case visits;
   - *group <tag>*: a plain tag picked for this change, by Claude from the diff or by the person.
3. **Shared files:** a changed file whose path tags cover more than `gate.sharedShare` (30%) of a plan of 20 or more cases selects nothing by path; smoke and the DSM cover it (Q37).
4. **Runner per case:** the automation link's prefix names it: `pytest:<node id>` or `bdd:@<TC id>` (Q9, Q38). Each runner runs in its own folder (`runners.<name>.root` in config/qamaster.json, else `QAMASTER_TEST_ROOT`). A link with no prefix, or a runner QAMaster doesn't have, blocks.
5. **Not run:** no link means manual. A link the runner doesn't collect is **BROKEN**, and the check fails until it's fixed.
6. **Approval** is bound to HEAD and, when the tests live in a QA project, to its commit. A new commit voids it.
7. **Verdict:** fail if any approved case failed, didn't run or was skipped, or a selected link is BROKEN. Failed then passed on retry is *flaky*: a pass with a warning. Nothing matched is a pass with a coverage warning.

## Common answers

- **Push blocked:** no passing verdict for HEAD. Run `/qamaster:check`. Every new commit needs a new check.
- **Not run (manual):** the test case has no automation link. Link it in the store as `pytest:<node id>` or `bdd:@<TC id>`.
- **BROKEN:** the test was renamed or moved. Update the link.
- **Coverage gap:** the change touches a screen no published case visits. Propose a TestGen run for it; never generate during a check.
- **A test failed:** the verdict lists its evidence: a screenshot (`.png`, which can be read), a video and a Playwright trace (`npx playwright show-trace <trace.zip>`). Start with the error line and the screenshot.
- **Blocked (exit 2):** read the message; it names the fix. `qam doctor` checks the settings.

Never approve a plan, or install a runner's tools, without the person's explicit reply.
