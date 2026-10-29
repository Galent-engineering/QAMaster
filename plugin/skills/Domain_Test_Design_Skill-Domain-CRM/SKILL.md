---
name: "Domain_Test_Design_Skill-Domain-CRM"
description: "CRM domain test design sub-skill of Domain_Test_Design_Skill: generic and custom customer relationship management (Dynamics 365, HubSpot, Zoho, Freshworks, custom CRMs) covering sales force automation, CPQ and quoting, marketing automation, customer service and contact centre, partner management and analytics, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a CRM, lead or pipeline management tool, helpdesk / ticketing system, contact-centre agent desktop, marketing automation platform or customer portal, or when TestGen / Domain_Test_Design_Skill routes a CRM application here (Salesforce orgs go to Domain_Test_Design_Skill-Domain-Salesforce)."
---

# CRM — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers platform-agnostic customer relationship management: leads to revenue, campaigns, service cases and SLAs, with data quality, consent and sharing rules as the main risks. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Modules:** sales force automation (leads, accounts, contacts, opportunities, pipeline, forecasting), CPQ and quotes, marketing automation (campaigns, segments, journeys, landing pages, forms), customer service (cases, SLAs, knowledge base, omni-channel routing), contact centre (CTI, IVR, chat, call recording), partner / channel management, customer portal, analytics and dashboards.
- **Users:** sales reps, sales managers, marketers, service agents, supervisors, partners, customers on the portal, administrators.
- **Platform note:** Salesforce-specific behaviour (governor limits, profiles / permission sets, Flows, Apex, LWC) is covered by Domain_Test_Design_Skill-Domain-Salesforce.

## Detection signals

- Terms: lead, contact, account, opportunity, pipeline, stage, forecast, quote, price book, territory, campaign, segment, journey, unsubscribe, case, ticket, SLA, escalation, queue, knowledge article, CSAT, NPS, activity, owner.
- Screens/routes: `/leads`, `/contacts`, `/accounts`, `/opportunities`, `/deals`, `/pipeline`, `/quotes`, `/campaigns`, `/cases`, `/tickets`, `/knowledge`, `/reports`.
- Fields: lead source, lead score, stage, probability, close date, amount, owner, priority, status, SLA due, consent / opt-in.

## Business objects and workflows

### Business objects
Lead, Contact, Account, Opportunity, Opportunity line item, Product, Price list / price book, Quote, Order, Contract, Campaign, Campaign member, Segment / list, Email template, Consent record, Case / ticket, SLA policy, Business-hours calendar, Queue, Knowledge article, Activity (call, email, meeting, task), Territory, User / team, Survey response.

### Core workflows
1. Capture leads (web form, import, API, chat) → deduplicate → score → assign.
2. Qualify and convert leads to account, contact and opportunity.
3. Progress opportunities through stages with required fields and stage gates.
4. Build quotes with products, discounts and approvals; generate quote documents.
5. Close won / lost; hand off orders to ERP; update forecasts.
6. Plan campaigns → segment audiences → send → track responses → attribute revenue.
7. Manage consent and preferences (opt-in, opt-out, double opt-in).
8. Create cases from email, chat, phone, portal or social → route → apply SLA timers.
9. Escalate, resolve and close cases; send satisfaction surveys.
10. Author, review, publish and link knowledge articles.
11. Reassign territories and ownership; recalculate sharing.
12. Merge duplicate records and process data-subject requests.

### Object lifecycles
- **Lead:** New → Working / Contacted → Nurturing → Qualified → Converted / Disqualified.
- **Opportunity:** Prospecting → Qualification → Proposal / Quote → Negotiation → Closed won / Closed lost; Reopened per permission.
- **Case:** New → Assigned → In progress → Waiting on customer (SLA paused) → Escalated → Resolved → Closed → Reopened.
- **Quote:** Draft → In review / Needs approval → Approved / Rejected → Presented → Accepted / Expired.

## Regulations and standards

- Privacy: GDPR (lawful basis, consent, right of access / erasure / portability), UK GDPR, CCPA/CPRA, DPDP Act 2023 (India), LGPD (Brazil).
- Electronic marketing: CAN-SPAM (US), CASL (Canada), TCPA (US telemarketing / SMS, Do Not Call), EU ePrivacy Directive and national rules (e.g. PECR in the UK).
- Payments in contact centres: PCI DSS (pause-and-resume or DTMF masking for card capture).
- Call recording consent rules (one-party / all-party consent jurisdictions).
- Accessibility for customer portals: WCAG 2.2 AA, ADA, EN 301 549 / European Accessibility Act.
- Security assurance for SaaS CRM: SOC 2, ISO 27001.

## Risk hotspots

