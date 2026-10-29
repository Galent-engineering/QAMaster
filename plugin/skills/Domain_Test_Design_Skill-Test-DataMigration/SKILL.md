---
name: "Domain_Test_Design_Skill-Test-DataMigration"
description: "Data migration testing sub-skill of Domain_Test_Design_Skill: legacy-to-new system migrations, platform and cloud moves, database upgrades, ETL validation (extract, transform, load), mapping and transformation rules, data quality and cleansing, reconciliation (counts, sums, hashes, field-level sampling), referential integrity, mock migrations and dress rehearsals, cut-over, rollback, delta/incremental loads and post-migration business validation, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating data migration tests for any application or domain."
---

# Data migration testing (sub-skill of Domain_Test_Design_Skill)

Data migration testing proves that data moved from source to target is complete, accurate, consistent and usable by the business, that the migration runs within the cut-over window, and that it can be rolled back. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Migrations: legacy → new application (e.g. core banking, policy admin, EHR, HRMS, CRM → Salesforce), on-premises → cloud, database engine/version changes, tenant merges/splits, mergers and acquisitions, archive moves.
- ETL validation: extraction completeness, transformation rules, load correctness, rejects and error handling.
- Reconciliation at record, field, aggregate and business level; referential integrity; history and audit preservation.
- Operational readiness: performance of the migration, cut-over runbook, rollback, delta loads, post-go-live validation.
- Ongoing pipelines (data warehouses, lakes) are covered with Domain_Test_Design_Skill-App-DataPlatform; this sub-skill focuses on one-time or phased migrations and their ETL.

## When to apply
- Any system replacement, consolidation, upgrade with schema change, cloud move or data-centre exit.
- Regulated data (financial balances, patient records, policies, payroll history, GxP records) where loss or alteration has legal impact.

| Application type | Relevance |
|---|---|
| Web | ◐ (back-end data behind the UI) |
| API / microservices | ◐ (API-based loads) |
| Mobile | ○ (local data upgrades only) |
| Desktop | ◐ (local DB/file format upgrades) |
| Cloud / SaaS | ● (onboarding/import, tenant moves) |
| Image-based / AI | ◐ (document/image archives, metadata) |
| Data platform | ● |

## Checklist
**Planning and analysis**
- [ ] Migration scope: entities, history depth (e.g. 7 years), active vs closed records, attachments/documents, audit trails.
- [ ] Data profiling of the source: volumes, nulls, duplicates, invalid values, orphan records, encodings, date ranges, outliers.
- [ ] Source-to-target mapping specification per field: transformation, default, lookup/code mapping, derivation, cleansing rule, owner.
- [ ] Data cleansing decisions (fix at source, fix in transformation, migrate as-is, exclude) agreed with business owners.
- [ ] Migration approach: big bang vs phased vs parallel run; trickle/delta strategy; freeze period.
- [ ] Reconciliation design: which counts, sums, hashes and samples prove success per entity.
- [ ] Data protection: masked or synthetic copies for test cycles; production data handled only in approved environments.

**Extraction**
- [ ] All in-scope records extracted (count by entity, status, period); filters correct; no truncation; encodings preserved.
- [ ] Extract timing consistent (point-in-time snapshot; no records changed mid-extract).

**Transformation**
- [ ] Each mapping rule tested with representative and edge values (decision tables for complex rules).
- [ ] Code/value translations complete (no unmapped codes); default values applied only where specified.
- [ ] Data type conversions: numbers (precision/scale, rounding), dates and time zones, booleans, currencies, units.
- [ ] Concatenation/splitting (names, addresses), normalisation and de-duplication (survivorship rules for merged records).
- [ ] Derived/calculated fields (balances, ages, accruals) match independent calculations.

**Load**
- [ ] Records loaded = records extracted − documented rejects; rejects logged with reasons and reprocessable.
- [ ] Keys: new ids generated; cross-reference (old id → new id) table complete; no collisions.
- [ ] Referential integrity: parent-child relationships, foreign keys, many-to-many links preserved; no orphans.
- [ ] Constraints, triggers, workflows and notifications disabled/enabled as planned (no emails to customers during load).
- [ ] Attachments/documents migrated with metadata and readable content; checksums match.
- [ ] Audit fields (created by/date) preserved or mapped per policy; history records preserved.

