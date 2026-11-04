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
- **Amended 2026-10-29:** a sixth interface, `Framework`, covers test generation (Q25).
- **Amended 2026-10-29:** a seventh interface, `CodeHost`, covers pull requests on GitHub, Azure Repos, Bitbucket and GitLab (Q28).
- **Amended 2026-10-29:** `RepoReader` gets a second kind of implementation, reading through a code host's API with no clone (Q30).

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
- **Amended 2026-10-29:** the four sources become switchable *selectors* with presets, and the AI step's model can be chosen (Q31). The default preset is exactly the rules above.

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
- **Amended 2026-10-29:** the Claude Code hooks are the first kind of *integration* (Q27). Git hooks, PR checks and branch policies follow as further kinds, and every place QAMaster is plugged in is recorded.
- **Amended 2026-11-02 (accepted, from the clean Docker run, F11):** a hook that can't judge a push, for example because git isn't available, still allows it. It now says so on stderr in one line, so nobody mistakes an unchecked push for a checked one.

**Q15. Read-only toward repos and trackers, except where a decision says otherwise** (2026-10-28, accepted 2026-10-28, AQE + CM)
- **Decision:**
  - Source repos are only read, using fetch, ls-tree and cat-file. They are never checked out, committed to or pushed.
  - Trackers are read-only, except `publish` (Q7) and the `work-items` skill. Both are dry runs until `--apply`.
  - The UI crawl blocks data-changing requests after login.
  - Tests run against production only after explicit confirmation.
- **Why:** both projects' safety rules, unchanged.
- **Gave up:** nothing.
- **Amended 2026-10-29:** cloning a remote repository is the one write to a source repo, and only when the person asks for it, into a folder they choose (Q26). After the clone, only fetch, ls-tree and cat-file run.

**Q16. Secrets never appear in chat or plugin files** (2026-10-28, accepted 2026-10-28, AQE + CM-D11)
- **Decision:**
  - ADO auth uses `QAMASTER_ADO_TOKEN` (a PAT) if set, else a token from `az login`.
  - Application logins for the crawl are typed in the terminal prompt, or kept in git-ignored `.env.dsm`.
  - Context-source tokens go in `.env.mcp`.
  - Nothing is logged, saved in `.qamaster/` or put in a report.
  - `qam setup` adds deny rules for `.env*` files to the project's `.claude/settings.json`, so Claude can't read secret files even when asked ([data-handling.md](data-handling.md)).
- **Why:** both projects agreed.
- **Gave up:** nothing.
- **Amended 2026-10-29 (the crawl session):**
  - After the crawl signs in, its session (cookies and storage) is saved to `dsm/.auth/state.json` by default, so later crawls skip sign-in. This includes unattended refreshes of apps that need a person to sign in (SSO, MFA, CAPTCHA).
  - The file is plain JSON, owner-only (`0600`), and its folder ignores itself in git.
  - `login.save_session: false` in `dsm-config.json` turns saving off.
  - `qam setup` denies Claude reading `dsm/.auth/`, as it does `.env*`.
  - **Why:** the person chose convenience by default, with an off switch. It's also AQE's behaviour and setting.
  - **Gave up:** the session file is a credential. Anyone who reads it is signed in as the crawl's test user until the session expires, including through backups, cloud sync or a shared copy of the project folder. Use a dedicated read-only test account, and turn saving off where that risk matters. AQE 0.2.0's encryption of the file is not ported, since its vault was ruled out above.

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
- **Amended 2026-10-29:** generation is still playwright-bdd only in v1, but it sits behind the `Framework` adapter (Q25). Other frameworks become new adapters, not a rewrite.
- **Amended 2026-10-29 (integrations):** v1 builds the integration seam and its record (Q27), with Claude Code hooks as the only kind. The git pre-push hook and PR checks stay v1.1; branch policies come after.

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

**Q25. Test generation goes behind a `Framework` adapter; v1 ships playwright-bdd only** (2026-10-29, accepted 2026-10-29, New; amends Q4 and Q20)
- **Decision:**
  - Everything framework-specific between a reviewed test case and a runnable test goes behind one adapter, `Framework`, paired with the `Runner` that runs its tests. That covers:
    - creating the automation folder;
    - the script quality gate;
    - locator sync;
    - the test-case tag and link format (Q9);
    - the conventions the `AutomationCode` skill follows.

    It is picked by name, like the other adapters, and has a fake for tests.
  - Its exact methods are designed in feature 8's Learn phase, from two real cases: Autonomous-QE's playwright-bdd template, and its path for existing frameworks (`CodebaseOperations`). So the interface fits two cases, not one.
  - v1 ships one implementation, playwright-bdd. Until feature 8, code in features 4 to 7 that has to name the framework does it in one place, not scattered.
- **Why:**
  - The person requires generated automation to be replaceable by the language or codebase a team works in (Java, .NET, Python, Cypress and others).
  - Autonomous-QE handles other frameworks with branches in one code path, so each new tool costs a rewrite.
  - Q4 already gives the gate this for runners. Generation is the one place it was missing.
- **Gave up:**
  - Some indirection in features 7 and 8, with one implementation in v1.
  - The interface's shape stays open until feature 8. Recording the requirement now, rather than guessing the methods, was the person's choice.
- **Amended 2026-10-29:** each `Framework` declares the runners and execution targets it's compatible with (Q32).

