# QAMaster: Architecture

> Status: draft v0.1 (2026-10-28). For what and why, see [product.md](product.md). For behavior, see [design.md](design.md). For the stack and internals, see [tech.md](tech.md). Settled choices are in [decisions.md](decisions.md) as Q1, Q2, ...

QAMaster joins two existing Galent plugins into one loop:

- **Autonomous-QE** (TypeScript) builds test assets from an application URL and its repository: the Design Structure Matrix (DSM), application knowledge, requirements, test cases validated against evidence, Playwright BDD scripts and reports.
- **CheckMaster** (Python) gates each code change: it picks test cases from Azure DevOps Test Plans by tag, a person approves the pick, it runs the tests and records a verdict that blocks `git push`.

Neither does the other's job. Autonomous-QE's test cases never reach Azure DevOps, so nothing runs them against later changes. CheckMaster needs test cases that are already in Azure DevOps, with hand-set tags and automation links. QAMaster adds the bridge between them, **publish**, and closes the loop with **feedback**.

## 1. Full architecture

```mermaid
flowchart TB
    %% ---------- Surfaces ----------
    subgraph SURF["Surfaces (thin: they call the qam CLI and show its output)"]
        direction LR
        CC["Claude Code plugin<br/>commands · skills · agents · hooks"]
        OT["Other AI tools<br/>Kiro · Codex · Cursor · Gemini · Copilot<br/>(qam export + MCP server)"]
        CI["CI · v1.1<br/>GitHub Actions · Azure Pipelines<br/>(qam --json)"]
        GH["git pre-push hook · v1.1<br/>(qam install-hooks)"]
    end

    CLI["qam CLI · the only entry point<br/>--json output · exit codes 0 pass · 1 fail · 2 blocked · 3 awaiting approval"]
    MCPS["qam mcp-serve<br/>stdio MCP server: tools, skills, prompts"]

    CC --> CLI
    OT --> MCPS --> CLI
    CI --> CLI
    GH --> CLI

    %% ---------- Engine ----------
    subgraph ENG["Engine · plugin/src (TypeScript on Node 24, no build step, zero runtime dependencies)"]
        direction TB
        PIPE["Pipeline state machine<br/>stages · evidence · stale detection · resume"]

        subgraph BUILD["Build: Autonomous-QE lineage"]
            direction LR
            DISC["Discover<br/>UI crawl + repo scan → DSM"]
            KNOW["Know<br/>AUT_&lt;App&gt; skills"]
            REQ["Requirements<br/>sprint or date range"]
            DES["Design<br/>context pack → test cases<br/>validator, tolerance 0"]
            AUTO["Automate<br/>app folder · locator sync<br/>BDD scripts · script gate"]
        end

        PUB["Publish · new bridge<br/>test cases → ADO Test Plans<br/>derived tags + automation links<br/>dry run until --apply · idempotent ledger"]

        subgraph GATE["Gate: CheckMaster lineage"]
            direction LR
            COL["Collect<br/>git diff base..HEAD"]
            SEL["Select<br/>path: · smoke · groups<br/>+ DSM impact"]
            APR["Approve<br/>person · bound to HEAD sha"]
            RUN["Run<br/>retry once · flaky · evidence"]
            VER["Verdict<br/>pass · fail · blocked"]
        end

        FB["Feedback · new<br/>coverage gaps → TestGen proposal<br/>stale test cases after DSM change"]
        REP["Reports<br/>DSM · test cases · execution<br/>defects · RCA · summary (self-contained HTML)"]

        PIPE --> BUILD
        DISC --> KNOW --> DES
        REQ --> DES
        DES --> AUTO
        DES --> PUB
        AUTO --> PUB
        COL --> SEL --> APR --> RUN --> VER
        VER --> FB
        VER --> REP
        DES --> REP
        DISC --> REP
        FB -.->|"proposes, person confirms"| DES
    end

    CLI --> PIPE
    CLI --> PUB
    CLI --> GATE
    CLI --> REP

    %% ---------- Adapters ----------
    subgraph ADP["Adapters · interfaces picked by name (QAMASTER_STORE, QAMASTER_REQUIREMENTS, QAMASTER_RUNNER), fakes in tests"]
        direction LR
        TRK["TestCaseStore<br/>ado Test Plans · v1<br/>xlsx/csv file · Xray/Zephyr · later"]
        RQS["RequirementSource<br/>ado Boards · v1"]
        RNR["Runner<br/>playwright-bdd · v1<br/>pytest · v1 (Python shim)"]
        REPO["RepoReader<br/>git: fetch · ls-tree · cat-file<br/>never checkout or commit"]
        CRW["Crawler<br/>Playwright Node<br/>blocks data-changing requests"]
    end

    PUB --> TRK
    SEL --> TRK
    REQ --> RQS
    RUN --> RNR
    COL --> REPO
    DISC --> REPO
    DISC --> CRW
    AUTO --> RNR

    %% ---------- External ----------
    subgraph EXT["External systems"]
        direction LR
        ADO[("Azure DevOps<br/>Boards · Test Plans")]
        JIRA[("Jira")]
        APP[("Application under test<br/>web · mobile · API")]
        SRC[("Source repositories<br/>read-only")]
        CTX[("Context sources via MCP<br/>Confluence · Figma · Visio")]
    end

    TRK -->|"REST 7.1 · PAT or az login"| ADO
    RQS --> ADO
    TRK -.->|"later: Xray / Zephyr"| JIRA
    CRW --> APP
    RNR --> APP
    REPO --> SRC
    CC -.->|"agent reads, read-only"| CTX

    %% ---------- State ----------
    subgraph ST["State in the QA project (generated, git-ignored where it holds secrets)"]
        direction LR
        S1["dsm/<br/>dsm.json · index.html · CHANGES.md"]
        S2["testgen/output/&lt;run&gt;/<br/>manifest · testcases · review"]
        S3["&lt;App&gt;/<br/>features · steps · pages · locators"]
        S4[".qamaster/<br/>pipeline · ledger · plans · verdicts · evidence"]
        S5["reports/<br/>data · output"]
    end

    ENG <--> ST
```