- Duplicate detection and merge (data loss on merge, child-record re-parenting).
- Assignment rules, round-robin and territories.
- SLA timer calculation (business hours, holidays, pause states, time zones).
- Consent enforcement in campaigns and suppression lists.
- Record- and field-level visibility (sharing rules, roles, teams).
- Integration sync (ERP, email, telephony, marketing tools) and conflicts.
- Bulk imports and mass updates.
- Workflow automation side effects (loops, duplicate emails, cascading updates).
- Discount approvals and quote pricing.
- Forecast roll-ups by hierarchy and period.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Lead score | Score = Σ(attribute points) + Σ(behaviour points) − decay; MQL when score ≥ threshold | Score at threshold − 1, threshold; decay after N days |
| Assignment | Match territory / rule criteria in order; first match wins; else default queue; round-robin among active users | Records matching multiple rules; inactive users in rotation |
| Duplicate match | Exact / fuzzy match on email, phone, name + company; above threshold → block or warn | Case, whitespace, accent and format variants |
| Discount approval | Discount ≤ level-1 limit → none; ≤ level-2 → manager; above → director | Each limit and limit + 0.01 |
| Quote total | Line = qty × unit price × (1 − line discount); total = Σ lines − header discount + tax | Mixed discounts; rounding per currency |
| Weighted pipeline | Weighted amount = amount × stage probability; forecast = Σ in period by category | Opportunities closing on period edges |
| SLA due time | Due = created time + target, counted only within business hours and excluding holidays; pause while waiting on customer | Creation after hours, before holiday, with pauses |
| Escalation | If not first-responded by due time → escalate to next level and notify | Response at due − 1 min, due, due + 1 min |
| Consent / suppression | Send only if consent status permits the channel and purpose; global unsubscribe overrides list membership | Opted out, pending double opt-in, expired consent |
| Merge survivorship | Master record keeps non-blank values per field rule; children re-parented; merged record audit kept | Conflicting values in each field |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Lead scoring and assignment, stage rules, quote pricing and discount approval, SLA timers, escalation, merge |
| Regression | Workflow / automation rules after configuration changes, integration mappings, report definitions |
| API | Lead and contact APIs, email / telephony connectors, ERP sync, webhooks, bulk APIs |
| UI/UX | Agent console efficiency, 360° customer view, mobile CRM, inline editing and list views |
| Localisation | Multi-currency opportunities and exchange rates, local time for SLA, translated knowledge articles and templates |
| Accessibility | Agent console and customer portal WCAG 2.2 AA |
| Security | Record-level sharing, field-level security, export restrictions, consent, portal user isolation |
| Performance | Bulk import, campaign send volume, agent console load time with large account histories, report runtimes |
| Integration | ERP (orders, invoices), email and calendar, CTI / telephony, marketing tools, data enrichment, identity provider |
| Data migration | Legacy CRM migration: records, relationships, owners, activities, attachments and audit history |
| Resilience | Sync retry and conflict resolution, email ingestion outage recovery, queue backlog processing |

## Scenario bank

