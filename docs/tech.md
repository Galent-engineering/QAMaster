# QAMaster: Technical design

> Status: draft v0.1 (2026-10-28). The diagrams are in [architecture.md](architecture.md); the reasons are in [decisions.md](decisions.md).

## Tech stack

Picked from the better option in each project. **AQE** = Autonomous-QE 0.1.5, **CM** = CheckMaster.

| Area | QAMaster | Picked from | Instead of | Decision |
|---|---|---|---|---|
| Engine language | TypeScript, run directly with Node 24 type stripping, no build step | AQE | CM's Python 3.12 + uv | Q1 |
| Runtime dependencies | None. Node standard library only (`node:fs`, `node:child_process`, `fetch`) | AQE | CM's pydantic, httpx | Q1 |
| Validation of data files | Hand-written type guards in `shared/schema.mts`, one per model | AQE | CM's pydantic | Q1 |
| Dev tooling | `tsc --noEmit` (strict), `node:test`, Biome for lint and format | CM's discipline, Node tools | CM's pyright, pytest, ruff | Q21 |
| Repo layout | `plugin/` ships; root holds marketplace, dev project, tests, docs | CM | AQE's single tree | Q2 |
| Entry point | `qam` CLI, `--json`, exit codes 0/1/2/3 | CM contract + AQE command set | — | Q3 |
| External systems | Interfaces with a registry and fakes | CM | AQE's direct calls | Q4 |
| ADO access | REST API 7.1, PAT or `az login` token | CM | AQE's MCP-only access | Q5 |
| Test case store | `TestCaseStore` adapter: `ado` in v1; spreadsheet, then Xray / Zephyr, after v1 | New | CM's ADO-only `Tracker` | Q23 |
| Context sources | MCP servers set up by `mcp-config-agent`, read-only | AQE | — | Q5 |
| UI crawl | Playwright (Node), data-changing requests blocked after login | AQE | — | Q15 |
| Generated automation | playwright-bdd (Gherkin + Page Object Model), Allure 3 | AQE | — | Q20 |
| Hand-written Python suites | pytest-playwright through a stdlib-only pytest plugin | CM | — | Q9, Q20 |
| Test mapping | ADO *Automated Test Name* = `bdd:@TC-…` or `pytest:<nodeid>` | CM-D15 + CM-D4 | AQE's local traceability only | Q9 |
| Selection | `path:` / `smoke` / Claude groups + DSM impact | CM + AQE | — | Q11 |
| Reports | Self-contained HTML, six types | AQE | CM's verdict JSON | Q17 |
| Other AI tools | `qam export`, `qam mcp-serve` | AQE | CM's Claude Code only | Q18 |
| AI use | On by default; `QAMASTER_AI=off` (app repo `.env` or QA `config/qamaster.json`, strictest wins) makes context commands refuse and skips group picking | New | CM's always-on groups | Q24 |
| Docs | `product.md`, `design.md`, `tech.md`, `architecture.md`, `decisions.md`, `data-handling.md`, `CLAUDE.md` | CM | AQE's single HTML guide | Q21 |

Requirements for users: Node.js 24 or later and git. ADO access (`az login` or a PAT). Python only for pytest suites. Appium 2 with an emulator or simulator only for native mobile.

## Repository layout

```
plugin/                          # everything an install copies
  .claude-plugin/plugin.json
  commands/                      # onboard, setup, status, dsm, publish, plan, check, report
  skills/                        # TestGen, Design-Structure-Matrix, AUT-Skill-Builder, UI-Locator-Sync,
                                 # QAMaster (plans, verdicts), work-items, QE-Reports-*, Domain_Test_Design_Skill-*
  agents/                        # mcp-config-agent, ui-dsm-agent
  hooks/hooks.json + *.mts       # session context, push gate, review gate, script gate
  src/                           # the engine (see the module map in architecture.md)
    cli/ pipeline/ dsm/ knowledge/ requirements/ testgen/ automation/
    publish/ gate/ feedback/ reports/ adapters/ export/ mcp/ shared/
  runners/pytest/qamaster_pytest.py   # stdlib + pytest only
  framework/TestAutomation/      # playwright-bdd template for <App>/ folders
  templates/project/config/      # starter config for a QA project
  reports/templates/             # report HTML, CSS, JS
.claude-plugin/marketplace.json  # source "./plugin"
package.json                     # dev only: typescript, @biomejs/biome, @types/node
tests/                           # node:test; fakes.mts has a fake for every adapter
  fixtures/ado/                  # recorded ADO responses
scripts/                         # dev tooling: seed ADO from sheets, live connection check
docs/
CLAUDE.md
```

