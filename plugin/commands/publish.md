---
description: Show what a reviewed TestGen run would publish to the test case store, then publish it after your yes
argument-hint: "[run] [--retire] [--refresh]"
allowed-tools: Bash(node:*), Read
---

Publish a reviewed run with these arguments: `$ARGUMENTS`. If no run is named, use the newest folder under `testgen/output/` that `qam pipeline status` shows as reviewed, and say which one.

Follow the `Publish` skill. Start with the dry run, from the QA project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" publish <run> $ARGUMENTS
```

Show the preview, then stop and wait. If it says an Azure DevOps project will be created, point that out: `--apply` creates the project (private, the organization's default process) before the plan and the test cases. Run it again with `--apply` (and the smoke and leave-out choices the person gave) only after their explicit yes. Exit 2 is blocked: read the message to the person and do what it says.
