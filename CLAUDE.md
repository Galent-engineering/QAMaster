# QAMaster Plugin

QAMaster builds a team's test cases and automation from the application and its code (from Autonomous-QE), publishes them to Azure DevOps Test Plans, and checks every code change against them before it's pushed (from CheckMaster).

Read before working on a feature:
- [docs/product.md](docs/product.md): problem, users, scope, success criteria
- [docs/design.md](docs/design.md): commands, CLI, publish preview, plan, verdict rules, config
- [docs/tech.md](docs/tech.md): stack, layout, models, adapters, pipeline, ADO API, hooks, testing, **porting plan**
- [docs/architecture.md](docs/architecture.md): diagrams and the module map
- [docs/decisions.md](docs/decisions.md): settled decisions. Don't reverse one silently; propose a new entry.
- [docs/data-handling.md](docs/data-handling.md): what goes to Claude, and `QAMASTER_AI=off`

Sources being ported, next to this repo: `../CheckMasterPlugin` (Python; port its tests before its code), `../autonomous-qe-0.2.0` (TypeScript, `tools/`), demos in `../CheckMasterDemo` and `../autonomousQeDemo`.

Layout (Q2). `plugin/` is everything an install copies. The repo root is the marketplace plus dev tooling:

```
plugin/
  .claude-plugin/plugin.json
  bin/qam, qam.cmd       # wrappers: node ../src/cli/main.mts
  src/                   # the engine and CLI (TypeScript, run directly by Node 24, no build)
    cli/main.mts         # qam: global flags, dispatch, exit codes
    shared/              # models, errors, schema guards
    adapters/            # TestCaseStore, RequirementSource, Runner, RepoReader, Crawler behind interfaces in base.mts
  commands/ skills/ agents/ hooks/ runners/ framework/ templates/ reports/
.claude-plugin/          # marketplace.json (source "./plugin")
package.json             # dev only: typescript, @biomejs/biome, @types/node
tests/                   # node:test; fakes.mts has a fake for every adapter, contracts.mts a suite per store interface
scripts/                 # dev tooling: seed ADO, live connection check
```

Front ends stay thin: commands, hooks and the MCP server call the `qam` CLI and show its output. Logic lives in `plugin/src/`. Every external system goes behind an adapter interface, and tests use fakes.

**Tradeoff:** these rules favor care over speed. For trivial tasks, use judgment.

---

## 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions. If unsure, ask.
- If a request has two readings, name both. Don't silently pick one.
- If a simpler approach exists, say so and push back.
- Decide where a change lives before writing it: pipeline, an adapter, the CLI, or the plugin. When it's unclear, ask.
- For anything touching Claude Code, Azure DevOps or Playwright APIs, check the current docs or existing code. Don't rely on memory: these APIs change often.

## 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features, settings, commands, or hooks beyond what was asked.
- No abstraction for a single use. No config knobs nobody asked for.
- No error handling for cases that can't happen. Do handle the ones that can: no git repo, no config, no credentials, ADO down, the runner crashing.
- One skill or command per job. Don't build a do-everything command.
- If 200 lines could be 50, rewrite it.

**The test:** would a senior engineer call this overcomplicated? If yes, simplify.

## 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

- Don't reformat, rename, or "improve" code next to your change.
- Match the existing style, even if you'd do it differently.
- Remove imports, files, and registrations that *your* change made unused. Mention other dead code, don't delete it.
- Changing a command name, CLI flag, exit code, config key, tag or link format, or manifest field breaks users. Ask first.

**The test:** every changed line traces back to the request.

## 4. Goal-driven execution

**Define success. Loop until it's verified.**

Turn each task into a check you can run:
- "Add a command" → it runs under `claude --plugin-dir ./plugin`
- "Fix the bug" → a failing test reproduces it, then passes
- "Port module X" → its tests pass against fakes before and after it moves (Q21)

For multi-step work, state a short plan first:
```
1. [step] → verify: [check]
2. [step] → verify: [check]
```

---

## TypeScript rules (Node 24, no build)

