---
name: AUT_Shop
description: "Knowledge base and router for the Shop application under test (AUT). _(one sentence: what the application is, for whom; it is also used in this skill's description)_ 12 screens in 7 components: Admin, Cart, Checkout, Help, Home, Login, Products. Application understanding, UI elements, page navigation, component dependencies (from the Design Structure Matrix) and end-to-end business cases. Use for any QA task on Shop: understanding the application, writing, reviewing or automating test cases, regression and impact analysis, defect triage. Routes to the AUT_Shop-{Component} sub-skills."
---

# Shop — application under test (AUT)

<!-- curated:start (written by Claude / QA from the source code; kept on regeneration) -->
## Application overview
Summary: _(one sentence: what the application is, for whom; it is also used in this skill's description)_

_Not written yet. Claude (AUT-Skill-Builder): from the source code (via the code-repository MCP server or the local
clones) and the generated facts below, describe the business domain, user roles and permissions, the main business
objects, environments, and how the components work together. Cite `file:line`; mark inferred statements **(inferred)**._

## Key end-to-end business cases
_Not written yet. The application's most important business flows across components (name · persona · steps across
components · expected outcome · sub-skills involved), built from the cross-module journeys and the component
dependency matrix below._
<!-- curated:end -->

<!-- generated:start (facts from the Design Structure Matrix; rewritten on regeneration, do not edit) -->
## Facts from the Design Structure Matrix
_DSM built 2026-10-29T07:21:47+00:00 from shop@cccccccc; skill generated 2026-10-29 11:16 UTC._

- Application: http://shop.test/
- 13 screens, 14 navigations, 27 UI elements, 2 navigation cycles
- Interactive matrix: `dsm/index.html` (skill `Design-Structure-Matrix`)

### Components (sub-skills)

| Component | Sub-skill | Screens | Forms | Main screens |
|---|---|---|---|---|
| Admin | [AUT_Shop-Admin](../AUT_Shop-Admin/SKILL.md) | 3 | 0 | `/admin/audit`, `/admin/reports`, `/admin` |
| Cart | [AUT_Shop-Cart](../AUT_Shop-Cart/SKILL.md) | 1 | 1 | `/cart` |
| Checkout | [AUT_Shop-Checkout](../AUT_Shop-Checkout/SKILL.md) | 2 | 1 | `/checkout`, `/checkout/review` |
| Help | [AUT_Shop-Help](../AUT_Shop-Help/SKILL.md) | 1 | 0 | `/#/help` |
| Home | [AUT_Shop-Home](../AUT_Shop-Home/SKILL.md) | 1 | 0 | `/` |
| Login | [AUT_Shop-Login](../AUT_Shop-Login/SKILL.md) | 1 | 0 | `/login` |
| Products | [AUT_Shop-Products](../AUT_Shop-Products/SKILL.md) | 2 | 0 | `/products`, `/products/:id` |

### Component dependency matrix (row navigates to column; from the DSM)

| | Admin | Cart | Checkout | Help | Home | Login | Products |
|---|---|---|---|---|---|---|---|
| **Admin** | · |  |  |  |  |  |  |
| **Cart** |  | · | 1 |  |  |  | 1 |
| **Checkout** |  |  | · |  |  |  |  |
| **Help** |  |  |  | · |  |  |  |
| **Home** |  |  |  | 1 | · | 1 | 1 |
| **Login** |  |  |  |  | 1 | · |  |
| **Products** |  | 2 |  |  |  |  | · |

### Cross-component journeys (candidates for end-to-end tests)

1. `/` → ("Products") `/products` → ("Cart") `/cart` → ("POST checkout") `/checkout`  _(components: Home, Products, Cart, Checkout)_
2. `/` → ("Help") `/#/help`  _(components: Home, Help)_
3. `/` → ("Sign in") `/login`  _(components: Home, Login)_
4. `/` → ("Products") `/products` → ("Item 1") `/products/:id`  _(components: Home, Products)_

### Most reached screens (smoke / regression candidates)

- `/cart` (Cart): reached from 3 screens
- `/products` (Products): reached from 2 screens
- `/` (Home): reached from 1 screens
- `/products/:id` (Products): reached from 1 screens
- `/checkout` (Checkout): reached from 1 screens
- `/checkout/review` (Checkout): reached from 1 screens
- `/login` (Login): reached from 1 screens
- `/#/help` (Help): reached from 1 screens

### Coverage gaps
- **code-only** (2): `/admin`, `/admin/reports`
- **unresolved** (2): `/faq`, `/admin/audit`
- **broken** (1): `/checkout/review`

### Routing
- Questions about one component → its `AUT_Shop-<Component>` sub-skill.
- Navigation, dependencies, impact of a code change → `Design-Structure-Matrix` / `/autonomous-qe:generate-dsm`.
- Test scenario design → `Domain_Test_Design_Skill`; locators → `UI-Locator-Sync`.
- Refresh these skills → `AUT-Skill-Builder` (also triggered by the hook `the aut-skill-gen hook of the plugin`).
<!-- generated:end -->
