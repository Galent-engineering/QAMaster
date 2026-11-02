# Releases

What each plugin version holds, and what the next one is planned to hold. Scope by product version (v1, v1.1, v2) is in [product.md](product.md#scope); this file tracks the plugin's own releases inside it.

Findings come from the [demos](demos/README.md). From 0.2.1 on, each planned release has a versioned plan in [plans/](plans/README.md). This file keeps the summary.

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

Plan: [plans/0.2.1.md](plans/0.2.1.md). It holds the fixes from the [0.2.0 publish walkthrough](demos/2026-10-30-0.2.0-publish-feedback.md) that the 0.3.0 gate depends on:
- review needs an explicit approval;
- the plan is named after the app;
- a file in a shallow folder is tagged with that folder's own files (`dir/*`), not the whole subtree (Q37; broad tags are kept, and the 0.3.0 gate decides what a shared file selects);
- smoke is counted across the whole plan;
- credential-like text in test cases is a validator finding;
- the `file` store blocks when both of its files exist (Q36, accepted 2026-11-02).

The other findings, and the earlier 0.2.1 backlog, are listed with where each one goes in that plan's [Later](plans/0.2.1.md#later) section.

## 0.3.0: planned

Plan: [plans/0.3.0.md](plans/0.3.0.md). The first full working plugin:
- the gate (plan, approve, run, verdict), ported from CheckMaster;
- just-in-time automation, which drafts playwright-bdd scripts for the cases a change touches (Q39);
- the pytest and playwright-bdd runners, picked for each case from its automation link (Q38);
- `/qamaster:check` and the push hook;
- end-to-end runs on CheckMasterDemo and Juice Shop.

Not in 0.3.0: Feedback, Reports and Requirements (`qam requirements fetch`), and the v1.1, v2 and v3 scope in product.md.
