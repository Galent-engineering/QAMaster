---
name: "Domain_Test_Design_Skill-App-DataPlatform"
description: "Data platform application-type test design sub-skill of Domain_Test_Design_Skill for data warehouses, data lakes and lakehouses, ETL/ELT pipelines, streaming pipelines, BI dashboards and reports: detection signals, focus areas (completeness, accuracy, transformations, reconciliation, data quality rules, SCD, late/duplicate data, schema drift, lineage, freshness SLAs), checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, test-type applicability, tooling and pitfalls. Use when the application under test moves, transforms or reports data, or when Domain_Test_Design_Skill routes a data or reporting application here."
---

# Data platforms, pipelines and reporting (sub-skill of Domain_Test_Design_Skill)

Test design for systems whose product is data: ETL/ELT jobs, streaming, warehouses, lakehouses and BI reports. Pairs with Domain_Test_Design_Skill-Test-DataMigration for one-off migrations.

## Detection signals
- Airflow/ADF/Glue/dbt/Informatica/SSIS/Databricks/Snowflake/BigQuery/Synapse/Kafka Streams code or configs.
- Star schemas, fact/dimension tables, Power BI / Tableau / Looker reports, scheduled jobs.

## Focus areas
| Area | What to verify |
|---|---|
| Completeness | Row counts source vs target, no dropped records |
| Accuracy | Transformations, calculations, aggregations, rounding |
| Consistency | Referential integrity, keys, de-duplication |
| Validity | Data quality rules (formats, ranges, enumerations) |
| Timeliness | Freshness SLAs, job windows |
| History | Slowly changing dimensions (SCD type 1/2), snapshots |
| Robustness | Late, duplicate, out-of-order, malformed records; schema drift |
| Lineage and governance | Column lineage, PII classification, masking, access |
| Reporting | Report totals reconcile to the warehouse and to the source system |

## Checklist
- [ ] Source-to-target mapping document exists; every mapped column has a test.
- [ ] Count, sum and hash reconciliations per load.
- [ ] Each transformation rule tested with independently computed expected rows.
- [ ] Rejects/quarantine: invalid rows routed with reason; counts reconcile (loaded + rejected = extracted).
- [ ] Incremental loads and CDC: inserts, updates, deletes, re-runs (idempotent).
- [ ] SCD2: new version row with effective dates; previous row closed.
- [ ] Late-arriving facts and early-arriving dimensions handled.
- [ ] Schema change upstream (new/removed column, type change) detected and handled.
- [ ] Job failure and restart from checkpoint without duplicates.
- [ ] Freshness and job duration within SLA at production volume.
- [ ] PII masked/tokenised in lower environments and restricted in reports.
- [ ] Report filters, drill-downs, row-level security and totals correct.

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Full load | Load 1 M customers | Target count 1 M; sums and hashes match |
| Incremental | 500 new + 200 changed rows | 500 inserted, 200 updated |
| Aggregation | Daily sales by store | Totals equal source sums per store/day |
| SCD2 change | Customer moves city | New version row; old row end-dated |
| Report | Monthly revenue dashboard | Equals warehouse query and source ledger |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Invalid row | Date "31/02/2025" | Row quarantined with reason |
| Missing reference | Fact with unknown product id | Mapped to unknown member or rejected per rule |
| Schema drift | Source adds column | Pipeline alerts or adapts per design; no silent loss |
| Bad file | Truncated CSV | Load fails cleanly; no partial commit |
| Unauthorised | Analyst queries restricted PII column | Access denied / masked |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Empty source | Zero rows extracted | Job succeeds; no deletes unless intended |
| Precision | Decimal(18,2) at max value | Stored without overflow/rounding error |
| Time window | Records at 23:59:59.999 and 00:00:00 | Assigned to correct day/partition |
| Volume | Peak-day volume | Completes within window |
| Text length | Field at target column length + 1 | Rejected or truncated per rule, logged |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Source → staging → warehouse → report | Sale in POS appears in dashboard | Same amount at every hop within freshness SLA |
| Stream | Event → stream → aggregate → alert | Alert raised once within latency target |
| Restatement | Correct last month's data | Reports restated; audit of change |
| Feed to regulator | Generate regulatory extract | File matches spec and totals |
| Reverse ETL | Warehouse segment → CRM | CRM records updated correctly |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Month-end close | Finance runs close reports | Ledger and warehouse reconcile to the cent |
| Executive KPI | KPI tile for revenue | Equal to drill-through details |
| Data subject request | Erase a customer | Removed from lake, warehouse and reports |
| New source onboarding | Add new country feed | Conforms to model; reports include it |
| Audit | Auditor traces a figure | Lineage shows source rows |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Duplicate events | Same event twice | Counted once |
| Out-of-order | Update arrives before insert | Final state correct |
| Re-run | Job re-run for same date | No duplicates (idempotent) |
| DST | Hourly aggregation across DST change | 23/25-hour days handled |
| Late fact | Sale arrives 3 days late | Booked to correct date; aggregates refreshed |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional (transformations), Regression, Data migration, Performance (windows), Security (PII, access), Integration, Resilience (restart) | ● |
| UI/UX, Accessibility | ◐ (dashboards) |
| Localisation | ◐ (currencies, time zones, collation) |

## Tools and automation
- SQL-based reconciliation queries, dbt tests, Great Expectations / Soda, data-diff tools; BI report checks via API/exports.
- In the <AppName>/ automation folder, call reconciliation endpoints or run query helpers from API steps (`@api`), and keep expected golden data under version control.

## Common pitfalls
- Counting rows only (no value reconciliation).
- Testing on tiny samples; skipping re-runs, late data and DST.
- Comparing report to warehouse but not to the source system.

## Related sub-skills
Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Integration
