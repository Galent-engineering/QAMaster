# Plans

There's one plan per plugin release. Each plan is the working source of truth for that release: what's in it, in what order, what has to be decided first, and how it's verified.

| Release | Plan | Status |
|---|---|---|
| 0.2.1 | [0.2.1.md](0.2.1.md): fixes from the 0.2.0 publish walkthrough that the gate depends on | Released 2026-11-02, r5 |
| 0.2.2 | [0.2.2.md](0.2.2.md): fixes from the 0.2.1 verification | Released inside 0.3.0, r1 |
| 0.3.0 | [0.3.0.md](0.3.0.md): the first full working plugin (gate, just-in-time automation, pytest and playwright-bdd runners) | Released 2026-11-02, r9 |
| 0.3.1 | [0.3.1.md](0.3.1.md): prerequisites a clean machine needs, checked and explained (Docker findings F1–F11) | Released 2026-11-02, r5 |
| 0.3.2 | [0.3.2.md](0.3.2.md): fixes from the Toolshop run, `/qamaster:status`, an installable zip, local first, a plugin with no `bin/` | Built 2026-11-03, loads in Claude desktop, r3 |
| 0.3.3 | [0.3.3.md](0.3.3.md): fixes only | Folded into 0.4.0 (no 0.3.3 release) |
| 0.4.0 | [0.4.0.md](0.4.0.md): the 0.3.3 fixes, setup folder suggestions, the crawl ETA, the six reports and feedback | Built 2026-11-04, r4 |
| 0.4.1 | [0.4.1.md](0.4.1.md): fixes from the AgentMesh run (A1–A17), request bodies checked against the code, FastAPI routes, API routes kept out of the UI map (Q48), the Docker check | Built 2026-11-04, r4 |
| 0.4.2 | [0.4.2.md](0.4.2.md): fixes from the dummy-static-website run (W1–W20): the shell drop that dropped real pages, the automation folder's name, the gate's settings, clearer messages | Released 2026-11-04, r4 |
| 0.4.3 | [0.4.3.md](0.4.3.md): the 39 domain sub-skills ship as reference files of `Domain_Test_Design_Skill` (Q51), so the catalog lists 8 skills | Released 2026-11-04, r1 |
| 0.4.4 | [0.4.4.md](0.4.4.md): messages and docs from the fastapi-react-app run (R1–R30) | Released 2026-11-10, r2 |
| 0.5.0 | [0.5.0.md](0.5.0.md): requirements fetch from Azure Boards and import from a file | Released 2026-11-10, r3 |
| 0.6.0 | [0.6.0.md](0.6.0.md): the gate and the store you can trust: Q52, Q53, Q49, every verdict kept, then the local store first (Q50), switching stores, conflicts, `qam status` (Q54 merged 0.8.0's store half in) | Built 2026-11-10, r5 |
| 0.7.0 | [0.7.0.md](0.7.0.md): what QAMaster covers: apps with a sign-in, a faster DSM, selection presets (Q31), API and Mobile Web scripts | Built 2026-11-10, r2 |
| 0.6.1 | None: folded. 0.7.0 contains 0.6.0, so 0.6.0's fixes are in 0.7.1 and its live-run fixes go to 0.7.2 | Not built (no 0.6.1 release) |
| 0.7.1 | [0.7.1.md](0.7.1.md): fixes after 0.6.0 and 0.7.0: Q56's `path:` tags, crawl and scan gaps, the `.feature` session and route text, 0.6.0's small gaps | Released 2026-11-10, r3 |
| — | [handoff.md](handoff.md): where the work stands and what a new session should do first | Kept current |
| — | [backlog.md](backlog.md): every open fix and to-do, with its source and target release, up to 1.0.0 and after | Kept current |

**Version numbers: MAJOR.MINOR.PATCH** ([Q46](../decisions.md), 2026-11-03).
- **1.0.0 is the major release:** product v1 complete, as [product.md](../product.md#v1) describes it.
- **New feature → minor** (0.4.0, 0.5.0, …): resets the patch to 0. A release with a feature and fixes is a minor release.
- **Fixes only → patch** (0.3.3, 0.3.4, …): no new command, flag, config key, file format or behaviour a user must learn.
- **After 1.0.0 the same rules apply:** 1.1.0 for features, 1.0.1 for fixes. A change that breaks users (a command, flag, exit code, config key, tag or link format or manifest field) is a major release, 2.0.0. Before 1.0.0 it's a minor release and the release notes say so.
- Releases up to 0.3.2 keep their numbers, though 0.3.1 and 0.3.2 mixed fixes with features.
- Every release: bump `plugin/.claude-plugin/plugin.json`, name the plan `docs/plans/<version>.md`, add its row to [plans/README.md](README.md) and to [releases.md](../releases.md), and build the zips with `scripts/package.sh`. Open items live in [plans/backlog.md](backlog.md).

**How the plans relate to the other docs**
- [releases.md](../releases.md) has a short summary of each release and links here. When a release ships, its row there lists what actually shipped.
- [decisions.md](../decisions.md) holds the decisions a plan relies on. A plan links to them and never restates them in a different way.
- [design.md](../design.md) and [tech.md](../tech.md) describe the product as designed. A plan says which parts of them it builds.
- [demos/](../demos/README.md) holds the walkthrough findings each plan answers.

**Revisions.** Each plan opens with a revision table. A change of scope, order or decision adds a row (`r2`, `r3`, …) with the date and what changed. Earlier rows are never edited. A step that's done is marked in the plan's status column, not deleted.
