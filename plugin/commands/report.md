---
description: Build the reports there is data for (test summary, test cases, execution, defects, root cause, DSM) and show where they are
argument-hint: "[all | manual | summary | test-cases | execution | defects | root-cause | dsm]"
allowed-tools: Bash(node:*), Read
---

Build reports with this argument: `$ARGUMENTS` (use `all` when it is empty).

First, so the test summary report shows proposals, save feedback for the latest verdict. It only reads and writes `reports/data/`, and it writes to no store:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" feedback
```

Then build the reports, from the QA project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" report ${ARGUMENTS:-all}
```

Show the paths it wrote under `reports/output/`, and any report it skipped with the reason. Exit 2 means no input exists for what was asked (no verdict, no TestGen run, no DSM): say which and what builds it. Defect drafts are for a person to file; never file them.
