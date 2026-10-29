---
name: "Domain_Test_Design_Skill-App-API"
description: "API and microservices (REST, SOAP, GraphQL, gRPC, webhooks, event streams) application-type test design sub-skill of Domain_Test_Design_Skill: detection signals, test layers, focus areas, checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, test-type applicability, tooling and automation with the application automation folder API layer, and common pitfalls. Use when the application under test is an API, a microservice back end, an integration layer or an event-driven system, or when Domain_Test_Design_Skill routes an API application here."
---

# API / microservices (sub-skill of Domain_Test_Design_Skill)

Platform-specific test design for services exposed over HTTP, messaging or RPC. For the API *test type* checklist (status codes, contract, auth, idempotency …) see Domain_Test_Design_Skill-Test-API; this sub-skill covers how an API-first *application* is approached as a whole.

## Detection signals
- OpenAPI/Swagger, WSDL, GraphQL schema, `.proto` files, Postman collections.
- Repositories with controllers/routes, Kafka/RabbitMQ/SQS consumers, API gateway config.
- No UI, or a UI that is a thin client over documented endpoints.

## Test layers
| Layer | Scope | Doubles |
|---|---|---|
| Component | One service in isolation | Stubs for dependencies |
| Contract | Consumer ↔ provider agreement | Consumer-driven contracts (Pact) |
| Integration | Service chains, database, broker | Real dependencies in a test env |
| End-to-end | UI/client → gateway → services → downstream | Minimal doubles (third parties only) |

## Focus areas
- Contracts and versioning; backward compatibility.
- AuthN/AuthZ: OAuth2 scopes, JWT validation, tenant scoping, BOLA/IDOR.
- Data validation and error model consistency.
- Idempotency, retries, timeouts, circuit breakers.
- Asynchronous flows: events, ordering, deduplication, dead-letter queues, replay.
- Rate limiting, pagination, filtering, sorting.
- Observability: correlation IDs, structured logs, metrics.

## Checklist
- [ ] Every endpoint in the spec has positive, negative and auth tests.
- [ ] Response schemas validated (required fields, types, enums, nullability).
- [ ] Downstream 500/timeout → meaningful error, retry with back-off, no partial commit.
- [ ] Same request with the same idempotency key → one record.
- [ ] Old client (v1) against new API → still works or gets a documented deprecation response.
- [ ] Message published twice → processed once; out-of-order messages handled.
- [ ] Poison message → dead-letter after N retries, alert raised.
- [ ] Gateway: CORS, rate limit (429 + Retry-After), request size limit.
- [ ] Correlation ID propagated across services and logs.

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| CRUD chain | POST → GET → PUT → GET → DELETE | 201, 200 with body, 200, updated body, 204 |
| Filter and paginate | GET /orders?status=OPEN&limit=50 | Only OPEN orders; ≤ 50 items; next cursor present |
| Event emitted | Create order | `OrderCreated` published with order id and totals |
| Webhook delivery | Subscribe and trigger event | Subscriber receives signed payload once |
| Version negotiation | Accept: v2 header | v2 representation returned |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Missing auth | No bearer token | 401 with standard error body |
| Wrong scope | Token with read scope on POST | 403 |
| Other tenant's object | GET another tenant's order id | 404/403; no data leaked |
| Malformed body | Invalid JSON | 400 with parse error, no stack trace |
| Unsupported media type | `text/plain` body | 415 |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Page size | limit = 0, 1, max, max + 1 | 400 or default, 1 item, max items, 400/clamped |
| Payload size | Body at limit and limit + 1 byte | Accepted; 413 |
| Rate limit | N and N + 1 requests per window | N succeed; next gets 429 with Retry-After |
| String length | Field at max and max + 1 | Accepted; 422 |
| Numeric range | Amount 0.01 and 0.00 | Accepted; 422 |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Saga success | Order → payment → inventory → shipping | All services consistent; final status Shipped |
| Saga compensation | Payment fails after inventory reserved | Reservation released; order Failed |
| Async round trip | Command → event → projection read | Read model updated within SLA |
| Third-party chain | Call that hits a payment provider sandbox | Provider reference stored; status reconciled |
| UI over API | Action in UI | Same state visible via API |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Partner integration | Partner submits 1 000 orders via bulk API | All accepted; per-item results returned |
| Reconciliation | Daily totals via reporting API | Equal to sum of transactions |
| Onboarding | New client registers app and obtains token | Token works only with granted scopes |
| Deprecation | Client still on v1 after sunset date | Documented response (410 / warning header) |
| Replay | Re-send missed events from offset | Consumers catch up without duplicates |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Concurrent update | Two PUTs with same ETag | One 200, one 412 |
| Clock skew | Token issued 2 min in the future | Accepted within allowed skew or 401 consistently |
| Partial batch failure | 1 of 100 items invalid | Per-item status; valid items processed per contract |
| Network partition | Broker unavailable | Producer buffers or fails fast; no lost messages |
| Large response | Export 1 M rows | Streamed/paginated; no timeout or OOM |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional, Regression, API, Security, Performance, Integration, Resilience | ● |
| Localisation | ◐ (formats, messages, currency) |
| UI/UX, Accessibility, Compatibility | ○ (client compatibility = API versions) |

## Tools and automation
- Automation folder (<AppName>/) API layer: services in `src/api/services`, zod schemas registered in `src/api/models/index.ts` (SCHEMAS), features tagged `@api`, steps in `steps/api/<service>.api.steps.ts`.
- Pact for contracts, WireMock/Prism for virtualisation, k6/JMeter/Gatling for load, OWASP ZAP for API scans (with authorisation).

## Common pitfalls
- Asserting only status codes, not bodies and side effects.
- Shared mutable test data across tests.
- Ignoring async timing (use polling with timeout, not sleeps).
- Not testing auth on every endpoint.

## Related sub-skills
Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-App-CloudSaaS
