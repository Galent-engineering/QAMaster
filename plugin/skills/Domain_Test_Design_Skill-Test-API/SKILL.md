---
name: "Domain_Test_Design_Skill-Test-API"
description: "API testing sub-skill of Domain_Test_Design_Skill: REST, GraphQL, SOAP, gRPC, webhooks and event APIs (contract and schema, status codes, validation, auth, idempotency, pagination, versioning, rate limits, error model, OWASP API Top 10 2023 checks), checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating API tests for any application or domain."
---

# API testing (sub-skill of Domain_Test_Design_Skill)

API testing verifies service interfaces directly, without the UI: contract, behaviour, data, errors, security and non-functional properties of REST, GraphQL, SOAP, gRPC, webhook and asynchronous event APIs. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Verify each operation against its contract (OpenAPI/Swagger, GraphQL schema, WSDL/XSD, .proto, AsyncAPI).
- Verify business rules at the service layer, where they are cheapest and most stable to test.
- Verify error model, authentication/authorisation, idempotency, concurrency, pagination and versioning.
- Provide the fast, stable base of the test pyramid; UI tests then cover only UI concerns.
- Deep security attacks: Domain_Test_Design_Skill-Test-Security; load: Domain_Test_Design_Skill-Test-Performance; cross-system flows: Domain_Test_Design_Skill-Test-Integration.

## When to apply
- Any application with a service layer (almost all modern web/mobile/SaaS apps).
- Public/partner APIs, open banking/FHIR/TM Forum Open APIs, microservices, BFFs, integration hubs (MuleSoft, Boomi), serverless functions.
- Before UI automation (API checks give faster feedback and test data set-up).

| Application type | Relevance |
|---|---|
| Web | ● (backend / BFF) |
| API / microservices | ● |
| Mobile | ● (mobile backend) |
| Desktop | ◐ (if it calls services) |
| Cloud / SaaS | ● (public and tenant APIs) |
| Image-based / AI | ● (inference endpoints) |
| Data platform | ◐ (ingestion / query APIs) |

## Checklist
**Contract and schema**
- [ ] Request and response validate against the published schema (required fields, types, formats, enums, nullable, additionalProperties).
- [ ] Content-Type / Accept negotiation; charset; compression.
- [ ] Field naming and casing consistent; dates in ISO 8601 with time zone; money as decimal string or minor units (no binary floats).
- [ ] Backward compatibility: no removed/renamed fields or new required request fields without a version change.
- [ ] Consumer-driven contracts (Pact) for each consumer.

**HTTP semantics (REST)**
- [ ] Correct methods: GET safe/idempotent, PUT/DELETE idempotent, POST creates, PATCH partial (JSON Merge Patch or JSON Patch).
- [ ] Status codes: 200, 201 + Location, 202 for async, 204, 400, 401, 403, 404, 405, 409, 410, 412, 415, 422, 429 + Retry-After, 500, 502, 503, 504.
- [ ] Headers: caching (Cache-Control, ETag, If-None-Match → 304), conditional updates (If-Match → 412), CORS, correlation/trace id.
- [ ] Consistent error body (e.g. RFC 9457 Problem Details: type, title, status, detail, instance, field errors).

**Input validation**
- [ ] Required, type, format, length, range, enum, pattern for every field (path, query, header, body).
- [ ] Unknown fields (rejected or ignored as specified); duplicated keys; empty body; malformed JSON/XML.
- [ ] Unicode, emoji, very long strings, null vs missing vs empty string.
- [ ] Large payloads (413), deep nesting, arrays at max size.

**Business behaviour**
- [ ] CRUD semantics per resource; state transitions enforced by the service.
- [ ] Calculations and rules at service level (same results as the UI).
- [ ] Side effects: events published, records created downstream, audit logs.
- [ ] Idempotency keys for POSTs that move money or create orders (same key → same result, no duplicate).
- [ ] Concurrency: optimistic locking (ETag/version) → 409/412 on stale update.

**Collections**
- [ ] Pagination (offset/limit, page/size, cursor): first, middle, last, beyond last, size 0/1/max/max+1, stable ordering across pages.
- [ ] Filtering, sorting, field selection, search; invalid filter fields.
- [ ] Total counts and links (next/prev) correct.