How to read it:

- **Everything goes through `qam`.** Commands, hooks, the MCP server and CI call the same CLI. The CLI is the only path into the engine, so Claude Code, CI and a terminal can't disagree about a verdict (Q3).
- **Two lineages, one engine.** The top half of the engine is Autonomous-QE's pipeline, the bottom half is CheckMaster's gate. Both were rewritten into one TypeScript engine with shared models (Q1).
- **Publish is the bridge.** It turns a validated test run into Azure DevOps test cases that the gate can select. The tags and automation links come from facts QAMaster already has, so nobody types them by hand (Q8, Q9).
- **Every external system sits behind an adapter.** The engine never calls Azure DevOps, git, a browser or a test runner directly (Q4).
- **The person decides at three gates:** test case review before publishing, the go-ahead before automating, and plan approval before each run (Q12).

## 2. The loop

```mermaid
flowchart LR
    A["1 · Build<br/>DSM · AUT skills<br/>requirements · test cases<br/>scripts"] -->|"person reviews<br/>test cases"| B["2 · Publish<br/>ADO Test Plan<br/>tags + automation links"]
    B --> C["3 · Gate<br/>every push or PR<br/>plan → approve → run → verdict"]
    C --> D["4 · Feedback<br/>reports · defects · RCA<br/>coverage gaps · stale cases"]
    D -->|"person confirms<br/>a TestGen run"| A
    C -.->|"pass: push allowed<br/>fail or blocked: push stopped"| E(("git push"))
```

| Step | Runs | Trigger | Output |
|---|---|---|---|
| 1 Build | Once per application, then module by module | `/qamaster:onboard` | `dsm/`, `.claude/skills/AUT_<App>*`, `testgen/output/`, `<App>/` |
| 2 Publish | After each reviewed test run | `/qamaster:publish` | Test cases in the ADO plan, `.qamaster/ledger.json` |
| 3 Gate | Every push (v1), every PR (v1.1) | `/qamaster:check`, push hook | `.qamaster/plans/`, `.qamaster/verdicts/<sha>.json`, evidence |
| 4 Feedback | After each verdict and each DSM refresh | Automatic, proposals only | Reports, defect drafts, gap list |

## 3. Where things run

QAMaster deals with three folders. The gate runs where the code is pushed; the build runs in the QA project.

```mermaid
flowchart LR
    subgraph DEV["App repository (developers push here)"]
        D1[".env<br/>QAMASTER_ADO_ORG · _PROJECT<br/>QAMASTER_TEST_ROOT (optional)"]
        D2[".qamaster/<br/>plans · verdicts · evidence"]
        D3["tests/ (pytest, optional)"]
    end
    subgraph QA["QA project (QAMaster builds here)"]
        Q1["config/ · dsm/ · testgen/"]
        Q2["&lt;App&gt;/ playwright-bdd suite"]
        Q3["reports/ · .qamaster/ledger.json"]
    end
    subgraph PLG["Plugin install (read-only, replaced on update)"]
        P1["skills · commands · agents · hooks"]
        P2["src/ engine · runners/pytest shim"]
        P3["templates · report templates"]
    end

    QA -->|"reads only, never commits"| DEV
    DEV -->|"QAMASTER_TEST_ROOT points at"| Q2
    PLG --> QA
    PLG --> DEV
```

