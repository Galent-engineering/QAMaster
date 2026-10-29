---
name: AUT_Shop-Help
description: "Shop application, Help component (AUT sub-skill of AUT_Shop). Screens: /#/help. 0 form(s). Covers its UI elements, forms and fields, page navigation, dependencies on other components (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on Shop Help: understanding the screens, writing or reviewing test cases, automation, impact analysis, defects."
---

# Shop · Help (AUT)

Part of [AUT_Shop](../AUT_Shop/SKILL.md). Generated from the Design Structure Matrix; business sections curated from the source code.

<!-- curated:start (written by Claude / QA from the source code; kept on regeneration) -->
## Business understanding
Summary: _(one sentence: what this module lets which users do; it is also used in this skill's description)_

_Not written yet. Claude (AUT-Skill-Builder): read this module's source files listed below through the code-repository
MCP server or the local clone, and the screens and forms in the generated facts, then describe:_
- _purpose of the module and the user roles that use it;_
- _business objects and their life cycle (states, transitions);_
- _business rules, calculations, validations, limits (cite `file:line`);_
- _integrations and data the module reads or writes (APIs, other modules, batch jobs)._
_Mark anything inferred rather than read in the code as **(inferred)**._

## End-to-end business cases
_Not written yet. One entry per real business case that touches this module, built from the candidate journeys and
dependencies below and confirmed in the code:_
- _**Name** · persona · preconditions and data · steps (screen → action → result) · expected business outcome ·
  modules involved · related candidate journey._
<!-- curated:end -->

<!-- generated:start (facts from the Design Structure Matrix; rewritten on regeneration, do not edit) -->
## Facts from the Design Structure Matrix
_DSM built 2026-10-29T07:21:47+00:00 from shop@cccccccc; skill generated 2026-10-29 11:16 UTC._

### Screens (1)

| Screen | Title | Reached from | Goes to | Forms · fields | Flags |
|---|---|---|---|---|---|
| `/#/help` | Help | / |  | 0 · 0 | dead-end, ui-only |

### Screen details

#### `/#/help` — Help
- URL: http://shop.test/#/help (HTTP 200)
- Headings: Help
- Found by: ui
- Reached from: `/` via "Help"

### Dependencies on other components (from the DSM)

- Depends on (navigates to): none
- Used by (navigated from): [AUT_Shop-Home](../AUT_Shop-Home/SKILL.md) (1)

### Candidate end-to-end journeys through this component

1. `/` → ("Help") `/#/help`

### Test design notes
- **dead-end**: `/#/help` — no onward navigation
- Design scenarios with the `Domain_Test_Design_Skill`; check impact of code changes with `/autonomous-qe:generate-dsm`.
<!-- generated:end -->