**Reconciliation**
- [ ] Row counts per entity and per partition (status, branch, product, year).
- [ ] Aggregates: sums of balances/amounts, min/max dates, distinct counts by key attributes.
- [ ] Hash/checksum comparison of normalised records (e.g. MD5/SHA of concatenated mapped fields) for full-volume field-level comparison.
- [ ] Statistical/random sampling plus targeted samples (VIP customers, complex cases, edge records) compared field by field and through the target UI.
- [ ] Business reconciliation: trial balance, GL totals, open orders, outstanding claims, leave balances, policy counts match source reports.

**Business validation in the target**
- [ ] Migrated records usable: view, edit, process next transaction (e.g. post payment to migrated loan, renew migrated policy, run payroll for migrated employee).
- [ ] Reports and dashboards in the target match equivalent source reports.
- [ ] Security: migrated users/roles/permissions correct; data scope per role; no over-privileged migrated accounts.
- [ ] Integrations using migrated data work (ids, reference data).

**Non-functional and operational**
- [ ] Migration run time per entity at full volume fits the cut-over window (with contingency).
- [ ] Restartability: resume after failure without duplicates; idempotent re-runs.
- [ ] Rollback tested: restore source as system of record, revert target, communication plan.
- [ ] Delta/incremental migration between mock runs and go-live; change capture accuracy.
- [ ] Cut-over runbook rehearsed end to end (dress rehearsal with timings and go/no-go checkpoints).
- [ ] Target performance with migrated full volume (indexes, statistics updated).

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Data profiling** and **domain analysis** of source values to find classes and anomalies.
- **Equivalence partitioning** of records by type, status, product, region, age; select samples from every partition.
- **Boundary value analysis**: oldest/newest records, max field lengths, max precision, extreme balances, maximum children per parent.
- **Decision tables** for mapping and survivorship rules.
- **Data-flow testing** from source column to target column through each transformation.
- **Metamorphic / reconciliation oracles**: invariants (sum of balances, count of active customers) that must hold before and after.
- **Error guessing** with known legacy-data problems (dummy dates 01/01/1900, "N/A" in numeric fields, trailing spaces, mixed encodings).

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Entity completeness | Migrate 1 250 000 customers | Target count = 1 250 000 − documented rejects; reject file lists each with reason |
| Field mapping | Legacy status "A" → target "Active" | All "A" records show "Active"; distribution of statuses equals source |
| Balance reconciliation | Sum of loan outstanding balances by product | Totals equal to the cent per product and in total |
| Document migration | 3 M PDF attachments | Counts and checksums match; sampled documents open in target UI |
| Usability after migration | Post a repayment to a migrated loan | Repayment accepted; schedule and balance correct |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Unmapped code | Source product code not in mapping table | Record rejected (or mapped to agreed default) and reported; load continues |
| Invalid data | Date of birth "31/02/1980" | Rejected or cleansed per rule; listed in exception report |
| Orphan child | Transaction whose account does not exist | Rejected with reason; no orphan in target |
| Duplicate source records | Same customer twice with different ids | De-duplicated per survivorship rule or flagged for manual merge |
| Constraint violation | Mandatory target field empty in source | Default applied only if specified; otherwise rejected with reason |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Field length | Source address 255 chars → target 200 | Truncation/split per spec; truncated records reported |
| Numeric precision | 6-decimal interest rate into 4-decimal field | Rounded per rule; reconciled within agreed tolerance (or zero tolerance for money) |
| Date range | Records dated 1900-01-01 and 9999-12-31 | Handled per cleansing rule; not shifted by time zone |
| Volume | Largest customer with 500 000 transactions | Migrated completely within the run window |
| History depth | Records exactly at and beyond the retention cut-off | At cut-off migrated; older archived/excluded per scope |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Mock migration cycle | Extract → transform → load → reconcile on full masked copy | All reconciliation checks green; timings recorded |
| Dress rehearsal | Full cut-over runbook with production-size data | Completed within window; go/no-go checkpoints passed |
| Delta load | Changes after initial load applied before go-live | Inserts/updates/deletes reflected; no duplicates |
| Parallel run | Run payroll/billing in legacy and target for same period | Outputs equal or differences explained and accepted |
| Rollback | Abort at checkpoint 3 and roll back | Legacy back as system of record; no data loss; target cleaned |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Financial close continuity | Migrate at month-end | Opening balances in target = closing balances in legacy |
| Customer experience | Migrated customer logs into new portal | Sees correct profile, products, history; no forced re-registration (unless planned) |
| In-flight transactions | Pending approvals/claims/orders at cut-over | Completed in legacy, migrated with state, or re-created per plan; none lost |
| Regulatory records | Audit trail of GxP/financial records | History preserved with original timestamps and users; read-only as required |
| Payroll history | Year-to-date earnings and tax | YTD values in target match legacy; next payroll correct |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Special characters/encoding | Names with diacritics from EBCDIC/Latin-1 source | Correct Unicode in target; no mojibake |
| Time zone shifts | Timestamps stored without zone in legacy | Converted per rule; dates do not move a day |
| Restart after failure | Load fails at 60 % | Restart resumes; final counts correct; no duplicates |
| Soft-deleted/archived source data | Records flagged deleted in legacy | Excluded or migrated as archived per scope |
| Circular references | Accounts referencing each other (guarantor links) | Loaded in correct order or two-pass; links intact |

