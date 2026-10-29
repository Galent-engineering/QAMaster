---
name: "Domain_Test_Design_Skill-Test-Regression"
description: "Regression testing sub-skill of Domain_Test_Design_Skill: impact analysis, layered suites (smoke, sanity, core, full), risk-based and change-based selection, defect-driven regression, suite maintenance and flakiness control, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating regression tests for any application or domain."
---

# Regression testing (sub-skill of Domain_Test_Design_Skill)

Regression testing proves that behaviour which should not have changed still works after a change: code, configuration, data, infrastructure, dependency or third-party updates. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Detect unintended side effects of changes.
- Select the smallest suite that gives enough confidence for the risk of the change.
- Keep a living, trustworthy regression suite (no obsolete, duplicate or flaky cases).
- Covers functional, API, integration and key non-functional baselines (performance and accessibility smoke).

## When to apply
- Every build (smoke), every merge to the main branch (sanity on affected areas), every release (core), major releases/platform upgrades (full).
- After configuration changes, data migrations, dependency/library upgrades, browser/OS updates, vendor releases (e.g. Salesforce seasonal releases), infrastructure changes.
- After defect fixes (defect-driven regression).

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ● (contract regression) |
| Mobile | ● (OS and device updates) |
| Desktop | ● (installer, OS updates) |
| Cloud / SaaS | ● (continuous deployment, tenant configs) |
| Image-based / AI | ● (model version comparisons) |
| Data platform | ● (pipeline output comparisons) |

## Checklist
**Impact analysis**
- [ ] Map the change → touched modules → dependent modules (use the Design Structure Matrix / dependency graph) → shared data, configuration and integrations.
- [ ] Identify changed APIs/contracts and their consumers.
- [ ] Identify changed calculations, reports and outputs consumed by finance/regulators.
- [ ] Record the selection rationale (why each area is in or out).

**Suite layers**
- [ ] Smoke (15–30 min): application up, login, top 5 business flows, critical integrations, health endpoints.
- [ ] Sanity (targeted): the changed feature and its immediate neighbours.
- [ ] Core regression: all P1/P2 scenarios across modules.
- [ ] Full regression: everything, for major releases.
- [ ] Non-functional baselines: response-time smoke, accessibility smoke on key pages, security headers.

**Always include**
- [ ] Money/quantity calculations and rounding.
- [ ] Authentication, authorisation and data scope.
- [ ] Data persistence and audit trails.
- [ ] Integrations (contract checks) and batch outputs.
- [ ] Reports used by finance, regulators or management.
- [ ] Previously fixed defects (one regression case per fixed defect of severity ≥ medium).

**Comparison techniques**
- [ ] Golden-master / baseline comparison for outputs (reports, files, payroll/bill runs, API responses).
- [ ] Parallel run: old release vs new release on the same data set; differences explained.
- [ ] Visual regression on key pages (ignore dynamic regions).
- [ ] Schema/contract diff for APIs.

