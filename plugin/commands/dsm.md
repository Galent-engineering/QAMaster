---
description: Build, refresh or inspect the UI Design Structure Matrix (dsm/index.html) from a safe crawl of the app and a scan of its code
argument-hint: "[run|refresh|changes|impact <files…>|compare [<older>] [<newer>]|render] [--no-crawl] [--login-mode auto|manual|none] [--routes <glob…>] [--estimate]"
allowed-tools: Bash(node:*), Read
---

Run the UI Design Structure Matrix for this project with these arguments: `$ARGUMENTS`. If they're empty, use `refresh` when `dsm/dsm.json` exists, else `run`.

Follow the `Design-Structure-Matrix` skill and the rules of the `ui-dsm-agent`. Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" --json dsm $ARGUMENTS
```

from the QA project, then report as the skill describes. Exit 2 is blocked:
- if it's about signing in, offer the user the skill's three ways and never ask for the password in chat;
- if it's about missing settings, ask the user for the app's URL and repository, then run `qam setup` with their answers. When there's no QA project yet (no `config/qamaster.json`), first ask where it goes: this folder, a new folder next to it, or a path they type, and wait; never pick one yourself. When setup prints folder choices for the code, show them and wait for the answer.

For `render`, show the user `dsm/index.html`.

When you hand the person a command to run in their own terminal, give one they can paste: every value (run name, plan id, path) filled in, never a `<placeholder>`, and the launcher by its absolute path, `node <absolute path of the QA project>/.qamaster/bin/qam.mjs <command>` (the launcher exists only in the QA project, written by `qam setup`). If `qam doctor` shows `WARN launcher`, hand over the plugin path instead and suggest running setup again from the plugin.
