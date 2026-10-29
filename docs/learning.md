# Learning QAMaster: concepts and design

> A guide that grows with the port. Each feature we move adds a lesson. Examples use the demo app, the Cypress Real World App (`../cypress-realworld-app`), a small payments app with about 10 screens.

How to use it: read **Part 1** once for the big picture. Read **Part 2** when a word is unfamiliar. Read the **lesson** for a feature before reviewing its code. Each lesson ends with questions to check yourself.

---

## Part 1: the big picture

### The problem in one paragraph

A QA team has an application and its code. They need test cases that really match the application, automation for them, and a way to know which tests to run when a developer changes the code. Today the cases are written by hand, the tracker (Azure DevOps) is filled in by hand, and choosing tests for a change is guesswork. QAMaster joins two Galent tools to do all three:
- **Autonomous-QE (AQE)** *builds*: it learns the application and writes test cases and automation;
- **CheckMaster (CM)** *gates*: it picks the tests behind a code change, asks a person to approve, runs them and gives a verdict.

QAMaster adds the two missing links: **Publish** (generated cases go into Azure DevOps with tags) and **Feedback** (gaps found by the gate go back into test design).

### The loop

```
        ┌────────────────────────── BUILD (from AQE) ──────────────────────────┐
app UI ─┤ crawl ─┐                                                             │
        │        ├─► DSM ─► app knowledge ─► test cases ─► person reviews      │
code ───┤ scan ──┘                (AUT skills)   (TestGen)        │           │
        └─────────────────────────────────────────────────────────┼───────────┘
                                                                  ▼
                                         PUBLISH (new): cases → Azure DevOps, with tags
                                                                  │
        ┌────────────────────────── GATE (from CM) ───────────────┼───────────┐
        │ code change ─► select cases by tags ─► person approves ─► run ─► verdict
        └──────────────────────────────────────────────────────────┬──────────┘
                                                                   ▼
                              FEEDBACK (new): screens with no test, stale cases ─► back to BUILD
```

The important idea: **the DSM connects the two halves**. It knows which screens exist (from the crawl) and which code files belong to which screen (from the scan). That lets QAMaster tag each test case with the files it covers (`path:src/checkout/**`), so when those files change, the gate knows which tests to run.

**Try it:** open [v2-plugin-setup.html](v2-plugin-setup.html), the plugin setup. It shows every stage of the loop, which parts swap (requirements source, test case store, test framework and runner, crawler), and where the port stands, feature by feature. Pick Jira or Cypress to see the setting it needs and when it ships.

**The current picture:** [v2-plugin-setup.html](v2-plugin-setup.html) adds decisions Q26 to Q32:
- the entry-point checklist;
- code from a local folder, a git URL or a host's API;
- plan presets, selectors and the model;
- runners and execution targets that fit the chosen framework;
- code host and CI as separate choices.

### The design in five rules