The CLI wrapper is `plugin/bin/qam` (`exec node "$(dirname "$0")/../src/cli/main.mts" "$@"`) plus `qam.cmd`. Commands and hooks call `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`, because hosted plugins may not put executables on the PATH (as in AQE). `qam setup` writes a project launcher, `.qamaster/bin/qam.mjs`, for terminals and CI.

## Models (`src/shared/models.mts`)

Neutral models shared by build and gate. Stores, requirement sources and runners map their own ideas onto these.

```ts
// Build side (from AQE)
type Evidence = string;                     // "dsm:relation:/->/employees", "aut:AUT_Shop#Checkout", "req:PROJ-12"
type Step = { screen: string; action: string; element?: string; leadsTo?: string;
              data?: string; expected: string; evidence: Evidence[] };
type DraftCase = { id: string;              // "TC-LOGIN-001"
                   title: string; component: string; subModule?: string; feature: string;
                   type: TestType; category: Category; priority: 'P1'|'P2'|'P3'|'P4';
                   severity: Severity; channel: Channel; coverage: string[];
                   objective: string; preconditions: string[]; testData: Record<string, unknown>;
                   steps: Step[]; requirements: string[] };
type Run = { dir: string; scope: { module: string; subModule?: string };
             validation: 'pass'|'fail'; reviewedAt?: string;
             reviewedBy?: { adoAccount: string; gitEmail: string };   // checked identity, never typed (Q12)
             ownerWarning?: string };                                  // set when an owner exists and someone else approved

// Publish (new)
type LedgerEntry = { localId: string; trackerId: number; hash: string;
                     ownedTags: string[]; smokeDeclined: boolean;   // QA removed smoke: never suggest again
                     publishedAt: string; trackerRev: number };
type PublishChange = { kind: 'create'|'update'|'unchanged'|'retire'|'conflict';
                       localId: string; trackerId?: number; fields: string[]; reason: string };

// Gate side (from CM)
type Change = { base: string; head: string; branch: string; files: ChangedFile[] };
type TestCase = { id: number; title: string; url: string; tags: string[]; automatedTest: string | null };
type Reason = { kind: 'path'|'smoke'|'group'|'added'|'dsm'; detail: string };
type PlanItem = { testCase: TestCase; reasons: Reason[]; selected: boolean };
type NotRun = { testCase: TestCase; why: string; broken: boolean };
type Gap = { screen: string; files: string[]; why: string };           // new: DSM impact with no case
type Plan = { id: string; createdAt: string; change: Change;
              testsHead?: string;                // QA project commit when QAMASTER_TEST_ROOT is set (Q22)
              items: PlanItem[]; notRun: NotRun[];
              gaps: Gap[]; catalogSize: number; otherGroups: Record<string, string[]>;
              approvedBy?: string; approvedAt?: string };
type TestResult = { testCaseId: number; status: 'passed'|'failed'|'flaky'|'skipped'|'not_run';
                    durationS: number; error?: string; testIds: string[]; evidence: string[] };
type Verdict = { result: 'pass'|'fail'|'blocked'; head: string; testsHead?: string; planId: string;
                 reasons: string[]; warnings: string[]; results: TestResult[] };
```

Errors a user can fix throw `BlockedError` with a message that says what to do next. The CLI turns it into exit code 2. This rule comes from CM.

## Adapters (`src/adapters/base.mts`)

