---
description: Show where this QA project is in the QAMaster pipeline, each stage with its evidence, and the next step; changes nothing
argument-hint: ""
allowed-tools: Bash(node:*)
---

Show this QA project's QAMaster status. It's read-only: run nothing that writes.

```bash
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" pipeline status
```

Show the output exactly as printed, in a code block. Then say in one or two sentences:
- which stage is next, and the command or request that does it (for example `/qamaster:dsm`, "write test cases for <module>", `/qamaster:publish`, or `/qamaster:check` in the app repo);
- any stage that's stale (older than its inputs), and why that matters.

If the output says there's no QA project here, say so, and that `qam setup` (or "set up QAMaster for <app>") starts one. To check settings, credentials and the test runners, offer `qam doctor`. It writes its result to `.qamaster/doctor.json`, so run it only if the person says yes.
