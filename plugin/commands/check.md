---
description: Plan the test cases behind this change, wait for your approval, run them, and report pass or fail
argument-hint: "[base-branch]"
allowed-tools: Bash(node:*), Bash(git diff:*), Bash(git log:*), Bash(uv sync:*), Bash(npx playwright install:*), Bash(npm install:*), Read, Glob, Grep, Write, Edit
---

Check the current change with QAMaster's gate. You approve what runs before anything runs. Follow the `Gate` skill. The CLI is `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`, run from the app repo.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" plan`, adding `--base $ARGUMENTS` if an argument was given. Its first line names the base branch. Exit 3 means a plan is waiting for approval.
2. If the plan lists **Other groups** and AI is on for this repo, run `git diff <base>...HEAD`. Read the change. For each listed group the change could affect, run the plan again with `--tag '<group>=<one-line reason tied to the diff>'`, one `--tag` per group. Use only group names from the list; never invent one.
3. **Automate (Q39).** If the QA project has an automation folder, run `… automate <plan-id>`. If it lists cases to **draft** or **update**, write their scripts with the `AutomationCode` skill, run `… check-scripts` until it passes, then run `… automate <plan-id> --done`. It prints the plan again, now with the drafted cases in it. Say which scripts are new or changed, and that they're uncommitted.
4. Show the final plan exactly as printed, in a code block, and note its plan ID. Say which groups you added and why. Point out **Not run** (manual or BROKEN), **Shared files** and **Coverage gaps**.
5. Ask: **"Do you approve plan `<id>`?"** The person can approve it as is, add test cases or groups ("add TC5103", "add the cart group"), remove some ("drop TC4410"), or stop. **Then end your turn and wait.** Approving the plan also approves the scripts drafted for it. Never approve on their behalf. Only their reply to this question counts.
6. After their yes, run `… approve <plan-id>` with `--add …` and `--remove …` for their edits (comma-separated IDs like `TC5103`, or group names). If they said stop, say nothing ran and end.
7. Run `… run <plan-id>` and show the verdict exactly as printed.
8. Summarise in one or two sentences: pass or fail, and for each failure the test case and the first line of its error. If it passed, say `git push` is now allowed for this commit. A failure marked "new script failed" may be the script's fault or the app's: say so.

Exit codes: 0 pass, 1 fail, 2 blocked, 3 awaiting approval. On 2, show the message and its fix, and stop. If it says HEAD moved, offer to plan again. A blocked run can be the machine's setup, not the code (Q41): the test environment isn't set up (`uv sync`), Playwright's browser isn't installed (`npx playwright install chromium`, or `uv run playwright install chromium`), its system libraries are missing (`sudo npx playwright install-deps chromium`, which the person runs themselves), the automation folder needs `npm install`, or the app isn't running. Show the message as printed, say what the command downloads, ask whether to run it, and run it only after an explicit yes. Never install in the background, and never run `sudo`.

Once `qam setup` has written `.qamaster/bin/qam.mjs`, run `node .qamaster/bin/qam.mjs` with the same arguments instead of the plugin path above (it follows plugin updates, and nothing long is retyped).
