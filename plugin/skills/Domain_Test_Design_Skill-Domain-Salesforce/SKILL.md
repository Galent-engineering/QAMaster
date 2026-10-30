---
name: "Domain_Test_Design_Skill-Domain-Salesforce"
description: "Salesforce domain test design sub-skill of Domain_Test_Design_Skill: Sales Cloud, Service Cloud, Experience Cloud, Marketing Cloud, Commerce Cloud, CPQ / Revenue Cloud, Field Service, Health Cloud, Financial Services Cloud, AppExchange packages and custom Apex / LWC, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a Salesforce org, Lightning app, Experience Cloud site, CPQ, Flows, Apex, MuleSoft integration or a Salesforce-based CRM, or when TestGen / Domain_Test_Design_Skill routes a Salesforce application here."
---

# Salesforce — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for applications built on the Salesforce platform: standard and custom objects, declarative automation (Flows, validation rules, approval processes), programmatic customisation (Apex, LWC), the sharing model, CPQ pricing, Experience Cloud sites and integrations through the platform APIs. Testing is done from the UI and the APIs but must respect platform behaviour (order of execution, governor limits, three releases a year). Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Clouds / sub-domains:** Sales Cloud (leads, opportunities, forecasting), Service Cloud (cases, entitlements, omni-channel, knowledge), Experience Cloud (customer / partner portals), Marketing Cloud and Account Engagement (journeys, consent), Commerce Cloud (B2C / B2B storefronts), CPQ and Revenue Cloud (configure-price-quote, billing, renewals), Field Service (work orders, scheduling, mobile), Industry clouds (Health, Financial Services, Manufacturing, Public Sector), AppExchange managed packages, custom Apex / LWC / Visualforce.
- **Users:** sales reps, sales managers, service agents, supervisors, partners, customers (community users), guest users, integration users, admins, release managers.
- **Platform facts that drive testing:** multi-tenant, metadata-driven, Spring / Summer / Winter releases with preview sandboxes, governor limits per transaction, sandboxes (Developer, Developer Pro, Partial Copy, Full), deployments through change sets, Salesforce CLI / DevOps Center or third-party pipelines.

## Detection signals
- URLs containing `lightning.force.com`, `my.salesforce.com`, `/lightning/r/`, `/lightning/o/`, `site.com`, `/s/` (Experience Cloud), `/apex/` (Visualforce).
- DOM with `lightning-*`, `force-*`, `slds-*` classes, Aura / LWC components, record pages with Highlights panel, Path, Related lists, Chatter feed.
- Objects / terms: Lead, Account, Contact, Opportunity, Case, Quote, Order, Product2, Pricebook, Campaign, Entitlement, Work Order, Record Type, Profile, Permission Set, Sharing Rule, Flow, Apex, Trigger, Platform Event.
- IDs of 15 / 18 characters starting with object key prefixes (`001` Account, `003` Contact, `006` Opportunity, `500` Case, `00Q` Lead).
- API paths `/services/data/vNN.N/`, `/services/apexrest/`, Bulk API 2.0 jobs, `oauth2/token`.

## Business objects and workflows

### Business objects
Lead, Account (business / person account), Contact, Opportunity, Opportunity Line Item, Product2, Pricebook and Pricebook Entry, Quote / SBQQ__Quote__c (CPQ), Quote Line, Contract, Order, Asset, Subscription, Case, Entitlement, Milestone, Knowledge Article, Campaign, Campaign Member, Task / Event, Territory, User, Role, Profile, Permission Set / Permission Set Group, Queue, Custom objects and custom metadata, Platform Events.

### Core workflows
1. Capture lead (web-to-lead, import, API, Marketing Cloud) and de-duplicate (matching / duplicate rules).
2. Assign lead (assignment rules, queues, territory, round-robin Flow).
3. Qualify and convert lead to Account, Contact and Opportunity.
4. Progress opportunity through sales stages (Path, stage validation, probability, forecast category).
5. Configure products, price and generate quote (CPQ product / price rules, discount schedules, approvals).
6. Approve quote (approval process / Advanced Approvals) and generate quote document.
7. Close opportunity won / lost; create order and contract; hand off to ERP / billing.
8. Renew and amend contracts (CPQ renewals, co-termination, amendments).
9. Create case (email-to-case, web-to-case, portal, chat, phone), route (omni-channel, assignment rules), apply entitlement, track milestones, escalate, resolve, close, survey.
10. Publish and use knowledge articles (draft → review → publish → archive).
11. Grant and revoke access (profiles, permission sets, sharing rules, role hierarchy, territory, manual sharing).
12. Run campaigns and track attribution; manage consent and unsubscribes.
13. Release management: deploy metadata, run Apex tests, validate in preview sandbox before each seasonal release.

