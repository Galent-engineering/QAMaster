---
name: "Domain_Test_Design_Skill-Test-Integration"
description: "Integration testing sub-skill of Domain_Test_Design_Skill: component and system integration, consumer-driven contract testing, end-to-end flows across systems, synchronous APIs, messaging and event streaming (Kafka, MQ, JMS, SQS/SNS, Service Bus), batch and file interfaces (SFTP, CSV, fixed-width, XML, EDI, ISO 20022, HL7/FHIR), middleware and iPaaS, data mapping, error handling, retries, idempotency and reconciliation, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating integration tests for any application or domain."
---

# Integration testing (sub-skill of Domain_Test_Design_Skill)

Integration testing verifies that components and systems exchange data and control correctly: right message, right format, right mapping, right time, exactly the intended number of times, with correct behaviour when the other side is slow, down or wrong. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- **Component integration**: modules/services within one application (service ↔ DB, service ↔ cache, service ↔ service).
- **System integration (SIT)**: application ↔ external/internal systems (ERP, CRM, payment gateways, core banking, EHR, carriers, identity providers, data warehouse).
- **Contract testing**: consumer and provider agree on interfaces without full environments (Pact, Spring Cloud Contract, schema registries).
- **End-to-end across systems**: business process spanning several systems with reconciliation of the final state.
- Interfaces: synchronous APIs (REST/SOAP/gRPC/GraphQL), asynchronous messaging/events, batch/file transfer, database links, SDKs, webhooks, email/SMS gateways.
- Single-API behaviour: Domain_Test_Design_Skill-Test-API; failure injection depth: Domain_Test_Design_Skill-Test-Resilience.

## When to apply
- New interfaces, changed message formats or mappings, partner onboarding, middleware/iPaaS changes (MuleSoft, Boomi, Azure Integration Services, TIBCO, webMethods), platform migrations.
- Any domain with heavy integrations: banking (payments, card networks), healthcare (HL7/FHIR, payers), retail (OMS/WMS/PSP), telecom (BSS/OSS), logistics (carriers, EDI), HR (payroll, benefits providers), Salesforce (MuleSoft, ERP sync).

| Application type | Relevance |
|---|---|
| Web | ● (backend integrations) |
| API / microservices | ● |
| Mobile | ◐ (backend, push, SDKs) |
| Desktop | ◐ (local services, peripherals, sync) |
| Cloud / SaaS | ● (connectors, webhooks, SSO/SCIM) |
| Image-based / AI | ◐ (capture → extraction → downstream systems) |
| Data platform | ● (sources, pipelines, consumers) |

## Checklist
**Interface inventory and contracts**
- [ ] Interface catalogue: source, target, direction, protocol, format, trigger, frequency, volume, owner, SLA.
- [ ] Contract/specification per interface (OpenAPI, AsyncAPI, WSDL/XSD, Avro/Protobuf schemas, file layout, EDI implementation guide).
- [ ] Consumer-driven contracts for each consumer/provider pair; schema compatibility rules (backward/forward) in the schema registry.

**Data mapping and transformation**
- [ ] Field-by-field mapping: source → transformation → target, including defaults, lookups, code translations (e.g. country, currency, status codes).
- [ ] Data types, lengths, precision, truncation, padding, date/time zones, encodings (UTF-8 vs legacy code pages), number formats.
- [ ] Mandatory/optional fields, nulls vs empty, repeating groups and arrays.
- [ ] Enrichment and derived fields; key generation and cross-reference (ID mapping tables).

**Synchronous integrations**
- [ ] Request/response correctness; correlation ids propagated end to end.
- [ ] Timeouts configured on both sides; retries with exponential back-off and jitter only for idempotent operations; circuit breakers.
- [ ] Authentication between systems (OAuth client credentials, mTLS, API keys, signed requests) and certificate expiry handling.

**Asynchronous messaging and events**
- [ ] Message published once per business event; payload and headers correct; topic/queue names and partitions keys.
- [ ] Delivery semantics: at-least-once with idempotent consumers, ordering per key, deduplication.
- [ ] Poison messages → dead-letter queue with reason; replay from DLQ works.
- [ ] Consumer lag, back-pressure and late/out-of-order events handled.
- [ ] Event schema evolution (new optional fields ignored by old consumers).

