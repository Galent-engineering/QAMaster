---
name: "Domain_Test_Design_Skill-App-CloudSaaS"
description: "Cloud and SaaS (multi-tenant platforms, subscription products, PaaS-hosted apps) test design sub-skill of Domain_Test_Design_Skill: detection signals, focus areas (tenant isolation, configuration per tenant, entitlements and licensing, provisioning, SSO/SCIM, zero-downtime upgrades, data residency, backup/restore, elasticity, API limits, webhooks, observability), checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, test-type applicability, tooling and pitfalls. Use when the application under test is delivered as a cloud service or SaaS, or when Domain_Test_Design_Skill routes a SaaS application here."
---

# Cloud / SaaS (sub-skill of Domain_Test_Design_Skill)

Platform-specific test design for multi-tenant cloud services. Usually combined with Domain_Test_Design_Skill-App-Web and -App-API, plus a domain sub-skill.

## Detection signals
- Tenant / organisation / workspace IDs in URLs or tokens, subdomains per customer.
- Plans, subscriptions, seats, feature flags, admin consoles, SCIM endpoints, webhooks.
- Infrastructure as code (Terraform, Bicep, CloudFormation), Kubernetes manifests.

## Focus areas
Multi-tenancy isolation, per-tenant configuration, subscription/licensing/entitlements, onboarding and provisioning, SSO (SAML/OIDC) and SCIM, upgrades without downtime, feature flags, data residency, backup/restore, elasticity/autoscaling, API limits and quotas, integrations/webhooks, observability, shared-responsibility security, billing and metering, tenant offboarding and data export.

## Checklist
- [ ] Tenant A cannot see or infer Tenant B data: UI, API, search, exports, reports, caches, logs, error messages.
- [ ] Tenant configuration changes apply only to that tenant.
- [ ] Plan upgrade/downgrade toggles entitlements immediately; data retained per policy.
- [ ] Seat/quota limits enforced with clear messages.
- [ ] Provisioning: new tenant ready within SLA with defaults.
- [ ] SSO per tenant; SCIM create/update/deactivate propagates in all channels.
- [ ] Rolling deployment during active sessions: no session loss; feature flags honoured.
- [ ] Data residency: data stored/processed in the tenant's region.
- [ ] Backup/restore per tenant meets RPO/RTO.
- [ ] Webhooks: signed, retried with back-off, dead-lettered, replayable.
- [ ] Usage metering matches billing.
- [ ] Offboarding: export complete; data deleted after retention.

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Tenant sign-up | Create trial workspace | Workspace provisioned with defaults; admin email sent |
| Upgrade plan | Free → Pro | Pro features unlocked immediately; invoice prorated |
| SSO login | User signs in via tenant IdP | Lands in own tenant with mapped role |
| SCIM provisioning | IdP creates user | User exists with correct groups |
| Webhook | Subscribe to `invoice.paid` | Event delivered with valid signature |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Cross-tenant access | Use Tenant B id with Tenant A token | 403/404; nothing leaked |
| Feature beyond plan | Free user calls Pro API | 402/403 with upgrade message |
| Seat limit | Add user when seats full | Blocked with clear message |
| Deactivated user | SCIM-deactivated user uses old session | Session revoked; access denied |
| Wrong region | Upload in EU tenant routed to US | Refused or stored in EU only |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Seats | seats − 1, seats, seats + 1 | Allowed, allowed, blocked |
| API quota | Requests at quota and quota + 1 | Allowed; 429 |
| Storage quota | Usage at 100 % | Uploads blocked; read still works |
| Trial expiry | Last minute of trial vs first after | Full access; downgraded/locked |
| Tenant name | Min/max length, reserved names | Accepted / rejected per rules |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Lead-to-tenant | Sign-up → onboarding → first value → billing | Tenant active; first invoice correct |
| Joiner-mover-leaver | IdP create → group change → deactivate | Access changes everywhere within SLA |
| Cancellation | Cancel subscription → export → deletion | Export complete; data deleted after retention |
| Disaster recovery | Region failover | Service restored within RTO; data loss ≤ RPO |
| Integration | Webhook → partner system → callback | Both systems consistent |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| Enterprise rollout | Tenant with 10 000 users via SCIM | All provisioned; performance acceptable |
| Reseller | Partner manages child tenants | Partner sees only own children |
| Audit | Tenant admin exports audit log | All admin actions with who/what/when |
| Compliance | Customer requests data deletion (GDPR) | Personal data erased; proof provided |
| Seasonal growth | Usage doubles | Autoscaling keeps SLA; bill reflects usage |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Deploy mid-transaction | Release during checkout | Transaction completes once |
| Flag flip | Feature flag toggled during a session | Consistent behaviour; no half-state |
| Noisy neighbour | One tenant floods requests | Other tenants unaffected (throttling) |
| Mid-cycle downgrade | Downgrade with data over new limit | Data retained read-only per policy |
| Cache poisoning | Shared cache key collision | Tenant-specific keys; no leakage |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional, Regression, API, Security (multi-tenant), Performance (elasticity), Resilience | ● |
| UI/UX, Accessibility, Localisation, Compatibility | ● (through web/mobile clients) |
| Integration, Data migration | ● (SSO, SCIM, webhooks, tenant import) |

## Tools and automation
- Automation folder (<AppName>/): one `.env` per tenant/environment; API services to provision tenants and users in setup; tag tenant-isolation tests `@security`.
- Chaos tooling (AWS FIS, Azure Chaos Studio, Litmus) for resilience with authorisation; cloud cost/usage APIs for metering checks.

## Common pitfalls
- Testing with one tenant only.
- Skipping caches, search indexes and exports in isolation tests.
- Ignoring entitlements after downgrade and offboarding data handling.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Integration
