---
name: "Domain_Test_Design_Skill-Core-RiskAndData"
description: "Core sub-skill of Domain_Test_Design_Skill for risk-based prioritisation (impact × likelihood scoring, P1–P4, always-P1 areas, smoke/sanity/regression tagging, automation candidacy) and test data strategy (data classes, privacy-safe synthetic and masked data, domain test ranges, data independence, environment and data refresh). Use when prioritising scenarios, selecting a smoke or regression set, deciding what to automate, or specifying test data for any domain or application type."
---

# Risk-based prioritisation and test data (sub-skill of Domain_Test_Design_Skill)

Decides **what runs first** and **with which data**. Apply after scenarios are designed (Domain_Test_Design_Skill-Core-Techniques) and before output (Domain_Test_Design_Skill-Core-OutputAndQuality).

## Risk scoring

**Impact (1–5):** 5 = financial loss / patient safety / regulatory breach / data breach; 4 = core business flow blocked; 3 = major feature degraded with workaround; 2 = minor feature; 1 = cosmetic.

**Likelihood (1–5):** 5 = new/complex/changed code, many integrations, historical defects; 4 = changed with dependencies; 3 = moderate change; 2 = minor change; 1 = stable, unchanged, simple.

**Risk score = Impact × Likelihood**

| Score | Priority | Execution |
|---|---|---|
| 20–25 | P1 – Critical | Every build; smoke/sanity; automate first |
| 12–19 | P2 – High | Every release regression |
| 6–11 | P3 – Medium | Major releases / rotation |
| 1–5 | P4 – Low | Exploratory or as time permits |

**Always P1 regardless of score:** money movement, calculations feeding statutory/regulatory output, authentication & authorization, patient-safety alerts, data privacy controls, audit trails in regulated systems, tenant isolation in SaaS.

### Likelihood signals
- Changed code or configuration in the release (from the DSM / repository change list).
- Number of integrations touched; shared components (many dependants in the DSM).
- Defect history and production incidents for the area.
- Complexity: many rules, states, roles, locales.
- New team / new technology / first release.

### Suite tagging
| Tag | Content | Size guide |
|---|---|---|
| `@smoke` | App up, login, top 5 business flows, critical integrations | 15–30 min |
| `@sanity` | Changed feature + immediate neighbours | Per change |
| `@regression` | All P1/P2 | Per release |
| `@full` | Everything | Major releases |

### Automation candidacy
| Automate | Keep manual / exploratory |
|---|---|
| Repetitive, stable, high-risk, data-driven | One-off, UX-subjective, highly volatile |
| Calculations with exact oracles | Visual aesthetics, first-impression usability |
| API contracts, permissions matrices | Screen-reader experience (assistive tech walkthroughs) |
| Regression of fixed defects | Exploratory charters on new features |

## Test data strategy

| Data class | Description | Example |
|---|---|---|
| Valid nominal | Typical correct values | Amount 1 000.00, age 35 |
| Valid boundary | At limits | Amount = daily limit, age = 18 |
| Invalid boundary | Just outside limits | Amount = limit + 0.01, age = 17 y 364 d |
| Invalid format | Breaks syntax | Email without @, IBAN wrong checksum |
| Special characters / Unicode | Encoding, injection, i18n | O'Brien, José, 张伟, محمد, emoji |
| Empty / null / whitespace | Absence | "", null, "   " |
| Volume | Large counts/sizes | 100 000 rows, 50 MB file |
| State-specific | Objects in each lifecycle state | Active, suspended, closed, lapsed |
| Role-specific | Users per role and data scope | Admin, manager, employee, auditor, guest |
| Temporal | Date/time edge values | 29 Feb, 31 Dec 23:59:59, DST shift |
| Localised | Per-locale formats | 1.234,56 €, ١٢٣ |
| Synthetic / masked | Privacy-safe | Generated PII; masked production copies |
| Historical / legacy | Records created by older versions | Pre-migration records, deprecated codes |
| Referential | Linked data across systems | Customer + accounts + transactions consistent |

### Rules
- **Never** use real production PII/PHI/PCI data in non-production without approved masking.
- Use domain-reserved test ranges: payment-scheme test card numbers, test MSISDN ranges, sandbox IBANs, test NPIs, sandbox GDS/PNR environments.
- Make data **independent** (each test creates or owns its data) or provide a reset/refresh mechanism.
- Document data dependencies in each test case's preconditions.
- Keep secrets (passwords, API keys) out of test data files: use environment variables / secret stores.
- Version the test data with the tests; keep generators deterministic (seeded).

### Data provisioning patterns
| Pattern | Use when | Notes |
|---|---|---|
| API seeding in setup | Fast, isolated tests | Preferred for UI tests: create via API, verify via UI |
| Fixtures / factories | Repeated object shapes | Builders with sensible defaults + overrides |
| Golden data set | Calculations and reports | Expected values computed independently and reviewed |
| Masked production subset | Realistic volume / legacy combos | Needs approval; referential integrity preserved |
| Synthetic at volume | Performance, migration | Distribution matches production profile |
| Service virtualisation | Unavailable third parties | Record/replay or contract-based stubs |

### Environment considerations
- Clock control (fixed dates) for date-dependent rules: cut-offs, ageing, renewals.
- Feature flags and configuration captured per run.
- Data refresh cadence and ownership agreed; shared environments need namespaced data (prefix per run).

## Related sub-skills
- Domain_Test_Design_Skill (router), Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-OutputAndQuality
- Domain_Test_Design_Skill-Test-Regression (suite selection), Domain_Test_Design_Skill-Test-DataMigration (data at volume), Domain_Test_Design_Skill-Test-Security (privacy-safe data)