**Batch and file interfaces**
- [ ] File naming, location (SFTP/blob), encryption (PGP), compression, control totals/trailers, header/footer records.
- [ ] Layout: delimiter, quoting, escaping, fixed-width positions, line endings, BOM, encoding.
- [ ] Partial file, empty file, duplicate file, late file, out-of-sequence file handling.
- [ ] Rerun/idempotency; archive and purge; acknowledgement/response files.
- [ ] Industry formats: EDI X12/EDIFACT (850, 856, 810, 997), ISO 20022 (pain.001, pacs.008, camt.053), SWIFT MT, NACHA, HL7 v2 (ADT, ORM, ORU), FHIR R4 resources, ACORD, TM Forum Open APIs.

**Error handling and reconciliation**
- [ ] Every error path: validation reject, business reject, technical failure, timeout; error codes mapped to user-facing messages.
- [ ] No partial updates: compensating actions/sagas, outbox pattern, two-phase commit where used.
- [ ] Reconciliation reports (counts and amounts source vs target); alerting on breaks.
- [ ] Manual repair/resubmit tools for operations.

**Environments and test doubles**
- [ ] Integration environment map: which systems are real, sandbox, or virtualised (WireMock, Mountebank, Hoverfly, Microcks, MockServer).
- [ ] Test data aligned across systems (same customer/product ids in each).
- [ ] Partner sandboxes (payment gateways, carriers, government APIs) and their limitations documented.

**Observability**
- [ ] Distributed tracing across hops; logs with correlation ids; integration dashboards and alerts.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Interface-based partitioning**: one test set per interface × direction × message type.
- **Data-flow testing**: follow each data element from origin to every consumer (define-use paths).
- **Equivalence partitioning and BVA** on mapped fields (lengths, codes, amounts, dates).
- **Decision tables** for routing and transformation rules.
- **State transition** for business objects synchronised across systems (order status in OMS vs WMS vs ERP).
- **Contract testing** and **schema-based generation**.
- **Fault injection / error guessing**: duplicate, missing, delayed, reordered, malformed messages.
- **Incremental integration strategies**: top-down, bottom-up, sandwich with stubs and drivers.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Sync call | CRM creates customer in ERP via API | ERP returns id; CRM stores cross-reference; both show identical name, address, tax id |
| Event publish/consume | OrderPlaced event consumed by inventory and billing | Stock reserved once; invoice draft created once; correlation id in both logs |
| Batch file | Nightly payroll file to bank in pain.001 | File validates against XSD; control totals match payroll register; bank ack file received |
| Mapping | Status "SHIPPED" in WMS mapped to "Dispatched" in storefront | Customer sees "Dispatched" with tracking number |
| Webhook | PSP sends payment.succeeded | Order marked paid; signature verified; 2xx returned within timeout |
| Contract | Consumer pact verified against provider build | Provider verification passes for all interactions |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Downstream unavailable | ERP down during customer creation | Request queued or failed with retry; user informed; no orphan record; alert raised |
| Malformed message | Event missing mandatory field | Message rejected to DLQ with reason; consumer keeps processing others |
| Invalid code mapping | Unknown country code from source | Rejected or default per rule; error logged with record id |
| Auth failure | Expired client certificate / secret | Clear 401/handshake error; alert; no data sent in clear |
| Duplicate file | Same batch file delivered twice | Second file detected (hash/sequence) and not reprocessed |
| Business reject | Bank rejects payment (invalid IBAN) | Reject file processed; payment marked failed; user notified |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Field length | Source name 100 chars, target allows 60 | Truncation/rejection exactly as mapping spec; no silent corruption |
| Decimal precision | Amount with 4 decimals into 2-decimal target | Rounded per rule; totals reconcile |
| Volume per file | Empty file, 1 record, max records, max + 1 | Empty handled per spec; max processed in window; above split or rejected |
| Message size | Event payload at broker max size | Accepted at limit; above rejected or claim-check pattern used |
| Timeout | Downstream responds at timeout − 100 ms and + 100 ms | First succeeds; second treated as timeout with safe retry |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Order to cash | Storefront → OMS → WMS → carrier → ERP invoice → payment | Same order id, quantities and amounts in every system; final status "Closed" |
| Hire to pay | HRM hire → payroll → bank file → GL posting | Employee paid correct net amount; GL balances |
| Patient admission | ADT A01 → lab order ORM → result ORU → EHR chart | Result attached to correct patient and encounter |
| Claim lifecycle | Portal FNOL → claims system → payment → reinsurance feed | Claim paid once; reserves and recoveries consistent |
| Lead to opportunity | Marketing form → Salesforce lead → MuleSoft → ERP account | Account created with mapped fields; sync status visible |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Partner onboarding | New carrier added via EDI 856/214 | Shipments and status updates flow; partner certification checklist passed |
| Cut-off times | Payments submitted before/after bank cut-off | Before: same-day value date; after: next business day |
| Reconciliation | Daily settlement file vs transactions | Breaks listed with reasons; totals match after resolution |
| Regulatory reporting | Data feed to regulator format | Validates against regulator schema; totals match source |
| Master-data sync | Product price change in ERP | Storefront, POS and marketplace show new price within SLA |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Out-of-order events | "Shipped" arrives before "Packed" | Consumer handles per design (buffer, ignore stale, or state check); final status correct |
| Exactly-once illusion | Consumer crashes after DB write, before ack | Message redelivered; idempotency prevents duplicate effect |
| Clock/time-zone mismatch | Source in IST, target in UTC | Timestamps converted; no date shift on day boundaries |
| Encoding mismatch | UTF-8 source to Windows-1252 target | Non-representable characters handled per spec; no "Ã©" mojibake |
| Partial batch failure | Record 5 001 of 10 000 fails | Failed records reported; others committed or whole batch rolled back per spec; rerun safe |
| Certificate rotation | Partner rotates TLS certificate | Connection continues with new certificate; no downtime |