### Object lifecycles
- **Lead:** Open – Not Contacted → Working – Contacted → Qualified → Converted (or Unqualified / Recycled).
- **Opportunity:** Prospecting → Qualification → Needs Analysis → Value Proposition → Proposal / Price Quote → Negotiation / Review → Closed Won | Closed Lost (stages configurable per sales process / record type).
- **Case:** New → Working → Escalated → On Hold (milestone clock paused if configured) → Closed; reopen allowed within a configured window.
- **CPQ Quote:** Draft → In Review → Approved / Rejected → Presented → Accepted → Ordered (Order generated, Contract created).

## Regulations and standards
- **Platform:** governor limits (e.g. 100 synchronous SOQL queries, 150 DML statements, 50 000 rows retrieved per transaction; 10 000 DML rows), Apex test coverage ≥ 75 % for production deployment, order of execution of save operations.
- **Data protection:** GDPR, CCPA / CPRA, India DPDP Act (consent, data subject rights, retention, Individual object / consent objects).
- **Marketing:** CAN-SPAM, CASL, TCPA (US calls / SMS), PECR (UK) for consent and unsubscribe.
- **Industry clouds:** HIPAA (Health Cloud), GLBA / FINRA record keeping (Financial Services Cloud), FedRAMP authorisation (Government Cloud).
- **Security:** Salesforce Shield (Platform Encryption, Event Monitoring, Field Audit Trail), AppExchange security review for managed packages, SOX controls for revenue (CPQ / Billing) and deployment segregation of duties.
- **Accessibility:** WCAG 2.1 / 2.2 AA for Experience Cloud sites and custom LWC (SLDS base components are designed for accessibility; custom code must be verified).

## Risk hotspots
- Sharing model gaps: users seeing records through role hierarchy, sharing rules, manual shares, implicit sharing or Apex `without sharing`.
- Profile / permission set changes widening object, field (FLS) or system permissions.
- Flow and trigger recursion; order of execution conflicts between Flows, triggers, validation rules and workflow.
- Governor limit failures on bulk operations (data loads, integrations, mass updates > 200 records per trigger batch).
- CPQ pricing waterfall errors, discount schedule tiers, proration and renewal uplift.
- Validation rules blocking integrations or data loads.
- Guest user access on Experience Cloud sites (over-exposed records through guest sharing rules or Aura endpoints).
- Seasonal release updates and critical updates changing behaviour; deprecated API versions.
- Lightning vs Classic differences; dynamic DOM making UI automation brittle.
- Duplicate rules and matching rules (false merges, missed duplicates).
- Time zone and currency (advanced currency management, dated exchange rates).

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| CPQ price waterfall | List price → contracted price → special price → regular price (after block / discount schedule) → customer price (additional discount) → partner price (partner discount) → net price (distributor discount) | Configure one product per step; assert each price field on the quote line against an independently computed value |
| Volume discount schedule (range) | Range: whole quantity priced at the tier it falls in; Slab: each unit priced in its own tier | Quantities at tier lower bound − 1, bound, bound + 1 for both types |
| Proration | Prorated price = unit price × (subscription term in days or months ÷ default term), per CPQ proration settings | Mid-term amendment with start date at day 1, mid-term and last day |
| Renewal uplift | Renewal price = previous net price × (1 + uplift %) | Renew contracts with 0 %, typical and maximum uplift |
| Opportunity stage validation | Stage ≥ Proposal requires Amount > 0 and at least one product; Closed Won requires Close Date ≤ today | Each missing field triggers the validation message; valid set saves |
| Approval threshold | Discount > rep limit (e.g. 20 %) → manager; > manager limit → director | Discount at limit, limit + 0.01 %, both levels |
| Entitlement milestone | Milestone target = start + SLA minutes using the business hours of the entitlement; violation at target time | Start just before close of business, before a holiday, case paused on hold |
| Lead assignment | Rule entries evaluated in order; first match wins; otherwise default owner / queue | One lead per rule entry and one matching none |
| Duplicate rule | Matching rule (exact / fuzzy on name, email, phone) → Alert or Block on create / edit | Exact duplicate, fuzzy duplicate, near-miss, bypass permission |
| Forecast | Forecast amount = Σ opportunity amount (or split amount) by forecast category and period | Opportunities across categories, splits, currencies; compare to report |
| Multi-currency conversion | Converted amount = amount ÷ conversion rate of the record currency (dated rates by close date if ACM) | Records in two currencies, rate change between dates |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Validation rules, Flows, approval processes, record types and page layouts per profile, Path, CPQ calculations, assignment and escalation rules, email templates |
| Regression | Seasonal release regression in the preview sandbox; managed package upgrade regression; release of critical updates; regression of automation after config changes |
| API | REST, SOAP, Bulk API 2.0, Composite and Graph APIs, Apex REST, Platform Events / Change Data Capture, OAuth flows, integration user permissions, API version deprecation |
| UI/UX | Lightning page load (EPT), dynamic forms and actions, list views, mobile app, Experience Cloud site navigation and branding |
| Localisation | Translation Workbench, user locale and language, multi-currency and advanced currency management, time zone per user, address formats |
| Accessibility | Custom LWC and Visualforce, Experience Cloud sites, keyboard navigation of record pages, screen-reader labels on custom components |
| Security | Profile / permission set matrix, OWD and sharing rules, FLS, guest user access, Apex sharing, session settings, login IP ranges, MFA, Shield encryption, connected app scopes |
| Performance | Lightning EPT, report and dashboard run time, bulk loads (Data Loader, Bulk API), large data volume (LDV) queries, skinny tables, CPQ quote calculation time with many lines |
| Integration | MuleSoft / middleware flows to ERP, billing, marketing automation, telephony (CTI), email; retries, idempotency (external IDs and upsert) |
| Data migration | Legacy CRM to Salesforce: external IDs, owner / record type mapping, parent-child load order, duplicate prevention, audit fields, attachments to Files |
| Resilience | Integration outages (queueing, Platform Event replay), API limit exhaustion, Salesforce maintenance windows, read-only mode during instance switches |

