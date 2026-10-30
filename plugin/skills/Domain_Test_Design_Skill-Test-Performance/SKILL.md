---
name: "Domain_Test_Design_Skill-Test-Performance"
description: "Performance testing sub-skill of Domain_Test_Design_Skill: workload modelling, load, stress, spike, soak/endurance, scalability, volume and capacity tests, front-end performance (Core Web Vitals), mobile performance, metrics (response time percentiles, throughput, error rate, resource utilisation), SLA/SLO definitions with examples, k6, JMeter and Gatling scripting, monitoring and bottleneck analysis, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating performance tests for any application or domain."
---

# Performance testing (sub-skill of Domain_Test_Design_Skill)

Performance testing measures how fast, how much and how long the system can serve its users under expected and extreme workloads, and finds the bottlenecks before users do. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- Verify SLAs/SLOs: response time percentiles, throughput, error rate, resource limits.
- Determine capacity and scalability limits; find bottlenecks (code, database, network, configuration, third parties).
- Test types: load, stress, spike, soak/endurance, scalability (horizontal/vertical, autoscaling), volume (large data), capacity, and front-end/mobile performance.
- Failover and recovery behaviour under load is shared with Domain_Test_Design_Skill-Test-Resilience.

## When to apply
- New systems before go-live; major releases; infrastructure, database or framework changes.
- Known peaks: sales events, month/quarter/year-end, enrolment periods, payroll runs, tax deadlines, ticket releases, marketing campaigns.
- Capacity planning and cloud cost optimisation.

| Application type | Relevance |
|---|---|
| Web | ● (server and Core Web Vitals) |
| API / microservices | ● |
| Mobile | ● (app start, frame rate, battery, network) |
| Desktop | ◐ (start-up, memory, large files) |
| Cloud / SaaS | ● (multi-tenant noisy neighbour, autoscaling) |
| Image-based / AI | ● (inference latency, GPU throughput) |
| Data platform | ● (batch windows, query latency, ingestion rate) |

## Checklist
**Requirements and SLAs**
- [ ] Non-functional requirements quantified per transaction (no "fast"): e.g. p95 ≤ 2 s, p99 ≤ 4 s, error rate < 1 %, throughput ≥ 50 orders/s at peak.
- [ ] SLO vs SLA distinguished; measurement point defined (server side, client side, end to end).
- [ ] Peak and average workloads from production analytics, business forecasts and growth (e.g. +30 % per year).
- [ ] Batch windows (e.g. nightly batch must finish in 4 h) and data-volume targets.

**Workload model**
- [ ] Business transactions and mix (% of each), user journeys with think time and pacing.
- [ ] Concurrent users vs arrival rate (open model: requests/s; closed model: virtual users); Little's Law: concurrency = throughput × (response time + think time).
- [ ] Peak hour, peak minute, seasonality; geographic distribution; device/network mix.
- [ ] Data distribution: realistic data volumes in DB (production-like size), unique test data per VU (no cache-only hits), parameterisation and correlation.
- [ ] Background load: batch jobs, integrations, reports running during the test.

**Test types**
- [ ] Baseline (1 user / low load) for reference.
- [ ] Load at expected peak (typically 1–2 h steady state).
- [ ] Stress: step increases beyond peak until breaking point; observe failure mode and recovery.
- [ ] Spike: sudden jump (e.g. 10× in 1 min) and drop.
- [ ] Soak/endurance: expected load for 8–72 h; memory leaks, connection-pool exhaustion, log/disk growth.
- [ ] Scalability: add instances/nodes; verify near-linear throughput and autoscaling triggers/cool-down.
- [ ] Volume: large DB tables, large files, large result sets/exports.
- [ ] Capacity: maximum users/throughput meeting the SLA.

**Environment**
- [ ] Production-like (or scaled with known ratio); same versions, configuration, data volume, CDN/WAF/load balancer settings.
- [ ] Load generators sized and not the bottleneck (CPU < 70 %); located appropriately (same region vs geo-distributed).
- [ ] Third parties stubbed or with agreed test quotas; never load-test third-party/production systems without permission.
- [ ] Monitoring in place: APM (traces), infrastructure (CPU, memory, disk I/O, network), DB (slow queries, locks, connections), JVM/CLR/Node (GC, heap, event loop), queues, caches.