**Q26. The app's code is a local folder or a git URL, and setup validates it** (2026-10-29, accepted 2026-10-29, New; amends Q15)
- **Decision:**
  - `qam setup` accepts each repository as either:
    - **a local folder:** if it's in git, setup records the branch and whether it's a subfolder of a bigger repo; if not, it's read from disk, with a warning that the gate has no diff for it;
    - **a git URL** (https or ssh): setup asks whether to clone it or use an existing clone. There's no default folder; the person always chooses where. An existing clone must have that URL as its `origin`.
  - Setup checks each repository, and `qam doctor` checks again:
    - git is installed and new enough for the commands QAMaster runs (the minimum version is set at Build);
    - the remote is reachable with the person's own git credentials (`git ls-remote`);
    - the branch exists locally or on `origin`;
    - the clone isn't shallow;
    - a warning if there are uncommitted changes, since the scan reads committed code.

    Each failure is blocked (exit 2) with the fix.
  - In Claude Code there's no terminal to prompt from. Claude asks in chat and passes the answers as flags; it never picks a repository or folder itself.
- **Why:**
  - Teams often start from a repository URL, not a clone. A wrong path, a missing branch or a shallow clone otherwise shows up later as an empty or wrong DSM (feature 2 found an empty scan with no error).
  - The person chose "always ask" for the clone folder.
- **Gave up:**
  - One write to the source side: the clone (Q15 amendment).
  - Setup takes a few more questions.

**Q27. Integrations: every place QAMaster plugs into is an adapter, and every install is recorded** (2026-10-29, accepted 2026-10-29, New; amends Q14 and Q20)
- **Decision:**
  - An *integration* is a place QAMaster hooks into:
    - Claude Code hooks (v1);
    - a git pre-push hook, and PR checks run by a CI system against a code host (Q28) (v1.1);
    - branch policies, later.
  - Each kind is an adapter with `install`, `remove`, `status` and `verify`.
  - Every install writes a record:
      - an ID, such as `git-hook:pre-push:shop`, `pr-check:github-actions:github:galent/shop` or `branch-policy:azure-repos:Shop/main`;
    - the kind, and the app or repo it serves;
    - the target (repo, branch or pipeline);
    - the QAMaster version and the date.
  - Records live in the app repo's `.qamaster/integrations.json`, next to its plans and verdicts (Q22). A user index, `~/.qamaster/installs.json`, lists every repo, so one command shows them all.
  - One command lists, adds and removes integrations; its name is set at Build. `qam doctor` verifies each one, an upgrade updates each one, and an uninstall removes exactly what was added.
  - A git hook chains with any hook or hook manager already there (husky, lefthook, pre-commit), never replacing it.
- **Why:**
  - The person wants QAMaster to know where it's installed, and to grow to git hooks, PRs and branches without a redesign.
  - Without a record, upgrades and removals have to guess, and a forgotten hook keeps blocking pushes.
- **Gave up:**
  - A little bookkeeping on every install.
  - The user index is per machine, so it lists only the repos installed from that machine.

**Q28. The code host is a replaceable adapter: GitHub is one of several** (2026-10-29, accepted 2026-10-29, New; amends Q4 and Q27)
- **Decision:**
  - Everything QAMaster does with a pull request goes through one interface, `CodeHost`:
    - read the PR (base and head commits, branches, changed files);
    - post and update its one plan comment;
    - set the check result on the head commit;
    - read approval comments.
  - Implementations:
    - `github` and `azure-repos` in v1.1 (the PR checks already planned);
    - `bitbucket` and `gitlab` after, as new adapters.
  - The host is detected from the repo's `origin` URL (`github.com`, `dev.azure.com`, `bitbucket.org`, `gitlab.com`). A self-hosted server, or an override, uses `QAMASTER_CODEHOST`. Each host reads only its own `QAMASTER_<HOST>_*` settings, and the token comes from the environment or the host's own CLI login, never a file (Q16).
  - The CI system that receives the PR event is a separate choice. A PR check integration (Q27) pairs a CI system with a code host, and its ID names both: `pr-check:<ci>:<host>:<repo>`.
    - CI systems in v1.1: GitHub Actions and Azure Pipelines;
    - after: Bitbucket Pipelines, GitLab CI and Jenkins.

    Installing one writes that system's pipeline file, which runs `qam check` for the PR.
  - The plan comment, verdict and approval rules are the same on every host (design.md, "same words everywhere").
- **Why:**
  - The person wants GitHub replaceable (Bitbucket, GitLab and others) without a redesign.
  - Host and CI vary independently: Bitbucket with Jenkins, or Azure Repos with Azure Pipelines. One seam for each keeps every pairing possible.
- **Gave up:**
  - Some indirection in the v1.1 PR work.
  - Features that only one host has (GitHub's check annotations, Azure's PR statuses) are used only through what all hosts share, unless an adapter adds them as extras.

**Q29. Entry points are a checklist: developers pick every tool they work in** (2026-10-29, accepted 2026-10-29, New; builds on Q27, keeps Q18 and Q20)
- **Decision:**
  - An *entry point* is a tool where developers run the gate or see its results. After the first onboarding run, `qam setup` shows the entry points as a checklist; more can be added any time with the integrations command (Q27). Each ticked one is installed and recorded as an integration.
  - The entry points, and when each can be ticked:
    | Entry point | How it reaches QAMaster | Available |
    |---|---|---|
    | Claude Code | The plugin: commands, skills, hooks | v1 |
    | Any IDE that pushes with git (VS Code, Visual Studio, PyCharm, IntelliJ, terminal) | One shared git pre-push hook gates them all. Ticking several IDEs installs it once and records each IDE against it | v1.1 |
    | PR checks | A CI system against a code host (Q28) | v1.1 |
    | AI assistants: GitHub Copilot (in VS Code, Visual Studio, JetBrains), Cursor, JetBrains AI | The QAMaster MCP server, plus instruction and prompt files exported for each tool (Q18) | v2 |
    | IDE panels with their own UI (a VS Code extension, a JetBrains plugin) | A separate extension per IDE that calls the `qam` CLI | Later, not planned |
  - Entry points not yet available show in the checklist as coming, so a team can see the plan.
  - Every entry point calls the same `qam` CLI (Q3), so plans, verdicts and rules are the same wherever a developer starts.