1. **One CLI, `qam`, is the only door** (Q3). Claude Code commands, hooks, CI and terminals all call it. It answers with an exit code: `0` pass, `1` fail, `2` blocked, `3` awaiting approval. *Why:* one tested path; CI and the IDE can never disagree.
2. **Everything outside goes through an adapter** (Q4). Azure DevOps, git, the test runner and the browser crawler sit behind five interfaces in `plugin/src/adapters/base.mts`. Tests swap in fakes (`tests/fakes.mts`). *Why:* the engine can be tested without a network, and Jira or Cypress can be added later without touching it.
3. **Errors a person can fix are "blocked", not crashes.** They throw `BlockedError` with a message that says what to do ("Fix the line in .env"). *Why:* a blocked check must never look green, and the person needs to know the next step.
4. **A person approves before anything is published or run** (design principle 2). The tool proposes; the person says yes.
5. **Facts or nothing** (AQE's "hallucination tolerance 0"). Every test step points to evidence: a DSM screen, a requirement, a source file. A gap is reported, never filled by guessing.

### How the code is laid out

```
plugin/                 what users install
  src/cli/main.mts      the qam command: flags, dispatch, exit codes
  src/shared/           models (data shapes), config, errors, .env reading
  src/adapters/         the five interfaces + the registry that picks one by name
  src/dsm/ …            one folder per engine module, added feature by feature
tests/                  node:test tests, fakes, contract suites, fixtures
docs/                   product, design, tech, decisions, this guide
```

Technology choices (Q1): TypeScript run directly by Node 24, with no build step and no runtime dependencies. Node strips the types when it loads a `.mts` file. That's why the code may only use "erasable" TypeScript: no `enum`, no constructor parameter properties.

---

## Part 2: glossary

| Word | Meaning | Example |
|---|---|---|
| **AUT** | Application under test | The Real World App |
| **Crawl** | A browser visits the running app and records screens, elements and links | `ui-model.json` |
| **Scan** | Reading the source code, without running it, to find routes, links and which file belongs to which screen | `code-model.json` |
| **DSM** | Design Structure Matrix: a square table of screens; a mark in row *A*, column *B* means "A leads to B" | see Lesson 1 |
| **Route** | The path of a screen | `/bankaccounts/new` |
| **Relation / cell** | One mark in the matrix, with how it happens (link, form, click, code) | `/ → /notifications` by link |
| **Module** | The first part of a route, used to group screens | `/bankaccounts/new` → `bankaccounts` |
| **Evidence** | A pointer that proves a test step is real | `dsm:screen:/bankaccounts/new` |
| **Run** | One TestGen output for a module: draft cases + validation + review | `testgen/output/<run>/` |
| **Draft case** | A generated test case, not yet in Azure DevOps | `TC-BANK-001` |
| **Publish** | Writing reviewed draft cases into Azure DevOps Test Plans | `qam publish <run> --apply` |
| **Ledger** | QAMaster's record of which draft became which ADO test case | `.qamaster/ledger.json` |
| **Tags** | Labels on ADO test cases that the gate selects by | `path:src/containers/**`, `smoke`, `bankaccounts` |
| **Plan** | The test cases proposed for one code change, each with its reason | `qam plan` |
| **Verdict** | `pass`, `fail` or `blocked` for one commit | `.qamaster/verdicts/<sha>.json` |
| **BROKEN** | A test case whose automation link points to a test that doesn't exist | fails the check |
| **Gap** | A screen the change touched that no test case covers | shown on the plan |
| **Adapter** | Code that talks to one outside system behind an interface | `ado`, `playwright-bdd` |
| **Fake** | An in-memory stand-in for an adapter, used in tests | `FakeStore` |
| **Contract test** | One test suite every implementation of an interface must pass, real or fake | `tests/contracts.mts` |
| **Golden test** | "This input must give exactly this output", where the output came from a trusted run | `tests/fixtures/dsm/*/dsm.expected.json` |

---

## Part 3: how we port (step 3)

AQE has about 16,600 lines and **no tests**. Moving it all at once would mean nobody could tell whether the move broke something. So each feature goes round the same loop ([porting-step3.md](porting-step3.md)):

1. **Learn:** read the AQE code in both versions, run it on the demo app, save what goes in and what comes out.
2. **Build:** write the QAMaster version behind the adapters.
3. **Test:** the saved outputs become **golden tests**. QAMaster's version must give the same result as AQE on the same input. That's how we test code that never had tests: AQE's own output is the reference.
4. **Move:** wire the `qam` command and the skill, try it on the demo, review, commit.

---

## Lesson 1: the DSM (feature 1, DSM build and render)

### What a DSM is

A Design Structure Matrix is a square table. The same list of screens runs down the rows and across the columns. A mark in row *A*, column *B* means **A leads to B**: a link, a button, a form submit or a redirect.

A tiny piece of the Real World App's DSM:

|  | `/` | `/bankaccounts` | `/bankaccounts/new` | `/notifications` | `/transaction/new` |
|---|---|---|---|---|---|
| **`/`** | · | link | | link | link |
| **`/bankaccounts`** | link | · | link | link | link |
| **`/bankaccounts/new`** | link | link | · | link | link |
| **`/notifications`** | link | link | | · | link |
| **`/transaction/new`** | | | | | · |

Read a row to see **where a screen leads**. Read a column to see **what leads to it**. Here `/transaction/new` has an empty row: nothing leads out of it in the crawl. That's a *dead end*, and in this case it's suspicious (see "What we found" below).

Why a matrix and not a picture of boxes and arrows? With 100 screens a picture becomes spaghetti, but a matrix stays a readable grid, and it can be **reordered** to reveal structure.

### There are two matrices

- **Page level:** screens only. 16 rows for the Real World App.
- **Element level:** screens *and* their parts: links, buttons, tabs, forms, fields and dialogs, 115 rows for the Real World App. The cells say `contains` (the page has this button), `navigates` (this link goes to that page), `submits` (this form posts to that page) or `opens` (this button opens that dialog).

Test design uses both. The page level shows the journeys between screens; the element level shows the fields and buttons each step touches.

### Where the data comes from, and why two sources

| Source | Knows | Misses |
|---|---|---|
| **Crawl** (browser) | What really shows on screen, the real titles, fields and links, HTTP errors | Screens it couldn't reach: behind sign-in, needing data, or blocked to stay safe |
| **Scan** (code) | Routes defined in code, even unreachable ones, and **which file belongs to which screen** | Anything built at runtime; routes written in ways it doesn't recognise |

The DSM merges both. Each screen remembers its **sources**: `ui`, `code`, both, or only seen as the target of a link (`ui-target`, `code-ref`).

### The build, step by step

1. **Name every screen the same way.** `/Bankaccounts/?x=1` and `/bankaccounts` must be one screen. The key drops the query, lower-cases the path and trims the trailing `/`. For hash routes it keeps only the part after `#`.
2. **Add the screens** from the crawl and from the code, merging those with the same key.
3. **Attach source files** to screens, using the scan's "owners" of each file. This is what later lets a code change point at screens.
4. **Add the relations** from crawl links and code links. Code shared by every screen (a nav bar, a layout) goes into a special `(shared)` node.
5. **Find cycles and order the screens.** See "The clever part" below.
6. **Flag the problems** for each screen:

   | Flag | Means | Real World App example |
   |---|---|---|
   | `orphan` | Nothing leads to it (and it isn't a start page) | `/implicit/callback`, an Okta sign-in callback |
   | `dead-end` | A crawled screen that leads nowhere | `/transaction/new` |
   | `code-only` | Defined in code, never seen by the crawler | `/signup`, `/signin`: the crawl was already signed in |
   | `ui-only` | Seen by the crawler, but the scan found no route for it | `/bankaccounts`: its route is declared through `<PrivateRoute>`, which the scan doesn't recognise |
   | `unresolved` | Only ever seen as a link target | `/forgotpassword`, `/transaction/:id` |
   | `broken` | HTTP 400+ or an error on the page | `/user/settings` (the crawl lost its session there) |
   | `redirect` | The screen sends you elsewhere | (in the hand-made shop: `/login` → `/`) |

7. **Build the element-level matrix**, with a size cap (`max_element_nodes`) so huge apps stay viewable.
8. **Compare with the previous DSM** to report screens and relations added, removed or changed. That's the "what changed since last time" list.

### The clever part: cycles and the partitioned order

Screens that can all reach each other form a **cycle**, a *strongly connected component* (SCC). In the Real World App, `/`, `/bankaccounts`, `/bankaccounts/new`, `/contacts`, `/notifications` and `/personal` all link to each other through the side menu: one big cycle.

The build finds SCCs with **Tarjan's algorithm**. It walks the links depth-first and notices when it comes back to a screen it's still exploring. Then it orders the matrix so that:
- each cycle sits together as a block on the diagonal;
- blocks come in "flow" order: if block X leads to block Y, X comes first;
- ties go to the start page first, then crawl depth, module and name.

The result: **marks above the diagonal are forward navigation; marks below it are going back**. You can read the structure of the app at a glance. A team uses this to spot screens tangled together, and test design uses it to walk journeys in a sensible order.

### Render

`render` puts the DSM data into a single HTML page (`dsm/index.html`) that works offline. You can switch between page and element level, sort by flow or by module, and click a cell to see why the mark is there.

**Try it:** open [learning/realworld-dsm.html](learning/realworld-dsm.html), the Real World App's DSM, rendered by AQE. Find the big cycle block, the dead ends, and the `(shared)` node. Then switch to the element level and look at `/bankaccounts/new`'s form fields.

### What we found while learning (and why it matters)

1. **The code scan misses most of this app's screens** (feature 2). It found 6 of about 12 routes, and it linked **no** source file to any screen. So for this app, QAMaster couldn't yet tag test cases with the files they cover, which is the key idea of the whole loop. The README listed this as the top risk (Q8), and now we have a real case to fix it against.
2. **The crawler changed the app's data** (feature 3). Its safety guard should block every write while it explores (Q15). But the guard only watched the app's own address, not the API on another port, and it switched itself off while signing in again. On the settings screen it mistook the profile form for a sign-in form and submitted it. We restored the demo's data both times, and feature 3 must fix this before QAMaster crawls a customer's test system.

Both were found only because we ran AQE on a realistic app before porting. That's the point of the Learn phase.

### How we built it in QAMaster

- **One pure function.** `build(ui, code, config, { previous, change, now })` in `plugin/src/dsm/build.mts` reads nothing and writes nothing. The command (`plugin/src/cli/dsm.mts`) does the file work: it finds `config/dsm-config.json`, reads the crawl, the scan and the last `dsm.json`, and writes the new one. Pure functions are what make golden tests easy: same input, same output.
- **The clock is a parameter.** `generated_at` is the only thing that changes between two runs, so `now` is passed in. The tests give it AQE's time and then compare the whole file.
- **No Python layer.** AQE carried a 600-line `pyport` so its output matched the old Python byte for byte. We kept only the three rules that change the result: how tuples sort, how `round` breaks ties, and Python's `or`. Everything else is plain TypeScript.
- **Blocked, not crashed.** A missing settings file or an empty `dsm/` folder gives exit 2 and the next step to take ("Run qam dsm run first"), as the CLI contract says.
- **A small safety upgrade.** The page embeds screen text from the app. Render writes every `<` as `\u003c`, so a page title like `</script>` can't break the DSM page.

Try it on the fixture:

```bash
plugin/bin/qam --repo <copy of a QA project> dsm build
plugin/bin/qam --repo <copy of a QA project> dsm render
```

### Check yourself

1. In a DSM, what does a mark in row `/cart`, column `/checkout` mean? What would a mark *below* the diagonal in the partitioned order suggest?
2. Why does the DSM need both a crawl and a code scan? Name one thing only the crawl knows and one only the scan knows.
3. `/signup` is `code-only` in the Real World App's DSM. Is that a bug in the app? Why did it happen?
4. If no file is linked to any screen, what breaks later in the loop?
5. Why are golden tests the right tool for porting code that has no tests?
6. Why does `build` take `now` as a parameter instead of reading the clock?

<details><summary>Answers</summary>

1. `/cart` leads to `/checkout` (a link, button, form or redirect). Below the diagonal means going back to an earlier screen, which is part of a cycle.
2. The crawl knows what really renders: titles, fields, errors, real links. The scan knows routes the crawl couldn't reach, and which file belongs to which screen.
3. No. The crawler signed in first, so it never saw the sign-up and sign-in pages. It's a gap in the crawl, not in the app.
4. `path:` tags can't be derived, so the gate can't map a code change to test cases, and the plan's coverage gaps (DSM impact) are empty.
5. The old code's output on a real input is the only reference we have. If the new code gives the same output, the port didn't change behaviour; if it differs, we look at why and write it down.
6. So the function stays pure: the tests can pin the time and compare AQE's whole file, instead of deleting the field before comparing.
</details>

---

## Lesson 2: the repo scan (feature 2)

### What it's for

The crawl sees the app from the outside. The scan reads its **source code** and answers one question the crawl can't: *which files make up which screen?* That answer is what turns a code change into "re-test these screens" and gives test cases their `path:` tags. If the scan gets it wrong, the whole gate gets weaker: QAMaster can't tell which test cases a change touches.

### How it works, in four steps

1. **Read the files** from git, at `origin/<branch>`. It never writes to the repo.
2. **Find the routes.** It knows the usual ways apps declare screens: a routes list (Angular, Vue), `<Route path=…>` elements (React), files in `pages/` (Next.js), controller methods (ASP.NET, Spring), `urls.py` (Django), decorators (Flask), and plain `.html` files. `/orders/{id}`, `/orders/[id]`, `/orders/<int:id>` and `/orders/:orderId` all become `/orders/:id`.
3. **Give each file its owners**, the routes it serves, with a confidence:

   | Confidence | Why the file owns the route | Example (polyglot fixture) |
   |---|---|---|
   | `direct` | It declares the screen's component, is its template or view, or sits next to one with the same name | `home.component.html` owns `/home` |
   | `module` | It's inside a lazy-loaded module's folder | `admin/admin.module.ts` owns `/admin/…` |
   | `imported` | A screen's file imports it, directly or through other files (QAMaster; AQE guessed from the folder instead) | `BankAccountForm.tsx` owns `/bankaccounts` |
   | `shared` | None of the above: layout, services, utilities | `machines/authMachine.ts` in the Real World App |

4. **Find the links** in each file (`routerLink`, `<Link to>`, `href`, `navigate(…)`, redirects, …). Each one becomes a code edge from the routes the file owns, or from `(shared)` when it owns none.

It's all regular expressions. That makes it fast (4,000 files in under a second) and language-agnostic, but it only knows the patterns someone wrote down.

### What the Real World App taught us

The app has about 12 screens. The scan found 6, and linked **0 of 17** relevant files to any screen. Three small patterns explain all of it:

```tsx
<Route exact path="/signup">            {/* the screen is a child, not element= */}
  <SignUpForm authService={authService} />
</Route>
<PrivateRoute exact path="/user/settings">   {/* a custom route: not a <Route> to the scan */}
  <UserSettingsContainer />
</PrivateRoute>
<Route exact path="/(public)?">        {/* a path pattern: read as "/(public)" */}
```

So every link in the app is drawn from `(shared)`, which is why the Lesson 1 matrix has a big `(shared)` row and no files on any screen.

The hand-made polyglot fixture found two more problems that would hit real teams:
- **Nested React routes come out wrong.** `<Route path="projects" element={<Projects />}>` has a `>` inside `<Projects />`, so the scan thinks the tag ends there, and the child `:projectId` loses its parent.
- **An app in a subfolder scans nothing.** If the configured path is `web/` inside a bigger repo, git lists `src/App.jsx` but the scan asks for it at the repo root. It reads 0 files and reports no error.

### The design choice for Build

As in Lesson 1, split the **pure** part from the **outside world**:
- `scan(files, repo, rules)` takes a list of `{ path, text }` and returns the code model. Tests feed it the fixture files directly, with no git.
- Reading git goes in an adapter behind `RepoReader` (`listTree`, `readFile`). That's also where the subfolder bug gets fixed: the adapter reads paths relative to the configured folder.

Then port in two passes: first match AQE exactly (golden tests on both fixtures), then fix the problems one at a time, each with a failing test first and its changed output written down.

### How we built it, and what the fixes changed

- **Pure scan, git outside.** `scan(config, read)` in `plugin/src/dsm/scan.mts` gets each repository's files from `read` and never touches git. `adapters/git.mts` does the reading with two git commands, whatever the repo's size.
- **AQE first, then one fix at a time.** The port matched AQE's output exactly before any fix. AQE's file is kept as `code-model.aqe.json` and ours as `code-model.expected.json`. A test lists every route where they differ, so a reviewer sees exactly what each fix changed.
- **The fixes:**
  - read paths relative to the app's folder (monorepos);
  - treat `<PrivateRoute>`-style tags as routes, and take the first component inside a route as its screen;
  - expand `/(a|b)?` patterns;
  - skip `{…}` attribute values so `element={<X />}` doesn't end the tag.

**The result on the Real World App:** 12 screens instead of 6, and 10 files linked directly to their screen instead of 0. In the DSM, 10 of 16 screens now have source files.

**Fix 5: imports instead of folders.** AQE gave a file the screens of its folder: `BankAccountForm.tsx` sits next to `SignInForm.tsx`, so it "inherited" `/signin`. Now a file owns the screens whose files import it, so `BankAccountForm.tsx` belongs to `/bankaccounts`, where it's really used. Removing the guess exposed a gap the guess had hidden: the scan matched a route's component by its *declared* name, and one Real World App screen imports its component under a different name. It now follows the router file's imports first. Result: all 11 app screens have their own file.

The trade-off: a core file used by many screens (the app's `authMachine.ts`) now owns all of them. That's true (changing it can break each one), but it means a change there selects many tests. The gate decides how to treat such files.

### Check yourself

1. Why can't the crawl alone tell which files belong to a screen?
2. In the Real World App, why does every code edge start at `(shared)`?
3. AQE's folder rule gave `ApiDataController.cs` the Account screens. Why was that weak evidence, and why is "a screen's file imports it" stronger?
4. Why put git reading behind `RepoReader` instead of calling `git` inside `scan`?
5. Why match AQE's output first, even though we know about the bugs?

<details><summary>Answers</summary>

1. The browser only sees rendered pages. Which source files produced them is only in the code.
2. No file owns any screen (the routes have no component the scan can see), and a file with no owners sends its links from `(shared)`.
3. Sharing a folder says nothing about what a screen uses: `ApiDataController.cs` is an API, not part of any Account page. An import is a real dependency: if the imported file changes, the screen's code changes with it.
4. So `scan` stays pure and testable on plain fixture files, and the git-specific problems (subfolders, refs, uncommitted files) live and get fixed in one place, with their own tests.
5. So every later difference is a deliberate fix with its own test, not an accident of the port. Golden first, then change one thing at a time.
</details>

---

## Lesson 3: the crawl and the refresh (feature 3)

### The crawl: a robot user

The crawler is a real browser (Playwright's Chromium) that signs in and visits every screen it can reach. It works breadth-first: the landing page, then everything one click away, then two, and so on. On each screen it writes down what's there (links, buttons, tabs, forms and their fields, tables, dialogs) and where each link leads. It also clicks buttons that have no link, to find menus, dialogs and JavaScript navigation. The result is `ui-model.json`, the "outside view" half of the DSM (Lesson 1).

Two details make the two views line up:
- **Route normalisation:** `/orders/101` and `/orders/102` are one screen, `/orders/:id`, just as the code scan writes it.
- **Code routes as seeds:** routes the scan found are added to the queue, so the crawl visits screens no link points to.

### The hard part: exploring without changing anything

A crawler that clicks buttons on a test system can do real damage: save forms, delete records, mark messages read. AQE has four layers of safety, and Q15 makes them a rule:

| Layer | What it does | Where it can fail |
|---|---|---|
| Forms are recorded, never submitted | The crawler reads fields; it doesn't press Save | …unless it thinks the form is a sign-in form |
| Deny list for clicks | Skips buttons named "delete", "save", "pay", "send", … | Only knows the words on the list: "Dismiss" isn't on it |
| Write guard | After sign-in, blocks POST, PUT, PATCH and DELETE | Only for `allowed_hosts`, and it's switched off to sign in again |
| Excluded URLs | Never opens "logout", "delete", downloads | Only knows the patterns on the list |

The guard is the safety net under the other three: if it holds, a mistaken click or submit is blocked. We found it has holes.

### What went wrong, on our own test app

We wrote a small app (`tests/fixtures/crawl/app.mjs`) that counts every write its API receives, and ran AQE's crawler on it four ways:

| Config | Writes that got through |
|---|---|
| As shipped | the profile form was saved, and a notification was marked read |
| Profile screen excluded | the notification |
| API's host guarded, profile screen crawled | both again: guard left off |
| API's host guarded, profile screen excluded | none |

Three separate bugs, stacked:
1. **Wrong sign-in detection.** A page with an email field and no password looked like step 1 of a sign-in. The crawler typed the username into Email and pressed Save.
2. **Guard switched off.** To sign in again, the crawler turns the guard off. The "sign-in" on the profile page failed, the crawler threw an error, and the line that turns the guard back on never ran. The rest of the crawl was unguarded.
3. **Guard on one host only.** The API runs on another port, a different host to the browser, and the guard only watched the app's own host.

This is exactly what happened to the Real World App's data in Lesson 1. Now each cause has a reproduction we can test the fix against: after a QAMaster crawl, the app's write log must be empty.

The general lesson is about **safety nets**. A guard must fail *closed* (block when unsure, as with every host), and must never be switched off in a way an error can skip (always restore it in `finally`).

### The refresh: rebuild only what changed

Re-crawling a whole app after every commit is slow. The refresh does the least work that keeps the DSM true:
1. Compare each repo's commit with the one in `state.json`. Nothing new: stop.
2. Re-scan the code, and map the changed files to screens with the scan's owners (Lesson 2).
3. Re-crawl only those screens, plus new routes. Do a full crawl when a shared file changed (it may affect every screen), history was rewritten, or it's been many runs since the last full crawl.
4. Rebuild, diff against the previous DSM, and write `CHANGES.md`.

Step 2 is also what the gate needs: **impact analysis**, "this change touches these screens". One gap matters there. When a changed file is shared (no owners), the refresh does re-crawl everything, but its report doesn't mention the file. For the gate, "this file may affect every screen" is important information, so QAMaster's `impact()` will return shared files next to the screens.

### How we built it

- **Decisions apart from the browser.** `dsm/crawl-rules.mts` holds every safety decision as a small function: `blocks()` for the guard, `isSignInPage()` for detection, and `Routes` for which URLs to open. Each fix has a test that needs no browser. The Playwright adapter only drives Chromium and asks these functions.
- **The guard decides by phase:** `signing-in` (before the crawl), `crawling`, or `re-signing-in`. A phase can't be "left off" by an error, because the code that sets it back sits in `finally`. While signing in again, only the sign-in page itself may write.
- **One test that matters most.** The crawl test runs a real Chromium against `app.mjs` and then asks the app for its write log, which must be empty. We also checked the test can fail: with the guard switched off, the same crawl lets the Dismiss request through.
- **The refresh never guesses.** It returns the screens a change touches, *and* the shared files, which may touch every screen. The gate will use both.

### Check yourself

1. Why does the crawl add the code scan's routes as seeds?
2. The deny list skips "Delete" but clicked "Dismiss". Why isn't a better deny list the real fix?
3. What does "fail closed" mean for the write guard, and which AQE behaviour was "fail open"?
4. Why must turning the guard back on happen in `finally`?
5. A commit changes only `NavBar.tsx`, which is shared. What should the refresh do, and what should the gate be told?

<details><summary>Answers</summary>

1. Some screens have no link pointing to them (reached by a typed URL, or a link the crawler's account can't see). The code knows they exist.
2. A list of words can never be complete. "Dismiss", "Archive", "Mark read" all change data. The guard catches any write whatever the button says; the deny list just avoids clicking things in the first place.
3. Block when unsure: every write to every host is blocked unless explicitly allowed. AQE allowed writes to any host not on its list, which failed open for the API on another port.
4. `finally` runs even when an error is thrown. AQE turned it back on in the next line, which an error skipped.
5. Re-crawl the whole app (the change may show on every screen), and tell the gate the change touches a shared file, so it doesn't conclude "no screens affected".
</details>

---

## Lesson 4: setup and the onboarding pipeline (feature 4)

### Setup: safe to run twice

`qam setup` prepares a QA project. Its main property is that it's **safe to re-run**: it only adds what's missing, and never overwrites a config file someone edited. `qam setup --check` changes nothing; it only reports what's missing (exit 2, blocked).

It does six things:

| Step | Why |
|---|---|
| Prerequisites: Node 24+, npm, git | QAMaster runs TypeScript directly on Node 24; git reads the code |
| The project link `.qamaster/` with a launcher `bin/qam` | The plugin's folder changes on every update. Terminals and CI call the launcher, which finds the current plugin |
| Config templates | A team starts from working settings; later features add their own templates |
| `.gitignore` | Secrets (`.env*`), the saved session (`dsm/.auth/`), locks and caches never reach git |
| Playwright, installed in the QA project | The crawl needs a browser; the plugin itself has no dependencies |
| Deny rules for Claude | Claude can't read `.env*` or the saved session, even if asked (Q16) |

Setup also takes the app's URL and where its code lives (Q26). Code can be a local folder or a git URL to clone, and setup checks git, the branch and access **before** anything depends on them.

### The pipeline: evidence, not checkboxes

Onboarding an app has 15 stages: setup, the test case store, DSM, knowledge, requirements, test cases, review, publish, automation, gate, reports. A naive tracker stores "stage 4: done". AQE's better idea, which we keep: **each stage looks at the project to decide whether it's done.** `dsm/dsm.json` exists, so the DSM stage is done. It's older than the last commit, so it's *stale*.

Why that matters:
- **Interrupted work resumes correctly.** Nothing claims to be done that isn't.
- **Stale work shows up by itself.** Test cases older than the DSM are flagged.
- **Marks are only for what can't be seen:** "skipped, no API", "failed, see note", "in progress".

`qam pipeline next` prints the first stage that isn't done, with the exact command to run. This is what the onboarding command (step 9) walks through.

### Integrations: knowing where QAMaster is installed

Every place QAMaster plugs into is recorded with an ID (Q27). In v1 that's just Claude Code; git hooks, PR checks and AI assistants follow. The record means an upgrade can update each one, an uninstall can remove exactly what was added, and `qam doctor` can check each one still works.

### What we found by trying to break it

We ran AQE's own `setup` and `pipeline` on scratch folders and fed them the awkward cases: a broken file, a typo, a second run with different flags. Both AQE versions misbehaved the same way in nine of ten cases (`tests/fixtures/setup/aqe-runs.json`). Most problems are one of two kinds.

**Saying "fine" when it isn't:**
- `setup --no-install` said **ready** while the browser wasn't installed.
- A config file cut off mid-edit was reported "present (kept as is)", and the pipeline called setup done.
- When the app's code folder disappeared, the DSM stayed "done": the error was caught and thrown away.

**Losing or ignoring what the person gave it:**
- A second `pipeline start` dropped the inputs from the first one.
- A `state.json` that couldn't be read was quietly replaced, so every recorded mark was lost.
- `pipeline mark dsm done` and `pipeline reset dsn` (a typo) both "worked" and changed nothing.

One rule covers both kinds: **when the tool can't tell, it says so.** It doesn't guess "fine", and it doesn't start again from nothing. In QAMaster, each of these cases now blocks (exit 2) with the next step, or shows the stage as stale with the reason. Each one has a test that failed on the first build and passes now.

The goldens come first: QAMaster's setup and pipeline must give the same status as AQE on every step and stage both of them have (`setup.aqe.json`, `pipeline/status.aqe.json`). The fixes are the only differences, and each is listed.

### Check yourself

1. Why must setup never overwrite an existing config file?
2. A stage's evidence file exists but is older than the DSM. What should the pipeline say, and why not "done"?
3. Why does setup check the git branch and access up front, instead of letting the scan fail later?
4. What breaks if a terminal or CI calls the plugin's folder directly instead of the launcher?
5. `state.json` can't be parsed. Why is blocking better than starting a fresh file?
6. Why does `qam pipeline mark dsm done` refuse instead of recording the mark?

<details><summary>Answers</summary>

1. People edit config files: URLs, safety lists, owners. Overwriting them silently loses decisions. "Only add what's missing" makes setup safe to re-run any time.
2. "Stale": the work exists but was built from older inputs, so it may be wrong. "Done" would hide that.
3. Feature 2 found a scan that silently read 0 files. Checking up front turns a confusing empty DSM later into a clear message now.
4. The plugin folder changes on every update, so the stored path breaks. The launcher reads the current folder from `.qamaster/plugin.json`.
5. A fresh file throws away the inputs and every mark ("skipped: no ADO yet"), and nobody notices. Blocking keeps the file, so the person can fix it or choose to delete it.
6. "Done" comes from evidence. A mark would be ignored anyway (evidence wins), so accepting it would only mislead. The refusal says what evidence the stage is missing and how to make it.
</details>

---

## Lesson 5: application knowledge (feature 5)

### What it's for

To write good test cases, Claude needs to know the app: its screens, what each one does, how they connect, and the business rules behind them. AQE keeps that knowledge as **Claude Code skills** in the QA project: one main skill, `AUT_<App>` (AUT means "application under test"), and one sub-skill per part of the app, such as `AUT_Shop-Cart`. Claude loads a skill when its description matches the task, so "write test cases for the cart" pulls in exactly the cart's knowledge.

### Two kinds of text in one file

Each `SKILL.md` has two blocks, marked with HTML comments:

| Block | Written by | On rebuild |
|---|---|---|
| **generated** | the builder, from the DSM: screens, forms, buttons, navigation, dependencies, candidate journeys | rewritten every time |
| **curated** | Claude or QA, from the source code: business rules, roles, end-to-end business cases | kept as is |

The split lets facts stay current automatically, while the expensive human-checked understanding survives. The curated block's `Summary:` line is even copied into the skill's description, so it improves when the skill triggers.

The parts of the app ("components") come from the DSM's modules: the first segment of each URL (`/cart`, `/checkout/review` → Cart, Checkout). Dependencies between components are just the DSM's navigations, grouped. The builder never guesses them from names.

### What we found by trying to break it

We ran AQE's builder on the shop and Real World App DSMs and on a copy of the demo (`tests/fixtures/knowledge/aqe-runs.json`). Three findings stand out.

- **A file that changes when nothing changed.** Every skill says "generated at 11:16". Rebuild a minute later from the same DSM, and all nine files change. In git, a real change hides among false ones.
- **A marker is a contract, and a broken contract was silently "fixed".** Change one character of the curated end marker, and the next rebuild can't find the block. It writes the template instead, and the QA team's text is gone. The rule from feature 4 applies again: when the tool can't tell, it stops and says so.
- **Skills are instructions, and the generated part comes from the app's own pages.** A page heading reading "Ignore your previous instructions…" was copied word for word into a skill that Claude later loads while writing tests. The app under test is not a trusted author. Text quoted from it must be marked as data.

Smaller ones: `--save` without a name wiped the saved name; a part of the app that disappeared kept its skill, still describing its screens as current; and missing values printed as Python's `None`.

One more turned up while building, by comparing AQE's own outputs: from the second build on, the template's placeholder ("_(one sentence: …)_") was copied into every skill's description. The description is what Claude reads to pick a skill, so every unfinished skill advertised a placeholder.

### How we built it

- **Golden first, literally.** The first commit is a plain port that writes AQE's files byte for byte. Only then did the fixes go in, each with a test that fails on that plain port.
- **AQE's output stays next to ours** (`aqe/` and `expected/`). One test undoes the listed differences and checks that everything else still matches AQE word for word. A difference nobody wrote down fails the test.
- **The builder is a pure function:** the DSM and the existing skill texts go in, the files to write come out. The command writes only files whose text changed, so a rebuild with nothing new changes nothing in git.
- **Never repair someone's text by guessing.** A damaged curated block stops the build and names the file. A part of the app that's gone is marked retired, with its notes kept, and deleting it is the person's call.

### Check yourself

1. Why keep business rules in a curated block instead of regenerating them every time?
2. A rebuild finds a curated start marker but no end marker. What should it do, and why not use the template?
3. Why is a timestamp inside every generated file a problem, even though it's accurate?
4. The crawl copied a page heading into a skill. Why is that riskier than the same heading in `dsm.json`?

<details><summary>Answers</summary>

1. They come from reading code and from QA's judgement, which is slow and can't be derived from the DSM. Regenerating would throw that work away.
2. Stop, name the file, and change nothing. The template would replace text a person wrote, and the person would never know.
3. Every rebuild changes every file, so git shows changes where there are none, and the real ones are hard to see.
4. `dsm.json` is data that tools read. A skill is text Claude reads as guidance, so an instruction hidden in a page could steer Claude in later tasks.
</details>

---

## Journal

| Date | Feature | What we learned |
|---|---|---|
| 2026-10-29 | Setup | QAMaster's repo, CLI with exit codes, models, config, adapters and fakes (steps 1–2) |
| 2026-10-29 | 1 DSM build | The build is identical in AQE 0.1.5 and 0.2.0. A real app exposes scan gaps (Q8) and a crawl safety bug (Q15) |
| 2026-10-29 | 1 DSM build (built) | Ported as one pure function with the clock passed in; it matches AQE on all five fixtures without the Python layer |
| 2026-10-29 | 2 Repo scan | Regex route finding is fast but pattern-bound: on the Real World App no file owns a screen. Subfolder apps scan nothing. Port pure, git behind RepoReader |
| 2026-10-29 | 2 Repo scan (built) | Matched AQE first, then four fixes, each with a test: the Real World App goes from 0 to 10 files linked to their screens. The folder rule now needs replacing |
| 2026-10-29 | 2 Repo scan (fix 5) | Ownership by imports, not folders. Removing a wrong guess exposed a hidden gap (component names), so check what a fallback was covering before removing it |
| 2026-10-29 | 3 Crawl and refresh | A safety net must fail closed and be restored in `finally`. Three stacked guard bugs, each reproduced on a hand-made app that counts writes |
| 2026-10-29 | 3 Crawl and refresh (built) | Safety decisions as pure functions, a guard set by phase and restored in `finally`, and a real crawl test that proves zero writes, checked to fail when the guard is off |
| 2026-10-29 | 4 Setup and pipeline | Setup only adds what's missing; pipeline stages decide "done" from evidence in the project, so they resume and show staleness |
