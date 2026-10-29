---
name: AUT_Shop-Login
description: "Shop application, Login component (AUT sub-skill of AUT_Shop). Screens: /login. 0 form(s). Covers its UI elements, forms and fields, page navigation, dependencies on other components (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on Shop Login: understanding the screens, writing or reviewing test cases, automation, impact analysis, defects."
---

# Shop · Login (AUT)

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
| `/login` | /login | / | / | 0 · 0 | ui-only, redirect, cycle |

### Screen details

#### `/login` — /login
- URL: http://shop.test/login (HTTP 200)
- Headings: /login
- Found by: ui
- Reached from: `/` via "Sign in"
- Leads to: `/` via "redirect"

### Dependencies on other components (from the DSM)

- Depends on (navigates to): [AUT_Shop-Home](../AUT_Shop-Home/SKILL.md) (1)
- Used by (navigated from): [AUT_Shop-Home](../AUT_Shop-Home/SKILL.md) (1)
- In navigation cycles: `/login` (test back/forward and state carry-over)

### Candidate end-to-end journeys through this component

1. `/` → ("Sign in") `/login`

### Test design notes
- No DSM flags for this component.
- Design scenarios with the `Domain_Test_Design_Skill`; check impact of code changes with `/autonomous-qe:generate-dsm`.
<!-- generated:end -->
