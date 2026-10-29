# Porting step 3: Autonomous-QE features, one at a time

> Status: v0.2 (2026-10-29), open questions answered. Step 3 of the [porting plan](tech.md#porting-plan). Scope is the **v1 MVP**; extra features are planned for v2 and v3 at the end.

Step 3 moves Autonomous-QE's engine into `plugin/src/` behind the adapters. It doesn't move everything at once. Each feature goes through the same loop: **learn, build, test, move**. The next feature starts only after the person has reviewed the last one.

## Decisions (2026-10-29)

| # | Question | Decision |
|---|---|---|
| 1 | Port from 0.1.5 or 0.2.0? | **The better of the two, module by module.** Each Learn phase compares the module in both versions and picks. Only what the v1 MVP needs is ported. Extra features (MCP, test case import, API, …) move to v2 or v3 (see Roadmap) |
| 2 | Keep the Python-compatibility layers? | **No.** Outputs are compared as parsed data, not bytes. Only behaviour that changes meaning is kept, such as Python-style regexes in user config, if feature 2 finds any |
| 3 | When do skills and agents move? | **With their feature**, so it works end to end in Claude Code as soon as it's moved. Hooks and commands stay in step 9 |
| 4 | When is the ADO adapter (step 4) built? | **Between features 5 and 6**, so requirements is tested against the real adapter, not only the fake |

## What we start from

- **Sources:** `../autonomous-qe-0.1.5` (about 10,700 lines, the version the design docs name) and `../autonomous-qe-0.2.0` (about 16,600 lines). Neither has tests.
- **Python-compatibility layers**, which are not ported (decision 2): `dsm/pyport.mts` (623 lines), `shared/pycompat.mts` (303) and `mcp_config/pycompat.mts` (306). They exist so the TypeScript ports printed byte-for-byte what the old Python tools printed.
- **Shared helpers:** `shared/common.mts` (305 lines) is imported by almost every module. It mixes paths, JSON I/O, process running and CLI output. We port only the helpers a feature needs, when it needs them, into `src/shared/`. No bulk port.
- **Known good data:** `../autonomousQeDemo` is a fully onboarded project. It has `dsm/` (`ui-model.json`, `code-model.json`, `dsm.json`, `index.html`), `config/`, a TestGen run (`testgen/output/20261029-1030-Home`), `requirements/`, `reports/` and a `site/` app with git history. Its files become the test fixtures: the same input has to give the same result in QAMaster as in AQE, or the difference is written down.

## The loop for each feature

| Phase | Do | Done when |
|---|---|---|
| **1. Learn** | Read the module and its skill in **both** AQE versions, and pick the better one, or combine them. Run it on a copy of `autonomousQeDemo` and save its inputs and outputs under `tests/fixtures/<feature>/`. Write down what it reads, writes and calls, its odd behaviours, which `common` helpers it really needs, and what is v2 or v3 rather than MVP | The feature's **Learnings** section below is filled in, and the person has read it |
| **2. Build** | Port into `plugin/src/<module>/`. Outside access goes through the adapters (`RepoReader`, `Crawler`, `RequirementSource`, …). Settings come from `loadConfig`, and fixable errors throw `BlockedError`. Rename `aqe` → `qam` and `.autonomous-qe/` → `.qamaster/`. Leave out what isn't MVP, and list it under the Roadmap | It typechecks and every line traces to the feature |
| **3. Test** | Golden tests: fixture input → the AQE fixture output, compared as parsed data. Unit tests with the fakes for each branch and error path. A contract test for any new adapter | `npm run check` passes. Any difference from AQE is intended and written down |
| **4. Move** | Replace the command's "isn't built yet" in `qam`. Move the feature's skills and agents into `plugin/`, with `aqe` rewritten to `qam` and MVP-only content. Run the command once on a copy of `autonomousQeDemo`, and try the skill once under `claude --plugin-dir ./plugin`. Update the status table | The person has reviewed it. One commit per feature, pushed |

Rules that hold throughout:
- AQE's folders are read-only sources. Nothing is edited there (CLAUDE.md, Boundaries).
- Fixtures are copied into this repo, so tests never read `../autonomousQeDemo` directly.
- A feature that needs a later one gets a fake for it, not a stub inside the engine.
- The demo is run on a copy in the scratch folder, never in place.

## Order

The order follows the dependencies, starting with the pure functions that are easiest to test. The gate (step 5) needs DSM impact, so DSM comes first.

| # | Feature | AQE source (0.2.0 lines) | QAMaster target | `qam` command | Skills and agents that move | Depends on |
|---|---|---|---|---|---|---|
| 1 | **DSM build and render** | `dsm/build_dsm` 482, `render_html` 65, `dsm_template.html` | `src/dsm/build.mts`, `render.mts` | `qam dsm build`, `qam dsm render` | — | — |
| 2 | **Repo scan** | `dsm/scan_repo` 680 | `src/dsm/scan.mts`, `adapters/git.mts` (the `RepoReader`) | `qam dsm scan` | — | 1 |
| 3 | **UI crawl and DSM refresh** | `dsm/crawl_ui.mjs` 705, `dsm_update` 465 | `adapters/crawler-playwright.mts`, `src/dsm/update.mts` | `qam dsm run\|refresh\|changes\|impact` | `Design-Structure-Matrix`, `ui-dsm-agent` | 1, 2 |
| 4 | **Setup and pipeline** | `setup/setup` 187, `pipeline/pipeline` 469, `shared/project` 101 | `src/pipeline/`, `src/cli/setup.mts` | `qam setup`, `qam pipeline …`, `qam doctor` (settings part) | — (onboard and status are commands: step 9) | 1–3 (DSM stage) |
| 5 | **Application knowledge** | `aut-skill/build_aut_skills` 571 | `src/knowledge/` | `qam aut-skills` | `AUT-Skill-Builder` | 1 |
| — | *Step 4: ADO adapter* | CheckMaster `adapters/ado.py` | `adapters/ado.mts` | `qam doctor` (ADO part), `qam req\|tc …` | — | step 2 |
| 6 | **Requirements** | `requirements/requirements` 252 | `src/requirements/` through `RequirementSource` | `qam requirements fetch` | — | 4, step 4 |
| 7 | **TestGen** | `testgen/testgen` 764 | `src/testgen/` | `qam testgen context\|validate\|render` | `TestGen`, `Domain_Test_Design_Skill` and its 39 sub-skills | 1, 5, 6 |
| 8 | **Automation** | `e2e-automation/scaffold` 274, `check_scripts` 157, `shared/bdd-quality` 83, `shared/aut-app` 69, `framework/TestAutomation` with `scripts/locator-sync` | `src/automation/`, `plugin/framework/` | `qam app create`, `qam check-scripts` | `AutomationCode` (playwright-bdd parts only), `UI-Locator-Sync` | 7 |
| 9 | **Reports** | `reports/build_report`, `build_all`, `compose_summary`, `dsm_to_report`, `testgen_to_report`, `playwright_to_report`, `types/*` (six report types) | `src/reports/`, `plugin/reports/templates/` | `qam report all\|manual\|<type>` | `QE-Reports` and its six report skills | 1, 7, 8 |

Not in step 3:
- **`qam review`** records who reviewed a run (Q12). It's new, so it comes with publish (step 7).
- **Hooks and commands** belong to step 9, along with the Q14 hook rules.
- **AQE's `aqe run`** (`runner/runner.mts`) overlaps with the gate's `Runner`. The playwright-bdd runner is step 6.
- **Pipeline stage 3, context sources**, becomes a v2 stage. In v1 the pipeline skips it.

## Status

| # | Feature | Learn | Build | Test | Move | Commit |
|---|---|---|---|---|---|---|
| 1 | DSM build and render | | | | | |
| 2 | Repo scan | | | | | |
| 3 | UI crawl and DSM refresh | | | | | |
| 4 | Setup and pipeline | | | | | |
| 5 | Application knowledge | | | | | |
| — | Step 4: ADO adapter | | | | | |
| 6 | Requirements | | | | | |
| 7 | TestGen | | | | | |
| 8 | Automation | | | | | |
| 9 | Reports | | | | | |

## Learnings

One section per feature, filled in during its Learn phase: inputs, outputs, side effects, surprises, which version won, what was left out and why.

### 1. DSM build and render
_Not started._

## Roadmap: what comes after the v1 MVP

These AQE features are left out of step 3 on purpose. Each becomes its own feature later, through the same loop. The v2 / v3 split is a proposal: v2 is what makes the build stages richer for the teams already using v1, and v3 is broader tooling. [product.md](product.md#scope) carries the same lists.

| Feature | AQE source | Proposed | Why then |
|---|---|---|---|
| Context sources: MCP config for Jira, Confluence, GitLab, Figma, Visio (`mcp-config-agent`, pipeline stage 3) | `mcp_config/*` 1,019 | v2 | v1 reads requirements and test cases over REST (Q5). MCP only adds context for test design |
| Export to other AI tools, and the QAMaster MCP server | `export/export` 324, `mcp_server/server` 266 | v2 | v1 is Claude Code only. The CLI already gives other tools a way in |
| Import existing test cases (Excel, HP ALM, Azure Test Plans) and gap analysis; revision mode in TestGen; Test Coverage report | `testcases/*` 993, `test-suite-analyst`, `TestCaseAnalysis`, `reports/types/test-coverage` | v2 | Teams with existing suites. v1 builds new cases from the application |
| Locators from the crawl, for apps without front-end source | `locators/from_crawl` 174 | v2 | v1 syncs locators from the front-end source |
| API discovery and API test data | `api/api` 450, `API-TestGen` | v2 | v1 covers API through TestGen's API channel only |
| Existing automation frameworks (detect, analyse, generate into them) | `codebase/*` 948, `CodebaseOperations`, `analyze_framework` 350 | v3 | v1 generates playwright-bdd only (Q20) |
| Impact and traceability matrices | `design/design` 243 | v3 | The gate's DSM impact and plan cover the v1 need |
| Root cause evidence from commits and logs | `rca/rca` 160 | v3 | v1 writes defect drafts; RCA data stays manual |
| Value metrics (tokens, time, effort saved) | `reports/value` 204 | v3 | Reporting extra |
| Encrypted secrets vault and security scan | `shared/secrets` 266, `security/*` 316 | v3 | v1 reads secrets from the environment, `.env` or `az login` (Q16) |
| Visio MCP server | `visio_mcp/*` 743 | v3 | Only needed with MCP context sources |