**Metrics to capture**
- [ ] Response time: average, median, p90, p95, p99, max (percentiles, not averages, for SLAs).
- [ ] Throughput (requests/s, transactions/s, business transactions/h); error rate and error types; timeouts.
- [ ] Concurrency (active VUs/sessions); latency vs time; Apdex if used.
- [ ] Resource utilisation per tier; saturation (queues, thread pools, connection pools); GC pauses.
- [ ] Front end: LCP, INP, CLS (Core Web Vitals at p75), TTFB, FCP, total blocking time, JS bundle size.
- [ ] Mobile: cold/warm start time, frame rate/jank, memory, battery drain, network data usage, app size.

**Analysis and reporting**
- [ ] Compare against SLA and previous baseline; identify knee point in throughput vs response time curve.
- [ ] Correlate slow transactions with traces, DB queries and resource metrics.
- [ ] Record bottlenecks, fixes, retest results and capacity recommendations.

**SLA examples**
| Transaction | Load | SLA |
|---|---|---|
| Login | 500 logins/min | p95 ≤ 1.5 s, errors < 0.5 % |
| Product search | 200 req/s | p95 ≤ 800 ms, p99 ≤ 1.5 s |
| Checkout / payment | 50 orders/s | p95 ≤ 3 s (excluding PSP), zero lost orders |
| Funds transfer (banking) | 300 TPS | p99 ≤ 2 s, 99.95 % availability |
| Report export (10 000 rows) | 20 concurrent | ≤ 30 s, no timeouts |
| Nightly batch (1 M records) | Batch window | Completes in ≤ 4 h |
| Web page (field data) | Real users | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 |

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Workload modelling** from analytics (transaction mix, arrival rates) and business calendars.
- **Equivalence partitioning** of transactions (light read, heavy read, write, report, upload) and users (by role and device).
- **Boundary value analysis** on load: expected peak, peak + headroom (e.g. 150 %), breaking point.
- **Risk-based selection**: business-critical and resource-heavy transactions first.
- **Scenario-based / use-case** journeys with think times.
- **Metamorphic checks**: doubling resources should roughly double capacity; repeated runs should give similar results (±10 %).

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Load at peak | 1 000 concurrent users, realistic mix, 1 h steady | All transactions meet p95 SLAs; error rate < 1 %; CPU < 70 % |
| Baseline | Single user per transaction | Response times recorded as reference; well under SLA |
| Scalability | Double application nodes | Throughput increases ≥ 80 % at same response times |
| Autoscaling | Ramp load until scale-out threshold | New instances added within target time; SLA maintained |
| Front-end performance | Home page on 4G mid-range device | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Overload | Load beyond capacity (stress) | Graceful degradation: 503/429 with Retry-After, no data corruption, no crashes |
| Dependency slow | Payment provider stub responds in 10 s | Timeouts and circuit breaker protect the system; other functions unaffected |
| Resource exhaustion | DB connection pool exhausted | Requests queue/fail fast with clear errors; pool recovers |
| Bad client behaviour | Clients retry aggressively without back-off | Rate limiting protects service; no retry storm collapse |
| Large payload abuse | Many max-size uploads concurrently | Limits enforced; memory stable |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Expected peak vs headroom | 100 % and 150 % of peak | 100 % meets SLA; 150 % degrades within agreed limits |
| Breaking point | Step load +10 % every 10 min | Knee point identified and documented with limiting resource |
| Batch window | Batch with 1 M and 1.5 M records | Completes within window; scaling factor documented |
| Data volume | Search on table with 10 M vs 100 M rows | Response time within SLA thanks to indexing; query plans stable |
| Soak duration | 24 h at 80 % peak | No memory growth trend; response times stable; no errors creeping in |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Full journey under load | Browse → search → cart → checkout → payment | Each step meets SLA; order counts reconcile with orders created |
| Multi-tier tracing | Slowest 1 % of requests traced | Bottleneck identified per tier (web/app/DB/external) |
| Batch + online concurrency | Online peak while nightly batch runs | Both meet SLAs, or batch throttled as designed |
| Event pipeline | 10 000 events/s into queue → consumers → DB | Consumer lag stays below threshold; no message loss |
| Mobile + backend | 5 000 app users with push notifications | Backend handles burst of app opens after push |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Flash sale | 50 000 users at 10:00 for limited stock | Queueing/virtual waiting room works; no overselling; checkout SLA met |
| Month-end close / payroll run | Payroll for 100 000 employees | Completes in agreed window; correct results |
| Enrolment / tax deadline | 5× daily traffic on last day | SLA met or graceful queueing |
| Market open (trading) | Burst of orders at 09:15 | Order latency within SLA; no rejections due to capacity |
| Ticket release | 200 000 users in first minute | Fair queueing; no double booking of seats |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Cold start | First request after deploy / serverless cold start | Within agreed cold-start limit; warm-up strategy works |
| Cache miss storm | Cache flushed under load | DB survives thundering herd; cache repopulates |
| Noisy neighbour | One tenant runs heavy reports | Other tenants' SLAs unaffected (quotas/isolation) |
| Long-running connections | 10 000 WebSocket connections for 4 h | Connections stable; memory per connection within budget |
| Network conditions | High latency (300 ms) and packet loss (2 %) | Mobile/web remain usable; retries do not duplicate actions |