**Authentication and authorisation** (OWASP API Security Top 10 2023)
- [ ] API1 Broken Object Level Authorization: access another user's/tenant's object id → 403/404.
- [ ] API2 Broken Authentication: missing, expired, malformed, wrong-audience, wrong-signature tokens → 401.
- [ ] API3 Broken Object Property Level Authorization: no excessive data exposure; mass assignment of read-only fields (role, price, owner) ignored/rejected.
- [ ] API4 Unrestricted Resource Consumption: rate limits, payload size, page size caps, timeouts.
- [ ] API5 Broken Function Level Authorization: admin endpoints with a user token → 403.
- [ ] API6 Unrestricted Access to Sensitive Business Flows: automation abuse of purchase/booking/coupon flows throttled.
- [ ] API7 Server Side Request Forgery: URL parameters cannot reach internal hosts/metadata endpoints.
- [ ] API8 Security Misconfiguration: TLS, CORS, verbose errors, unnecessary methods, security headers.
- [ ] API9 Improper Inventory Management: old versions, debug and undocumented endpoints identified and controlled.
- [ ] API10 Unsafe Consumption of APIs: data from third-party APIs validated before use.
- [ ] OAuth 2.0 / OIDC scopes enforced per operation; API keys not in URLs.

**GraphQL specifics**
- [ ] Queries, mutations, subscriptions; field-level authorisation; errors array with partial data.
- [ ] Query depth/complexity limits, batching/aliasing abuse, introspection disabled in production (if policy).

**SOAP / gRPC / async specifics**
- [ ] SOAP: WSDL/XSD validation, SOAP Faults, WS-Security.
- [ ] gRPC: status codes (OK, INVALID_ARGUMENT, NOT_FOUND, PERMISSION_DENIED, UNAUTHENTICATED, DEADLINE_EXCEEDED, UNAVAILABLE), deadlines, streaming.
- [ ] Webhooks/events: signature verification, retries with back-off, ordering, duplicates (consumer idempotency), dead-letter queues.

**Versioning and lifecycle**
- [ ] Version in path/header/media type works as documented; deprecation and Sunset headers; old version behaviour unchanged until sunset.

