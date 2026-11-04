---
description: Show what a reviewed TestGen run would publish to the test case store, then publish it after your yes
argument-hint: "[run] [--retire] [--refresh]"
allowed-tools: Bash(node:*), Read
---

Publish a reviewed run with these arguments: `$ARGUMENTS`. If no run is named, use the newest folder under `testgen/output/` that `qam pipeline status` shows as reviewed, and say which one.

Follow the `Publish` skill. If the run isn't reviewed, stop and say so; the review is the person's separate yes in the `TestGen` skill, never this command's. Otherwise start with the dry run, from the QA project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" publish <run> $ARGUMENTS
```

Show the preview, then stop and wait. If it says an Azure DevOps project will be created, point that out: `--apply` creates the project (private, the organization's default process) before the plan and the test cases. Run it again with `--apply` (and the smoke and leave-out choices the person gave) only after their explicit yes. Exit 2 is blocked: read the message to the person and do what it says.

When you hand the person a command to run in their own terminal, give one they can paste: every value (run name, plan id, path) filled in, never a `<placeholder>`, and the launcher by its absolute path, `node <absolute path of the QA project>/.qamaster/bin/qam.mjs <command>` (the launcher exists only in the QA project, written by `qam setup`). If `qam doctor` shows `WARN launcher`, hand over the plugin path instead and suggest running setup again from the plugin.