```ts
interface TestCaseStore {                        // QAMASTER_STORE; v1: ado (Q23)
  where(): string;
  url(id: number): string;
  inPlan(): Promise<Map<number, TestCase>>;      // what selection needs
  find(filter: Filter): Promise<Item[]>;
  show(id: number): Promise<Item>;
  create(change: ItemChange): Promise<Item>;
  update(item: Item, change: ItemChange): Promise<Item>;       // refuses if item.rev changed since read
  retire(item: Item): Promise<string[]>;         // the store's undoable removal
  addToSuite(caseId: number, suite: string): Promise<void>;
}

interface RequirementSource {                    // QAMASTER_REQUIREMENTS; v1: ado
  requirements(q: RequirementQuery): Promise<Requirement[]>;   // sprint, current sprint or dates
  find(filter: Filter): Promise<Item[]>;
  show(id: number): Promise<Item>;
  create(change: ItemChange): Promise<Item>;     // work-items skill only, dry run until --apply
  update(item: Item, change: ItemChange): Promise<Item>;
  retire(item: Item): Promise<string[]>;         // ADO: Recycle Bin
}

interface Runner {
  collected(root: string): Promise<string[]>;    // every test ID the runner can see
  run(selection: Map<number, string[]>, root: string, evidence: string): Promise<TestResult[]>;
}

interface RepoReader {                           // read-only by construction
  diff(base: string, head: string): Promise<Change>;
  readFile(ref: string, path: string): Promise<string>;
  listTree(ref: string): Promise<string[]>;
  head(): Promise<string>;
}

interface Crawler {
  crawl(opts: CrawlOptions): Promise<UiModel>;   // blocks POST/PUT/PATCH/DELETE after login
}
```

