---
name: "Domain_Test_Design_Skill-Test-Resilience"
description: "Resilience testing sub-skill of Domain_Test_Design_Skill: high availability and failover, disaster recovery (RPO/RTO), backup and restore, chaos engineering and fault injection, graceful degradation, timeouts, retries, circuit breakers, bulkheads, idempotency, queue durability, autoscaling and self-healing, dependency failures, maintenance and zero-downtime deployments, observability and alerting, checklist, design techniques, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, entry/exit criteria, metrics, tooling and automation with the automation framework ({AppName}/ folders). Use when planning, designing, reviewing or automating resilience tests for any application or domain."
---

# Resilience testing (sub-skill of Domain_Test_Design_Skill)

Resilience testing proves that the system keeps serving users, protects data and recovers within agreed objectives when components, dependencies, infrastructure or whole sites fail. Combine with the domain and application-type sub-skills; methodology in Domain_Test_Design_Skill.

## Purpose and scope
- **Availability**: redundancy and failover at every tier (load balancer, app instances, database replicas, caches, queues, zones, regions).
- **Recoverability**: backup/restore, disaster recovery (DR) against RPO (maximum data loss) and RTO (maximum downtime).
- **Fault tolerance patterns**: timeouts, retries with back-off and jitter, circuit breakers, bulkheads, rate limiting/load shedding, fallbacks/graceful degradation, idempotency, outbox/sagas.
- **Chaos engineering**: controlled experiments injecting failures to verify a steady-state hypothesis.
- **Operational resilience**: zero-downtime deployments, rollbacks, certificate/secret rotation, observability and alerting, runbooks.
- Regulatory drivers: DORA (EU financial entities, applicable from 17 January 2025), PRA/FCA operational resilience (UK), FFIEC (US), HIPAA contingency plan, ISO 22301.
- Load-related behaviour shares methods with Domain_Test_Design_Skill-Test-Performance.

## When to apply
- Critical services with availability SLAs (e.g. 99.9 % ≈ 43.8 min/month downtime, 99.95 % ≈ 21.9 min, 99.99 % ≈ 4.4 min).
- New architecture, cloud migration, multi-region design, new critical dependency, major infrastructure change.
- Periodic DR drills (at least annually; often regulator-mandated) and after incidents.

| Application type | Relevance |
|---|---|
| Web | ● |
| API / microservices | ● |
| Mobile | ◐ (offline, retry, backend failover) |
| Desktop | ◐ (crash recovery, local data, offline) |
| Cloud / SaaS | ● |
| Image-based / AI | ◐ (model service failover, fallbacks) |
| Data platform | ● (pipeline restart, backfill, replay) |

## Checklist
**Objectives and inventory**
- [ ] Critical business services identified with impact tolerances (max tolerable downtime) and SLOs.
- [ ] RPO and RTO per service and data store (e.g. payments RPO 0, RTO 15 min; reporting RPO 24 h, RTO 8 h).
- [ ] Dependency map (internal services, databases, third parties, DNS, identity provider, CDN, cloud services) with failure modes and owners.
- [ ] Single points of failure listed and either removed or accepted.

**High availability and failover**
- [ ] Instance failure: kill an app instance/pod → traffic rerouted; health checks remove it; autoscaler/orchestrator replaces it.
- [ ] Zone failure: lose one availability zone → service continues within SLO.
- [ ] Database failover: primary → replica promotion; connection strings/drivers reconnect; committed transactions preserved; replication lag measured.
- [ ] Cache failure: cache node lost → fallback to DB without overload (thundering-herd protection).
- [ ] Message broker node failure: no message loss for persistent queues; consumers reconnect.
- [ ] Region failover (if multi-region): DNS/global load balancer switch, data replication state, failback procedure.

**Backup and restore / DR**
- [ ] Backups run per schedule, encrypted, stored off-site/immutable (ransomware protection), monitored.
- [ ] Restore tested regularly: full restore and point-in-time recovery to a specific timestamp; restored data verified (counts, checksums, application-level checks).
- [ ] DR drill: invoke DR plan, measure actual RTO and RPO against targets; runbook accuracy; communication tree.
- [ ] Configuration, secrets, infrastructure-as-code and certificates recoverable, not just data.

