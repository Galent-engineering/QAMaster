---
name: "Domain_Test_Design_Skill-Core-Techniques"
description: "Core sub-skill of Domain_Test_Design_Skill with the black-box test design techniques (equivalence partitioning, boundary value analysis, decision tables, cause-effect, state transition, use case, pairwise, classification tree, CRUD/permission matrix, error guessing, exploratory, checklist, syntax, domain analysis, metamorphic, data-flow), worked examples, the generic error-guessing list, the six scenario categories (Positive, Negative, Boundary, End-to-end, Business, Edge) and the category-to-technique map. Use when deriving test scenarios from inputs, rules, states or journeys for any application type, domain or test type."
---

# Black-box test design techniques and scenario categories (sub-skill of Domain_Test_Design_Skill)

The method layer of Domain_Test_Design_Skill: *how* to turn a model of the application into scenarios. Domain sub-skills give *what* matters in a business; test-type sub-skills give *which quality* is examined; application-type sub-skills give *where* it runs. This sub-skill is used by all of them.

## Techniques

| # | Technique | When to apply | How (short) |
|---|---|---|---|
| T1 | **Equivalence Partitioning (EP)** | Any input with ranges or classes | Split inputs into valid and invalid classes; one test per class |
| T2 | **Boundary Value Analysis (BVA)** | Numeric, date, length, count, amount limits | 2-value: min-1, min, max, max+1. 3-value: min-1, min, min+1, max-1, max, max+1 (use 3-value for money, dosage, limits) |
| T3 | **Decision Table** | Multiple conditions combine into outcomes | List conditions, enumerate rules (2^n), collapse don't-cares, one test per rule |
| T4 | **Cause–Effect Graphing** | Complex logical rules | Map causes to effects with AND/OR/NOT, constraints (E, I, O, R), derive decision table |
| T5 | **State Transition** | Objects with lifecycles | All states, all valid transitions (0-switch), every invalid event per state, N-switch (1-switch) paths for critical objects |
| T6 | **Use-Case / Scenario Testing** | User goals and journeys | Main success scenario + every alternate + every exception flow |
| T7 | **Pairwise / Combinatorial** | Many parameters with many values | All-pairs; 3-wise for critical combinations; add constraints for impossible combinations |
| T8 | **Classification Tree** | Hierarchical input domains | Build tree of classifications and classes; combine leaves (minimal, pairwise or full) |
| T9 | **CRUD / Permission Matrix** | Multi-role systems | For each object × role, test allowed and denied C/R/U/D, plus data scope (own / team / org / tenant) |
| T10 | **Error Guessing** | Every feature | Apply the domain hotspot lists (domain sub-skills) and the generic list below |
| T11 | **Exploratory (Session-Based)** | New/changed features, UX | Time-boxed charters: "Explore <area> with <resource> to discover <info>"; debrief with notes, bugs, issues |
| T12 | **Checklist-Based** | Standards (WCAG, OWASP, i18n) | Use the checklists in the test-type sub-skills |
| T13 | **Syntax / Format Testing** | IDs, codes, formatted strings | Valid format, each single format violation, encoding variants, checksum failures |
| T14 | **Domain Analysis** | Interacting variables (e.g. age + plan) | ON/OFF/IN/OUT points for each boundary of the combined domain |
| T15 | **Metamorphic Testing** | No exact oracle (search, ML, image processing, calculations at scale) | Assert relations between outputs (rotate image → same OCR text; add filter → result is a subset) |
| T16 | **Data-Flow / Lifecycle (black-box)** | Data created in one place, used elsewhere | Create → read in every consumer → update → propagate → archive/delete → verify absence |
| T17 | **Risk-Based / Failure-Mode (FMEA-lite)** | Critical flows | List failure modes per step, rate severity × likelihood, design one test per significant mode |
| T18 | **Persona / Journey Testing** | Business scenarios, UX | Define persona goals, constraints and context; walk the journey end to end across channels |
| T19 | **Random / Property-Based (black-box)** | Parsers, calculators, APIs | Generate many valid/invalid inputs; assert invariants (no 500, totals balance, round-trip equality) |

## Worked examples

**EP + BVA — loan amount 1 000.00 to 50 000.00, 2 decimals**
- Valid class: 1 000.00–50 000.00; invalid: < 1 000.00, > 50 000.00, non-numeric, 3 decimals, negative, empty.
- BVA (3-value): 999.99, 1 000.00, 1 000.01, 49 999.99, 50 000.00, 50 000.01.

**Decision table — free shipping**
| Rule | Member | Order ≥ 50 | Remote area | Result |
|---|---|---|---|---|
| R1 | Y | – | N | Free |
| R2 | N | Y | N | Free |
| R3 | N | N | N | Charge |
| R4 | – | – | Y | Charge remote fee |
One test per rule (R1 uses order 10 to prove membership alone grants it).

**State transition — order**
States: Draft → Submitted → Approved → Shipped → Delivered; Cancelled from Draft/Submitted/Approved; Returned from Delivered.
- 0-switch: each arrow once. Invalid: Ship a Draft, Cancel a Delivered, Approve a Cancelled.
- 1-switch for critical paths: Submitted→Approved→Cancelled (refund triggered?).