- **Why:**
  - The person wants teams to add several tools together, not one at a time.
  - Most IDEs need no special work: they all push through git, so one hook covers them.
- **Gave up:** nothing in v1 scope. The timing of each entry point is as already decided (Q18, Q20, Q28).

**Q30. The code can be read through the host's API, with no clone** (2026-10-29, accepted 2026-10-29, New; amends Q4)
- **Decision:**
  - Besides the local git reader, `RepoReader` has one implementation per code host that reads through its API: Bitbucket (Cloud and Data Center), GitHub, GitLab and Azure Repos.
    - The scan downloads one archive of the commit.
    - Diffs come from the host's compare endpoint.
    - Each reader uses the same login as that host's `CodeHost` adapter (Q28), never a token in a file (Q16).
  - Each API reader ships with its host's `CodeHost` adapter: GitHub and Azure Repos in v1.1, Bitbucket and GitLab after.
  - The local git reader stays the default. Setup (Q26) offers the API reader when the source is a host URL and the person doesn't want a clone.
- **Why:**
  - The person wants Bitbucket, and other hosts, readable directly.
  - It helps where no clone exists: CI runners and a central QA server.
- **Gave up:**
  - API rate limits, and a download per scanned commit.
  - Uncommitted local changes are never seen, since the API only has pushed commits.

**Q31. The plan's selection is made of switchable selectors, and the AI model can be chosen** (2026-10-29, accepted 2026-10-29, New; amends Q11)
- **Decision:**
  - Each of Q11's sources of reasons is a *selector*: `path`, `smoke`, `groups` (Claude) and `dsm` (impact and gaps). Each can be switched on or off, and they're bundled in presets:
    - `fast`: path and smoke;
    - `standard`: all four, exactly Q11, and the default;
    - `full`: every linked case.
  - Selectors are an adapter seam, so new algorithms are added as new selectors without changing the plan. Candidates for later: recent failures, flaky-test quarantine, coverage-based impact, risk scoring.
  - A setting names the Claude model the `groups` selector uses; it runs as a subagent with that model. Unset, it uses the session's model.
    - It only applies where AI runs. CI and the hook skip `groups` (Q11), and `QAMASTER_AI=off` turns it off entirely (Q24).
  - The plan names the preset, the selectors and the model it used, so every verdict is traceable. The setting names are fixed at Build.
  - v1 ships the four selectors, the three presets and the model setting.
- **Why:**
  - The person wants to choose the algorithm and the model.
  - Teams trade speed against coverage differently, and better selection algorithms will come.
- **Gave up:** a few more settings to explain. The default behaves exactly as Q11, so nothing changes unless someone opts in.

**Q32. Run offers only runners and targets that fit the framework** (2026-10-29, accepted 2026-10-29, New; amends Q25)
- **Decision:**
  - Each `Framework` (Q25) declares the runners that can run its tests, and the *execution targets* it supports:
    - local;
    - Docker;
    - a cloud grid such as BrowserStack, Sauce Labs, LambdaTest or Azure Playwright Testing.
  - Setup, the integrations checklist and `qam doctor` offer only compatible pairs, and block a mismatch (exit 2) with the compatible choices listed.
  - The execution target is part of the run's evidence, recorded in the verdict.
  - In v1:
    - playwright-bdd pairs with the playwright-bdd runner, and pytest with pytest;
    - the target is local.

    Docker and the cloud grids come later, as targets of the frameworks that support them.
- **Why:**
  - The person wants the Run step to show only options that work with the chosen framework.
  - A mismatched runner otherwise fails late, at the first gate run.
- **Gave up:** each new framework must list its runners and targets. That's a small table in its adapter.

**Q33. Claude's own ADO work goes through the az CLI first; the engine keeps its REST adapter; publish can create plans and suites** (2026-10-30, accepted 2026-10-30, New; refines Q5 and Q7)
- **Decision:**
  - **Claude's own ADO work** (looking things up, the work-items skill, checking a publish) uses the az CLI first: `az boards` for work items, queries and iterations, and `az devops invoke --api-version 7.1` for the rest.
  - **When the CLI can't do a call**, Claude uses `qam ado call`. The CLI can't when it isn't installed or isn't signed in, when a list is longer than one page, or when an update needs a revision check. `qam ado call` makes one REST call with the adapter's auth, retries and errors, and refuses writes without `--apply`.
  - **A call that had to be built** is saved as a recipe: first in the QA project's `.qamaster/ado-recipes.md`, then folded into the `ADO-API` skill's `references/recipes.md` in the next release. Recipes hold no data.
  - **The `qam` engine keeps its REST adapter** (`adapters/ado.mts`, Q5): the gate, `qam doctor` and publish. They need revision-guarded updates and page tokens, which `az boards` lacks, and the az start-up time on every call would slow the gate.
  - **The store can create the plan named like the repo, and a static suite per module** (`ensurePlan`, `ensureSuite`). Publish calls them only with `--apply`, after the preview (Q7).
- **Why:**
  - The person wants ADO work to use the az CLI first, to build an API call only when it can't, and to keep built calls for reuse and for future plugin versions.
  - The person wants publish to create and write to Test Plans.