## Entry and exit criteria
**Entry**: migration scope and mapping specification signed off; source profiling done; reconciliation rules agreed; masked full-volume test data; target configuration (reference data, codes) complete; migration tooling built.
**Exit**: at least two successful mock migrations and one dress rehearsal; all reconciliation checks pass (zero tolerance for financial/regulated data unless signed off); rejects resolved or accepted by data owners; business validation signed off; run time within window; rollback rehearsed; go/no-go criteria met.

## Metrics
- Records migrated, rejected, reconciled per entity (counts and %); field-level mismatch rate.
- Aggregate reconciliation breaks (count and value).
- Data-quality issues found in source by category; cleansing progress.
- Migration duration per entity per mock run (trend towards window).
- Business validation pass rate; post-go-live data incidents.

## Tools and automation
- ETL/migration tools: Informatica, Talend, Azure Data Factory, AWS DMS, SSIS, Salesforce Data Loader/Data Import Wizard, dbt; validation: Great Expectations, Soda, Deequ, QuerySurge, Datagaps, SQL diff/compare tools, custom Python (pandas/PySpark) reconciliation scripts.
- Reconciliation SQL patterns: counts by partition (`GROUP BY`), aggregate sums, `EXCEPT`/`MINUS` set differences on mapped columns, hash comparisons.
- Automation folder (<AppName>/): business validation of migrated records through the target UI and APIs using a sample list (`test-data/migration-sample.json` of source ids → expected target values) in a Scenario Outline; API services read target records and compare to expected values; tag `@migration @feature:<Entity>`; reconciliation reports attached to Allure. Bulk reconciliation stays in SQL/Python, not in browser tests.
- Do not automate through the UI: full-volume comparisons (use SQL/hash-based tools).

## Common pitfalls
- Counting rows only; no field-level or business reconciliation.
- Testing on small, clean subsets instead of full-volume, production-like (masked) data.
- Mapping specification untested against real legacy data quirks.
- No rollback rehearsal; cut-over timings never measured.
- Forgetting in-flight transactions, attachments, history and user permissions.
- Triggers/notifications left on during load, sending emails to real customers.

## Related sub-skills
Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-Insurance, Domain_Test_Design_Skill-Domain-HRM, Domain_Test_Design_Skill-Domain-Salesforce, Domain_Test_Design_Skill-Domain-LifeSciences.
