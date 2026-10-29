# QAMaster: Decisions

One entry per decision that would be expensive to reverse. To change a decision, add a new entry that supersedes it. Don't edit the old one.

Each entry says where the choice came from:
- **AQE**: Autonomous-QE 0.1.5
- **CM**: CheckMaster, with its own decision number, e.g. CM-D15
- **New**: neither project had it

Format: **Q<n>. Title** (date, status, source): decision, why, what we gave up.

All entries Q1–Q24 were **accepted** on 2026-10-28. To change one, add a new entry that supersedes it. All [open questions](#open-questions) are resolved.

---

## Platform

**Q1. One plugin with one TypeScript engine** (2026-10-28, accepted 2026-10-28, AQE; reverses CM-D8 for QAMaster)
- **Decision:**
  - QAMaster is one Claude Code plugin with one engine in TypeScript.
  - It runs directly on Node 24 with type stripping: no build step and no runtime dependencies.
  - CheckMaster's Python engine (selection, verdict, the ADO adapter, about 1,900 lines) is ported to TypeScript.
  - Its pytest plugin stays Python (Q9, Q20).
- **Why:**
  - Autonomous-QE is about 9,500 lines of TypeScript, and the parts it owns are Node-first: the Playwright crawl, playwright-bdd generation and the report builders. Porting the smaller side costs about a fifth as much.
  - Playwright's main API is Node. This is also the reason CheckMaster first picked TypeScript (CM-D1).
  - Running directly with no install means the plugin works from `${CLAUDE_PLUGIN_ROOT}` on any machine with Node 24.
- **Gave up:**
  - A Python-native tool for Python teams. They need Node 24 installed, but not uv: the pytest runner uses `uv run pytest` only if their repo already has `uv.lock` (as CheckMaster does).
  - CheckMaster's pydantic models, which become TypeScript types plus hand-written validation.
- **Alternatives considered** (reviewed and A reconfirmed on 2026-10-28):

  | | A. One TypeScript engine (chosen) | B. One Python engine | C. Two engines, thin QAMaster layer | D. Engines behind MCP servers |
  |---|---|---|---|---|
  | Work to build | Medium: about 1,830 lines + 1,264 test lines from CheckMaster | Very large: about 9,500 lines from Autonomous-QE, and the generated framework changes | Small: publish command + playwright-bdd runner in CheckMaster | Medium: a CheckMaster MCP server, wiring |
  | Time to a working loop | Weeks | Months | Days to a week | About a week |
  | Speed and weight once running | Fastest: one runtime | Medium: uv start-up per call | Heavier: two runtimes, uv start-up per gate call | Heaviest: servers stay running |
  | User installs | Node (Python only for pytest suites) | Python + uv | Node and Python + uv | Node and Python + uv |
  | Long-term upkeep | One codebase, one set of models, one release | One codebase | Two codebases and a bridge that breaks when either changes | As C, plus the MCP layers |
  | Testability | One test setup | One test setup | Each tool tested; the bridge isn't | As C |
  | Main risk | The port repeats ADO bugs CheckMaster already fixed (port its tests first) | No Python playwright-bdd; output moves to pytest-bdd | The two tools drift: IDs and data shapes | Hooks can't call MCP, so the CLI is still needed |

  - **B** was rejected because it's the most work, and it gives up the Node-only parts: the Playwright crawl and BDD generation.
  - **D** was rejected because it adds a layer without removing one.
  - **C** was the real alternative: fastest to build, but heavier to run and two codebases for good. A was chosen for runtime weight, a single install, and one codebase to maintain.

**Q2. `plugin/` holds what ships; the repo root holds the marketplace and dev tooling** (2026-10-28, accepted 2026-10-28, CM-D16)
- **Decision:**
  - `plugin/` holds what installs: manifest, commands, skills, agents, hooks, `src/`, runners, templates.
  - The root holds `marketplace.json` (source `"./plugin"`), the dev `package.json`, `tests/`, `scripts/` and `docs/`.
- **Why:** an install copies only the source folder. Users don't get tests, seed scripts or dev dependencies. Autonomous-QE shipped its whole tree.
- **Gave up:** `--plugin-dir .` from the root. It's `--plugin-dir ./plugin`.

**Q3. One CLI, `qam`, that every surface calls** (2026-10-28, accepted 2026-10-28, CM-D3 + CM-D17 + AQE)
- **Decision:**
  - Commands, hooks, the MCP server, CI and terminals all call `qam`.
  - It prints readable text by default and JSON with `--json`.
  - Exit codes: `0` pass, `1` fail, `2` blocked (settings, credentials, network), `3` awaiting approval.
  - Front ends contain no logic.
- **Why:**
  - One tested code path. CI and the IDE can't disagree.
  - CheckMaster's exit-code contract lets any trigger, now or later, call it with no code in the engine.
  - Autonomous-QE already ran everything through `aqe`. It just didn't have the exit-code contract.
- **Gave up:** a little startup time per call.

**Q4. Every external system is an adapter picked by name, with a fake for tests** (2026-10-28, accepted 2026-10-28, CM-D17)
- **Decision:**
  - The engine talks to the outside only through five interfaces: `TestCaseStore`, `RequirementSource` (Q23), `Runner`, `RepoReader`, `Crawler`.
  - A repo picks implementations with `QAMASTER_STORE` (default `ado`), `QAMASTER_REQUIREMENTS` (default `ado`) and `QAMASTER_RUNNER` (default `playwright-bdd`).
  - Each provider reads only its own `QAMASTER_<NAME>_*` settings.
  - `tests/fakes.mts` has a fake for every interface.
- **Why:**
  - Jira, Cypress or a CI trigger can be added without touching the pipeline.
  - Autonomous-QE had no seams, which is one reason it had no unit tests.
- **Gave up:** a few lines of indirection per provider.

## Data and source of truth

**Q5. The engine reaches trackers through REST adapters; MCP is only for context the agent reads** (2026-10-28, accepted 2026-10-28, New; CM-D11 for auth)
- **Decision:**
  - Anything the CLI, a hook or CI needs comes from the `TestCaseStore` and `RequirementSource` adapters over REST: requirements, test cases, tags, links, publishing.
  - MCP servers stay, but only for sources the agent reads for context during test design: Confluence, Figma, Visio, and optionally GitLab.
  - The `mcp-config-agent` sets those up, read-only.
- **Why:**
  - Autonomous-QE only reached Jira and ADO through MCP. That meant the CLI couldn't fetch anything itself: the agent had to run the query and paste results back. That doesn't work in a hook or in CI, and it can't be tested with fixtures.
  - CheckMaster's REST adapter is deterministic, uses `respx`-style recorded tests, and gives clear `BlockedError` messages.
- **Gave up:**
  - One configuration style for all sources. ADO and Jira credentials go in `.env`, context sources in `.mcp.json` + `.env.mcp`.
  - Autonomous-QE's breadth of read-only MCP sources stays available, but only to the agent.

**Q6. Once published, Azure DevOps Test Plans is the source of truth for test cases** (2026-10-28, accepted 2026-10-28, CM-D15 extended)
- **Decision:**
  - Generated test cases in `testgen/output/` are **drafts**.
  - After publishing, the ADO test case is the master copy: title, steps, tags, *Automated Test Name*, suite membership. The gate reads only ADO.
  - More generally, the master copy is whatever the configured `TestCaseStore` holds. In v1 that's always ADO Test Plans (Q23).
  - The test plan is the one named like the app repo folder (ignoring case, spaces and punctuation), else `QAMASTER_ADO_PLAN`.
  - The app repo holds no QAMaster IDs or config, apart from a git-ignored `.env`.
- **Why:**
  - One place for QA to maintain test cases. They already work in Test Plans.
  - It's what CheckMaster's gate needs, and Autonomous-QE's local files had no path into it.
- **Gave up:**
  - Test cases versioned next to the code.
  - Edits made in ADO don't flow back into `testgen/output/`. A re-generated run is compared through the ledger (Q7), and publishing never overwrites a field a person changed in ADO since the last publish. It reports a conflict instead.

**Q7. Publishing is a dry run until `--apply`, idempotent, and never deletes** (2026-10-28, accepted 2026-10-28, New + CM-D17)
- **Decision:**
  - `qam publish <run>` prints what it would create, update, leave alone or retire. It writes only with `--apply`, after the person's yes in chat.
  - `.qamaster/ledger.json` in the QA project maps each local ID (`TC-LOGIN-001`) to its ADO ID, with a content hash and the tags QAMaster owns. Re-publishing the same run changes nothing.
  - A test case that is no longer generated is **retired** (State Closed, removed from every suite), never deleted, because ADO can't restore a test case deleted through its API.
  - Publishing refuses a run that hasn't passed the validator and the review gate (Q10, Q12).
- **Why:**
  - Autonomous-QE was read-only toward trackers. Publishing breaks that rule, so it has to be explicit, reviewable and undoable.
  - CheckMaster's `req` / `tc` commands already proved this pattern.
- **Gave up:** speed. Each publish is a two-step conversation.

**Q8. Selection tags are derived from facts, not typed** (2026-10-28, accepted 2026-10-28, New)
- **Decision:** when publishing, QAMaster sets three kinds of tags on each test case:
  - `path:<glob>`: one per source file or folder behind the screens the case visits. They come from the DSM's evidence (`repo:file:line`) and are collapsed to the nearest folder with a configurable depth.
  - **Group**: the case's module and sub-module (e.g. `checkout`, `checkout-coupon`).
  - `smoke`: **suggested, not set** (settled 2026-10-28, open question 3).
    - Publish suggests it for P1 cases of category Positive or E2E, capped by `config/qamaster.json → smoke.max` (default 20).
    - The suggestions appear in the publish preview, where QA confirms them or unticks any. Only confirmed ones are written.
    - A smoke tag QA removed, in the preview or later in ADO, is recorded in the ledger and never suggested again for that case.
  
  QAMaster only adds or removes the tags listed as its own in the ledger. Tags people add in ADO are never touched.
- **Why:**
  - Hand-tagging was CheckMaster's biggest setup cost, and its success target (90% recall at 30% of the suite or less) depends on good `path:` tags.
  - The DSM already links screens to source files, so the facts exist.
- **Gave up:**
  - Tags based on the DSM's view of the code are only as good as its code scan. Routes it can't resolve produce no `path:` tag, and the plan flags those cases under **Not linked to code**.

**Q9. The automation link is `<runner>:<id>`; BDD scenarios are found by their `@TC` tag** (2026-10-28, accepted 2026-10-28, CM-D15 + CM-D4)
- **Decision:** *Automated Test Name* in ADO holds a runner-prefixed ID:
  - `bdd:@TC-LOGIN-001`: the playwright-bdd scenario tagged `@TC-LOGIN-001`. Autonomous-QE already writes that tag on every generated scenario, and its script gate enforces it.
  - `pytest:tests/test_coupon.py::test_applies`: a pytest node ID and its parametrized variants, as in CheckMaster.
  
  A link that matches no collected test marks the case **BROKEN**, which fails the verdict.
- **Why:**
  - For generated code, the tag is written by the same tool that writes the link, so they can't drift. Unlike a file path, it survives renames and moves. This was CheckMaster's main loss in CM-D15.
  - pytest keeps CheckMaster's no-markers rule, so hand-written Python suites need no changes.
- **Gave up:**
  - Scenarios in generated BDD suites do carry an ID in the code (the `@TC` tag).
  - One automated test per test case, as in ADO.

## Test design and selection

**Q10. Test design has hallucination tolerance 0** (2026-10-28, accepted 2026-10-28, AQE)
- **Decision:**
  - Every screen, element, step and rule in a test case cites evidence: the DSM, the AUT skills, code it read, a fetched requirement, or a domain skill section.
  - `qam testgen validate` must report 0 findings and 0 coverage gaps before a run can be rendered, reviewed or published.
  - A gap that truly can't be tested goes in `coverage_exclusions` with a reason a person can check.
- **Why:** test cases go into the tracker the team trusts (Q6). An invented step there costs more than in a local draft.
- **Gave up:**
  - Speed and some creativity. Cases need facts behind them.
  - Exploratory ideas go to a separate `ideas.md`, not into the test cases.

**Q11. Rules decide the plan; Claude adds groups; the DSM flags gaps** (2026-10-28, accepted 2026-10-28, CM-D15 + AQE)
- **Decision:** the gate's plan has four sources of reasons, in this order:
  1. `path:` matches: changed files against the case's globs.
  2. `smoke`: always in.
  3. Groups Claude picks from the diff, one-line reason each. They start checked, and the person approves. Skipped when `QAMASTER_AI=off` (Q24).
  4. **DSM impact**: screens whose source files changed. Impacted screens with no selected case are listed as **Coverage gaps**. They never add tests silently.
  
  Run from the CLI alone (CI, the hook), the plan uses only 1, 2 and 4, so it's predictable.
- **Why:**
  - CheckMaster's rules are explainable, and Claude's groups catch what globs miss.
  - Autonomous-QE's DSM impact analysis already knew which screens a commit touched, but nothing used it to choose tests.
- **Gave up:** group picks depend on Claude and can differ between runs (as in CM-D15).

**Q12. A person decides at three gates** (2026-10-28, accepted 2026-10-28, AQE + CM-D6)
- **Decision:**
  1. **Review** test cases before publishing. Enforced by the Stop hook and by `publish` refusing unreviewed runs.
     - **Who** (settled 2026-10-28, open question 6): in v1, any QA engineer can approve.
     - QAMaster records a checked identity, never a typed name: the ADO account running the publish (PAT owner or `az login` user) plus `git config user.email`. It goes on the run, in the ledger, and in each test case's ADO history.
     - If `config/qamaster.json → owners` names an owner for a module, the publish preview **warns** when someone else approves. It doesn't block.
     - Two reviewers and an owner-only rule were rejected as too slow for v1. Turning the owner warning into a block later needs no redesign.
  2. **Go-ahead** before generating automation for a module.
  3. **Plan approval** before each gate run. Bound to the HEAD sha, and to the QA project's commit when tests live there (Q22), so a new commit in either voids it. In CI, only users with write access can approve.
  
  Claude never approves on the person's behalf. Commands end the turn and wait.
- **Why:** gates 1 and 2 come from Autonomous-QE's onboarding, gate 3 from CheckMaster. Each protects a different thing: the test catalog, the automation effort, and the merge.
- **Gave up:** fully automatic runs. `--yes` exists for local use only.

**Q13. Verdict rules, retries and evidence follow CheckMaster** (2026-10-28, accepted 2026-10-28, CM design)
- **Decision:**

  | Situation | Verdict |
  |---|---|
  | All approved tests passed | pass |
  | Any failed after one retry, or didn't run, or was skipped | fail |
  | A selected case is BROKEN | fail |
  | Nothing matched the change | pass, with a coverage-gap warning |
  | Missing settings, credentials, ADO down | blocked |
  | Not approved yet | pending, never green |

  - Only failures are retried, once. Failed then passed is **flaky**: listed, but it doesn't fail the verdict.
  - Evidence (screenshot, video, trace) is kept per attempt in `.qamaster/evidence/<sha>/attempt-<n>/`. Settings the project already passes to Playwright are kept.
- **Why:** these rules are tested, and they never go green when a test didn't run.
- **Gave up:** nothing new.

## Safety and hooks

**Q14. Hooks are fast and quiet; slow checks run on request** (2026-10-28, accepted 2026-10-28, CM plugin rules; narrows AQE)
- **Decision:**
  - `SessionStart` prints context and stale-stage warnings.
  - `PreToolUse` on Bash blocks `git push` without a passing verdict for HEAD. It only applies to repos with a `.qamaster/` folder.
  - The `Stop` gates check only fast facts: is there an unreviewed run, does the last script gate result match the current files. Each has a timeout of 15 seconds or less.
  - The full script quality gate and test runs happen in explicit steps.
  - Hooks exit 0 to allow and 2 to block, with the reason on stderr.
- **Why:** Autonomous-QE's Stop hooks could run for up to seven minutes at the end of every turn, and its PostToolUse hooks ran on every Bash call. That slows every session, even ones unrelated to QA.
- **Gave up:** an automatic full gate after every edit. A turn can end with scripts that haven't been re-checked. `/qamaster:status` and the push gate catch that.

**Q15. Read-only toward repos and trackers, except where a decision says otherwise** (2026-10-28, accepted 2026-10-28, AQE + CM)
- **Decision:**
  - Source repos are only read, using fetch, ls-tree and cat-file. They are never checked out, committed to or pushed.
  - Trackers are read-only, except `publish` (Q7) and the `work-items` skill. Both are dry runs until `--apply`.
  - The UI crawl blocks data-changing requests after login.
  - Tests run against production only after explicit confirmation.
- **Why:** both projects' safety rules, unchanged.
- **Gave up:** nothing.

**Q16. Secrets never appear in chat or plugin files** (2026-10-28, accepted 2026-10-28, AQE + CM-D11)
- **Decision:**
  - ADO auth uses `QAMASTER_ADO_TOKEN` (a PAT) if set, else a token from `az login`.
  - Application logins for the crawl are typed in the terminal prompt, or kept in git-ignored `.env.dsm`.
  - Context-source tokens go in `.env.mcp`.
  - Nothing is logged, saved in `.qamaster/` or put in a report.
  - `qam setup` adds deny rules for `.env*` files to the project's `.claude/settings.json`, so Claude can't read secret files even when asked ([data-handling.md](data-handling.md)).
- **Why:** both projects agreed.
- **Gave up:** nothing.

## Output and reach

**Q17. Reports are self-contained HTML, and the gate feeds them** (2026-10-28, accepted 2026-10-28, AQE)
- **Decision:**
  - Six report types: DSM, test cases, execution, defects, root cause analysis, test summary. They open offline.
  - The gate's verdicts and evidence feed the execution, defect and root cause reports. A failed case becomes a defect draft, never a filed bug.
- **Why:** CheckMaster had only a verdict JSON and a planned PR comment, while Autonomous-QE's reports were its strongest output.
- **Gave up:** nothing.

**Q18. Other AI tools get skills, instructions and the MCP server, not hooks** (2026-10-28, accepted 2026-10-28, AQE)
- **Decision:**
  - `qam export --target kiro|codex|antigravity|cursor|gemini|copilot|agent-plugin` writes skills and instructions, and registers `qam mcp-serve`.
  - Hooks aren't ported. The instructions tell those agents to run the validators.
  - The push gate reaches every tool and terminal through the git pre-push hook in v1.1.
- **Why:** Autonomous-QE's reach, kept. CheckMaster was Claude Code only.
- **Gave up:** enforcement in other tools until the git hook lands.
- **Amended 2026-10-29:** export and `qam mcp-serve` move to v2. v1 is an MVP for Claude Code; Autonomous-QE's extras, MCP included, come after it ([porting-step3.md](porting-step3.md#roadmap-what-comes-after-the-v1-mvp)). The decision itself stands for v2.

**Q19. Feedback proposes; it never generates on its own** (2026-10-28, accepted 2026-10-28, New)
- **Decision:**
  - After a verdict or a DSM refresh, `feedback` lists three things:
    - coverage gaps (impacted screens with no case);
    - stale cases (a DSM relation they cite is gone);
    - BROKEN links.
  - It proposes a TestGen run for the module. Starting it is the person's choice.
  - It never generates during a push.
- **Why:** generating test cases is slow and needs review (Q12). Doing it inside a push would block developers on QA work.
- **Gave up:** a fully self-healing suite.

## Scope and process

**Q20. v1 scope** (2026-10-28, accepted 2026-10-28, New)
- **Decision:**
  - Test case store: `ado` (Test Plans) only. Requirements: `ado` (Boards). See Q23.
  - Runners: `playwright-bdd` (Web, Mobile Web, API; Android and iOS through Appium as in Autonomous-QE) and `pytest`.
  - Surface: Claude Code.
  - Jira can be read for requirements during test design, through MCP, as in Autonomous-QE.
- **Why:** one complete path end to end, as in CM-D2.
- **Gave up:**
  - Every test case store other than ADO, including Jira add-ons and the spreadsheet fallback, waits until after v1 (Q23).
  - CI triggers and the git hook move to v1.1.

**Q21. Engineering discipline follows CheckMaster** (2026-10-28, accepted 2026-10-28, CM)
- **Decision:** each item below has to be in place before the code that needs it ships.
  - A `CLAUDE.md` with CheckMaster's rules: think first, simplicity, surgical changes, goal-driven checks, a Learnings section.
  - This decision log.
  - Unit tests with fakes for every engine module.
  - Recorded-response tests for each tracker.
  - `node:test`, `tsc --noEmit` and Biome must pass before a release.
- **Why:** CheckMaster had full test coverage in about 2,000 lines. Autonomous-QE had about 9,500 lines with no unit tests. The merged engine is bigger than either, so it needs the stricter habit.
- **Gave up:** porting speed. Autonomous-QE modules get tests as they move.

**Q22. The gate runs in the app repo; the tests can live elsewhere** (2026-10-28, accepted 2026-10-28, New)
- **Decision:**
  - The gate always reads the diff from the repo being pushed and keeps its plans and verdicts in that repo's `.qamaster/`.
  - The runner runs from `QAMASTER_TEST_ROOT` if set: an absolute path, or relative to the repo, usually the QA project's `<App>/` folder. Otherwise it runs from the repo root.
  - **Which version of the QA project runs** (settled 2026-10-28, open question 4):
    - **v1:** whatever is checked out, with two rules:
      1. Uncommitted changes in the QA project block the plan and the run.
      2. The QA project's commit is bound to the plan alongside the app commit. If either moves after approval, the plan is void and must be approved again (Q12).
      
      The QA commit is recorded in the plan and the verdict.
    - **v1.1, for CI:** the matching branch. The gate checks out the QA project branch with the same name as the app branch if one exists, otherwise `main`, and records which one it used.
- **Why:**
  - CheckMaster assumed tests live next to the code. Autonomous-QE keeps them in a separate QA project and never writes to the app repo. Both setups are common at Galent.
  - Running what's checked out keeps the local gate fast. Requiring a clean, recorded commit keeps every verdict traceable.
  - Matching branches let a code change and its test change land together, and that's what a CI machine can check out without a person.
- **Gave up:**
  - Exact reproduction in v1. Someone re-running a verdict has to check out the recorded QA commit by hand.
  - Pinning a QA commit or a tagged QA release, which were rejected as too slow: every test change would need a second step.

**Q24. AI use is on by default, with one switch that turns it all off** (2026-10-28, accepted 2026-10-28, New; resolves open question 5, amends Q11)
- **Decision:**
  - QAMaster's AI steps are on unless a repo sets `QAMASTER_AI=off`. The AI steps are:
    - Claude picking groups from the diff;
    - Claude reading code and requirements for application knowledge, test design and locator sync;
    - Claude triaging failures.
  - The setting is read from the app repo's `.env` and from the QA project's `config/qamaster.json`. If either says off, it's off.
  - **When it's off:**
    - Plans use only `path:`, `smoke` and DSM impact, and say "Group picking off for this repo".
    - The context commands that feed code to Claude (`qam testgen context`, `qam aut-context`, the locator-sync context) refuse with a message naming the setting. So do the skills that use them.
    - What doesn't need AI keeps working: the DSM crawl and scan, publishing an already-reviewed run, the gate's run and verdict, and reports.
  - [data-handling.md](data-handling.md) lists exactly what goes to Claude, when, and what never does.
- **Why:**
  - Inside a Claude Code session, Claude can already read the repo, so reading a diff adds no new exposure. On by default gives the best selection quality.
  - Customers who forbid AI on their code need one clear switch that covers every step, not just group picking. Otherwise they'd discover during test design that their code went to Claude.
  - Galent's contractual position isn't known yet. The switch lets v1 ship either way.
- **Gave up:**
  - With the switch off, QAMaster can't design tests or build application knowledge for that repo. Only the deterministic parts are left.
  - The switch governs QAMaster's own steps. It can't stop a person from asking Claude to read files in the same session. Teams that must keep code out of Claude entirely should run `qam` from a terminal, not from Claude Code.
  - A team that forbids AI has to remember to set it.

**Q23. The test case store is a replaceable adapter; v1 ships ADO Test Plans only** (2026-10-28, accepted 2026-10-28, New; resolves open question 2, amends Q4 and Q6)
- **Decision:**
  - The old `Tracker` interface splits in two:
    - **`TestCaseStore`**: list, create, update and retire test cases, read their tags and automation links, manage suites.
    - **`RequirementSource`**: requirements for a sprint or a date range.
  - Each is picked by name: `QAMASTER_STORE` and `QAMASTER_REQUIREMENTS`.
  - **v1:** `ado` for both. When ADO isn't configured, the gate and publish stop with `BlockedError`, naming the `.env` lines to add.
  - **After v1, in this order:**
    1. **`file`**: a spreadsheet in the project (`testcases.xlsx` or `testcases.csv`), used when no tracker is configured.
       - It uses the layout of ADO Test Plans' own XLSX import, the same one CheckMaster's seed sheets use: one row per step, plus ID, State, Suite, Requirement, Automated Test and Tags columns.
       - Moving a project to ADO later is then a straight import.
    2. Jira add-ons, as their own adapters (`xray`, `zephyr`). Which one comes first depends on which add-on customers use.
- **Why:**
  - Teams without ADO aren't locked out for good, and adding a store doesn't touch the pipeline (Q4).
  - Requirements and test cases often live in different tools (Jira plus ADO, for example), so they need separate interfaces.
  - Keeping v1 to one store gets one path working end to end first (as in CM-D2).
- **Gave up:**
  - v1 needs ADO for the gate and publishing. Jira-only teams can still read requirements through MCP during test design, but they can't publish or gate until a non-ADO store ships.
  - The spreadsheet store loses tracker features: history, permissions and concurrent editing. Its open questions (xlsx or csv by default, how to keep formatting people add, merge conflicts) are settled when it's built.

---

## Open questions

1. ~~**Accept Q1?**~~ **Resolved 2026-10-28:** accepted. QAMaster has a single TypeScript engine, and CheckMaster's Python engine is ported. The two-engine option was rejected.
2. ~~**Jira test cases:** Xray, Zephyr Scale, or not supported?~~ **Resolved 2026-10-28** by Q23: the test case store is a replaceable adapter, and v1 uses ADO Test Plans only. Which Jira add-on comes first is decided when a customer needs it.
3. ~~**Smoke rule:** is "P1 and Positive or E2E, at most 20" right, or does QA pick smoke by hand?~~ **Resolved 2026-10-28:** the rule only suggests smoke. QA confirms each suggestion in the publish preview, and a removed smoke tag is never re-added (Q8). Rejected: the rule with no review, hand-picking only, and one smoke case per DSM journey.
4. ~~**QA project versioning:** when tests live in a QA project, should the gate require it to be at a tagged or pinned commit?~~ **Resolved 2026-10-28** (Q22):
   - v1 runs the checked-out QA project, which must be clean. Its commit is recorded and bound to the plan.
   - v1.1 uses the QA branch matching the app branch, else `main`.
   - Pinned commits and tagged releases were rejected.
5. ~~**Data policy:** is sending the diff to Claude for group picking allowed for every customer?~~ **Resolved 2026-10-28** by Q24:
   - AI steps are on by default, and `QAMASTER_AI=off` turns all of them off.
   - Data flows are documented in [data-handling.md](data-handling.md).
   - Still for Galent legal: whether customer contracts allow AI on code. The design works either way.
6. ~~**Who reviews in gate 1:** any QA engineer, or a named owner per module?~~ **Resolved 2026-10-28** (Q12):
   - Any QA engineer can approve, recorded by checked identity.
   - Optional module owners produce a warning, not a block.