## Entry and exit criteria
**Entry**: quantified NFRs; workload model approved; production-like environment and data volumes; scripts validated (correlation, parameterisation, assertions on content not just status); monitoring live; functional stability (no blocking defects).
**Exit**: all planned test types executed; SLAs met or deviations accepted with owners; bottlenecks fixed and retested; results reproducible (two consistent runs); capacity and scaling recommendations published; baseline stored for regression.

## Metrics
- p50/p90/p95/p99 response time per transaction; throughput; error rate; Apdex.
- Resource utilisation and saturation per tier; GC time; DB slow queries.
- Capacity (max users/TPS within SLA); scalability factor.
- Core Web Vitals (lab and field p75); mobile start time and frame rate.
- Performance regression vs previous baseline (% change).

## Tools and automation
- Load tools:
  - **k6** (JavaScript, CI-friendly, thresholds as code): `export const options = { scenarios: { peak: { executor: 'ramping-arrival-rate', startRate: 10, timeUnit: '1s', preAllocatedVUs: 200, stages: [{ target: 200, duration: '10m' }, { target: 200, duration: '60m' }] } }, thresholds: { http_req_duration: ['p(95)<800', 'p(99)<1500'], http_req_failed: ['rate<0.01'] } };`
  - **JMeter**: Thread Groups (or Concurrency/Arrival Thread Groups), CSV Data Set Config for data, Regular Expression/JSON Extractors for correlation, Constant Throughput Timer for pacing, Response/Duration Assertions; run non-GUI `jmeter -n -t plan.jmx -l results.jtl -e -o report/`.
  - **Gatling** (Scala/Java/Kotlin DSL): `setUp(scn.injectOpen(rampUsersPerSec(10).to(200).during(600), constantUsersPerSec(200).during(3600))).assertions(global.responseTime.percentile(95).lt(800), global.failedRequests.percent.lt(1))`.
  - Others: Locust (Python), Artillery, NeoLoad, LoadRunner; Azure Load Testing, AWS Distributed Load Testing, Grafana Cloud k6 for distributed load.
- Monitoring: Grafana + Prometheus, Dynatrace, New Relic, Datadog, AppDynamics, Azure Monitor/App Insights, CloudWatch; DB tools (pg_stat_statements, Query Store, AWR).
- Front end: Lighthouse/Lighthouse CI, WebPageTest, Chrome DevTools Performance, CrUX/RUM for field data; mobile: Android Profiler, Xcode Instruments, Firebase Performance.
- Automation folder (<AppName>/): not a load tool. Use it for performance smoke: capture navigation timing / Web Vitals in page objects (`page.evaluate(() => performance.getEntriesByType('navigation'))`) and assert budgets on key pages, tag `@perf-smoke`; attach timings to Allure; API service methods measure single-request latency against budgets. Reuse API service definitions and test data to build k6/JMeter scripts.
- Do not automate as performance tests: functional Playwright suites run in parallel (browsers are too heavy to generate realistic load).

## Common pitfalls
- Vague NFRs ("should be fast") and averages instead of percentiles.
- Unrealistic workload: no think time, one user's data reused (cache hits), wrong transaction mix.
- Test environment much smaller or differently configured with no scaling ratio.
- Load generator becoming the bottleneck.
- Ignoring errors because response times look good (fast failures).
- One run treated as conclusive; no baseline for comparison.

## Related sub-skills
Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Test-API, Domain_Test_Design_Skill-Test-UIUX, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-AIML, Domain_Test_Design_Skill-Domain-Retail, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Core-RiskAndData.
