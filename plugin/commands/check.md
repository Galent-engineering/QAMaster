---
description: Plan the test cases behind this change, wait for your approval, run them, and report pass or fail
argument-hint: "[base-branch]"
allowed-tools: Bash(node:*), Bash(git diff:*), Bash(git log:*), Read
---

Check the current change with QAMaster's gate. You approve what runs before anything runs. Follow the `Gate` skill. The CLI is `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`, run from the app repo.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" plan`, adding `--base $ARGUMENTS` if an argument was given. Its first line names the base branch. Exit 3 means a plan is waiting for approval.
2. If the plan lists **Other groups** and AI is on for this repo, run `git diff <base>...HEAD`. Read the change. For each listed group the change could affect, run the plan again with `--tag '<group>=<one-line reason tied to the diff>'`, one `--tag` per group. Use only group names from the list; never invent one.
3. Show the final plan exactly as printed, in a code block, and note its plan ID. Say which groups you added and why. Point out **Not run** (manual or BROKEN), **Shared files** and **Coverage gaps**.
4. Ask: **"Do you approve plan `<id>`?"** The person can approve it as is, add test cases or groups ("add TC5103", "add the cart group"), remove some ("drop TC4410"), or stop. **Then end your turn and wait.** Never approve on their behalf. Only their reply to this question counts.
5. After their yes, run `… approve <plan-id>` with `--add …` and `--remove …` for their edits (comma-separated IDs like `TC5103`, or group names). If they said stop, say nothing ran and end.
6. Run `… run <plan-id>` and show the verdict exactly as printed.
7. Summarise in one or two sentences: pass or fail, and for each failure the test case and the first line of its error. If it passed, say `git push` is now allowed for this commit.

Exit codes: 0 pass, 1 fail, 2 blocked, 3 awaiting approval. On 2, show the message and its fix, and stop. If it says HEAD moved, offer to plan again. If a runner's tools are missing (pytest or Playwright not installed), show exactly what the message says to install, ask whether to install it, and run the install only after an explicit yes. Never install in the background.