**Pairwise — browser (4) × OS (3) × role (3) × locale (3)** = 108 full combinations → ~12–16 pairwise rows covering every pair at least once.

**CRUD / permission matrix**
| Object \ Role | Admin | Manager | Employee | Auditor |
|---|---|---|---|---|
| Employee record | CRUD | RU (team) | R (self), U (contact) | R |
Test every cell allowed *and* every denied cell, in UI and API.

**Metamorphic — search**: results for "shoes" filtered by brand X ⊆ results for "shoes"; sort ascending then reverse = sort descending; adding a stop word doesn't change the top results.

## Generic error-guessing list (apply everywhere)
- Empty, null, whitespace-only, very long strings, leading/trailing spaces, Unicode, emoji, RTL text, zero-width characters, combining characters.
- Special characters: `' " < > & ; -- /* */ % _ \ $ { } | ^ ~`, SQL/HTML/script fragments, CSV formula prefixes `= + - @`.
- Numbers: 0, -0, negative, decimals, many decimals, scientific notation, max int, overflow, NaN/Infinity, locale separators (`1,234.56` vs `1.234,56`).
- Dates: 29 Feb, 31st on 30-day months, year end, DST change, time-zone crossing, far past/future, epoch, 2038, invalid formats, two-digit years.
- Double submit, back button after submit, refresh during processing, session timeout mid-flow, multiple tabs, deep link into a mid-flow step.
- Concurrent update of the same record by two users; delete while another user edits.
- Network drop, slow network, retries, partial failures from downstream, out-of-order responses.
- Copy-paste input, auto-fill, browser zoom 200–400 %.
- File upload: 0-byte, max size, max+1, wrong extension, renamed extension, corrupted, password-protected, malware test file (EICAR), duplicate name, long file name, Unicode file name.
- Pagination/sorting/filtering at 0, 1, page-size, page-size+1 records; last page after deletion.
- Configuration: missing config, default config, config changed mid-transaction.
- Permissions changed while the user is logged in.

## Scenario categories

Every key workflow gets scenarios in **all six** categories where meaningful.

| Category | Code | Definition | Design focus | Typical techniques |
|---|---|---|---|---|
| **Positive** | POS | Valid input and valid state; system behaves as specified | Happy path, each valid equivalence class, each valid rule | EP, decision table, use case |
| **Negative** | NEG | Invalid input, unauthorised action, invalid state; system rejects gracefully | Correct error message, no data corruption, no partial commit, secure failure | EP (invalid), error guessing, CRUD/permission, syntax |
| **Boundary** | BVA | Values at, just inside and just outside limits | Amounts, lengths, dates, counts, rates, time windows, quotas | BVA, domain analysis |
| **End-to-End** | E2E | Full flow across modules, channels and integrated systems | Data correctness at each hop, final business outcome, notifications, reports | Use case, data-flow, state transition |
| **Business Scenario / Use Case** | BUS | Realistic story of a persona reaching a business goal | Business value, rules in context, multi-step decisions | Use case, persona, decision table |
| **Edge Condition** | EDG | Rare but valid situations, unusual timing, extreme configurations | Leap years, cut-offs, concurrency, mid-cycle changes, legacy data, max volumes | Error guessing, N-switch, exploratory |

**Expected-result rule:** every scenario states an observable, verifiable outcome (UI message, status, value, record, event, response code, log/audit entry, notification). "Works fine" or "as expected" is not an expected result.

### Category × technique map
| Category | Primary techniques | Secondary |
|---|---|---|
| Positive | EP (valid), decision table, use case main flow | Pairwise |
| Negative | EP (invalid), error guessing, CRUD/permission, syntax testing | State transition (invalid) |
| Boundary | BVA, domain analysis | Decision table on limits |
| E2E | Use case, data-flow lifecycle, state transition | Integration mapping |
| Business | Use case alternates, persona journeys, decision tables | Exploratory |
| Edge | Error guessing, N-switch state transition, timing/concurrency | Metamorphic, exploratory |

## Models that feed the techniques

| Model | Use for | Feeds technique |
|---|---|---|
| Input/field inventory (field, type, mandatory, min, max, format, default) | Forms, APIs | EP, BVA, syntax |
| Business rule table (conditions → actions) | Calculations, eligibility | Decision tables, cause-effect |
| State diagram (object lifecycle) | Orders, claims, policies, tickets, loans | State transition |
| Use-case / journey map | End-to-end flows | Use case, E2E, persona |
| CRUD matrix (object × role × C/R/U/D) | Access control, data integrity | CRUD/permission |
| Integration / data-flow map | APIs, batch, events | Contract, data-flow |
| Parameter matrix (browser × OS × locale × role …) | Compatibility, configuration | Pairwise, classification tree |

## Related sub-skills
- Domain_Test_Design_Skill (router and procedure)
- Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Core-OutputAndQuality
- Test-type sub-skills (Domain_Test_Design_Skill-Test-*) for checklists; domain sub-skills (Domain_Test_Design_Skill-Domain-*) for hotspots.
