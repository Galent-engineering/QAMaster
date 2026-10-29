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
- **Main demo app:** `../cypress-realworld-app` ([cypress-io/cypress-realworld-app](https://github.com/cypress-io/cypress-realworld-app), MIT, cloned at `0729f68` on 2026-10-29). `autonomousQeDemo` is a single static page, too small to exercise the DSM. The Real World App is a mid-sized payments app built for test practice:
  - about 10 screens: sign in, sign up, the home feed with tabs, new transaction, transaction detail, bank accounts, notifications and user settings;
  - forms with validation, sign-in, create and delete flows, and an Express REST API on port 3001;
  - React Router routes, including a parameter route (`/transaction/:transactionId`) and pattern routes (`/(public|contacts|personal)?`, `/bankaccounts*`);
  - seeded local data, recreated on every start, and its own Cypress tests to compare with ours.

  Run it with the `realworld-app` entry in `.claude/launch.json` (`yarn dev` through corepack; front end on port 3000). Every feature builds its fixtures by running AQE on it first.

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
| 4 | **Setup and pipeline** | `setup/setup` 187, `pipeline/pipeline` 469, `shared/project` 101 | `src/pipeline/`, `src/cli/setup.mts`; repository input and validation (Q26); the integration seam and its record (Q27), with the entry-point checklist (Q29) | `qam setup`, `qam pipeline …`, `qam doctor` (settings, repositories, integrations) | — (onboard and status are commands: step 9) | 1–3 (DSM stage) |
| 5 | **Application knowledge** | `aut-skill/build_aut_skills` 571 | `src/knowledge/` | `qam aut-skills` | `AUT-Skill-Builder` | 1 |
| — | *Step 4: ADO adapter* | CheckMaster `adapters/ado.py` | `adapters/ado.mts` | `qam doctor` (ADO part), `qam req\|tc …` | — | step 2 |
| 6 | **Requirements** | `requirements/requirements` 252 | `src/requirements/` through `RequirementSource` | `qam requirements fetch` | — | 4, step 4 |
| 7 | **TestGen** | `testgen/testgen` 764 | `src/testgen/` | `qam testgen context\|validate\|render` | `TestGen`, `Domain_Test_Design_Skill` and its 39 sub-skills | 1, 5, 6 |
| 8 | **Automation** | `e2e-automation/scaffold` 274, `check_scripts` 157, `shared/bdd-quality` 83, `shared/aut-app` 69, `framework/TestAutomation` with `scripts/locator-sync` | `src/automation/` behind the `Framework` adapter (Q25; its methods are designed in this feature's Learn phase), `plugin/framework/` | `qam app create`, `qam check-scripts` | `AutomationCode` (playwright-bdd parts only), `UI-Locator-Sync` | 7 |
| 9 | **Reports** | `reports/build_report`, `build_all`, `compose_summary`, `dsm_to_report`, `testgen_to_report`, `playwright_to_report`, `types/*` (six report types) | `src/reports/`, `plugin/reports/templates/` | `qam report all\|manual\|<type>` | `QE-Reports` and its six report skills | 1, 7, 8 |

Not in step 3:
- **`qam review`** records who reviewed a run (Q12). It's new, so it comes with publish (step 7).
- **Hooks and commands** belong to step 9, along with the Q14 hook rules.
- **AQE's `aqe run`** (`runner/runner.mts`) overlaps with the gate's `Runner`. The playwright-bdd runner is step 6.
- **Pipeline stage 3, context sources**, becomes a v2 stage. In v1 the pipeline skips it.

## Status

| # | Feature | Learn | Build | Test | Move | Commit |
|---|---|---|---|---|---|---|
| 1 | DSM build and render | ✓ 2026-10-29 | ✓ | ✓ 5 golden fixtures | ✓ | ✓ |
| 2 | Repo scan | ✓ 2026-10-29 | ✓ | ✓ 2 golden fixtures, fixes 1–5 | ✓ | ✓ fixes 1–4 |
| 3 | UI crawl and DSM refresh | ✓ 2026-10-29 | ✓ | ✓ real crawl of app.mjs: 0 writes | ✓ skill, agent, `/qamaster:dsm` | ✓ build |
| 4 | Setup and pipeline | ✓ 2026-10-29, 10 AQE problems reproduced | ✓ | ✓ 2 golden fixtures, fixes 1–10 | ✓ no skills (onboard and status are step 9) | ✓ `feature/4_setup-and-pipeline` |
| 5 | Application knowledge | in progress | | | | |
| — | Step 4: ADO adapter | | | | | |
| 6 | Requirements | | | | | |
| 7 | TestGen | | | | | |
| 8 | Automation | | | | | |
| 9 | Reports | | | | | |

## Learnings

One section per feature, filled in during its Learn phase: inputs, outputs, side effects, surprises, which version won, what was left out and why.

The concepts behind each feature are explained for people in [learning.md](learning.md).

### 1. DSM build and render (Learn done 2026-10-29)

**Version:** `build_dsm.mts`, `render_html.mts`, `pyport.mts` and `dsm_template.html` are identical in 0.1.5 and 0.2.0. Nothing to choose.

**What it does:** `build(ui, code, config, previous?, change?)` is a pure function apart from `generated_at`. Its steps:
1. Merge pages from the crawl (`ui-model.json`) and routes from the code scan (`code-model.json`) into page nodes, keyed by `matchKey`: the part after `#`, no query, lower case, no trailing `/`.
2. Attach source files to pages through `files[*].owners`.
3. Add page relations from crawl edges (not element-level ones) and code edges. A `(shared)` node stands for layout code. Targets nobody visited become `ui-target` or `code-ref` nodes.
4. Order the pages: Tarjan's strongly connected components, then the components in topological order, with ties broken by (start page, crawl depth, module, label).
5. Work out fan-in, fan-out, cycles and the flags: `orphan`, `dead-end`, `code-only`, `ui-only`, `unresolved`, `broken`, `redirect`.
6. Build the element-level matrix: each page followed by its visible elements, forms, fields and dialogs, with contains, navigates, submits, opens and redirect relations, capped at `matrix.max_element_nodes` (`truncated` is then true).
7. Add stats (`density` rounded to 4 places) and the diff against the previous DSM: nodes and relations added, removed and changed.

`render(dsm, out)` puts the DSM JSON into `dsm_template.html` (escaping `</`), sets the title to "<project> UI DSM", and writes the file atomically (a `.tmp` file, then a rename).

**Callers:** `dsm_update` (feature 3) and `testcases` (v2). `impactedRoutes`, which the gate needs, lives in `dsm_update`, so it moves with feature 3, not here.

**Python behaviour it really relies on**, to write natively, without `pyport`:
- Truthiness: `[]`, `{}`, `''`, `0` and `null` are false (`truthy`, `or`).
- Sorting: stable, comparing arrays element by element and strings by code point (`sorted`, `pyCmp`), not `localeCompare`. It decides the matrix order.
- `round(x, 4)` for density, and `rstrip('/')` / `strip('/')`.
- Floats: Python wrote `0.0`. In parsed JSON it's `0`, so it doesn't matter.

**Fixtures** (`tests/fixtures/dsm/`), each built with AQE's own `build` / `render`:

| Case | From | What it covers |
|---|---|---|
| `demo/` | autonomousQeDemo, real | 1 page, 9 elements, no code routes |
| `rwa/` | Real World App, real crawl and scan | 16 pages, 40 relations, 115 elements, a cycle, every flag except `redirect` |
| `shop/` | Hand-made | Branches the real apps missed: redirect, HTTP 500 page, hash route, `opens` dialog edge, form `submits`, `(shared)` code edges, unresolved targets, element truncation (`max_element_nodes: 14`), a diff against a previous crawl, and the rendered HTML |

**Found on the way (not feature 1, but recorded for later features):**
- **Feature 2, repo scan:** on the Real World App it found 6 of about 12 routes. It misses routes declared through a custom component (`<PrivateRoute path=…>`), turns `/(public)?` into `/(public)`, treats `/manifest.json` as a screen, and links **none** of 126 files to a screen (all `shared`). `path:` tags (Q8) would be empty for this app. This is the risk the README names, now confirmed.
- **Feature 3, crawl safety (Q15), must fix:**
  - The write guard only covers the app's own host. The API on another port (3001) wasn't guarded until it was added to `allowed_hosts`.
  - The guard is switched off while the crawler signs in again (`crawl_ui.mjs` lines 547–549).
  - Sign-in detection mistook `/user/settings` for a login page. The crawler typed the username into First name and submitted it, and dismiss clicks marked notifications as read.

  The demo's data was restored with `git checkout` both times.
- **Feature 3, crawl coverage:** the crawler never reached `/transaction/:id`, and lost the session on two screens.

**Left out (not MVP):** nothing. Feature 1 is all MVP.

**Built (2026-10-29):** `plugin/src/dsm/build.mts`, `render.mts`, `template.html` (AQE's, unchanged), `plugin/src/cli/dsm.mts`; crawl and scan types in `shared/models.mts`. `qam dsm build` and `qam dsm render` read `config/dsm-config.json` in the QA project (or `--config`) and write to its `output_dir`.

**Tested:** `tests/dsm.test.mts`. The build gives AQE's `dsm.json` as parsed data on all five fixtures (demo, Real World App, shop, shop truncated, shop diffed against an earlier crawl), and render gives AQE's page around the same data. On a copy of autonomousQeDemo, `qam dsm build` matches AQE's own `dsm.json` apart from the time, the diff and `change` (AQE's refresh fills `change`; that is feature 3).

**Intended differences from AQE:**
- No `pyport`. Python's rules are written natively where they change the result: `compare`/`sortBy` (element-by-element tuples), `round4` (ties to even) and `||` for Python's `or` on strings. Strings sort by UTF-16 unit, not code point; they differ only for characters above U+FFFF against U+E000–U+FFFF.
- `dsm.json` is written by `JSON.stringify` with indent 1: non-ASCII text as UTF-8 rather than `\uXXXX`, and `0` rather than `0.0`. The parsed data is the same.
- Render escapes every `<` in the data as `\u003c`, not only `</`, so no screen text can open or close a script tag.
- `qam dsm build` blocks when there is neither a crawl nor a scan; AQE built an empty matrix.
- An element-level redirect edge uses the screen part of `from`; AQE raised a KeyError if `from` held an element key.
- `build` takes `now`, so tests pin the clock instead of ignoring `generated_at`.

### 2. Repo scan (Learn done 2026-10-29)

**Version:** `scan_repo.mts` is identical in 0.1.5 and 0.2.0 (680 lines). Nothing to choose.

**What it does:** `scan(config)` reads each repository in `config.repositories` and writes `code-model.json`, which the DSM build (feature 1) reads. There's no AI and no network. Per repository:
1. **Read the files** at `origin/<branch>`, then `<branch>`, then `HEAD`, using `git ls-tree` and one `git cat-file --batch`. If the path isn't a git repo, it reads the working tree instead. Only source extensions count (`TEXT_EXT`), files over 1.5 MB are skipped, and `include`/`exclude` rules filter the paths.
2. **Find routes**, by regular expression, for:
   - router objects (Angular, Vue, React data routers), with nesting, `redirectTo` and lazy modules;
   - JSX `<Route>` elements;
   - Next.js `pages/` and `app/`;
   - ASP.NET MVC controllers and actions, Razor Pages and WebForms `.aspx`;
   - Spring `@Controller`, Django `urls.py` and Flask decorators;
   - standalone HTML pages.

   Parameters such as `{id}`, `[slug]`, `<int:pk>` and `:x` all become `:id`. `route_normalization` rules from the config apply last.
3. **Work out owners** (which routes each file serves), with a confidence for each:
   - `direct`: the file declares the route's component, is its template or MVC view, or is a sibling or code-behind of such a file;
   - `module`: the file is inside a lazy-loaded module's folder;
   - `inferred`: the file is in the same folder as owned files, if that folder has 25 routes or fewer (replaced by `imported` in fix 5);
   - `shared`: none of the above.
4. **Find navigation references** in each file (`routerLink`, `navigate`, `<Link to>`, `href`, form `action`, `location =`, redirects, MVC `RedirectToAction`, `ActionLink` and `asp-*` tags). Each one becomes an edge from every route the file owns, or from `(shared)` if it owns none. Relative targets are resolved against the owning route.
5. **List UI elements** per template file (forms, controls, buttons, click handlers). These become `code_elements` in the DSM.
6. **Remove duplicate edges** (same from, to, kind, file and line) and self-edges.

**Reads, writes, calls:**
- It reads the repos through `git` only and never writes to them.
- `fetch: true` in the config is never used: the scan reads whatever `origin/<branch>` already is.
- It writes `code-model.json` and exits 1 if any repo path was missing.

**Python behaviour it relies on:**
- Every pattern is in Python `re` syntax, translated at run time by `pyRe` (Unicode `\w`, Python's `^`/`$`, `(?P<name>)`).
- `os.walk` order and `sorted`.

Most of this disappears in a native port: the patterns can be written once as JavaScript regexes. The cases where JavaScript would match differently (Unicode `\w`, `$` before a final newline) are covered by the fixtures.

**Fixtures** (`tests/fixtures/scan/`). AQE's output was produced on a git copy of each repo (branch `main`, commit date fixed at 2026-10-29T00:00:00Z, so the commit hash can be reproduced), with `path` written as `<repo>`:

| Case | From | What it covers |
|---|---|---|
| `rwa/` | 17 Real World App files (routing, forms, links) plus its MIT licence | The same 6 routes and 14 edges as scanning the whole app: the subset is representative |
| `polyglot/` | Hand-made, 31 files | One tiny app per supported framework: Angular (children, lazy module, `templateUrl`, `[routerLink]` arrays, `redirectTo`, `**`), React Router v6 (nested, `index`, `element=`), Vue, Next.js `pages/` and `app/` (route group), MVC (attribute routes, `[controller]`/`[action]`, views, `ApiController`, `RedirectToAction`, `ActionLink`, `asp-*`), Razor Pages with code-behind, WebForms with code-behind, Spring, Django, Flask, static HTML (relative, `../`, `#`, `mailto:`, external and asset links), and excluded `dist/` and `*.spec.ts` files |

**Problems found.** Each was reproduced on a fixture. Numbers 1 to 4 decide whether `path:` tags work at all (Q8).
1. **A folder inside a bigger repo scans nothing, and says nothing.**
   - Cause: `git ls-tree` lists paths relative to the folder, but `git cat-file <ref>:<path>` reads them from the repo root.
   - Effect: every read misses. The result is `files_scanned: 0`, no routes and no error. Any monorepo, or an app in a `web/` folder, gets an empty scan.
2. **Real World App: no file owns a screen.** There are three causes:
   - React Router v5 puts the screen as a child (`<Route path="/signup"><SignUpForm/></Route>`), but only `element=`/`component=` are read. So these routes have no component, and nothing links them to a file.
   - Custom route components (`<PrivateRoute path=…>`, Okta's `<SecureRoute>`) aren't routes to the scan. 6 of about 12 routes are missed.
   - Path patterns aren't expanded: `/(public)?` becomes `/(public)`, `/(public|contacts|personal)?` is dropped, and `/bankaccounts*` is dropped.

   In this app every private route wraps exactly one screen component, so "the first component inside the route" would link every screen to its file.
3. **`element={<X />}` breaks nesting.**
   - Cause: the `<Route …>` regex stops at the first `>`, which is the one inside `<X />`. The route looks self-closing, so it's never pushed as a parent.
   - Effect, in polyglot: `/projects/:projectId` comes out as `/:id`, and `/` (Layout) and `/` (index) are both reported. Any React Router v6 app with nested routes gets wrong paths.
4. **Routes from file paths assume the app is at the repo root.**
   - Next.js, static HTML and WebForms routes keep the folder they sit in: `/next/pages/blog/:id`, `/public/about.html`, `/webforms/Default.aspx`.
   - The fix is the same as for problem 1: treat the configured folder as the root.
5. **Ownership is coarse:**
   - **By folder:** a file inherits every route in its folder (25 or fewer), so MVC's `ApiDataController.cs` "owns" all four Account and Reports screens.
   - **By file:** a file's navigation counts as coming from every route it owns. The `RedirectToAction` in `Logout` becomes an edge from `/Account` and `/Account/Profile/:id` too.
6. **Small misses:**
   - Vue's `redirect:` isn't read (only Angular's `redirectTo`).
   - Vue single-file components are never linked to a route (no class, function or const name).
   - Flask's `redirect('/x')` is counted twice, as `navigate` and as `redirect`.
   - `Html.ActionLink("Profile", …)` points to `/Account/Profile`, not the real `/Account/Profile/:id`.
7. **It reads committed code only.** Uncommitted and unpushed edits aren't scanned when `origin/<branch>` exists. That's fine for the gate (it runs on commits), but it surprises a developer running `qam dsm scan` locally.
8. **Speed:** the sibling search compares every file with every other file. That takes 0.2 s for 1,000 files, 0.35 s for 2,000 and 0.85 s for 4,000, so about 5 s for 10,000. Fine for v1; note it for very large repos.

**Port plan for Build** (proposed; the person decides):
- Split it like feature 1:
  - a pure `scan(files, repo, rules)` over a list of `{ path, text }`, tested against the golden fixtures with no git;
  - the git reading in `adapters/git.mts` behind `RepoReader.listTree` and `readFile`. That adapter fixes problem 1 by reading paths relative to the configured folder.
- First match AQE exactly (golden). Then fix problems 1 to 4 one at a time. Each fix gets its own test, and each changed golden line is listed here as an intended difference.
- Leave 5, 6 and 8 for later, and list them in the Roadmap. Import-graph ownership (a screen owns the files its component imports) is the real answer to problem 5, and it's a v2 feature.

**Left out (not MVP):** none of the scan. The scan itself never fetches; the refresh (feature 3) does, which Q15 allows.

**Built (2026-10-29):** `plugin/src/dsm/scan.mts` (pure: files in, code model out), `plugin/src/adapters/git.mts` (`readRepo`: one `ls-tree -z`, one `cat-file --batch`, or the folder on disk outside git), and `qam dsm scan [--config] [--out]` in `plugin/src/cli/dsm.mts`. `readRepo` is not yet the full `RepoReader`: `diff`, `head` and `readFile` come with the gate (step 5).

**Tested:** `tests/scan.test.mts`, 11 tests.
- The port first matched AQE exactly on both fixtures. AQE's output stays as `code-model.aqe.json`; `code-model.expected.json` is QAMaster's reviewed output after the fixes. Two tests pin every route where the two differ.
- Through real git: the committed polyglot repo gives the golden output, including the commit hash. Uncommitted files are ignored.
- On the whole Real World App: 12 screens found (AQE: 6), 10 files linked directly to their screen (AQE: 0). In the DSM, 10 of 16 screens now have files (AQE: 0), and `ui-only` drops from 6 to 1.

**Fixes (intended differences from AQE):**
1. **Subfolder repos.** Files are listed and read relative to the configured folder (`<ref>:./<path>`). A web app inside a monorepo now scans its 31 files instead of 0.
2. **React Router v5 and custom routes.**
   - Any tag ending in `Route` with a `path` counts (`<PrivateRoute>`, `<SecureRoute>`).
   - A route without `element=`/`component=` takes the first component inside it as its screen.
   - Path patterns are expanded: `/(a|b)?` gives `/`, `/a` and `/b`; `/x*` gives `/x`.
3. **Nesting.** An attribute value in `{…}` is skipped whole, so `element={<X />}` no longer ends the tag. `/projects/:projectId` is now `/projects/:id`, not `/:id`.
4. **Page-file routes.** Covered by fix 1: configure the app's own folder (`site/next`) and Next.js pages give `/`, `/blog/:id` and `/pricing`.

**Other differences:**
- `ls-tree -z`, so unusual file names aren't quoted.
- A relative repository `path` is relative to the QA project, not the shell's folder.
- Outside git, files are read in path order (AQE used directory-listing order).
- A missing repository path exits 2 (blocked) with the fix to make; AQE exited 1.
- Patterns are JavaScript regexes. `\w` and `\b` are ASCII, where Python's were Unicode.

**Fix 5 (the person chose import ownership):** the folder rule (`inferred`) is gone.
- **How it works:** a file now owns the screens whose files import it, following relative imports (`import … from './x'`, `require('./x')`, `import('./x')`, re-exports) all the way down. The confidence is `imported`. A file no screen reaches is `shared`.
- **It exposed an older gap, now fixed too.** Screens were linked by the component's *declared* name. The Real World App's `/transaction/:id` imports `TransactionDetailContainer` from a file that declares `TransactionDetailsContainer`, so it was never linked; the folder rule had hidden this with a wrong guess. A route's component is now found through the router file's own imports first, then by declared name.
- **On the whole Real World App:**
  - all 11 app screens have their own file (`/implicit/callback` is Okta's library component);
  - 55 files are `imported` and 60 `shared`, and none get a screen from their folder;
  - `BankAccountForm.tsx` → `/bankaccounts` and `CommentForm.tsx` → `/transaction/:id` (before: `/`, `/contacts`, `/signin`…).
- **In the polyglot repo:** only the three wrong folder guesses changed. `ApiDataController.cs`, Next's `_app.tsx` and the React router file became `shared`.

**What fix 5 leaves:**
- **A trade-off it creates:** core files used by many screens own them all. On the Real World App, `authMachine.ts` owns 6 screens and 11 files own 10. These are real dependencies, but their `path:` tags are broad, so a change there selects many tests. The gate (step 5) decides whether a file owning most screens counts as shared.
- **Layout is shared, by design:** the router file renders the layout (`MainLayout`, `NavBar`), not a screen, so it stays `shared`, as AQE's `(shared)` intended. How the gate treats a change to a shared file is a step 5 question (Q8, "Not linked to code").
- **Limits, independent of fix 5:**
  - import aliases (`@/components/x`, tsconfig `paths`) and package imports aren't followed;
  - C#, Java and Python files get no import following, so outside a direct link they are `shared`.

  Both are on the Roadmap.

### 3. UI crawl and DSM refresh (Learn done 2026-10-29)

**Versions:**
- `dsm_update.mts` (465 lines) is the same in 0.1.5 and 0.2.0.
- `crawl_ui.mjs` differs. 0.2.0 adds three things:
  - **stable test attributes** on every element (`data-testid`, `data-cy`, `aria-label`, …), which locator sync can use (feature 8);
  - **`api_calls`**: each XHR/fetch the UI makes, with method, path, statuses, pages and response keys (never values). QAMaster's `UiModel` already has this field;
  - **an encrypted vault** for the sign-in details, and encryption of the saved session.
- **Choice:** 0.2.0's crawler without the vault. Q16 settled where crawl logins live: the terminal prompt or a git-ignored `.env.dsm`.

**What the crawler does** (`crawl_ui.mjs`, Playwright Chromium):
1. **Sign in** if the first page is a sign-in form. `auto` fills `DSM_APP_USERNAME`/`DSM_APP_PASSWORD` (environment or `.env.dsm`), or asks in the terminal (password hidden, OTP if asked). It handles one-page and two-step forms. `manual` opens a visible browser for SSO, CAPTCHA or MFA. The session can be saved in `dsm/.auth/state.json`, owner-only and git-ignored.
2. **Explore breadth-first** from the landing page and `start_paths`, plus code routes as seeds. It stays on `allowed_hosts`, skips `exclude_url_patterns`, and stops at `max_pages`/`max_depth`. Routes are normalised (`/orders/101` → `/orders/:id`), with hash routes handled.
3. **On each page, record** the title, headings, tables, links, buttons, tabs, menu items and forms with their fields. Each element gets its selector, visibility and test attributes. Then it clicks up to 40 safe elements without `href`, to find JS navigation, pop-ups and dialogs.
4. **Write** `ui-model.json`: pages, edges (`link`, `form`, `click`, `popup`, `redirect`, `opens`), `api_calls`, `blocked_requests`, `login`, and `truncated`/`pending_routes`.

**What the refresh does** (`dsm_update.mts`):
- **`run`:**
  1. fetch each repo, compare its commit with `state.json`, and stop with `no-change` if nothing is new;
  2. re-scan, and map the changed files to screens through the code model's owners;
  3. pick the crawl: incremental (only the impacted screens and new routes), full (shared files changed, history rewritten, no previous crawl, or every `full_recrawl_every_runs` runs), or none;
  4. build, snapshot the previous `dsm.json` to `history/`, render, and write `CHANGES.md` and `state.json`.

  A `.lock` file stops two runs at once.
- **`check`** lists new commits without building. **`status`** shows the state.
- In a terminal it asks for the URL and repository when they aren't saved, and can save them.

**Fixtures** (`tests/fixtures/crawl/`):
- `app.mjs` is a hand-made app with no dependencies. Its UI and API run on two ports, and the API records every write it receives at `GET /__writes`, so a test can prove a crawl changed nothing. It has the traps:
  - a sign-in (`qa@example.test` / `qa-password`, fixture only);
  - a profile form with an email field;
  - a "Dismiss" button that sends PATCH to the API;
  - a "Delete all" button;
  - an `/orders/:id` pair, a redirect, an HTTP 500 page, a hash route, a `target=_blank` link, a dialog and a log-out link.
- `aqe-runs.json` records four AQE crawls with the config changes and the writes that got through.
- `ui-model.aqe.json` is the safe run's output, with ports as placeholders.

**Problems found** (each reproduced on the fixture app; `aqe-runs.json`):

| Config | Writes that reached the API |
|---|---|
| As the demo ships it | `PATCH /users/me` (the profile form) and `PATCH /notifications/1` |
| `/settings` excluded | `PATCH /notifications/1` |
| API host in `allowed_hosts`, `/settings` crawled | both again, with 0 blocked |
| API host in `allowed_hosts` and `/settings` excluded | none (1 blocked) |

1. **Sign-in detection fires on ordinary forms.** A visible email or "user" field with no password field counts as step 1 of a two-step sign-in. On `/settings` the crawler typed the username into Email and pressed Save. This is the Real World App incident.
2. **The guard is left off.**
   - The crawler turns the write guard off to sign in again mid-crawl.
   - When that "sign-in" fails (as on `/settings`), it throws before turning the guard back on. Every page after that is unguarded: 0 requests blocked.
3. **The guard covers only `allowed_hosts`**, which defaults to the app's own host. An API on another port or host, like the Real World App's `:3001`, is never guarded. "Dismiss" isn't in the deny list, so clicking it marked a notification read.
4. **Smaller issues:**
   - `api_calls` lists the redirecting page (`/old-orders`) as a caller;
   - redirects aren't logged in the progress output;
   - with `hash_routing: auto`, `/#/help` on a page that isn't a single-page app is a separate copy of `/`;
   - two `history/` snapshots in the same second overwrite each other.
5. **Refresh hides shared changes.** When a changed file has no owners, the refresh forces a full re-crawl, but `impacted_routes` and `CHANGES.md` don't mention the file. In the run log: a commit touching `shared/header.component.html` and `flask/app.py` reported only the two Flask screens. The gate needs `impact()` to return shared files ("may affect every screen"), not drop them.
6. **Impact keys are repo-relative.** The gate's change has paths from the app repo root, while the code model keys files from the configured folder. After scan fix 1, an app in `web/` needs that prefix removed before matching.
7. **Exit codes clash.**
   - AQE's `needs-input` exits 3, which in QAMaster means "awaiting approval".
   - Login problems exit 4, which QAMaster doesn't have.

   Both become 2 (blocked) with the next step.

**Port plan for Build** (proposed; the person decides the open points):
- **The crawler goes behind `Crawler`** (`adapters/crawler-playwright.mts`). Playwright loads from the QA project's `node_modules`, as AQE does, so the plugin keeps no runtime dependencies (Q1).
- **Fixes, each with a test on `app.mjs` asserting `GET /__writes` is empty:**
  - the guard blocks every write to **any** host after sign-in, with `allow_mutating_patterns` as the only exception;
  - the guard is never switched off. A re-login allows only the one form submit on the known login route, and is undone in `finally`;
  - sign-in needs a password field, or the known login route for step 1 of a two-step form.
- **The refresh becomes pure functions plus a command:**
  - pure: change detection, the crawl decision, `impact(files)` returning `{ screens, shared }`;
  - commands: `qam dsm run` (full), `refresh` (only on new commits, never prompts), `changes` (AQE `check`) and `impact <files…>`;
  - no URL or repo prompts: `qam setup` (feature 4) writes the config;
  - the terminal prompt for credentials stays (Q16).
- **Open points:**
  - (a) **Playwright for QAMaster's own tests: decided 2026-10-29.** `playwright` 1.64.1 is an exact dev dependency of `qamaster-dev`, so the end-to-end safety test (crawl `app.mjs`, then `GET /__writes` must be empty) always runs. It's not skipped when the browser is missing. The plugin still loads Playwright from the user's QA project, with no runtime dependency (Q1).
  - (b) **The saved session: decided 2026-10-29** ([Q16 amendment](decisions.md)). It's saved by default, as AQE does (plain JSON, owner-only, git-ignored), and `login.save_session: false` turns it off. `qam setup` denies Claude reading `dsm/.auth/`. Build tests both settings.

**Moves with it:**
- the `Design-Structure-Matrix` skill and `ui-dsm-agent`, rewritten for `qam` and Q16, and without the vault;
- the `generate-dsm` command;
- the `dsm-gen` hook (SessionStart and after git pulls) belongs to step 9 with the other hooks.

**Left out (not MVP):** the encrypted vault and session sealing (Q16), and the scheduled "UI DSM refresh" routine. The DSM from test cases (`testcases dsm`) is v2, with test-case import.

**Built (2026-10-29):**

| File | What it holds |
|---|---|
| `plugin/src/dsm/crawl-rules.mts` | The pure decisions: routes, which URLs to open, the write guard, sign-in detection, incremental merge |
| `plugin/src/adapters/crawler-playwright.mts` | The `Crawler`. Playwright is loaded from the QA project; the in-page code is plain JavaScript strings |
| `plugin/src/dsm/update.mts` | Change detection, `impact`, the crawl decision, `CHANGES.md`, history, state and the lock |
| `adapters/git.mts` | Gains `changesSince` |
| `qam dsm run` | Full rebuild now; asks for sign-in details only in a terminal |
| `qam dsm refresh` | Only on new commits; never asks |
| `qam dsm changes` | New commits per repository, without building |
| `qam dsm impact <files…>` | The screens those files touch, and shared files |

The CLI dispatcher is now async.

**Tested:**
- `tests/crawl.test.mts` (8 tests):
  - each fix as a pure rule;
  - a real Chromium crawl of `app.mjs`: the API receives **no writes**, the Dismiss PATCH to the API's port is blocked, `/settings` is crawled without being taken for a sign-in page, and the session is saved owner-only, then reused;
  - `save_session: false` writes nothing;
  - a sign-in page with no credentials and no terminal is blocked, naming the three ways to sign in.

  With the guard switched off, the same crawl lets `PATCH /notifications/1` through, so the test would catch a regression.
- `tests/update.test.mts` (6 tests), on a git copy of the polyglot fixture with the fake crawler:
  - a full run;
  - a refresh with no new commits, which changes nothing;
  - a commit to `Settings.jsx`, which re-crawls only `/settings` and merges it;
  - a commit to a shared header, which re-crawls fully and lists the file;
  - history and state;
  - a code-only run without a URL, and the lock;
  - a sign-in failure, which keeps the previous DSM;
  - `qam dsm impact` and `qam dsm changes`.
- By hand: `qam dsm run` against `app.mjs`, with the sign-in from environment variables, built the whole DSM folder with 0 writes.

**Intended differences from AQE:**
- **Fix 1:** a page is a sign-in page only with a password field. A username-only or code-only form counts only on the known sign-in route, or before that is known, on a route named like one.
- **Fix 2:** the guard is never switched off. Signing in again allows writes only from the sign-in page, and the phase is reset in `finally`.
- **Fix 3:** after sign-in, the guard blocks writes to every host, not only `allowed_hosts`.
- **Safe defaults:** the deny list, click selectors and excluded URLs fall back to AQE's template values when a config leaves them out.
- **No URL or repository prompts:** `qam setup` writes them (Q26). Only the sign-in details are asked, in a terminal, and only by `run`.
- **Commands:**
  - `run` is a full rebuild;
  - `refresh` is AQE's `run --no-input`;
  - `changes` is AQE's `check`;
  - `impact` is new;
  - `status` moves to `/qamaster:status` (step 9).
- **Blocked, not exit 3 or 4:** sign-in problems and a missing setup exit 2, with the next step.
- **`impact` reports shared files** and non-UI files instead of dropping them, and `CHANGES.md` lists shared files (learning 5).
- **Paths are relative to the app's folder:** changed files come from `git diff --relative`, and `qam dsm impact` maps paths given from the app repo into each configured folder (learning 6).
- **History file names are unique** even within one second.
- **The session is saved by default:** plain JSON, owner-only, git-ignored, with `login.save_session: false` to turn it off (Q16 amendment). There's no vault.
- **The crawler returns the model** and writes no file except the session. The refresh writes `ui-model.json`.

**Moved (2026-10-29):**
- `plugin/skills/Design-Structure-Matrix/SKILL.md` is short, with the matrix, flags, files and settings in `references/dsm.md`;
- `plugin/agents/ui-dsm-agent.md`;
- `plugin/commands/dsm.md`: AQE's `generate-dsm` is now `/qamaster:dsm`, the name tech.md gives the plugin's DSM command.

All three are rewritten:
- for `qam dsm run`, `refresh`, `changes` and `impact`;
- for Q16: the sign-in options are a browser window, a terminal or `.env.dsm`, with no vault;
- for Q26: the URL and repository come from `qam setup`, never chosen by Claude;
- with the crawl's safety and prompt-injection rules.

AQE's `full`, `login`, `code-only`, `open`, `setup` and `forget-login` subcommands are covered by `run`, `--login-mode manual`, `--no-crawl`, showing the page, `qam setup`, and deleting `dsm/.auth/`.

Checks:
- `claude plugin validate ./plugin` passes. The advice it gives is about a missing icon and licence file, which matter only for the plugin directory.
- Under `claude --plugin-dir ./plugin`, the prompt "a map of every screen in our web app and which screens my last code change affects" picks `qamaster:Design-Structure-Matrix`.


### 4. Setup and pipeline (Learn done 2026-10-29)

**Versions:**
- **`shared/project` is the same in both.**
- **`setup` in 0.2.0 adds** security overrides (DOMPurify for Allure) and more `.gitignore` lines, including the vault, which Q16 drops.
- **`pipeline` in 0.2.0 grows from 13 to 17 stages:** test import, API model, test analysis and existing framework. All four are v2 or v3 (Roadmap).
- **Choice:** 0.2.0's structure, cut to QAMaster's 15 v1 stages (tech.md, "Onboarding pipeline"). Overrides come with feature 8, where Allure arrives.

**What it does:**
- **`aqe setup`.** It's safe to re-run: it only adds what's missing, and `--check` changes nothing. It does six things:
  1. checks the prerequisites (Node 24+, npm, git);
  2. writes a project link: `.autonomous-qe/plugin.json` points at the current plugin folder, and a launcher (`bin/aqe.mjs`, plus `aqe` and `aqe.cmd` shims) runs the CLI from terminals and CI after plugin updates;
  3. copies config templates, never overwriting;
  4. adds `.gitignore` lines;
  5. merges `package.json`: npm workspaces for app folders, plus Playwright;
  6. runs `npm install` and installs browsers.
- **`aqe pipeline`** tracks each stage. Each stage has a `detect` that reads **evidence** in the project (files, freshness, review results) and a `how` that says exactly what to run next. Marks recorded in `state.json` add only what can't be detected (skipped, failed with a note, in progress). So the pipeline resumes correctly after an interruption and never claims undone work.
  - `start` records the inputs (URL, repository, app name, channels), never credentials.
  - `status` lists every stage; `next` gives the first stage not done.

**Problems found:**
1. **`setup --check` exits 1** ("fail") when something is missing. In QAMaster that's blocked (2).
2. **Setup asks for nothing about the app.** The URL and repository are asked later by the DSM skill. Q26 moves them into setup, with validation.
3. **The pipeline imports the refresh code** to show "repository changed", and swallows every error. QAMaster calls `changesSince` directly.
4. **Its `start --repo` writes MCP config** (`repoSource`). Context sources are v2.
5. **Stage evidence is scattered.** `test-cases` checks `review.json`, `gate` reads a recorded mark plus file times, and `execution` reads `results.json`. Each later feature owns its evidence; the pipeline just asks.

**Port plan.** You asked me to continue through all the features, so the choices below are mine (marked ★) and wait for your review:
- **`qam setup`** in `src/cli/setup.mts`, with the steps in `src/pipeline/setup.mts`:
  - the prerequisites, including the git version (Q26);
  - the project link `.qamaster/` with `plugin.json`, `bin/qam.mjs`, and `qam` / `qam.cmd` shims;
  - config templates from `plugin/templates/project/config/`. Later features add their templates there and setup picks them up;
  - `.gitignore`, and `package.json` with an exact Playwright version;
  - `npm install` and browsers (`--browsers chromium|all|none`, `--no-install`);
  - the Q16 deny rules in `.claude/settings.json`: Claude may not read `.env*` or `dsm/.auth/`;
  - `--check` exits 2 when anything is missing.
- **Q26: where the code comes from.**
  - ★ `--url <app URL>` sets `application.base_url`.
  - ★ `--source <folder|git URL>` adds a repository; `--branch`, `--name` go with it. A URL needs ★ `--clone-to <folder>` or ★ `--use-clone <folder>`. There's no default, because the person always chooses.
  - Validation: git version, reachable (`git ls-remote`), branch exists, not shallow, and uncommitted changes warned. A clone's `origin` must match the URL.
- **Q27 and Q29: integrations.**
  - ★ `qam integrations list|add|remove|verify`, each kind an adapter.
  - v1 has one kind, `claude-hooks`: it creates the app repo's `.qamaster/`, which turns on the push gate for that repo (Q14).
  - Records go in `.qamaster/integrations.json` and `~/.qamaster/installs.json`.
  - ★ `qam setup --entry claude-code,vscode,…` is the checklist. Entry points not available yet are listed as coming, not installed.
- **`qam pipeline start|status|next|mark|reset`** for the 15 v1 stages. Each stage's evidence comes from the feature that owns it, and stages whose features aren't built yet read the files those features will write.
- **`qam doctor`** (settings part): the config, each repository (Q26), each integration (Q27), and Playwright. The ADO part comes with step 4.

**Left out (v2/v3):** test import, API model, test analysis, existing frameworks, the MCP config stage, `repoSource`, and the vault lines in `.gitignore`.

**Built (2026-10-29), on branch `feature/4_setup-and-pipeline`:**

| File | What it holds |
|---|---|
| `src/pipeline/setup.mts` | Setup's steps: prerequisites, project link and launcher, config templates, `.gitignore`, `package.json` with Playwright 1.64.1, Q16 deny rules, install |
| `src/pipeline/sources.mts` | Q26: a local folder or a git URL (https, ssh, `git@`, `file://`), git 2.20+, `ls-remote` with the person's own credentials (`GIT_TERMINAL_PROMPT=0`), branch, not shallow, uncommitted warning, existing clone's `origin` |
| `src/integrations/integrations.mts` | Q27/Q29: the `Integration` interface, the `claude-hooks` kind, the entry-point checklist, `.qamaster/integrations.json` and `~/.qamaster/installs.json` (`QAMASTER_HOME` overrides the folder) |
| `src/pipeline/pipeline.mts` | The 15 stages, each with its evidence file named in the code |
| `src/cli/project.mts` | `qam setup`, `qam pipeline`, `qam doctor`, `qam integrations` |
| `plugin/templates/project/config/` | `qamaster.json`, and `dsm-config.json` from AQE's template without the vault |

**Tested:**
- `tests/project.test.mts` (9 tests):
  - setup on an empty folder, run twice: nothing changes the second time, and an edited config is kept;
  - `--check` blocks while Playwright is missing;
  - the launcher runs from a terminal;
  - URL and local git source, then `qam dsm scan` scans it;
  - every source check blocks with its fix;
  - a `file://` URL is cloned into the chosen folder, refused into a non-empty one, and matched as an existing clone; a shallow clone is refused;
  - the entry-point checklist installs `claude-hooks` and lists VS Code (v1.1) and Copilot (v2) as coming, with list, verify and remove;
  - pipeline evidence, `next`, marks, inputs and reset;
  - `doctor`.
- By hand: `qam setup` on a copy of autonomousQeDemo, with app, URL, source and entry points, then `qam pipeline next`.

**Intended differences from AQE:**
- `--check` exits 2, not 1.
- Setup takes the app, URL and code sources (Q26) and the entry points (Q29).
- Setup writes the Q16 deny rules.
- Workspaces and security overrides come with feature 8.
- The pipeline has the 15 v1 stages, not 17, and never writes MCP config.

**Choices I made under your go-ahead (★), for review:**
- the flag names `--url`, `--source`, `--clone-to`, `--use-clone`, `--entry`;
- the command `qam integrations list|add|remove|verify`;
- git 2.20 as the minimum;
- `file://` accepted as a git URL;
- removing `claude-hooks` deletes only its record, since `.qamaster/` also holds plans and verdicts. The hooks will check the record (step 9).

**Redo of the loop (2026-10-29): reproduce, golden, then fix.** The first build skipped reproducing AQE's problems. This pass did it.

*Learn: reproduced on AQE.* `tests/fixtures/setup/aqe-repro.mjs` runs AQE's `setup` and `pipeline` on scratch folders. Its results are in `aqe-runs.json`. 0.1.5 and 0.2.0 behave the same in every case but the last.

| # | What we did | What AQE did | QAMaster first build |
|---|---|---|---|
| 1 | `setup --check` with something missing | exit 1 ("fail") | fixed already: exit 2 |
| 2 | `setup --no-install`, no Playwright | `ready`, exit 0 | same |
| 3 | `config/dsm-config.json` cut off mid-edit, then `setup --check` and `pipeline status` | "present (kept as is)", `ready`, setup stage done | same; `setup --url` then said "Run qam setup", which loops |
| 4 | `pipeline start --app Shop …`, then `pipeline start --channels web …` | the app name is gone | same (url and app gone) |
| 5 | `state.json` cut off, then `pipeline mark reports skipped` | file replaced without a word; inputs and marks lost | same |
| 6 | `pipeline reset dsn` (typo) | exit 0, nothing done | same |
| 7 | `pipeline mark dsm done`, no `dsm.json` | exit 0, stage still pending, nothing said | same |
| 8 | `pipeline start --repo /no/such/folder` | recorded | same (`--source`) |
| 9 | configured repository deleted, DSM built | DSM done, no warning (the error is swallowed) | same |
| 10 | `package.json` with `workspaces: {packages, nohoist}` | 0.2.0 replaces it with `[]`; 0.1.5 keeps it | not touched: workspaces come with feature 8 |
| — | `doctor` with a `.qamaster/doctor.json` that can't be read | — | crash (stack trace, not exit 2) |

*Golden.* AQE's own output is kept next to QAMaster's:
- `setup.aqe.json` and `setup.expected.json`: setup on an empty folder;
- `pipeline/status.aqe.json` and `pipeline/status.expected.json`: pipeline status on `pipeline/project/`, a QA project built from the demo's evidence files (DSM, state, requirements, AUT build record, a reviewed TestGen run).

`aqe-goldens.mjs` rewrites the AQE files. The tests check that QAMaster's output matches its expected file, and that every step and stage both tools have has the same status in both:
- setup: Node.js, npm, git, project link, `config/dsm-config.json`, `.gitignore`, `package.json`, npm install;
- pipeline: setup, dsm, knowledge (AQE `aut-skills`), requirements, test-cases, app-folder, locators, scripts, script-gate (AQE `gate`), reports.

The first build matched on all of them before any fix. The only intended differences:
- a first-time project link is `created` (AQE says `updated`);
- the overall result is `incomplete` (fix 2).

*Improve and Build: the fixes.*

| Fix | Change |
|---|---|
| 1 | `setup --check` blocks (exit 2). From the first build |
| 2 ★ | Setup says `ready` only when Playwright is installed. With `--no-install` it says `incomplete` and still exits 0, because the person asked to skip the install |
| 3 | A config file that isn't valid JSON is a failed step: setup blocks and writes nothing (the app, URL, sources and entry points wait), and the setup stage isn't done. The "invalid `qamaster.json`" message no longer sends people to `qam setup`, which can't fix it |
| 4 | A later `pipeline start` adds to the recorded inputs; it keeps the ones it wasn't given, channels included |
| 5 | A `state.json` that can't be read blocks every pipeline command and is never replaced: "Fix it, or delete it to start the record again" |
| 6 | `pipeline reset <unknown stage>` blocks and lists the stages |
| 7 ★ | `pipeline mark <stage> done` blocks: done comes from evidence. The message shows what the stage's evidence lacks and how to get it. The marks left are `pending`, `in_progress`, `failed` and `skipped` |
| 8 ★ | `pipeline start --source` blocks a local folder that doesn't exist. Git URLs are only recorded: setup checks and clones them (Q26) |
| 9 ★ | A configured repository that can't be read makes the DSM stage **stale**, with "can't read <name> (<path>): run qam doctor" |
| 10 | `doctor` rewrites its own record when it can't be read |

*Test.* `tests/setup.test.mts` has 4 golden tests and one test per fix. Each test was run against the first build (`0759576`, in a throwaway worktree): fixes 2–10 failed there, and fix 1 passed, as it was already in. All of them pass now. `npm run check` passes: typecheck, Biome and 101 tests.

*Move.* `claude plugin validate ./plugin` passes. No skills move with this feature.

**Open, for the person:**
- **The launcher doesn't pin its project.** AQE's launcher passes its project folder (`AQE_PROJECT_DIR`). QAMaster's runs in the current folder, so `qa/.qamaster/bin/qam pipeline status` run from elsewhere reports on that folder (checked by hand). Pinning it isn't obvious, because the gate needs the app repo as its folder (Q22). This needs a decision: a `QAMASTER_QA_PROJECT` variable set by the launcher, or the launcher used only for project commands.
- **A QA project inside the app repo.** Setup writes `package.json`, `.gitignore` and `node_modules/` into whatever folder it runs in. When that folder is the app repo (the demo's layout: its `repo` is itself), that's a write to a source repo, which Q15 forbids. Should setup refuse, warn, or allow it as Q22's "tests live in the app repo" case?
- **Workspaces (problem 10)** belong to feature 8. Its merge must keep an object-form `workspaces`.
- **The app name isn't normalised.** AQE turns "CheckMaster Shop" into `CheckMasterShop` for `AUT_<App>`, but QAMaster uses the name as given. Feature 5 owns the `AUT_` names.
- **Running `npm run check` on this machine** also lints the untracked `.e2e-scriptgen/session.json`, which the AQE plugin's prompt hook wrote into this repo. It's not QAMaster's, so it was left alone; Biome on every tracked file passes.

**The first build's ★ choices, reviewed:** I'd keep all five, but they're still yours to decide.
- **The flag names** match Q26's words.
- **`qam integrations list|add|remove|verify`** maps one-to-one onto Q27's record.
- **git 2.20** is older than every git command QAMaster runs.
- **`file://`** is what makes the clone path testable without a network.
- **Removing `claude-hooks` keeps `.qamaster/`,** which also holds plans and verdicts.

### 5. Application knowledge (Learn in progress, 2026-10-29)

**Version:** `aut-skill/build_aut_skills.mts` (571 lines) is the same in 0.1.5 and 0.2.0.

**What it does:** it turns `dsm/dsm.json` into a main `AUT_<App>` skill and one `AUT_<App>-<Component>` skill per DSM module. Each `SKILL.md` has two blocks:
- a **generated** block of DSM facts, rewritten every time;
- a **curated** block that Claude writes from the source code, kept as is.

**Fixtures** (`tests/fixtures/knowledge/`), each produced by AQE's own builder:
- `shop/expected`: the shop DSM, app "Shop";
- `rwa/expected`: the Real World App DSM;
- `curated/input` and `expected`: the shop skills with a hand-written curated block in `AUT_Shop-Cart`, rebuilt to show the block is kept and its `Summary:` reaches the description.

**Problems found so far** (each reproduced with AQE):
1. **Every rebuild rewrites every file.** Rebuilding the same DSM a minute later changed all 9 files, because each carries "skill generated <time>". That's noise in git, and reviewers can't see real changes.
2. **Curated text can be lost silently.** When a curated block's end marker is damaged (one edited character), the rebuild replaces the whole file with the template. The QA-written text is gone, with no warning.
3. **Exit codes clash:** `needs-input` exits 3 (QAMaster: awaiting approval) and `no-dsm` exits 4.
4. **Components follow the first URL segment**, so the Real World App's transaction tabs (`/contacts`, `/personal`, `/public`) become three components. The scan now knows they share one container file, which could group them (still to decide).

Still to do: the rest of Learn, then Improve, Build, Test and Move.

## Roadmap: what comes after the v1 MVP

These AQE features are left out of step 3 on purpose. Each becomes its own feature later, through the same loop. The v2 / v3 split is a proposal: v2 is what makes the build stages richer for the teams already using v1, and v3 is broader tooling. [product.md](product.md#scope) carries the same lists.

| Feature | AQE source | Proposed | Why then |
|---|---|---|---|
| Context sources: MCP config for Jira, Confluence, GitLab, Figma, Visio (`mcp-config-agent`, pipeline stage 3) | `mcp_config/*` 1,019 | v2 | v1 reads requirements and test cases over REST (Q5). MCP only adds context for test design |
| Export to other AI tools, and the QAMaster MCP server | `export/export` 324, `mcp_server/server` 266 | v2 | v1 is Claude Code only. The CLI already gives other tools a way in |
| Import existing test cases (Excel, HP ALM, Azure Test Plans) and gap analysis; revision mode in TestGen; Test Coverage report | `testcases/*` 993, `test-suite-analyst`, `TestCaseAnalysis`, `reports/types/test-coverage` | v2 | Teams with existing suites. v1 builds new cases from the application |
| Scan: import aliases (`@/x`, tsconfig `paths`) and import following for C#, Java and Python | new (QAMaster `dsm/scan.mts`) | v2 | Fix 5 follows relative JS/TS imports only. Apps that use aliases or back-end MVC pages get fewer `imported` owners |
| Locators from the crawl, for apps without front-end source | `locators/from_crawl` 174 | v2 | v1 syncs locators from the front-end source |
| API discovery and API test data | `api/api` 450, `API-TestGen` | v2 | v1 covers API through TestGen's API channel only |
| Existing automation frameworks (detect, analyse, generate into them) | `codebase/*` 948, `CodebaseOperations`, `analyze_framework` 350 | v3 | v1 generates playwright-bdd only (Q20). Each framework becomes a `Framework` adapter (Q25), not a rewrite |
| Impact and traceability matrices | `design/design` 243 | v3 | The gate's DSM impact and plan cover the v1 need |
| Root cause evidence from commits and logs | `rca/rca` 160 | v3 | v1 writes defect drafts; RCA data stays manual |
| Value metrics (tokens, time, effort saved) | `reports/value` 204 | v3 | Reporting extra |
| Encrypted secrets vault and security scan | `shared/secrets` 266, `security/*` 316 | v3 | v1 reads secrets from the environment, `.env` or `az login` (Q16) |
| Visio MCP server | `visio_mcp/*` 743 | v3 | Only needed with MCP context sources |