**Dependency failure handling**
- [ ] Each dependency: down, slow (latency injection), erroring (5xx), returning bad data, rate-limiting (429), DNS failure, TLS error.
- [ ] Timeouts set and shorter than callers' timeouts (timeout budget along the call chain).
- [ ] Retries only for idempotent operations, bounded, with exponential back-off and jitter; no retry storms.
- [ ] Circuit breakers open at thresholds, fail fast, half-open probe, close on recovery.
- [ ] Bulkheads isolate resource pools so one failing dependency does not exhaust shared threads/connections.
- [ ] Fallbacks/graceful degradation: cached data, default recommendations, "service temporarily unavailable" for non-critical features while core flows continue.

**Data integrity under failure**
- [ ] Idempotency keys/deduplication for payments, orders, messages.
- [ ] Transactions atomic; sagas with compensation for distributed operations; outbox pattern for event publishing.
- [ ] No partial writes visible to users; reconciliation detects and repairs inconsistencies.
- [ ] Queues durable; poison messages to DLQ; replay after outage processes backlog in order (where required).

**Capacity and self-healing**
- [ ] Autoscaling triggers and limits; scale-out time vs traffic ramp.
- [ ] Load shedding/admission control under overload (429/503 with Retry-After) protecting core services.
- [ ] Resource exhaustion: disk full, memory pressure/OOM kill, file handles, connection pools, thread pools, CPU throttling.
- [ ] Restarts and crash loops handled (liveness/readiness probes correct, back-off).

**Deployment and operations**
- [ ] Zero-downtime deployments (rolling, blue-green, canary) without failed requests or session loss.
- [ ] Rollback within target time; database migrations backward compatible (expand/contract).
- [ ] Certificate and secret rotation without downtime; expiry alerts.
- [ ] Clock/NTP drift, DNS TTLs, leap-second/DST behaviour of schedulers.

**Observability and response**
- [ ] Alerts fire for each injected failure within target time and reach on-call; dashboards show the impact.
- [ ] Logs/traces identify the failing component; runbooks accurate; incident communication (status page) tested.

**Client-side resilience (mobile/web/desktop)**
- [ ] Offline mode and sync; retry with user feedback; no data loss on app crash or kill; resumable uploads.

## Design techniques
From Domain_Test_Design_Skill-Core-Techniques:
- **Failure mode and effects analysis (FMEA)** per component and dependency to choose experiments.
- **Chaos experiment design**: steady-state hypothesis (e.g. "checkout success ≥ 99 %, p95 < 2 s"), inject one fault, limit blast radius, observe, abort conditions, learn.
- **State transition** for circuit breakers (closed → open → half-open → closed) and failover states.
- **Boundary value analysis** on timeouts, retry counts, thresholds, replication lag, RPO/RTO limits.
- **Decision tables** for fallback behaviour per dependency state.
- **Scenario-based testing** of disasters (zone loss, region loss, ransomware, data corruption, third-party outage).
- **Error guessing** from past incidents and post-mortems.

