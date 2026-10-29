---
name: "Domain_Test_Design_Skill-Test-Functional"
description: "Functional testing sub-skill of Domain_Test_Design_Skill: requirement and business-rule verification (field validation, calculations, state transitions, roles, CRUD, search/filter/export, notifications, batch jobs, reports, configuration), checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating functional tests for any application or domain."
---

# Functional testing (sub-skill of Domain_Test_Design_Skill)

Functional testing proves that every feature does what the requirements, acceptance criteria and business rules say, for every role, input class and object state. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Verify features against requirements, user stories, acceptance criteria, business rules and regulations.
- Cover inputs (valid/invalid classes, limits), outputs (screens, records, files, messages), state changes and side effects (audit, notifications, downstream calls).
- In scope: UI and API behaviour, calculations, workflows and approvals, role-based behaviour, data persistence, reports and exports, batch/scheduled jobs, configuration-driven behaviour.
- Out of scope (own sub-skills): performance, security attacks, accessibility conformance, localisation, compatibility matrices.

## When to apply
- Every new feature, change request, defect fix and configuration change.
- Before regression selection (functional cases become the regression base).
- Highest weight where money, statutory output, safety or legal records are produced.

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ● |
| Mobile | ● |
| Desktop | ● |
| Cloud / SaaS | ● |
| Image-based / AI | ● (accuracy oracles) |
| Data platform | ● (transformation rules) |

## Checklist
**Requirements coverage**
- [ ] Every acceptance criterion has at least one positive and one negative scenario.
- [ ] Every business rule has a decision-table or formula-based test with an independently computed expected value (show the formula in the test).
- [ ] Assumed rules (not in requirements) are marked "assumed" and listed as open questions.

**Field and form validation**
- [ ] Mandatory, optional, conditional-mandatory and dependent fields.
- [ ] Data type, length (min/max), format/pattern, range, precision/scale, allowed values (enums, dropdown sources).
- [ ] Uniqueness, duplicates, case sensitivity, trimming of leading/trailing spaces.
- [ ] Defaults, pre-population, read-only/disabled states, cascading dropdowns.
- [ ] Cross-field rules (start ≤ end date, total = sum of parts, password confirmation).
- [ ] Server-side validation mirrors client-side validation (bypassed client checks are still rejected).

**Business logic and calculations**
- [ ] Formulas with nominal, boundary and zero values; rounding mode and precision.
- [ ] Proration, accrual, tiers/slabs, caps and floors, tax/fee components.
- [ ] Date logic: calendars, working days, cut-offs, time zones, leap years.
- [ ] Eligibility and decision rules (every rule column of the decision table).

**State and workflow**
- [ ] Every valid state transition, every invalid transition attempt, terminal states.
- [ ] Approval chains: single/multi-level, delegation, rejection, resubmission, escalation, timeouts.
- [ ] Maker-checker / segregation of duties.
- [ ] Concurrency: two users acting on the same object.

**Roles and data scope**
- [ ] Menus, buttons, fields and actions visible/enabled per role.
- [ ] Data scope per role (own records, team, region, entity, tenant).
- [ ] Field-level masking for sensitive data.

**Data lifecycle (CRUD)**
- [ ] Create, read, update, delete, soft-delete and restore for each business object.
- [ ] Audit trail entries (who, what, when, old → new value, reason).
- [ ] Referential integrity: deleting a parent with children, orphan prevention.

**Search, list and export**
- [ ] Search by each criterion, combined criteria, partial match, no results.
- [ ] Sort (each column, asc/desc, stable), filter, pagination (0, 1, page size, page size + 1, last page).
- [ ] Export CSV/XLSX/PDF: column set, values, formats, totals match the screen; large exports.
- [ ] Import: template validation, partial failures, error report, idempotent re-import.

**Notifications and outputs**
- [ ] Email/SMS/push/in-app: trigger, recipient, content, placeholders resolved, timing, unsubscribe.
- [ ] Documents and letters: template, data merge, numbering, signatures, PDF properties.

**Batch, schedulers and integrations**
- [ ] Trigger (time, event, manual), input selection, output, rerun/idempotency, partial failure, logs.
- [ ] Downstream effects visible in the consuming system.

**Reports and dashboards**
- [ ] Totals reconcile with transactional data; filters and drill-downs consistent.
- [ ] Period boundaries (month end, financial year end).

