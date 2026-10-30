# Releases

What each plugin version holds, and what the next one is planned to hold. Scope by product version (v1, v1.1, v2) is in [product.md](product.md#scope); this file tracks the plugin's own releases inside it.

Findings come from the [demos](demos/README.md).

Effort: XS < 30 min · S ~1 h · M half a day · L a day or more.

## 0.2.0: publish, and fixes from the first walkthrough

Publish (Q33, Q34), plus the fixes the 0.1.0 walkthrough turned up (WALKTHROUGH-0.1.0, step 4 notes).

| Change | Where | Decision |
|---|---|---|
| `qam publish`: dry run, `--apply`, `--retire`, `--refresh`, `--leave-out`, `--skip-smoke`; the `file` store; the store cache | `cli/publish.mts`, `publish/`, `adapters/file.mts`, `adapters/cache.mts` | Q33, Q34 |
| Doctor: a missing ADO project lists the organization's projects, closest names first, with the next steps (pick one, a new name, the `file` store, or let publish create it) | `adapters/ado.mts`, `shared/errors.mts`, `cli/project.mts` | |
| Publish creates a missing ADO project, only with `--apply` after the preview | `adapters/ado.mts`, `cli/publish.mts` | Q35 |
| Scan skips `codefixes/` folders (copies of routers, as in Juice Shop) | `pipeline/sources.mts` | |
| The requirements stage no longer points to the unbuilt `qam requirements fetch` | `pipeline/pipeline.mts`, `testgen/facts.mts` | |
| A stage marked skipped shows its note, not the last failed check | `pipeline/pipeline.mts` | |
| ADO-API recipe: list the organization's projects | `skills/ADO-API/references/recipes.md` | |
| Doctor warns when an existing config misses a newer default (`pathDepth`, scan excludes) | `cli/project.mts` | |
| The `file` store also reads and writes `testcases/testcases.json`, used when there is no CSV | `adapters/file.mts`, `shared/schema.mts` | Q36 (proposed) |

## 0.2.1: planned

| Item | Effort | Impact | Needs first |
|---|---|---|---|
| Accept the store's version of a conflicted case (today the message only says to look in the store) | M | Med: only on conflicts | A flag or command name, approved |
| xlsx `file` store. No runtime dependencies, so a minimal reader and writer on `node:zlib` (xlsx is zipped XML) | M | Med for teams with no tracker | Hand-written vs a dependency exception (Q34) |
| Upgrade an old config on request, beyond the 0.2.0 doctor warning | S | Low-med | A flag name, e.g. on `setup`, approved |
| Domain_Test_Design skills crowd the `/` menu: hide them from the menu (Claude still loads them) | XS | Med: first thing a new user sees ([demo 0.1.0 step 1](demos/2026-10-30-0.1.0-juice-shop.md)) | Check the current skill frontmatter docs for the menu-hiding field |
| Accept or drop Q36 (JSON form of the `file` store); decide whether both files present should block | XS | Low | Your call |
| Findings from the publish walkthrough (WALKTHROUGH-publish) | ? | ? | The filled-in feedback, triaged like this table |
| Findings from the first live ADO publish, project creation included | ? | ? | The live run |

Not in 0.2.1: `qam requirements fetch` (sprint stories, L), and the v2 and v3 scope in product.md.