- **Gave up:**
  - Two ways of reaching ADO: the CLI for Claude's work, REST for the engine.
  - Recipes can drift from the API. Each one records the date it last worked.

**Q34. The `file` store ships in v1, and every store sits behind a local cache** (2026-10-30, accepted 2026-10-30, New; amends Q23, refines Q6 and Q7)
- **Decision:**
  - **The source of truth is whatever `QAMASTER_STORE` names.** `ado` is the default. `file` is added to v1: a CSV in the QA project, kept in git, which is the master copy when it's chosen. Q6 already says the master is whatever the configured `TestCaseStore` holds; this makes that true for more than one store.
  - **`file` store format: CSV, one row per step**, in the column layout of ADO Test Plans' own import (ID, Title, Step action, Step expected, State, Suite, Requirement, Automated Test, Tags). Q23's open question "xlsx or csv" is settled as **CSV**: XLSX needs a zip and XML library, and `plugin/` has no runtime dependencies. XLSX can come later behind the same adapter, once a dependency is agreed.
  - **IDs and revisions in the file store:** the store assigns the next whole number, starting at 1000 so they don't look like ADO IDs in reports. Each test case carries a revision that goes up on every write, so "update refuses if the revision changed" works as in ADO.
  - **A local cache wraps any store**, in `.qamaster/cache/store.json` (git-ignored):
    - It holds the store's test cases as last read, with their revisions, the store's `where()` string and the time.
    - **The cache is never the master.** Reads (`inPlan`, `show`, `find`) may come from it, and every message that used it says how old it is.
    - **Writes always go to the store.** `update` checks the revision against the **live** store, never the cache. A stale cache can make a preview miss a conflict, but it can't make `--apply` overwrite one. The cache is updated after each write.
    - It refreshes on `publish --refresh`, on `doctor`, and when it doesn't exist. Deleting it is always safe.
    - With the `file` store the cache passes straight through, since the file is already local.
  - **The ledger records which store it belongs to.** `.qamaster/ledger.json` gets a `store` field (the store's `where()` string). Publishing to a different store than the ledger names is blocked, with the fix, so IDs from one store are never taken for IDs from another.
  - **Q7 is unchanged.** Dry run until `--apply`, idempotent, never deletes, refuses an unvalidated or unreviewed run.
- **Why:**
  - Teams without ADO, and demos with no sandbox project, can run the whole publish flow. The manual walkthrough's store stage was already marked "Local CSV for now".
  - A second `TestCaseStore` implementation proves the interface isn't shaped around ADO. The shared contract suite (`tests/contracts.mts`) holds both to the same behaviour.
  - The cache gives fast previews and offline work without a second source of truth.
- **Gave up:**
  - The `file` store has no history, permissions or concurrent editing (as Q23 said). Two people editing the CSV merge through git.
  - A preview from a stale cache can be wrong about conflicts. It says so, and `--apply` still checks live.
  - XLSX waits.
- **Not decided here:**
  - Whether the gate's `plan` reads through the cache: decide at porting step 5, with the same age display. In CI it would always refresh.
  - Moving a project from `file` to `ado` (`qam publish --to ado`): out of scope until asked. Today you'd start a new ledger.
  - Jira stores (`xray`, `zephyr`) stay after v1, as Q23 says.

**Q35. Publish can create a missing ADO project, only with `--apply`** (2026-10-30, accepted 2026-10-30, New; extends Q33, keeps Q7)
- **Decision:**
  - **When the configured project doesn't exist** (TF200016), `qam publish` doesn't block. Its preview says so first: "The ADO project 'X' doesn't exist (or this token can't see it); --apply will create it (process P, private)." ADO answers TF200016 for a project the token has no access to as well, so the messages say both; if the name turns out to be taken (TF200019), `--apply` blocks with "ask for access, or pick another name". The plan line follows, since a new project has no plan.
  - **Only `--apply` creates it**, after the person's yes to that preview (Q7). A dry run sends no write. Nothing else creates a project: doctor and the gate only report it missing (with the organization's projects, closest first).
  - **The new project is private, uses Git, and gets the organization's default process** (`GET process/processes`, the one with `isDefault`). QAMaster asks no questions about it. A team that wants another process or public visibility creates the project in Azure DevOps first.
  - **Creation is asynchronous in ADO.** `POST projects` returns an operation, which the store polls (`GET operations/{id}`) for at most two minutes. A failure or a timeout blocks (exit 2) with the reason and where to look; running publish again doesn't create the project twice.
  - **It needs the organization permission "Create new projects"** (Project Collection Administrators have it) and a token with Project and Team (Read, write, & manage). A 403 blocks with exactly that.
  - **In the code**, it is the optional `TestCaseStore.ensureProject()`, passed through the cache. Publish calls it before `ensurePlan()` (Q33). The `file` store doesn't have it.
  - **The publish flags `--leave-out`, `--skip-smoke` and `--refresh` are approved as shipped.** The person signed them off on 2026-10-30; they were in the code before any decision named them.
- **Why:**
  - The person wants no hand setup in ADO before a first publish. A missing project was the first wall new users hit.
  - A project is an organization-level write, so it gets the same preview-then-yes gate as every other publish write.
- **Gave up:**
  - No choice of process, visibility or version control from QAMaster. The defaults fit a new QA project; anything else is made in ADO.
  - A token that can create projects is broader than publishing needs. Teams that don't want that create the project by hand, and publish then never asks.