`src/adapters/registry.mts` maps names to factories:
- `STORES = { ado }`. Planned after v1: `file` (`testcases.xlsx` / `.csv` in ADO's import layout), then `xray` or `zephyr` (Q23)
- `REQUIREMENTS = { ado }`
- `RUNNERS = { 'playwright-bdd', pytest }`

The ADO adapter implements both `TestCaseStore` and `RequirementSource` and shares one HTTP client.

Each factory reads only its own `QAMASTER_<NAME>_*` settings. When one is missing, it throws `BlockedError` naming the `.env` line to add.

Adding a provider follows CheckMaster's recipe:
1. Implement the interface.
2. Write a factory.
3. Register it.
4. Test it with recorded responses.

Nothing in the pipeline changes.

## Onboarding pipeline (`src/pipeline/`)

AQE's 13 stages, plus **Review** and **Publish** as their own stages, and a first gate run. Each stage records its evidence, and a stage is **stale** when it's older than its inputs.

| # | Stage | Command | Done when |
|---|---|---|---|
| 1 | Setup | `qam setup` | Config written, packages and Chromium installed, launcher written |
| 2 | Test case store | `qam doctor` | ADO reachable, plan found or created on request |
| 3 | Context sources (v2; skipped in v1) | `mcp-config-agent` | `.mcp.json` verified with a scoped sample read |
| 4 | DSM | `qam dsm run` | `dsm/dsm.json` built from crawl + repo scan |
| 5 | Application knowledge | `AUT-Skill-Builder` skill | `AUT_<App>` and module sub-skills newer than the DSM |
| 6 | Requirements | `qam requirements fetch --sprint …` | Saved under `requirements/<scope>/` (now fetched by the CLI, Q5) |
| 7 | Test cases | `TestGen` skill + `qam testgen validate` | Validator: 0 findings, 0 gaps |
| 8 | Review | the person, in chat | `run.reviewedBy` set |
| 9 | **Publish** | `qam publish <run> --apply` | Ledger matches ADO for the run |
| 10 | Automation folder | `qam app create` | `<App>/` from the template |
| 11 | UI locators | `UI-Locator-Sync` skill | Page-wise locator files |
| 12 | Scripts | E2EAutomation skill | Features, steps, pages for each channel |
| 13 | Script gate | `qam check-scripts` | Types, BDD steps, no inline selectors, placement, `@TC` traceability |
| 14 | First gate run | `qam check --all` | A verdict for the current HEAD |
| 15 | Reports | `qam report all` | Six reports built |

Publishing (9) happens before automation (10–13) on purpose. Manual cases are useful in Test Plans even before scripts exist; the gate lists them under **Not run**. Stage 13 then fills in the automation link for each scenario. The next `qam publish` updates *Automated Test Name* on cases that now have a script.

## Publish (`src/publish/`)

```
load      the run's testcases.json; refuse unless validation == pass and reviewedBy is set
          warn (don't block) if config.owners names an owner for the run's module and reviewedBy differs
derive    tags:   path:<glob>   from DSM evidence on every screen the case visits (dsm.json screen → source files),
                                collapsed to folders at config.publish.pathDepth (default 3), deduplicated
                  <module>, <module>-<sub-module>
                  smoke         suggested when priority P1 and category in {Positive, E2E}, up to config.smoke.max;
                                written only if QA confirms it in the preview; never re-suggested once removed (ledger)
          link:   bdd:@<id>     when the <App>/ suite has a scenario tagged @<id>; else none (manual)
diff      against the ledger and the tracker:
                  no ledger entry                     → create
                  hash changed, tracker rev unchanged → update (only QAMaster-owned fields and tags)
                  tracker rev changed by someone else → conflict (reported, not written)
                  in ledger, not in any current run   → retire (only with --retire)
apply     only with --apply: create/update work items, add to the suite named after the module,
          set Microsoft.VSTS.TCM.AutomatedTestName / AutomatedTestStorage / AutomatedTestType, write the ledger
```

Steps are written as ADO's `Microsoft.VSTS.TCM.Steps` XML (action plus expected result per step). The evidence list goes in the test case's description under a **Sources** heading, so reviewers in ADO can see why each step exists.

## Gate (`src/gate/`)

CheckMaster's pipeline, ported:

```
collect   RepoReader.diff(mergeBase(base, HEAD), HEAD) → Change
          if QAMASTER_TEST_ROOT: its git commit → testsHead; uncommitted changes there → BlockedError
          (v1.1 in CI: check out the QA branch named like the app branch, else main, first)
catalog   TestCaseStore.inPlan() → every test case in the plan with tags and automation link
select    candidates(change, catalog, groups) → {case → reasons}: path, smoke, group
          dsm.impact(change.files) → screens; screens with no selected case → gaps
          Runner.collected(testRoot) + split() → PlanItem[], NotRun[] (manual or BROKEN) → Plan
approve   approve(plan, by, add, remove) → Plan with approvedBy/At; refuses if HEAD or testsHead moved
run       Runner.run(selection) → TestResult[], retry failed cases once → decide() → Verdict
feedback  gaps + BROKEN + stale cases → .qamaster/feedback/<sha>.json, defect drafts for failures
```

`qam plan` stops after select, `qam approve` and `qam run` take a plan ID, and `qam check` does all three.

### Runners

**playwright-bdd** (`adapters/runner-bdd.mts`):
- `collected()` runs `npx bddgen` then `npx playwright test --list --reporter=json` in the test root, and reads each test's tags.
- `run()` passes `--grep "@TC-A|@TC-B"` for the approved IDs, `--output` set to the attempt's evidence folder, and turns on `screenshot: only-on-failure`, `video: retain-on-failure` and `trace: retain-on-failure` where the project left them off.
- It reads results from the JSON reporter.
- A case passes only if every scenario linked to it passed, in every Playwright project selected for its channel.

**pytest** (`adapters/runner-pytest.mts` + `runners/pytest/qamaster_pytest.py`), CheckMaster's runner unchanged in behavior:
- `uv run pytest` if the test root has `uv.lock`, else `python -m pytest`, with `-p qamaster_pytest` and the plugin's folder on `PYTHONPATH`.
- Options: `--qamaster-list`, `--qamaster-select`, `--qamaster-report`, `--qamaster-evidence`.
- Parametrized variants count. Exit codes other than 0, 1 and 5 become `BlockedError`.

## Azure DevOps (`adapters/ado.mts`)

Auth: `QAMASTER_ADO_TOKEN` as Basic auth if set, else a Bearer token from `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798`. API version 7.1. A 401, or ADO's 203 sign-in page, becomes a `BlockedError`.

| Need | Call | Scope |
|---|---|---|
| Plan by name | `GET {org}/{project}/_apis/testplan/plans` | Test Management (Read) |
| Suites | `GET …/testplan/Plans/{plan}/suites` | Test Management (Read) |
| Cases in a suite | `GET …/testplan/Plans/{plan}/Suites/{suite}/TestCase` (follow `x-ms-continuationtoken`) | Test Management (Read) |
| Fields and tags | `GET …/wit/workitems?ids=…&fields=…&errorPolicy=omit` (batches of 200) | Work Items (Read) |
| Requirements | `POST …/wit/wiql` with `[System.TeamProject] = '<project>'` (not `@project`), then the fields call | Work Items (Read) |
| Current sprint | `GET {org}/{project}/{team}/_apis/work/teamsettings/iterations?$timeframe=current` | Work Items (Read) |
| Create a test case | `POST …/wit/workitems/$Test Case` (JSON Patch) | Work Items (Read & Write) |
| Update | `PATCH …/wit/workitems/{id}` with a `test` op on `/rev` | Work Items (Read & Write) |
| Add to a suite | `POST …/testplan/Plans/{plan}/Suites/{suite}/TestCase` | Test Management (Read & Write) |
| Create a suite | `POST …/testplan/Plans/{plan}/suites` | Test Management (Read & Write) |

The gate needs only the read scopes. Publishing and `work-items` need read and write. The two WIQL notes (name the project, not `@project`) come from CheckMaster's Learnings.

## State

| Where | File | Written by |
|---|---|---|
| QA project | `config/qamaster.json`, `config/dsm-config.json`, `config/testgen.json` | `qam setup`, then the user |
| QA project | `dsm/`, `requirements/<scope>/`, `testgen/output/<run>/` | Build stages |
| QA project | `<App>/` | `qam app create`, script generation |
| QA project | `.qamaster/pipeline.json`, `.qamaster/ledger.json`, `.qamaster/bin/` | Pipeline, publish, setup |
| QA project | `reports/data/`, `reports/output/` | Reports |
| App repo | `.env` (git-ignored) | The user |
| App repo | `.qamaster/plans/<id>.json`, `verdicts/<sha>.json`, `evidence/<sha>/`, `feedback/<sha>.json` | Gate. Writes its own `.gitignore` |

When the QA project and the app repo are the same folder, everything lives in one `.qamaster/`.

## Hooks (`plugin/hooks/hooks.json`)

| Event | Script | Does | Timeout |
|---|---|---|---|
| SessionStart | `context.mts` | Prints the `qam` command for this install, the pipeline status line, stale stages | 10 s |
| PreToolUse (Bash) | `push-gate.mts` | Parses the command; blocks `git push` (exit 2) unless `.qamaster/verdicts/<HEAD>.json` says pass. Ignores repos without `.qamaster/` | 5 s |
| UserPromptSubmit | `prompt.mts` | On a test-design or script request, adds the context pack path and the rules | 15 s |
| Stop | `review-gate.mts` | Blocks ending the turn while a run is validated but unreviewed, or failed validation | 15 s |
| Stop | `script-gate.mts` | Blocks when `<App>/` files changed since the last passing `check-scripts` (hash compare, does not run the gate) | 10 s |

All hooks use only the standard library and stay quiet when they allow (Q14).

## Testing

| Level | What | How |
|---|---|---|
| Unit | Models, globs, tag derivation, selection, verdict rules, validator rules, rendering | `node:test` with fakes |
| Pipeline / CLI | plan → approve → run, publish dry run → apply, exit codes, HEAD binding | Temporary git repo fixture + fakes |
| ADO adapter | Plan by name, paging, fields, create/update/retire, revision conflicts, 401 / 203. One suite of contract tests per interface, run against the fake and ADO alike, so later stores reuse it | Recorded responses in `tests/fixtures/ado/` |
| pytest shim | list, select, report, evidence | `pytester`, run by `scripts/test-pytest-shim.sh` |
| bdd runner | List, grep, results, evidence, retries | A generated suite in a temp folder |
| Crawler | Mutation blocking, login handoff | Local fixture site |
| Hooks | Push detection, verdict lookup, review gate | Scripts run as subprocesses |
| End to end | Onboard → publish → check against a demo app | `CheckMasterDemo`-style repo + a sandbox ADO project |
| Plugin | Manifests, wiring, skill triggers | `claude plugin validate .`, `claude -p --plugin-dir ./plugin` |

## Porting plan

| # | Step | From | Size |
|---|---|---|---|
| 1 | New repo with the Q2 layout, `CLAUDE.md`, dev tooling, empty CLI with exit codes | CM | S |
| 2 | Models, `BlockedError`, config loader, adapter interfaces, fakes | CM | S |
| 3 | Move AQE engine modules into `src/` behind adapters, one feature at a time ([porting-step3.md](porting-step3.md)) | AQE | L |
| 4 | Port the ADO adapter to TypeScript, with fixtures from CM's tests | CM | M |
| 5 | Port selection, approve, run, verdict | CM | M |
| 6 | playwright-bdd runner; copy the pytest shim | New + CM | M |
| 7 | Publish: derivation, ledger, dry run, apply | New | M |
| 8 | Feedback: gaps, stale cases, defect drafts into reports | New + AQE | S |
| 9 | Hooks, commands, skills; the Q14 hook rules | Both | S |
| 10 | End to end against a demo app and a sandbox ADO project | — | M |
| 11 (v1.1) | git pre-push hook, GitHub / Azure Pipelines triggers, PR comment, QA branch matching in CI | CM design + New | M |