**Suite maintenance**
- [ ] Retire obsolete cases; merge duplicates; update for intended changes.
- [ ] Refresh test data; keep tests independent (each test owns its data).
- [ ] Track flaky tests (quarantine with owner and due date; never ignore silently).
- [ ] Tag cases by layer (`@smoke`, `@regression`), component and priority.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Risk-based selection** (impact × likelihood, Domain_Test_Design_Skill-Core-RiskAndData).
- **Change-based / dependency-based selection** using the dependency matrix.
- **Data-flow lifecycle** checks for data touched by the change.
- **State transition** paths through changed objects.
- **Pairwise** for configuration regression.
- **Metamorphic / golden-master** comparisons where exact oracles are expensive.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Smoke flow | Login → open dashboard → create core record | All steps succeed within normal time |
| Unchanged feature | Feature not touched by the release | Same results as the previous baseline |
| Golden output | Monthly report for a fixed data set | Byte/column-level match with the approved baseline |
| Contract | Consumer calls a changed provider | Response satisfies the consumer contract |
| Fixed defect | Re-run the defect's reproduction steps | Correct behaviour; defect not reintroduced |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Validation still enforced | Invalid input on a refactored form | Same validation messages as before |
| Access control still enforced | Unauthorised role after a menu change | Still denied |
| Error handling unchanged | Downstream returns 500 | Same user-facing error and no partial commit |
| Removed feature | Old URL of a removed page | Redirect or 404 as specified, no stack trace |
| Deprecated API version | Call v1 after v2 release | Works until sunset date, or documented error |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Limits after refactor | Max length and max amount of changed fields | Same limits as specified |
| Period boundaries | Month-end/year-end run after the release | Outputs match baseline for boundary dates |
| Volume | Largest customer/tenant data set | No timeout, correct totals |
| Version boundary | Data created before and after upgrade | Both readable and editable |
| Configuration extremes | Minimum and maximum config values | Behaviour unchanged vs baseline |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Top business journeys | Top 5 journeys by usage | All pass end to end |
| Cross-system flow | Order to invoice across systems | Values consistent in each system |
| Batch chain | Nightly jobs in sequence | Each job completes, outputs reconcile |
| Upgrade path | Upgrade from previous version with existing data | Data intact; flows still work |
| Multi-channel | Same action on web and mobile | Same outcome |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Statutory output | Tax/payroll/billing run after release | Matches parallel run of previous release |
| Peak business day | Month-end close flow | Completes; reports reconcile |
| Key customer configuration | Largest tenant's custom setup | Behaviour unchanged |
| Seasonal vendor release | Salesforce/ERP vendor upgrade in preview sandbox | No behaviour change or changes documented and accepted |
| Policy change | Rule change effective date | Old rule before date, new rule after |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Flaky test investigation | Test fails 1 in 10 runs | Root cause found; fixed or quarantined with owner |
| Legacy data | Records created years ago with old formats | Still displayed and processed |
| Rollback | Deploy then roll back | Data and behaviour return to previous state |
| Feature-flag combinations | Flags on/off around changed code | Each combination behaves as specified |
| Time-dependent logic | Run on DST change or leap day after release | Same results as specified |

## Entry and exit criteria
**Entry**: change list/release notes available, impact analysis done, build deployed, smoke passed, baseline outputs available.
**Exit**: selected suite executed; all failures triaged (product defect, test defect, environment); no open critical regression defects; flaky tests quarantined with owners; selection rationale and results published.

## Metrics
- Regression pass rate per layer; escaped regression defects (found after release).
- Suite execution time per layer (smoke ≤ 30 min target).
- Flaky-test rate and mean time to fix.
- Automation coverage of P1/P2 regression; defect-driven regression coverage (% of fixed defects with a regression case).
- Selection accuracy (defects found in selected vs non-selected areas).

## Tools and automation
- CI pipelines (GitHub Actions, GitLab CI, Azure Pipelines, Jenkins) running layers on triggers.
- Automation folder (<AppName>/): `npm run test:smoke`, `npm run test:regression`, per-component runs with `--grep @feature:<Component>`; Allure history shows trends, new failures and flaky tests; retries configured in `playwright.config.ts`; sharding for speed.
- Impact selection from the DSM: `qam dsm impact <changed files>` impacted screens → run `@feature:` tags of those components.
- Visual regression with Playwright screenshots (`toHaveScreenshot`) on stable pages only.
- Do not automate: one-time migration checks, exploratory regression of new UX.

## Common pitfalls
- Running everything every time (slow feedback) or too little (escaped defects).
- No impact analysis; selection by habit.
- Ignoring flaky tests until the suite is distrusted.
- Baselines not updated for intended changes, causing noise.
- Tests depending on each other or on shared data.

## Related sub-skills
Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Compatibility, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-Domain-Salesforce.