**Q36. The `file` store also reads and writes a JSON form** (2026-10-30, accepted 2026-11-02 with the amendment below; amends Q34)
- **Decision:**
  - **`testcases/testcases.json` is the `file` store's second form:** a JSON array with one record per case (the CSV's columns, steps inside) and `{"suite": "…"}` records for empty suites. IDs, revisions, signatures and hand-edit detection work as for the CSV. `shared/schema.mts` (`asFileStoreRecords`) checks it; suites and tags are trimmed and blanks dropped, as in the CSV.
  - **Which form:** the CSV, `testcases/testcases.csv`, unless it is missing and `testcases.json` is there. No setting picks it.
- **Why:** a JSON file is easier for scripts and other tools to read and write than one row per step.
- **Gave up / open:**
  - A CSV that appears later (a pull, an export) silently wins: the store's `where()` changes, so publish blocks on the ledger's store mismatch, and the JSON cases are no longer read. Whether to block when both files exist is not decided.
- **Amended 2026-11-02 (on acceptance):** when `testcases.csv` and `testcases.json` both exist, the `file` store blocks (exit 2) and names the file to remove. A CSV no longer wins silently. Built in [0.2.1](plans/0.2.1.md), item A7.

**Q37. Every `path:` tag is kept; the gate decides what a shared file selects** (2026-11-02, accepted 2026-11-02; amends Q8 and Q31)
- **Decision:**
  - **Publish keeps every derived `path:` tag**, including folders behind most of the plan (`environments/**`, `Services/**`). The tags record which code each case depends on (Q8), and nothing is removed from the store.
  - **One fix at publish:** a file in a folder shallower than `publish.pathDepth` is tagged as itself (`path:frontend/src/app/app.routing.ts`), not as its folder (`path:frontend/src/app/**`). A folder glob at that depth covers the whole app, so the old tag was wrong, not just broad.
  - **The gate's `path` selector (Q31) handles shared files.** When a changed file matches a `path:` glob that sits on more than `config/qamaster.json → gate.sharedShare` of the plan's cases (default `0.3`, a fraction), that file is *shared*. Through it, `path` selects only the cases that are also smoke or DSM-impacted. The plan names each shared file and how many cases its glob covers, for example "environment.ts is shared (208 cases); selected smoke + DSM impact".
  - The `full` preset (Q31) selects every case under a shared glob, for anyone who wants that.
- **Why:**
  - In the 0.2.0 walkthrough (Juice Shop, 243 cases), `path:frontend/src/environments/**` was on 208 cases (86%). Selecting by it would break the selection target in product.md (at most 30% of the suite). With just-in-time automation (Q39), it would also mean drafting scripts for most of the plan on a one-line change.
  - Keeping the tags means no mass tag rewrite in ADO later. The rule lives in one gate setting that can be tuned or switched off.
- **Gave up:**
  - A change to a shared file selects fewer cases by path, so the plan relies on smoke and DSM impact for it.
  - Whether a file counts as shared depends on the plan's size at check time, so it can change as cases are published.
- **Amended 2026-11-02 (while building 0.2.1 A4):** a file in a folder shallower than `pathDepth` is tagged with that folder's own files, `dir/*` (`path:frontend/src/app/*`), not as the file itself. `*` matches within one folder only, as in CheckMaster's matcher. A new file added to the same folder is still covered, and subfolders aren't. A folder at `pathDepth` or deeper keeps `dir/**`.
- **Amended 2026-11-02 (while building the 0.3.0 gate):** no file is shared in a plan of fewer than 20 test cases. In a small plan, a share says nothing: with 3 cases, 2 covering a file is ordinary coverage, and the gate's CLI test selected nothing by path until this was added.


**Q38. The runner is picked for each case, from its automation link** (2026-11-02, accepted 2026-11-02; amends Q4 and Q32, builds on Q9)
- **Decision:**
  - The gate groups the approved cases by the prefix of their automation link (`pytest:`, `bdd:`; Q9). It runs each group with the runner registered under that prefix, and merges the results into one verdict. A plan can mix runners.
  - Each runner runs in its own folder: `config/qamaster.json → runners.<name>.root`, a path relative to the QA project. When unset, the runner uses `QAMASTER_TEST_ROOT`, and failing that the repo root, as today.
  - **A runner whose tools are missing is fetched, with a yes.** Before running, each runner checks its folder: pytest needs Python, pytest and the project's environment; playwright-bdd needs `playwright`, `playwright-bdd` and the browser. When something is missing:
    1. **Use what's already on the machine.** An existing `node_modules`, uv environment or Playwright browser cache is reused, with no download.
    2. **Otherwise, ask.** `/qamaster:check` shows exactly what would be downloaded and where from: the packages in the project's own `package.json` or `uv.lock` (npm or PyPI), and the Playwright browser (Playwright's download host). It shows sizes when they're known, then waits. Only on a yes does it install, through the same install step as `qam setup`. Python packages go through uv, never pip.
    3. **Never in the background.** The push hook, CI, `--yes` and runs with no terminal never download. They block (exit 2) with the command to run.
  - **A link prefix QAMaster has no runner for** (for example `cypress:` today) can't be fetched, because a runner is plugin code. The gate blocks (exit 2), naming the cases and the ways forward: change the link, or wait for that runner.
  - Both cases are **blocked**, not **fail**. They're setup problems, like missing settings in Q13, so a developer is never told their code broke something.
  - `QAMASTER_RUNNER` no longer means "the project's only runner". It names the runner that new links are written for, and it's the default when a project has one runner. Q32's compatible pairs still apply to each runner.
- **Why:** teams have API tests in pytest and UI tests in playwright-bdd. The link already says which runner each case needs, so the person never has to choose.
- **Gave up:** a project-wide `QAMASTER_RUNNER` that's simpler to explain. A mixed plan also takes as long as its slowest runner. The first check on a new machine can stop to ask for a download.

