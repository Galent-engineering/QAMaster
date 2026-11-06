# QAMaster

A Claude Code plugin that builds a team's test cases and automation from the application and its code, publishes them to Azure DevOps Test Plans (or a local file), and checks every code change against them before it's pushed.

**Status: 0.4.3** (2026-11-04). Built and tested on fixtures and on three live apps; not yet run on a live application at 0.4.2 or 0.4.3. Product v1 isn't complete: requirements fetching (0.5.0) and scripts for the other channels (0.7.0) are still to build. What each release holds is in [docs/releases.md](docs/releases.md); the walk-through of setup and the roadmap is [docs/v0.4.4-setup-guide.html](docs/v0.4.4-setup-guide.html).

## Install

In Claude Code, from the marketplace:

```
/plugin install qamaster --marketplace Galent-engineering/QAMaster
```

Or from a zip, for Claude desktop or the CLI: [docs/install.md](docs/install.md). To run it from a checkout: `claude --plugin-dir ./plugin`. It needs Node.js 24 and git; `qam doctor` checks the rest and says how to fix it.

## What it does

| | Brings | From |
|---|---|---|
| **Build** | A screen map of the app (the DSM) from a safe crawl and a code scan; application knowledge skills; test cases written at hallucination tolerance 0, validated against the DSM and the code; playwright-bdd scripts drafted just in time | Autonomous-QE |
| **Publish** | Reviewed cases go to Azure DevOps Test Plans or a local CSV, after a dry run and your yes, with tags derived from the code and links to the scripts | New |
| **Gate** | For each code change: a plan of the cases it touches, your approval bound to the commit, a run, a verdict that unlocks `git push` | CheckMaster |
| **Feedback and reports** | Coverage gaps, stale cases and defect drafts; six HTML reports | New and Autonomous-QE |

## Use it

In a QA project (a folder with `config/qamaster.json`), in Claude Code:

| Command | Does |
|---|---|
| `/qamaster:status` | Every pipeline stage with its evidence, and the next step. Changes nothing |
| `/qamaster:dsm` | Build or refresh the screen map |
| `/qamaster:publish` | Show what would be published, then publish after your yes |
| `/qamaster:check` | Plan, draft scripts, wait for your approval, run, and give a verdict |
| `/qamaster:report` | Build the reports there is data for |

Front ends are thin: commands, skills and hooks call the `qam` CLI. In a terminal, `node .qamaster/bin/qam.mjs <command>` from a QA project (written by `qam setup`) or `bin/qam <command>` from a checkout. Exit codes: `0` pass, `1` fail, `2` blocked, `3` awaiting approval; `--json` prints JSON.

## Develop

```bash
npm install                       # dev tools only; the plugin has no runtime dependencies
npx playwright install chromium   # once per machine, for the crawler tests
npm run check                     # typecheck, lint, all tests
scripts/package.sh                # dist/: the plugin zip and the marketplace zip
```

[CLAUDE.md](CLAUDE.md) has the working rules, layout and verification steps.

## Documents

| Read | For |
|---|---|
| [docs/product.md](docs/product.md) | Problem, users, scope (v1, v1.1, later, not doing), success criteria |
| [docs/design.md](docs/design.md) | Commands, CLI, the publish preview, the plan, verdict rules, configuration |
| [docs/tech.md](docs/tech.md) | Stack, layout, models, adapters, pipeline, ADO API, hooks, testing |
| [docs/architecture.md](docs/architecture.md) | Diagrams and the module map |
| [docs/decisions.md](docs/decisions.md) | Every settled decision (Q1 on), why, and what it gives up. Q50 is proposed |
| [docs/data-handling.md](docs/data-handling.md) | What goes to Claude, and the `QAMASTER_AI=off` switch. For customers, security reviewers and legal |
| [docs/releases.md](docs/releases.md) | What each version holds, and what's planned |
| [docs/plans/](docs/plans/README.md) | One plan per release, and the [backlog](docs/plans/backlog.md) of every open item |
| [docs/demos/](docs/demos/README.md) | The live runs, their findings, and where each finding went |
| [docs/install.md](docs/install.md) | Load a release as a zip, and what the machine needs |
| [docs/learning.md](docs/learning.md) | The concepts and design, one lesson per feature |
| [docs/porting-step3.md](docs/porting-step3.md) | How the Autonomous-QE features were ported, and the intended differences |
| [docs/v0.4.4-setup-guide.html](docs/v0.4.4-setup-guide.html) | Setup step by step, the roadmap, the latest decisions |

## Key decisions

- **One TypeScript engine (Q1).** CheckMaster's Python engine was ported; only its pytest shim stays Python.
- **A swappable test case store (Q23, Q44).** Local file first; Azure DevOps Test Plans when the team is ready.
- **Azure DevOps as the source of truth, written behind a dry run and your yes (Q6, Q7).**
- **AI on by default, with one switch (Q24).** `QAMASTER_AI=off` turns off every AI step.
- **Approval is yours.** Commands never review a run, approve a plan or apply a publish without your explicit reply.
