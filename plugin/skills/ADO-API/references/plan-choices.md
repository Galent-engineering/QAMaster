# Plan choices and the write check

## What `qam doctor` prints

```
FIX   test case store  No test plan is named like this repo ('shop-web') in <org>/<project>. Choose one:
                         1. Use the plan 'Shop Web': set QAMASTER_ADO_PLAN=Shop Web in the repo's .env.
                         2. Create a new plan, named 'shop-web' by default or any name you type (if it differs from the repo name, then set QAMASTER_ADO_PLAN=<that name> in the repo's .env). A plan in another project needs QAMASTER_ADO_PROJECT changed first.
```

- Exit code 2. With `--json` the check also has `plans: [{id, name}]` and `createName`.
- With `QAMASTER_ADO_PLAN=<x>` set and no plan of that name, the default name of the last choice is `<x>`: creating it needs no `.env` change.
- Two plans matching the name keep their own message (no choices): set `QAMASTER_ADO_PLAN` to the exact name.

## `qam doctor --check-write`

Reads only: it never sends a write. Azure DevOps is asked whether the user holds Manage test plans (64) and Manage test suites (128) on the area of the plan (the project's root area when there is no plan yet), and Edit work items (32) on the project's root area, because test cases are created without an area and land there. It also reads whether the project's process has a Test Case type.

| State | Exit | Meaning | What to do |
|---|---|---|---|
| allowed | 0 | Azure DevOps says the user holds the permissions | Go on. The licence and the token's scopes are not proven |
| blocked | 2 | names the missing permission and area, or says the process has no Test Case type | Relay the fix. Don't create anything |
| unknown | 0 | the permission call answered 403 or 404, or the area could not be found; the text starts with `unknown` | Ask whether to try anyway: the create is the test |

The exit codes apply only when the store check passes. In the create flow the store check has already failed (no plan), so doctor exits 2 whatever the write check says: read `write.state` from `--json`, or the `write access` line's label (ok, FIX, WARN). A 401 means the credentials were rejected: the check fails with the client's fix (a new token or `az login`), not `unknown`.

`--json` has `write: {state, detail, area, missing, testCaseType}`. The licence (Basic + Test Plans) is never checked.

## Creating the plan

Write the body to a scratch file, then run it after the person's yes, and delete the file. The name is whatever the person typed, so never put it inside a shell string: build the JSON so it is escaped (the Write tool, or `node -p 'JSON.stringify({name: process.argv[1]})' "<plan name>"`), which keeps a quote, an apostrophe or a backslash in a name valid:

```bash
node -p 'JSON.stringify({name: process.argv[1]})' "<plan name>" > plan.json
node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" ado call POST testplan/plans --body plan.json --apply
```

The response's `rootSuite.id` is where suites go. A 403 here means the token lacks Test Management (Read & Write), or the user lacks Manage test plans: the message names which.