## Entry and exit criteria
**Entry**: interface specifications and mapping documents baselined; component tests passed on both sides; integration environment with connectivity, credentials and aligned test data; stubs/virtual services for unavailable systems; contract tests in CI.
**Exit**: every interface × message type × direction tested with positive and negative cases; end-to-end business flows reconciled; error and retry paths verified; no open critical/high integration defects; reconciliation and monitoring in place; partner sign-off where required.

## Metrics
- Interface coverage (interfaces/message types tested ÷ total in catalogue).
- Contract test pass rate and number of breaking changes caught pre-merge.
- Integration defects by type (mapping, format, connectivity, error handling, timing).
- Reconciliation breaks per run; DLQ message counts; end-to-end latency per flow.
- Environment availability of integrated systems during SIT.

## Tools and automation
- Contracts: Pact/PactFlow, Spring Cloud Contract, Confluent Schema Registry compatibility checks, Specmatic.
- Virtualisation: WireMock, Mountebank, Hoverfly, MockServer, Microcks, Parasoft/Broadcom service virtualisation.
- Messaging: Kafka tools (kcat, Testcontainers Kafka), Azure Service Bus Explorer, AWS CLI for SQS/SNS, IBM MQ Explorer.
- Files/EDI: XSD/schema validators, EDI validators, HL7 tools (HAPI, Mirth/NextGen Connect), FHIR validator.
- Automation folder (<AppName>/): API features drive one side of the integration through `src/api/services` and poll the other side's API (`expect.poll`) for the expected state with timeouts, tag `@integration @feature:<Flow>`; mocks via Playwright `page.route`/`context.route` for UI-level isolation; shared correlation id generated in `ctx` and asserted in each system; created records cleaned up with `ctx.onCleanup`; Allure attachments with each system's payload. Message-broker and file checks run as helper utilities called from steps (no selectors involved).
- Do not automate: one-off partner certification ceremonies; flows dependent on unavailable partner sandboxes (use contracts and virtual services instead).

## Common pitfalls
- Testing only the happy path; no duplicates, delays, reordering or downstream failures.
- Assuming the mapping document is right; not validating against real sample data from the source.
- Test data not aligned across systems, causing false failures.
- Over-reliance on full end-to-end environments instead of contract tests and virtualisation.
- No reconciliation, so silent data loss goes unnoticed.

## Related sub-skills
Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Domain-Logistics, Domain_Test_Design_Skill-Domain-Salesforce.
