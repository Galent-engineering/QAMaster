---
name: AUT_RealWorldApp-Home
description: "RealWorldApp application, Home component (AUT sub-skill of AUT_RealWorldApp). Screens: /. 0 form(s). Covers its UI elements, forms and fields, page navigation, dependencies on other components (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on RealWorldApp Home: understanding the screens, writing or reviewing test cases, automation, impact analysis, defects."
---

# RealWorldApp · Home (AUT)

Part of [AUT_RealWorldApp](../AUT_RealWorldApp/SKILL.md). Generated from the Design Structure Matrix; business sections curated from the source code.

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
_DSM built 2026-10-29T07:21:47+00:00 from cypress-realworld-app@0729f68a; skill generated 2026-10-29 11:16 UTC._

### Screens (1)

| Screen | Title | Reached from | Goes to | Forms · fields | Flags |
|---|---|---|---|---|---|
| `/` | Cypress Real World App | /bankaccounts, /bankaccounts/new, /contacts, /notifications, /personal | /bankaccounts, /contacts, /notifications, /personal, /transaction/new, /user/settings | 0 · 0 | ui-only, cycle |

### Screen details

#### `/` — Cypress Real World App
- URL: http://localhost:3000/ (HTTP 200)
- Found by: ui
- Buttons: open drawer, Logout, Date: ALL, Amount: $0 - $1,000
- Links: /, NEW, 8, EVERYONE, FRIENDS, MINE, Home, My Account, Bank Accounts, Notifications, https://cypress.io
- Tabs: EVERYONE, FRIENDS, MINE
- Reached from: `/bankaccounts` via "Home", `/bankaccounts/new` via "Home", `/contacts` via "EVERYONE", `/notifications` via "Home", `/personal` via "EVERYONE"
- Leads to: `/bankaccounts` via "Bank Accounts", `/contacts` via "FRIENDS", `/notifications` via "8", `/personal` via "MINE", `/transaction/new` via "NEW", `/user/settings` via "My Account"

### Dependencies on other components (from the DSM)

- Depends on (navigates to): [AUT_RealWorldApp-Bankaccounts](../AUT_RealWorldApp-Bankaccounts/SKILL.md) (1), [AUT_RealWorldApp-Contacts](../AUT_RealWorldApp-Contacts/SKILL.md) (1), [AUT_RealWorldApp-Notifications](../AUT_RealWorldApp-Notifications/SKILL.md) (1), [AUT_RealWorldApp-Personal](../AUT_RealWorldApp-Personal/SKILL.md) (1)
- Used by (navigated from): [AUT_RealWorldApp-Bankaccounts](../AUT_RealWorldApp-Bankaccounts/SKILL.md) (2), [AUT_RealWorldApp-Contacts](../AUT_RealWorldApp-Contacts/SKILL.md) (1), [AUT_RealWorldApp-Notifications](../AUT_RealWorldApp-Notifications/SKILL.md) (1), [AUT_RealWorldApp-Personal](../AUT_RealWorldApp-Personal/SKILL.md) (1)
- In navigation cycles: `/` (test back/forward and state carry-over)

### Candidate end-to-end journeys through this component

1. `/` → ("Bank Accounts") `/bankaccounts` → ("CREATE") `/bankaccounts/new`
2. `/` → ("FRIENDS") `/contacts`
3. `/` → ("8") `/notifications`
4. `/` → ("MINE") `/personal`

### Test design notes
- No DSM flags for this component.
- Design scenarios with the `Domain_Test_Design_Skill`; check impact of code changes with `/autonomous-qe:generate-dsm`.
<!-- generated:end -->