**Non-functional smoke**
- [ ] Response time per operation within SLA at single-user load; payload size reasonable; gzip enabled.
- [ ] Logs contain correlation id and no secrets/PII.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Equivalence partitioning and BVA** per parameter (path, query, header, body).
- **Decision tables** for business rules exposed by the endpoint.
- **State transition** on resources (e.g. order: created → paid → shipped → delivered / cancelled).
- **CRUD matrix** per resource and **permission matrix** (operation × role × object ownership).
- **Pairwise** for optional parameter combinations (filters, sort, fields).
- **Contract / schema-based generation** (property-based or fuzzing from OpenAPI, e.g. Schemathesis).
- **Error guessing**: null, empty, wrong type, injection strings, huge numbers, negative ids, duplicated requests.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Create resource | POST /orders with valid body | 201, Location header, body matches schema, id returned, GET returns same data |
| Read resource | GET /orders/{id} as owner | 200, schema valid, values equal the created ones |
| Update | PUT/PATCH /orders/{id} with valid change and current ETag | 200/204; subsequent GET shows the change; new ETag |
| Delete | DELETE /orders/{id} | 204; GET then returns 404 (or 410) |
| List with pagination | GET /orders?page=2&size=20 | 200; 20 items; correct next/prev links; total count |
| Async operation | POST /reports | 202 with status URL; polling reaches "completed" with result link |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Missing required field | POST /orders without customerId | 400/422 with field error "customerId is required"; nothing created |
| Wrong type | quantity: "two" | 400 with type error; no stack trace |
| No / invalid token | Call without Authorization | 401 with WWW-Authenticate; no data |
| BOLA | User A GETs user B's order id | 403 or 404; no data leaked; attempt logged |
| Function-level authz | User token on DELETE /admin/users/{id} | 403 |
| Mass assignment | PATCH /users/me with {"role":"admin"} | Field ignored or 400; role unchanged |
| Unsupported method / media | PUT on a read-only resource; text/plain body | 405 with Allow header; 415 |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| String length | name length max and max+1 | Max accepted; max+1 → 400 with limit in message |
| Numeric range | quantity 0, 1, max, max+1 | 0 and max+1 rejected; 1 and max accepted |
| Page size | size=0, 1, max, max+1 | 0/max+1 rejected or clamped as documented |
| Last page | page beyond last | 200 with empty items (or 404 as documented) |
| Payload size | Body at size limit and limit+1 | Limit accepted; above → 413 |
| Rate limit | N and N+1 requests in window | N+1 → 429 with Retry-After; resets after window |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Resource lifecycle | Create → pay → ship → deliver via API | Each transition succeeds; invalid order rejected; final state correct |
| Event propagation | Create order → event consumed by inventory | Stock decremented once; event id logged |
| Webhook delivery | Payment status change | Webhook delivered with valid signature; retried on 5xx from receiver |
| Auth flow | OAuth client credentials → call → refresh | Token obtained, call succeeds, refreshed token works, revoked token fails |
| API + UI consistency | Create via API, view in UI | UI shows the same values |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Partner integration | Partner submits a batch of 100 orders | All accepted or per-item errors returned; totals reconcile |
| Payment idempotency | Retry payment POST with same Idempotency-Key after timeout | One charge; second response identical to first |
| Quota per plan | Free plan exceeds monthly quota | 429/402 as specified; paid plan unaffected |
| Open standard compliance | FHIR Patient read / open-banking accounts call | Response conforms to the standard profile |
| Version migration | Consumer moves from v1 to v2 | Same business outcome; documented field changes only |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Concurrent update | Two PUTs with same ETag | One succeeds; other 412/409; no lost update |
| Duplicate request | Same POST sent twice quickly | One resource (with idempotency) or documented duplicate handling |
| Unicode and special characters | Name with emoji, RTL text, quotes | Stored and returned byte-identical |
| Downstream timeout | Dependency slower than timeout | 504/503 with error body; no partial commit; retry-safe |
| Clock skew | Token issued slightly in the future | Accepted within allowed leeway, rejected beyond |
| Null vs missing | PATCH with field null vs omitted | Null clears the field; omitted leaves it unchanged (as specified) |

## Entry and exit criteria
**Entry**: API specification available and versioned; environment and test credentials per role; test data and mocks for dependencies; health endpoint up.
**Exit**: 100 % operations covered with positive + negative cases; all status codes in the spec exercised; schema validation on every response; OWASP API Top 10 checks done for exposed APIs; no open critical/high defects; contract tests green for all consumers.

## Metrics
- Operation coverage (operations tested / documented) and response-code coverage.
- Schema-validation pass rate; contract test pass rate per consumer.
- Defects by category (validation, authz, error model, business logic).
- p95 response time per operation in functional runs.
- Undocumented endpoints found.

## Tools and automation
- Tools: Postman/Newman, REST Assured, Karate, Pact, Schemathesis, Dredd, SoapUI/ReadyAPI, grpcurl/ghz, k6 for API load, OWASP ZAP API scan.
- Automation folder (<AppName>/): features under `features/api/` tagged `@api @feature:<Service>`; steps in `steps/api/<service>.api.steps.ts`; service classes in `src/api/services/` built on the `api` fixture (Playwright `APIRequestContext`); schemas registered in `src/api/models/index.ts` (`SCHEMAS`) and checked with `ApiResponse.validate(schema)`; auth tokens from environment config, never hard-coded; created resources removed with `ctx.onCleanup`; request/response attached to Allure. Run with `npx playwright test --project=api`.
- Use APIs to set up data for UI tests (faster, more stable).
- Do not automate: one-off exploratory probing, manual security exploitation (hand to Security).

## Common pitfalls
- Checking only status code, not body, schema, headers and side effects.
- Hard-coded ids and tokens; tests dependent on execution order.
- Ignoring authorisation per object (BOLA is the top API risk).
- Testing only through the UI, so service rules stay untested.
- Not testing error responses for information leakage.

## Related sub-skills
Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-Healthcare.