## Scenario patterns
### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Instance failover | Terminate 1 of 4 app pods under normal load | No user-visible errors beyond in-flight retries; pod replaced within 60 s; SLO held |
| Database failover | Force primary DB failover | Application reconnects within 30 s; no committed data lost; error rate spike < agreed threshold |
| Backup restore | Point-in-time restore to 10:15:00 in an isolated environment | Data as of 10:15:00; application checks pass; time to restore recorded |
| Circuit breaker | Recommendation service down | Breaker opens after threshold; product page shows without recommendations; checkout unaffected |
| Zero-downtime deploy | Rolling deployment during synthetic traffic | 0 failed requests; sessions preserved |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Dependency timeout | Payment provider latency 30 s | Call times out at configured limit; user sees pending status; no double charge on retry |
| Retry storm prevention | Downstream returns 503 to all callers | Bounded retries with back-off; downstream recovers; no cascading failure |
| Poison message | Malformed message on order queue | Moved to DLQ after N attempts; queue keeps flowing; alert raised |
| Disk full | Log volume fills | Service degrades predictably; alert; no data corruption; recovers after cleanup |
| Expired certificate | Internal mTLS cert expires | Alert before expiry; on expiry clear failure and documented recovery |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| RTO limit | DR invocation with RTO 60 min | Service restored and verified in ≤ 60 min |
| RPO limit | Async replication lag with RPO 5 min | Measured data loss ≤ 5 min of transactions; documented |
| Breaker threshold | Error rate at threshold − 1 % and + 1 % | Breaker stays closed below; opens above |
| Retry count | Failure persists past max retries | Stops at max; error surfaced; no further attempts |
| Autoscale limit | Traffic exceeds max instance count | Load shedding engages; core service protected; alert |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Zone outage game day | Simulate loss of one availability zone during peak traffic | Traffic served from remaining zones; SLO held or within impact tolerance |
| Regional DR drill | Fail over to DR region, run business checks, fail back | RTO/RPO met; data consistent after failback |
| Outage and backlog | Consumer service down 1 h, then restored | Backlog processed; no loss/duplicates; downstream reconciled |
| Ransomware recovery | Restore from immutable backup into clean environment | Systems recovered; data integrity verified; credentials rotated |
| Third-party outage | SMS/OTP provider down | Fallback provider or alternative factor offered; login still possible |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Payments continuity | Core banking DB failover mid-transfer | Transfer either completes once or is rolled back; customer sees accurate status |
| Hospital system downtime | EHR unavailable for 2 h | Downtime procedures (read-only view/BCP report) available; data re-entered and reconciled after recovery |
| Retail peak | CDN partial outage during sale | Origin shielding/failover CDN keeps storefront available |
| Payroll deadline | Batch server fails during payroll run | Job restarts from checkpoint; payroll completes before bank cut-off |
| Regulatory resilience | Important business service impact tolerance test (DORA/PRA) | Service stays within impact tolerance under severe but plausible scenario; evidence recorded |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Split brain | Network partition between DB nodes | Only one primary accepts writes (quorum); no divergent data |
| Clock skew | Node clock 5 min off | Tokens, schedulers and ordering behave correctly or alert |
| Partial failure | One of three replicas returns stale data | Reads served per consistency setting; stale data not used for critical decisions |
| Cascading timeouts | Caller timeout shorter than callee's | Timeout budget prevents wasted work; detected in review |
| Failback | Return to primary region after DR | No data loss of transactions made in DR; replication resynchronised |

## Entry and exit criteria
**Entry**: critical services, SLOs, RPO/RTO and impact tolerances agreed; architecture and dependency map; observability in place; experiment plan with blast radius, abort criteria and approvals; backups available; non-production (or approved production) environment.
**Exit**: planned failure scenarios executed; RPO/RTO measured and met (or gaps with remediation plans); alerts and runbooks validated; data integrity verified after each experiment; findings tracked to closure; DR test report signed off.

## Metrics
- Measured RTO and RPO vs targets per service.
- Availability (SLO attainment) and error budget burn during experiments.
- Mean time to detect (MTTD), mean time to recover (MTTR).
- Number of experiments run, weaknesses found and fixed; single points of failure remaining.
- Backup success rate and restore test success rate.

## Tools and automation
- Chaos and fault injection: Chaos Mesh, LitmusChaos, Gremlin, AWS Fault Injection Service, Azure Chaos Studio, Chaos Toolkit, Toxiproxy (network faults), Istio/Linkerd fault injection, `tc netem` for latency/packet loss.
- Resilience libraries to verify: Resilience4j, Polly (.NET), opossum (Node), Envoy circuit breaking.
- DR/backup: cloud backup services, database PITR, Velero (Kubernetes), runbook automation.
- Observability: Prometheus/Grafana, Datadog, Dynatrace, New Relic, Azure Monitor, CloudWatch, PagerDuty/Opsgenie.
- Automation folder (<AppName>/): run `@smoke` journeys continuously as synthetic traffic during experiments (`npx playwright test --grep @smoke --repeat-each` with retries off) and use pass rate/latency as the steady-state signal; simulate dependency failures at the UI layer with `page.route` (abort, delay, 503) to verify fallbacks and error messages, tag `@resilience @feature:<Component>`; API services assert idempotent retry behaviour; Allure shows failures per experiment window.
- Do not automate without approvals: production chaos experiments, DR invocations (run as scheduled game days with change control).

## Common pitfalls
- Backups that are never restored (untested backups are hopes, not backups).
- Retries without idempotency, causing duplicate payments/orders.
- Chaos experiments without steady-state metrics or abort conditions.
- Testing failover of instances but not of dependencies, DNS, identity provider or third parties.
- RTO measured to "servers up" instead of "business service verified".

## Related sub-skills
Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-Domain-FinancialServices, Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Core-RiskAndData.
