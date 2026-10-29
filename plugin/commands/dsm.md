---
description: Build, refresh or inspect the UI Design Structure Matrix (dsm/index.html) from a safe crawl of the app and a scan of its code
argument-hint: "[run|refresh|changes|impact <files…>|render] [--no-crawl] [--login-mode auto|manual|none]"
allowed-tools: Bash(node:*), Read
---

Run the UI Design Structure Matrix for this project with these arguments: `$ARGUMENTS`. If they're empty, use `refresh` when `dsm/dsm.json` exists, else `run`.

Follow the `Design-Structure-Matrix` skill and the rules of the `ui-dsm-agent`. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" --json dsm $ARGUMENTS
```

from the QA project, then report as the skill describes. Exit 2 is blocked:
- if it's about signing in, offer the user the skill's three ways and never ask for the password in chat;
- if it's about missing settings, ask the user for the app's URL and repository, then run `qam setup` with their answers.

For `render`, show the user `dsm/index.html`.