- **No runtime dependencies.** `plugin/` uses the Node standard library only (`node:fs`, `node:child_process`, `fetch`). Dev tools live in the root `package.json`. Ask before adding any dependency.
- **Files are `.mts`**, imported with their extension (`'../shared/errors.mts'`). Only erasable syntax: no `enum`, `namespace` or parameter properties, because Node strips types rather than compiling them.
- **Strict types.** `npm run typecheck` (`tsc --noEmit`, strict) must report 0 errors.
- **Validate data files with hand-written type guards** in `shared/schema.mts`, one per model. No zod or similar.
- **Errors the user can fix throw `BlockedError`** (`shared/errors.mts`) with a message that says what to do next. The CLI turns it into exit code 2.
- **Exit codes are a contract:** `0` pass, `1` fail, `2` blocked, `3` awaiting approval. `--json` prints JSON on stdout.
- **Hooks and `runners/pytest/qamaster_pytest.py` are standard library only** (plus pytest for the shim). Hooks run on every matching tool call; the shim runs inside the user's test environment.
- **Python only for the pytest shim**, managed with uv as in CheckMaster. Never pip.

## Claude Code plugin rules

- **Descriptions are the trigger.** Claude picks a skill from its `description` alone. Write it in the third person with the phrases a user would type.
- **Progressive disclosure.** Keep `SKILL.md` short. Put long reference material in `references/` next to it.
- **Portable paths.** Use `${CLAUDE_PLUGIN_ROOT}` in commands, hooks and `.mcp.json`, never an absolute or cwd-relative path. Call the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`: hosted plugins may not put `bin/` on the PATH.
- **Hooks are fast and quiet.** Exit 0 to allow. Exit 2 to block, with the reason on stderr. Repos QAMaster has never planned in (no `.qamaster/`) are never blocked (Q14).
- **Approval is the user's.** Commands never review a run, approve a plan or apply a publish without the user's explicit reply.
- **Least privilege.** Give commands only the `allowed-tools` they need.
- **No secrets in the plugin.** Read them from the environment (`QAMASTER_ADO_TOKEN`) or `az login`.
- **Bump `version`** in `plugin/.claude-plugin/plugin.json` on every release.

---

## Commands

```bash
npm install                              # dev tools only
npm run check                            # typecheck + lint + all tests
npm test                                 # all tests
node --test --test-name-pattern "exit" tests/cli.test.mts   # one targeted test
npm run typecheck
npm run lint                             # npm run format to fix formatting

node plugin/src/cli/main.mts help        # the CLI
claude plugin validate .                 # check manifests, commands, skills, hooks
claude --plugin-dir ./plugin             # run Claude Code with the plugin, no install
```

## Verification

Match the check to the scope of the change. Don't run every check as a ritual.

- Prefer the smallest test that covers the change. Run `npm run check` for cross-cutting changes and before a release.
- Don't re-run a check whose inputs haven't changed since it last passed.
- Engine change → targeted `node:test` with fakes, then typecheck and lint.
- Plugin change → `claude plugin validate .`, then run the changed command or hook once under `--plugin-dir`. For a skill, check that a realistic prompt triggers it.
- ADO adapter change → recorded-response tests in `tests/fixtures/ado/`, then one live `qam doctor` if credentials are available.

Report exactly what you ran and what you couldn't. Never call something verified that you didn't run.

## Boundaries

- Don't edit `node_modules/`, `package-lock.json` by hand, or `.qamaster/`.
- Don't publish, push, or tag unless asked.
- Don't create or change Azure DevOps resources unless asked, and say exactly what will change first.
- Don't change `../CheckMasterPlugin` or `../autonomous-qe-0.2.0`; they are sources to port from.
- Delete temporary scripts and scratch files before you finish.

## Learnings

<!-- Append one line each time Claude gets something wrong in this repo, so it doesn't happen again.
     Format: "- <rule>. (<what went wrong>)" -->
- In WIQL, name the project (`[System.TeamProject] = 'X'`), not `@project`: at org level `@project` matches nothing. (From CheckMaster: a re-run would have duplicated every item.)

---

**This file is working if:** diffs contain only what was asked, skills fire on the prompts they should, nothing ships unverified, and questions come before code rather than after mistakes.