**Configuration**
- [ ] Each configuration value changes the behaviour as specified; defaults; invalid configuration rejected.
- [ ] Feature flags on/off.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Equivalence partitioning** for every input (valid classes, invalid classes).
- **Boundary value analysis** for lengths, amounts, dates, counts (min−1, min, max, max+1).
- **Decision tables / cause-effect** for eligibility, pricing, approval routing.
- **State transition testing** for objects with lifecycles (0-switch for all transitions, invalid transitions, N-switch for critical objects).
- **Use-case testing** for main, alternate and exception flows.
- **CRUD/permission matrix** (object × role × C/R/U/D).
- **Pairwise** for combinations of configuration options.
- **Error guessing** with the generic error list.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Happy path per acceptance criterion | Create an order with valid customer, items and address | Order saved with status "Created", number shown, audit entry written |
| Each valid equivalence class | Pay by card, wallet, bank transfer | Each method completes and the payment record shows the method used |
| Calculation with nominal values | Salary 50 000, 22 of 22 days worked | Net pay equals the formula result to 2 decimals |
| Role-allowed action | Approver approves a pending request | Status "Approved", requester notified, approver and timestamp recorded |
| Configuration on | Enable "auto-approve under 1 000" and submit 900 | Request auto-approved without an approver task |
| Search and export | Filter by date range and export CSV | CSV rows and totals equal the on-screen list |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Missing mandatory field | Save without email | Field-level message "Email is required"; nothing saved |
| Invalid format | Email "abc@" | Validation message; focus on the field; other input preserved |
| Invalid state transition | Cancel an already shipped order | Action unavailable or rejected with reason; status unchanged |
| Role-denied action | Viewer opens the approve URL directly | Access denied page / 403; no state change; attempt audited |
| Duplicate where unique | Second customer with same tax id | Duplicate warning; record not created |
| Tampered request | Change price in request payload | Server recalculates; tampered value ignored |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Length limits | Name at 50, 51 characters (limit 50) | 50 saved; 51 rejected or truncated exactly as specified |
| Numeric limits | Amount at limit − 0.01, limit, limit + 0.01 | Up to the limit accepted; above rejected with the limit shown |
| Date windows | Submission on the last allowed day and the day after | Last day accepted; next day rejected with the window dates |
| Counts | 0, 1, max items in a list | Empty-state message at 0; max accepted; max + 1 blocked |
| Pagination | Page size records, page size + 1 | Second page appears only at page size + 1 |
| Rounding | 0.005 rounding | Rounded per the specified mode (half-up / banker's) |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Lifecycle of a core object | Request → approve → fulfil → close | Each status reached in order; final record complete; audit trail complete |
| Cross-module data flow | Data entered in module A used in module B report | Report shows the value entered in A |
| UI → API → downstream | Submit in UI, verify via API and downstream system | Same values in all three |
| Notification chain | Event triggers email and in-app message | Both delivered with correct content |
| Batch effect | Daily job processes today's records | Records processed once; job log shows counts |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Persona goal | New employee completes onboarding tasks in week one | All tasks complete; employee active; manager notified |
| Mid-cycle change | Price change between quote and order | Order uses the rule-defined price; difference visible |
| Delegation | Approver on leave delegates to deputy | Deputy approves; audit shows "on behalf of" |
| Exception handling | Payment fails then retried | Single successful payment; no duplicate order |
| Period close | Month-end close with pending items | Pending items carried over per rule; close report correct |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Leap day / month end | Schedule on 29 Feb, 31st in 30-day month | Date handled per rule (next valid day or last day) |
| Concurrent edit | Two users save the same record | Second save warned of conflict; no silent overwrite |
| Double submit | Double-click Submit | One record created |
| Session timeout mid-flow | Session expires on step 3 of a wizard | Data preserved or clear message; no partial record |
| Special characters | Name "O'Brien-Łukasz 张" | Stored and displayed unchanged in UI, export and email |
| Very large data | 10 000 line items | Saved and listed within acceptable time; totals correct |

## Entry and exit criteria
**Entry**: requirements/acceptance criteria baselined (or assumptions agreed), build deployed to test environment, smoke passed, test data and accounts per role available, test cases reviewed.
**Exit**: all P1/P2 cases executed; 100 % of acceptance criteria covered; no open critical/high defects (or accepted with sign-off); requirement traceability complete; coverage summary published.

## Metrics
- Requirement / acceptance-criteria coverage (% with ≥1 positive and ≥1 negative case).
- Execution progress and pass rate by module and priority.
- Defect density per module, defect leakage to later phases, reopen rate.
- Business-rule coverage (decision-table rules exercised / total).
- Automation coverage of P1/P2 functional cases.

## Tools and automation
- Test management: Jira/Xray, Zephyr, Azure Test Plans, TestRail; traceability via requirement links.
- In the application's automation folder (<AppName>/): one feature per component under `features/web|api|mobile-web|native/`, tags `@feature:<Component> @TC-<id> @smoke|@regression @severity:<level>`; page-specific steps in `steps/pages/<page>.page.steps.ts`; page objects extend `BasePage` with locators from `src/web/locators/<page>.page.locators.ts`; API checks through `src/api/services` and `ApiResponse.validate(schema)`; data via `test-data/` and `DataGenerator`; cleanup with `ctx.onCleanup`; results in Allure.
- Automate: stable, repeatable, high-risk and data-driven cases (Scenario Outline / Examples for EP/BVA tables).
- Keep manual / exploratory: volatile UI, one-off checks, subjective content review.

## Common pitfalls
- Expected results like "works fine" instead of observable outcomes.
- Only happy paths; no invalid classes, no boundaries, no invalid state transitions.
- Expected calculation values copied from the application instead of computed independently.
- Ignoring roles and data scope.
- Not verifying side effects (audit, notifications, downstream records).
- Shared mutable test data causing order-dependent failures.

## Related sub-skills
Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Core-OutputAndQuality, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-API, and the Domain_Test_Design_Skill-Domain-* sub-skill for the application's domain.
