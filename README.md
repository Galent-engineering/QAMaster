# QAMaster

> Status: design draft v0.1 (2026-10-28). No code yet. All decisions in [docs/decisions.md](docs/decisions.md) (Q1–Q24) are accepted, and every open question is resolved.

QAMaster builds a team's test cases and automation from the application and its code, puts them in Azure DevOps Test Plans, and checks every code change against them before it's pushed.

It combines two Galent plugins:

| | Brings | Lacks on its own |
|---|---|---|
| **Autonomous-QE** | DSM, application knowledge, zero-hallucination test design, playwright-bdd automation, reports, export to other AI tools | Test cases never reach the tracker, so nothing runs them on later changes |
| **CheckMaster** | Change-based selection from ADO tags, approval bound to a commit, verdicts, push gate, adapters with tests | Needs test cases already in ADO with hand-set tags and links. Never creates any |
| **QAMaster adds** | **Publish** (generated cases → ADO, with derived tags and links) and **Feedback** (coverage gaps and stale cases → new test design) | |

## Architecture at a glance

```
  Claude Code   ·   other AI tools (export + MCP)   ·   CI / git hook (v1.1)
                               │
                           qam CLI          --json · exit 0 pass · 1 fail · 2 blocked · 3 awaiting approval
                               │
 ┌─────────────────────────── engine (TypeScript, Node 24, no build, no runtime deps) ───────────────────────────┐
 │                                                                                                              │
 │  BUILD (from Autonomous-QE)                          PUBLISH (new)              GATE (from CheckMaster)      │
 │  crawl + repo scan → DSM                                                                                     │
 │  → AUT skills → requirements           review ──►    drafts → ADO Test Plans    diff → select → approve      │
 │  → TestGen (tolerance 0)               (person)      path: tags from DSM        → run → verdict              │
 │  → playwright-bdd scripts → script gate              groups from modules            │                         │
 │                                                      links bdd:@TC-… / pytest:…     ▼                         │
 │        ▲                                                                       FEEDBACK (new)                │
 │        └──────────── person confirms a TestGen run ◄──── coverage gaps · stale cases · defect drafts         │
 │                                                                                     │                         │
 │                                         REPORTS: DSM · test cases · execution · defects · RCA · summary      │
 └──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        │ Store (ado, v1)     │ Runner (playwright-bdd, pytest)      │ RepoReader (read-only git)    │ Crawler
        ▼                     ▼                                      ▼                               ▼
   Azure DevOps         application under test                source repositories           application UI
```

The full diagrams (components, the loop, where things run, gate and publish sequences) are in [docs/architecture.md](docs/architecture.md).

## Documents

| Read | For |
|---|---|
| [docs/architecture.md](docs/architecture.md) | The full architecture diagram, the loop, deployment, sequences, module map |
| [docs/decisions.md](docs/decisions.md) | Q1–Q22: each decision, where it came from (Autonomous-QE, CheckMaster or new), why, and what it gives up. Open questions at the end |
| [docs/tech.md](docs/tech.md) | The tech stack and where each piece came from, layout, models, adapters, pipeline, ADO API, hooks, testing, porting plan |
| [docs/product.md](docs/product.md) | Problem, users, scope (v1, v1.1, later, not doing), success criteria |
| [docs/design.md](docs/design.md) | Commands, CLI, the publish preview, the plan, verdict rules, configuration |
| [docs/data-handling.md](docs/data-handling.md) | What goes to Claude and when, what never does, the `QAMASTER_AI=off` switch. Written for customers, security reviewers and Galent legal |
| [docs/porting-step3.md](docs/porting-step3.md) | Step 3 of the port: Autonomous-QE features one at a time (learn, build, test, move) |
| [docs/learning.md](docs/learning.md) | A guide to the concepts and design, one lesson per ported feature |

## Key decisions (all accepted 2026-10-28)

- **Q1, one TypeScript engine.** CheckMaster's Python engine (about 1,900 lines) gets ported, and its pytest shim stays Python.
- **Q23, a swappable test case store.** v1 uses ADO Test Plans only. A spreadsheet fallback and Jira add-ons come after v1.
- **Q6 and Q7, ADO as the source of truth, with QAMaster writing to it.** Autonomous-QE's read-only rule gives way here, behind a dry run and the person's yes.
- **Q24, AI on by default, with one switch.** `QAMASTER_AI=off` turns off every AI step. See [data-handling.md](docs/data-handling.md).

## Risks to watch while building

- **Q8, tags derived from the DSM**, only work if the DSM's code scan links screens to files well enough for each app. Check this on the first real app before relying on `path:` tags.
- **The ADO port (Q1)** could repeat bugs CheckMaster already fixed. Port its tests before its code.
