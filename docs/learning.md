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

### Check yourself

1. In a DSM, what does a mark in row `/cart`, column `/checkout` mean? What would a mark *below* the diagonal in the partitioned order suggest?
2. Why does the DSM need both a crawl and a code scan? Name one thing only the crawl knows and one only the scan knows.
3. `/signup` is `code-only` in the Real World App's DSM. Is that a bug in the app? Why did it happen?
4. If no file is linked to any screen, what breaks later in the loop?
5. Why are golden tests the right tool for porting code that has no tests?

<details><summary>Answers</summary>

1. `/cart` leads to `/checkout` (a link, button, form or redirect). Below the diagonal means going back to an earlier screen, which is part of a cycle.
2. The crawl knows what really renders: titles, fields, errors, real links. The scan knows routes the crawl couldn't reach, and which file belongs to which screen.
3. No. The crawler signed in first, so it never saw the sign-up and sign-in pages. It's a gap in the crawl, not in the app.
4. `path:` tags can't be derived, so the gate can't map a code change to test cases, and the plan's coverage gaps (DSM impact) are empty.
5. The old code's output on a real input is the only reference we have. If the new code gives the same output, the port didn't change behaviour; if it differs, we look at why and write it down.
</details>

---

## Journal

| Date | Feature | What we learned |
|---|---|---|
| 2026-10-29 | Setup | QAMaster's repo, CLI with exit codes, models, config, adapters and fakes (steps 1–2) |
| 2026-10-29 | 1 DSM build | The build is identical in AQE 0.1.5 and 0.2.0. A real app exposes scan gaps (Q8) and a crawl safety bug (Q15) |