## Scenario bank
ID convention: `SFDC-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-FUN-POS-001 | Sales rep creates opportunity with required fields and record type | Saved; correct layout, picklist values and Path stages for the record type | P2 |
| SFDC-FUN-POS-002 | Submit quote for approval with discount within the rep's authority | Auto-approved; quote document generated from the template | P2 |
| SFDC-FUN-POS-003 | Convert a qualified lead choosing an existing account | Contact and opportunity created under the existing account; lead status Converted; campaign history kept | P1 |
| SFDC-FUN-POS-004 | Email-to-case creates a case for a known contact | Case linked to contact and account, entitlement applied, first milestone started, auto-response sent | P1 |
| SFDC-FUN-POS-005 | Publish a knowledge article through the review queue | Article visible to agents and (if channel set) on the portal; version number incremented | P3 |
| SFDC-API-POS-006 | Upsert 1 000 accounts by external ID through Bulk API 2.0 | Job completes; created and updated counts match the input; no duplicates | P2 |
| SFDC-FUN-POS-007 | Mark opportunity Closed Won with products | Order and contract created per automation; forecast updated | P1 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-FUN-NEG-001 | Move opportunity to Closed Won without required products | Validation rule error message displayed; record not saved | P2 |
| SFDC-SEC-NEG-001 | User in Region A opens Region B account through a direct record URL | "Insufficient privileges"; account absent from search, reports, list views and related lists | P1 |
| SFDC-SEC-NEG-002 | Guest user on Experience Cloud site queries records through API / Aura endpoint | No data exposed beyond guest sharing rules | P1 |
| SFDC-SEC-NEG-003 | User without FLS on a salary / discount field opens the record and runs a report | Field hidden on layout, absent from report columns and API responses | P1 |
| SFDC-FUN-NEG-004 | Create a lead that matches an existing contact by email when the duplicate rule blocks | Save blocked with the duplicate message and link to the existing record | P2 |
| SFDC-API-NEG-005 | Call REST API with an expired OAuth access token | 401 INVALID_SESSION_ID; client refreshes token; no data returned | P2 |
| SFDC-FUN-NEG-006 | Discount above the director limit with no approver configured | Submission blocked with a clear message; quote stays in Draft | P2 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-FUN-BVA-001 | Data load of 200, 201 and 10 000 records triggering a Flow | All processed; no governor-limit errors; Flow bulkified (201st record in a second batch) | P1 |
| SFDC-FUN-BVA-002 | Text field at max length (255) and 256 through API | 255 accepted; 256 → STRING_TOO_LONG | P3 |
| SFDC-FUN-BVA-003 | Approval discount at 20.00 % and 20.01 % (rep limit 20 %) | 20.00 % auto-approved; 20.01 % routed to manager | P2 |
| SFDC-FUN-BVA-004 | Volume discount tier 1–9 / 10–49: quantity 9, 10, 49, 50 | Correct tier price per quantity for range and slab schedules | P2 |
| SFDC-FUN-BVA-005 | Entitlement milestone of 4 business hours on a case created 30 min before close of business | Target time falls 3 h 30 min into the next business day | P2 |
| SFDC-API-BVA-006 | Composite request with 25 subrequests and with 26 | 25 succeeds; 26 rejected with a limit error | P3 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-FUN-E2E-001 | Web-to-lead → assignment → conversion → CPQ quote → approval → order → ERP via MuleSoft → contract | Pricing per rules; order synced to ERP with external ID; contract and renewal opportunity created | P1 |
| SFDC-FUN-E2E-002 | Customer creates case in portal → omni-channel routing → agent resolves → knowledge suggested → case closed → survey | Case visible to customer with the right status; entitlement milestones met; survey response linked | P1 |
| SFDC-INT-E2E-003 | Order activated in Salesforce → invoice created in billing system → payment status back on account | Status and amounts consistent across systems; failure path retried and logged | P1 |
| SFDC-FUN-E2E-004 | Campaign → campaign member responds → lead created → nurtured → converted → opportunity attributed | Campaign influence shows the opportunity; ROI report reconciles | P3 |
| SFDC-FUN-E2E-005 | Contract renewal: renewal opportunity generated → renewal quote with uplift → signed → new contract | Renewal price = prior net × (1 + uplift); co-termed subscriptions aligned | P2 |
| SFDC-FUN-E2E-006 | Field Service: case → work order → appointment scheduled → technician completes on mobile → case closed | Appointment status flows back; parts consumed update inventory | P3 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-FUN-BUS-001 | CPQ bundle with volume discount schedule and partner discount | Price waterfall (list → contracted → special → regular → customer → partner → net) correct | P1 |
| SFDC-FUN-BUS-002 | Territory realignment | Accounts and opportunities reassigned; forecast hierarchy updated | P2 |
| SFDC-FUN-BUS-003 | Sales rep leaves; their accounts, opportunities and open tasks are transferred | New owner set; sharing recalculated; open activities moved; history retained | P2 |
| SFDC-FUN-BUS-004 | Mid-term amendment adds 10 licences to an active subscription | Amendment quote prorates the new licences to the contract end date | P1 |
| SFDC-FUN-BUS-005 | Customer exercises GDPR erasure | Personal data anonymised / deleted across objects; consent records updated; audit retained | P1 |
| SFDC-FUN-BUS-006 | Partner user registers a deal in the partner portal | Deal registration approved; opportunity shared with partner; channel manager notified | P3 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SFDC-REG-EDG-001 | Seasonal release preview: run full regression in the preview sandbox | No behaviour change, or changes documented and accepted | P1 |
| SFDC-FUN-EDG-001 | Record edited by a user and by an integration in the same second | Order of execution respected; no lost update; triggers / Flows do not recurse | P2 |
| SFDC-FUN-EDG-002 | Opportunity close date in a fiscal period that crosses a custom fiscal year boundary | Forecast period correct for the custom fiscal year | P3 |
| SFDC-FUN-EDG-003 | Case created on a holiday defined in business hours | Milestone clock starts at next business hours start | P3 |
| SFDC-API-EDG-004 | Daily API request limit reached during an integration run | Integration backs off and resumes; no partial records; alert raised | P2 |
| SFDC-MIG-EDG-005 | Migrated record whose owner is an inactive user | Load mapped to the default owner per mapping rule; no failure | P3 |

## Integrations
ERP (SAP, Oracle, NetSuite) for orders and invoices; billing (Salesforce Billing, Zuora); marketing automation (Marketing Cloud, Account Engagement, HubSpot); MuleSoft / iPaaS; telephony (CTI, Service Cloud Voice); email (Gmail / Outlook integration, Einstein Activity Capture); e-signature (DocuSign, Adobe Sign); data warehouse (Data Cloud, Snowflake); identity (SSO SAML / OIDC, SCIM provisioning).

## Non-functional profile
- Lightning EPT target typically < 3 s for record pages; reports < 10 s for standard volumes.
- LDV: objects with millions of records (selective queries, indexes, skinny tables).
- Bulk API 2.0 jobs up to 150 MB per upload; daily API request entitlement per org.
- Seasonal release cadence: 3 per year, each with preview window (about 4–6 weeks).
- Availability per Salesforce trust status; maintenance windows and read-only mode.

## Test data
Users per profile / permission set / role (rep, manager, agent, partner, customer, guest, integration); sandbox seeding with data templates and anonymisation of Full sandbox copies; CPQ product catalogue with bundles, options, price rules and discount schedules; multi-currency records with dated rates; business hours and holidays; duplicate seed data (exact and fuzzy).

## Automation notes
- Automate first: lead conversion, opportunity-to-order, CPQ pricing, case routing and milestones, sharing / FLS checks per profile, API upserts.
- Prefer API for data setup (REST / Bulk with external IDs) and UI only for the user journey under test; clean up through API.
- Locators: Lightning DOM is dynamic; use stable attributes (`data-target-selection-name`, field API names, `lightning-*` with labels) captured in the page-wise locator files (UI-Locator-Sync).
- Oracles: compute expected prices / milestones independently; compare report totals against API queries.
- Automation mapping (<AppName>/): page objects per record page / Experience page, API services per sObject (`/services/data`), features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-Domain-CRM, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