- **Tests live in the app repo** (CheckMaster's setup): leave `QAMASTER_TEST_ROOT` unset. The runner runs from the repo root.
- **Tests live in the QA project** (Autonomous-QE's setup): set `QAMASTER_TEST_ROOT` to the `<App>/` folder. The gate reads the diff from the app repo and runs the suite from there (Q22).

## 4. The gate, step by step

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant CC as Claude Code
    participant Q as qam CLI
    participant G as git (app repo)
    participant T as TestCaseStore (ADO)
    participant D as DSM
    participant R as Runner

    Dev->>CC: /qamaster:check
    CC->>Q: qam plan --base main --json
    Q->>G: diff merge-base..HEAD
    Q->>T: test cases in plan (tags, automation link)
    Q->>D: screens impacted by changed files
    Q->>R: collected test IDs
    Q-->>CC: plan: path, smoke, groups, not run, gaps
    CC->>CC: read diff, pick groups with a reason
    CC->>Q: qam plan --tag coupon="coupon rules changed"
    CC-->>Dev: show the plan and end the turn
    Dev->>CC: approve (or add / remove)
    CC->>Q: qam approve PLAN_ID --by NAME
    Q->>G: HEAD still equals planned sha?
    CC->>Q: qam run PLAN_ID
    Q->>R: run selection, retry failures once
    R-->>Q: results + evidence
    Q-->>CC: verdict pass / fail / blocked
    Dev->>CC: git push
    CC->>Q: PreToolUse hook reads .qamaster/verdicts/HEAD
    Q-->>CC: allow (pass) or block (exit 2, with reason)
```

## 5. Publish, step by step

```mermaid
sequenceDiagram
    autonumber
    actor QA as QA engineer
    participant CC as Claude Code
    participant Q as qam CLI
    participant L as ledger.json
    participant T as TestCaseStore (ADO)

    QA->>CC: /qamaster:publish RUN
    CC->>Q: qam publish RUN --json (dry run)
    Q->>Q: refuse unless validator passed and run was reviewed
    Q->>L: which local IDs already have an ADO ID?
    Q->>Q: derive tags: path from DSM files, group from module, smoke from P1
    Q->>Q: derive automation link: bdd:@TC-ID from the scenario tag
    Q-->>CC: create 12 · update 3 · unchanged 40 · retire 0
    CC-->>QA: show the change list and end the turn
    QA->>CC: yes
    CC->>Q: qam publish RUN --apply
    Q->>T: create or update work items, add to suite
    Q->>L: record local ID ↔ ADO ID, owned tags, content hash
    Q-->>CC: done, with links to each test case
```

## 6. Module map

| Module (`plugin/src/`) | Role | Comes from |
|---|---|---|
| `cli/` | Argument parsing, `--json`, exit codes, the only entry point | Both (CheckMaster's contract) |
| `pipeline/` | Onboarding stages, evidence, stale detection, resume | Autonomous-QE `tools/pipeline` |
| `dsm/` | UI crawl, repo scan, matrix build, diff, impact, HTML render | Autonomous-QE `tools/dsm` |
| `knowledge/` | AUT skill builder and context | Autonomous-QE `tools/aut-skill` |
| `requirements/` | JQL / WIQL planning, normalise, save | Autonomous-QE `tools/requirements`, now through the `RequirementSource` adapter |
| `testgen/` | Context pack, validator (tolerance 0), render | Autonomous-QE `tools/testgen` |
| `automation/` | App folder scaffold, locator sync, script quality gate | Autonomous-QE `tools/e2e-automation`, framework `scripts/locator-sync` |
| `publish/` | Tag and link derivation, ledger, dry run, apply | **New** |
| `gate/` | Collect, select, approve, run, verdict | CheckMaster `pipeline.py`, `selection.py`, `verdict.py`, ported |
| `feedback/` | Coverage gaps, stale cases, defect drafts | **New**, partly Autonomous-QE defect drafts |
| `reports/` | Report data builders and HTML | Autonomous-QE `tools/reports` |
| `adapters/` | `TestCaseStore`, `RequirementSource`, `Runner`, `RepoReader`, `Crawler` interfaces and implementations | CheckMaster `adapters/` pattern; ADO adapter ported |
| `export/`, `mcp/` | Export to other AI tools, stdio MCP server | Autonomous-QE `tools/export`, `tools/mcp_server` |
| `shared/` | Models, config, errors (`BlockedError`), paths | Both |

Outside `src/`:

| Path | Role |
|---|---|
| `plugin/runners/pytest/qamaster_pytest.py` | pytest plugin loaded with `-p` into the user's test environment. Standard library and pytest only. A port of CheckMaster's `pytest_plugin.py` |
| `plugin/hooks/` | Hook scripts: session context, push gate, test case review gate, script gate |
| `plugin/framework/` | The playwright-bdd template for new `<App>/` folders |
| `plugin/skills/`, `commands/`, `agents/` | Claude Code front ends, including about 45 domain, app-type and test-type design skills |