**Q39. Automation is drafted just in time, inside the gate** (2026-11-02, accepted 2026-11-02; amends Q12 and Q22, keeps Q13, Q14 and Q19)
- **Decision:**
  - **When.** After `qam plan` picks the cases for a change, the gate's *automate* step looks at each selected case:
    - no script: draft one;
    - the script is stale, because its case changed (ledger hash) or code under its `path:` tags changed: update it;
    - otherwise: keep it.

    The `Framework` (Q25) does the drafting through the `AutomationCode` skill. Then `qam check-scripts` must pass.
  - **One approval (amends Q12).** Running `/qamaster:check` is the go-ahead to draft (Q12's gate 2). Gate 3's approval covers the cases and the scripts, which are shown together as new, updated or kept, with diffs. A person still decides before anything runs.
  - **Where scripts live (amends Q22).** The recommended home is a **separate QA repo** per app, the QA project (for example `shop-qa` on Bitbucket), with `QAMASTER_TEST_ROOT` pointing at its `<App>/` folder. The app repo isn't cluttered, and scripts are still versioned, reviewed by PR and branched. Tests inside the app repo (CheckMaster's setup) stay supported, but aren't the default. Scripts are never stored as attachments on test cases: attachments aren't versioned or runnable, and shared step code would be copied into every case.
  - **Uncommitted, hash-bound (amends Q22).** Drafted scripts stay as uncommitted changes in the test root. The approval is bound to HEAD, the QA project's commit and a hash of the drafted scripts, and any later edit voids it. QAMaster records each draft's hash in `.qamaster/`. A later check reuses its own drafts while their hashes match. "Test root has uncommitted changes → blocked" applies only to changes QAMaster didn't draft, which includes a draft the person has since edited by hand: that one has to be committed first, so QAMaster never overwrites it. QAMaster never commits or pushes. Committing and pushing are the person's.
  - **Drafts are shown until they're pushed.** Every plan lists drafts that aren't yet on the QA repo's remote, for example "3 drafted scripts not pushed: their links stay unpublished". A draft whose run failed stays for the person to fix. The plan prints the exact `git restore` / `git clean` command that discards only those files, for the person to run. QAMaster never deletes them itself.
  - **Links only for pushed scripts (amends Q9's publish step).** Publish writes an automation link (Q9) only for a script that's on the QA repo's remote branch (`git branch -r --contains`). A link in the store then always points at code a teammate can pull.
  - **New scripts (keeps Q13).** A script with no recorded pass that fails makes the verdict **fail**. The failure is labelled "new script failed: check the script or the app". A script's first pass is recorded in the ledger.
  - **Hooks stay fast (keeps Q14 and Q19).** The push hook never drafts scripts. Without an approved, passing verdict for HEAD it blocks with "run `/qamaster:check`". Drafting happens there, in the session, and is timed apart from the plan's 30-second target.
  - Onboarding stages 10–13 (tech.md) become optional, for a team that wants every case automated up front.
- **Why:**
  - Scripts get written only where code changes, so 243 published cases don't need 243 scripts before the first push.
  - The tester's generated cases can be run on the first change.
- **Gave up:**
  - `/qamaster:check` takes minutes when scripts need drafting.
  - A failure in a new script may be the script's fault. The label says so, but the push is still blocked until the script is fixed or the case is removed from the plan.
  - Scripts drafted by a check come from the reviewed case and its facts (DSM, AUT skills, code), not from sprint requirements, until Requirements (feature 6) is built.
  - A case's automation link reaches the store only after its script is committed, pushed and published again.
  - Storing Gherkin in the tracker itself (Jira with Xray) is left for a Jira store (Q23), after v1.
- **Amended 2026-11-02 (while building the 0.3.0 automate step):** a selected case can stay manual. `qam automate --done` records the scripts that were drafted. A case still without a scenario stays under **Not run (manual)**, visible in the plan, instead of blocking. Some cases (a pre-registered account, a CAPTCHA) are reasonably left manual for a while.

**Q40. Each test case links to its script in the QA repo, pinned to a commit** (2026-11-02, accepted 2026-11-02; builds on Q9 and Q39)
- **Decision:**
  - When publish writes an automation link (Q9), it also writes a **Script** line in the test case's description, next to the **Sources** heading, with the script's web address at the commit that was published. For example: `Script: https://bitbucket.org/acme/shop-qa/src/<sha>/Shop/features/checkout/coupon.feature`.
  - The address is built from the QA repo's `origin` remote, for Bitbucket, GitHub and Azure Repos. For any other host it writes the repo-relative path and the commit, without a link.
  - The line belongs to QAMaster, like the Sources list. It's rewritten when the script's commit changes, and removed when the link is removed. Nothing else in the description is touched.
  - It's part of the publish preview, as "script link added" or "script link updated", and is written only on `--apply` (Q7).
- **Why:** QA can open the exact script from the test case in ADO without the code being stored there (Q39).
- **Gave up:**
  - Every new script commit updates the test case's description, so ADO's history records the change.
  - A link to a private repo opens only for people with access to it.

**Q41. A runner's setup problem blocks, and a runner never downloads without a yes** (2026-11-02, accepted 2026-11-02; amends Q13 and Q38)
- **Decision:**
  - **Blocked, not fail.** A runner that can't start its tests because of the machine's setup throws `BlockedError` (exit 2) with the command that fixes it, and the gate writes no verdict. That covers:
    - a missing browser ("Executable doesn't exist");
    - missing system libraries ("error while loading shared libraries");
    - the app unreachable at its base URL (`ERR_CONNECTION_REFUSED`).

    A setup problem is never reported as a test failure, and never as "new script failed".
  - **No silent downloads.** The pytest runner runs `uv run --no-sync` with `UV_PYTHON_DOWNLOADS=never`. A missing project environment blocks with "run uv sync (downloads Python and the test dependencies)". `/qamaster:check` offers to run it, and does only after the person's yes. The hook and CI never download (Q38).
- **Why:** the clean Docker run (F2, F5). On a new machine every case "failed" for want of a browser, and `qam plan` fetched about 240 MB unasked. A developer would read both as problems with their code.
- **Gave up:** a first `qam plan` that just works on a machine missing its test environment. The person runs one install command first.

**Q42. The gate keeps its local files out of the app repo's commits** (2026-11-02, accepted 2026-11-02; amends Q15)
- **Decision:**
  - When the gate first writes to an app repo, it adds `.qamaster/plans/`, `.qamaster/verdicts/`, `.qamaster/evidence/`, `.qamaster/drafts.json` and `.env` to that clone's `.git/info/exclude`. The file is local to the clone, git never commits or shares it, and existing lines are kept.
  - `.qamaster/integrations.json` isn't excluded: teams commit it (Q27).
  - This is the one write QAMaster makes inside the app repo's `.git`. Q15's read-only rule otherwise stands: no commits, no branches, no tracked files.
- **Why:** the clean Docker run (F7). With a separate QA project, plans, verdicts, screenshots, videos and the developer's `.env` sat untracked in the app repo, and `git add -A` would have committed them.
- **Gave up:** strict read-only toward the app repo. The alternative, a warning that asks the developer to edit `.gitignore` by hand, was rejected as easy to miss.

**Q43. Ticking a tool writes its own files, hooks included, and keeps them out of commits** (2026-11-03, accepted 2026-11-03; amends Q18 and Q29, extends Q42)
- **Decision:**
  - Ticking an entry point (Q29), in `qam setup` or `qam integrations add <tool>`, writes that tool's files in the developer's working copy of the app repo, so QAMaster works the same way in every IDE and agent.
  - Each tool gets what it supports, nothing more:
    - **its rules or steering file**, telling the agent how to call `qam` (plan, check, status) and to wait for approval;
    - **a hook, where the tool has one**, that runs the same push check as the Claude Code hook before the agent's `git push`. This amends Q18, which ported no hooks;
    - **its MCP registration**, once `qam mcp-serve` exists (still v2, Q18).
  - The files QAMaster writes are its own (`qamaster.md`, `qamaster.mdc`, `qamaster.json`), never a file the team already has. A shared file such as `AGENTS.md` or `GEMINI.md` is written only when it doesn't exist. When it exists, QAMaster leaves it alone and says what to add.
  - **How each file is kept out of commits depends on where it lives and on the code source (Q26):**
    - In a git working copy, every file QAMaster creates is listed in `.git/info/exclude`, as in Q42. These files hold machine paths and per-developer choices, so each developer ticks their own tools.
    - A file in a place git or the tool already keeps private (`.git/hooks/`, Visual Studio's `.vs/`) needs no line.
    - A plain folder with no git has nothing to exclude through: QAMaster lists the files it wrote and says so.
    - With a host URL and no clone (Q30), QAMaster asks which working copy the IDE opens, and writes there.
    - `.gitignore` is never edited: it's a tracked file (Q15).
  - Each tool's files are recorded with its integration (Q27), so `qam doctor` checks them and `qam integrations remove` deletes them, exclude lines included.
  - Paths come from each tool's docs at build time. As of 2026-11-03:
    | Tool | Rules or steering | Hook | MCP (v2) |
    |---|---|---|---|
    | Kiro | `.kiro/steering/qamaster.md` | `.kiro/hooks/qamaster.json` (the trigger before a shell command is to be confirmed) | `.kiro/settings/mcp.json` |
    | Cursor | `.cursor/rules/qamaster.mdc` | `.cursor/hooks.json`, `beforeShellExecution` | `.cursor/mcp.json` |
    | GitHub Copilot in VS Code | `.github/instructions/qamaster.instructions.md` | `.github/hooks/qamaster.json` (preview) | `.vscode/mcp.json` |
    | Visual Studio (Copilot) | the same instructions file | none: the git pre-push hook | `.vs/mcp.json` (to confirm) |
    | JetBrains AI Assistant, Junie | `.aiassistant/rules/qamaster.md`; `.junie/guidelines.md` when absent | none: the git pre-push hook | set in the IDE's settings |
    | Gemini CLI | `GEMINI.md` when absent | `.gemini/settings.json` (experimental) | the same file |
    | Codex CLI | `AGENTS.md` when absent | `.codex/hooks.json` (needs a trusted project) | `.codex/config.toml` |
    | Any terminal or IDE | none | `.git/hooks/pre-push` | none |
- **Timing:** v1.1, with the git pre-push hook, instead of v2 (amends Q29). The MCP registration still waits for `qam mcp-serve` in v2.
- **Why:** the person wants teams to work in any IDE and have QAMaster set up for that IDE by ticking a box, with nothing new landing in a commit.
- **Gave up:**
  - One set of files the whole team shares: each developer ticks their own tools.
  - Stability. Several of these hook formats are in preview or experimental, so each one is checked against the tool's docs when it's built, and `qam doctor` checks it works.

**Q44. Local first: with nothing chosen, the code is a local folder and the store is the local file** (2026-11-03, accepted 2026-11-03; amends Q23 and Q34)
- **Decision:**
  - With no `QAMASTER_STORE`, the store is the one the QA project's ledger already names (a project that published to Azure DevOps stays there), else the local `file` store (`testcases/testcases.csv`, or `.json`).
  - `QAMASTER_STORE` always wins. Azure DevOps is chosen with `QAMASTER_STORE=ado` and its settings.
  - Setup and the setup page offer a local folder first for the code, and the file store first for test cases. The remote choices (GitHub, Azure Repos, Bitbucket, GitLab; Azure DevOps Test Plans) follow.
- **Why:** the person wants local things as the default. A first run then needs no account, token or network, and a team adds Azure DevOps when it's ready.
- **Gave up:** a new project that publishes straight to Azure DevOps with only the ADO settings in `.env`: it now also needs `QAMASTER_STORE=ado`. `qam doctor` passes on the file store, so nothing points out the missing line; the publish preview names the store it will write to.

**Q45. `plugin/` ships no `bin/`, and is ready to zip at any time** (2026-11-03, accepted 2026-11-03; amends Q2)
- **Decision:**
  - The `qam` wrappers move from `plugin/bin/` to the repo root's `bin/`, for development only. The plugin is reached through its commands, hooks and skills, which call `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts"`. In a terminal, use `qam setup`'s launcher, `.qamaster/bin/qam.mjs`.
  - `plugin/` holds only what ships. `tests/plugin-ship.test.mts` fails on a top-level `bin/`, on `node_modules/`, `.env*`, `.DS_Store`, logs, a `.qamaster/` folder, or any git-ignored file inside it. `scripts/package.sh` refuses to zip a plugin with `bin/`. A skill, agent or command description has no XML-like tags (`<App>`): the upload refuses them too.
- **Why:** Claude desktop's "Upload a plugin" refused the 0.3.2 zip: "claude.ai-hosted plugins may not ship bin/ executables", because they go on the PATH without appearing on the admin approval screen. `claude plugin validate` doesn't run that check. The person wants the plugin code clean and ready to zip at all times.
- **Gave up:** `qam` on the PATH after a CLI plugin install.

**Q46. Version numbers are MAJOR.MINOR.PATCH, and 1.0.0 is product v1 complete** (2026-11-03, accepted 2026-11-03; New)
- **Decision:**
  - **1.0.0 is the major release:** all of product v1's scope, a clean-room Docker run, and a walkthrough on a second unknown app.
  - **A release that adds a feature raises the minor** (0.4.0) and resets the patch. **A release of fixes only raises the patch** (0.3.3) and adds no command, flag, config key, file format or behaviour a user must learn.
  - After 1.0.0 the same: 1.1.0 for features, 1.0.1 for fixes. A breaking change (command, flag, exit code, config key, tag or link format, manifest field) is a major release then; before 1.0.0 it's a minor release, named in the notes.
  - Releases up to 0.3.2 keep their numbers. Each release has `docs/plans/<version>.md`, and open items are kept in `docs/plans/backlog.md`.
- **Why:** 0.3.1 and 0.3.2 each mixed fixes and features, so the number didn't say what changed. The person wants a feature release and a fix release to look different, and 1.0.0 to mean something.
- **Gave up:** a single counter that rises with every release.

**Q47. With no code folder given, setup asks where, with three suggestions** (2026-11-04, accepted 2026-11-04; amends Q26)
- **Decision:**
  - When `qam setup` has no `--source`, `--clone-to` or `--use-clone`, it asks where the app's code is (or where to clone it), and offers three choices: **this folder** (where setup was run), **the usual folder** (the one chosen most often in past setups on this machine), and **a path you type**.
  - Past choices are counted in `~/.qamaster/`, next to the install index (Q27), as folder paths only. With no history the usual folder isn't offered.
  - Claude asks in a session; a terminal shows the same three choices. A script or CI call with no folder still stops and names the flag to add (exit 2, as today). A folder is never chosen without being shown.
- **Why:** the person wants setup to ask for a location, with the likely answers one keypress away, instead of failing and asking for a flag.
- **Gave up:** a fully silent setup. It always asks when no folder is given.

**Q48. A route found only in server code is an API route, not a screen** (2026-11-04, accepted 2026-11-04; amends Q11's DSM use)
- **Decision:**
  - A route the code scan finds only on the server (an HTTP verb, with no UI page and no link to it) is recorded as `kind: api`.
  - It stays in the code model, so impact analysis and the API channel (0.7.0) can use it. It isn't a screen: it gets no DSM cell, no orphan or code-only flag, and TestGen writes no UI case for it.
- **Why:** on AgentMesh (FastAPI plus Streamlit), 27 of 38 "pages" were API endpoints. TestGen wrote them as UI cases, and the validator then flagged the HTTP verbs as invented UI.
- **Gave up:** API endpoints in the screen matrix. They come back as API cases with the API channel.

**Q50. Test cases are stored locally first; publish chooses its destinations** (2026-11-04, proposed; would amend the store stage's place in the pipeline)
- **Decision (proposed):**
  - The pipeline order becomes: generate and review test cases, store them locally (the file store), then publish.
  - Publish asks which integration(s) to publish to. Several destinations at once are allowed.
  - A destination already set up (an ADO plan, say) publishes after one approval. A new one first asks for its connection details and checks access before anything else is shown.
  - When every check passes, publish asks for a final apply, and that ends it.
- **Why:** on dummy-static-website (W9) the store was chosen at setup, before any test case existed, the ADO details were set by hand in `.env`, and only one destination was possible.
- **Gave up (if accepted):** choosing the store at setup. Built in 0.6.0.

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