ID convention `CRM-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-POS-001 | Web form lead submitted with valid data | Lead created; scored; assigned per territory rule; auto-response email sent | P1 |
| CRM-FUN-POS-002 | Convert qualified lead | Account, contact and opportunity created and linked; lead marked converted | P1 |
| CRM-FUN-POS-003 | Create a quote with two products and a discount within limit | Quote total equals formula; PDF generated; no approval required | P1 |
| CRM-FUN-POS-004 | Inbound support email creates a case | Case created with contact matched, queue assigned and SLA due time set | P1 |
| CRM-FUN-POS-005 | Publish a knowledge article and link it to a case | Article visible to agents and portal per visibility setting; link recorded | P3 |
| CRM-API-POS-001 | Create contact via REST API with valid token | 201 with id; record visible in UI with correct owner | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-NEG-001 | Import lead file with duplicate emails and invalid phone formats | Duplicates flagged / merged per rule; invalid rows rejected with error report | P1 |
| CRM-FUN-NEG-002 | Send campaign to contact who opted out | Contact excluded; suppression logged | P1 |
| CRM-FUN-NEG-003 | Move opportunity to Closed won without required fields | Blocked with field-level validation | P2 |
| CRM-SEC-NEG-004 | Sales rep opens an account outside their territory via direct URL | Access denied or read-only per sharing model; no data leak in related lists | P1 |
| CRM-SEC-NEG-005 | Portal customer requests another customer's case via ID change | 403/404; no case data returned | P1 |
| CRM-FUN-NEG-006 | Export contacts by a user without export permission | Export option hidden or blocked | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-BVA-001 | Discount at approval threshold (e.g. 20 %), 20.01 % | ≤20 %: no approval; >20 %: routed to manager | P1 |
| CRM-FUN-BVA-002 | Case SLA breach at exactly target minute | Escalation fires at breach, not before; business hours respected | P1 |
| CRM-FUN-BVA-003 | Lead score at MQL threshold − 1 and threshold | Becomes MQL only at the threshold; routed to sales | P2 |
| CRM-FUN-BVA-004 | Opportunity close date on the last day of the quarter vs the first day of the next | Counted in the correct forecast period | P2 |
| CRM-FUN-BVA-005 | Bulk import at the maximum rows per file and max + 1 | Max processed; above rejected or split with message | P3 |
| CRM-FUN-BVA-006 | Text field at maximum length and max + 1 characters | Max saved intact; above blocked with message | P3 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-E2E-001 | Lead → opportunity → quote → approval → closed won → order to ERP → invoice status back in CRM | Data consistent across systems; revenue in forecast | P1 |
| CRM-FUN-E2E-002 | Customer emails support → case created → routed → resolved → CSAT survey → KB article linked | SLA met; survey response stored against case | P1 |
| CRM-FUN-E2E-003 | Campaign → segment → send → click → form fill → lead → opportunity → won | Campaign influence / attribution reflects the revenue | P2 |
| CRM-INT-E2E-004 | Inbound call via CTI → screen pop of matched contact → call logged → follow-up task | Call activity linked to contact with duration; task assigned | P2 |
| CRM-FUN-E2E-005 | Case escalated through two levels → resolved by tier 2 → closed → reopened by customer reply | Escalation history kept; SLA restarted per policy on reopen | P2 |
| CRM-FUN-E2E-006 | Partner registers a deal → channel manager approves → opportunity shared with partner | Partner sees only their deals; conflict check against existing opportunities | P3 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-BUS-001 | Key account manager leaves; accounts reassigned | Ownership, open opportunities and activities transferred; sharing recalculated | P1 |
| CRM-FUN-BUS-002 | GDPR erasure request for a contact | PII removed / anonymised across CRM and integrated systems; audit retained | P1 |
| CRM-FUN-BUS-003 | Annual territory realignment | Accounts move to new territories; forecasts and sharing follow; history preserved | P2 |
| CRM-FUN-BUS-004 | Price book update effective on a future date | Quotes before the date keep old prices; new quotes after the date use new prices | P2 |
| CRM-FUN-BUS-005 | VIP customer case gets priority routing | Case routed to the premium queue with shorter SLA | P2 |
| CRM-FUN-BUS-006 | Customer submits data access request | Export of personal data from all modules delivered within the legal deadline | P2 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CRM-FUN-EDG-001 | Case raised Friday 17:59 with 2-hour business-hours SLA and Monday holiday | Breach time = Tuesday 10:59 per calendar | P1 |
| CRM-FUN-EDG-002 | Two agents edit the same case simultaneously | Conflict detected; no silent overwrite | P2 |
| CRM-FUN-EDG-003 | Merge two contacts each with open cases and opportunities | All child records re-parented to the survivor; nothing lost | P1 |
| CRM-FUN-EDG-004 | Workflow rule updates a field that triggers the same rule | No infinite loop; recursion guard stops after one execution | P2 |
| CRM-INT-EDG-005 | Same account updated in CRM and ERP within the same sync interval | Conflict resolved per system-of-record rule; no data ping-pong | P2 |
| CRM-FUN-EDG-006 | Opportunity in a foreign currency after the exchange rate changes | Converted amounts follow the dated-rate rule; closed deals keep their rate | P3 |

## Integrations

ERP (accounts, orders, invoices, credit status), email and calendar (Exchange / Microsoft 365, Gmail), CTI and telephony, chat and messaging channels, marketing automation and ad platforms, data enrichment providers, e-signature, CPQ and billing, customer portal, identity provider (SSO, SCIM), BI / data warehouse, consent management platforms.

## Non-functional profile

- **Performance:** bulk imports of hundreds of thousands of records; campaign sends at volume within throttling limits; agent console and 360° view load times with long histories; report and dashboard runtimes.
- **Security and privacy:** record- and field-level access, export controls, consent enforcement, portal isolation, audit trails.
- **Availability:** contact-centre hours (often 24×7); email-to-case ingestion without loss.
- **Accessibility and localisation:** WCAG AA agent console and portal, multi-currency, local business hours and holidays.

## Test data

Seeded duplicates (case, whitespace, accent variants); contacts with all consent states; accounts with large activity histories; business-hour calendars with holidays; users in each role, territory and team; products with multiple price books and currencies; email templates per language.

## Automation notes

- Automate first: lead capture and conversion, opportunity stage progression, quote with approval, case creation and SLA, campaign suppression.
- Oracles: independent SLA due-time calculator using the business-hours calendar; quote total calculator; sharing matrix by role.
- Create records via APIs and clean up per test; avoid shared accounts across parallel runs.
- In the application's automation folder (<AppName>/): page objects for leads, opportunities, quotes, cases and the agent console; API services for CRM records and webhooks; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-Salesforce, Domain_Test_Design_Skill-Domain-HRM, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-Techniques.
