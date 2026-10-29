---
name: "Domain_Test_Design_Skill-Domain-Telecom"
description: "Telecom domain test design sub-skill of Domain_Test_Design_Skill: mobile, fixed, broadband, enterprise and OTT service providers (BSS, OSS, charging, billing, self-care, retail POS, dealer portals), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a telecom BSS/OSS, CRM for subscribers, online charging system, billing, number portability, eSIM, self-care app or dealer portal, or when TestGen / Domain_Test_Design_Skill routes a telecom application here."
---

# Telecom — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers communications service providers: subscriber lifecycle, product catalogue, ordering, provisioning, rating and charging, billing, payments and collections, number portability, roaming and assurance. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** prepaid, postpaid and hybrid mobile; fixed line and broadband (FTTH, DSL, fixed wireless); enterprise (MPLS, SIP trunks, bulk SIMs, M2M/IoT); OTT and content bundles; wholesale and interconnect; MVNO / MVNE.
- **Typical systems:** BSS (CRM, product catalogue, CPQ, order management, billing, revenue assurance, collections), OSS (service and resource inventory, activation/provisioning, network management, fault and performance assurance), Online Charging System (OCS) and Policy Control (PCRF/PCF), mediation, self-care web and app, retail POS, dealer/partner portals, IVR, eSIM entitlement server (SM-DP+).
- **Users:** consumers, enterprise admins, retail agents, dealers, call-centre agents, billing operations, network operations, fraud and revenue assurance analysts.

## Detection signals

- Terms: MSISDN, ICCID, IMSI, IMEI, eSIM, SIM swap, port-in/port-out, MNP, UPC/porting code, tariff, plan, bundle, add-on, top-up, recharge, voucher, data pack, roaming, CDR, EDR, rating, bill cycle, dunning, barring, OCS, PCRF.
- Screens/routes: `/recharge`, `/plans`, `/usage`, `/bill`, `/port`, `/activation`, `/sim`, `/roaming`, `/dealer`.
- Data fields: balance, validity, quota (MB/GB/minutes), bill date, credit limit, deposit, contract end date, APN.

## Business objects and workflows

### Business objects
Customer, Account (prepaid / postpaid / hybrid, consumer / enterprise), Subscriber / MSISDN, SIM / eSIM profile (ICCID, IMSI, EID), Device (IMEI), Plan / Tariff, Add-on / Bundle, Balance bucket, Usage record (CDR / EDR), Rated event, Bill / Invoice, Payment, Deposit, Credit limit, Order, Trouble ticket, Port request, Contract, Device instalment plan, Dealer / commission.

### Core workflows
1. Capture customer and complete KYC / eKYC.
2. Select plan, device and add-ons; run credit check (postpaid).
3. Allocate number and SIM / download eSIM profile.
4. Provision services in the network (HLR/HSS, PCRF, voicemail, APN).
5. Recharge / top-up (voucher, card, wallet, auto-top-up).
6. Rate and charge usage (online for prepaid, offline for postpaid).
7. Change plan (upgrade / downgrade, mid-cycle) and add/remove add-ons.
8. Run bill cycle; generate and deliver invoices.
9. Collect payments; allocate to invoices; manage deposits.
10. Dunning: reminders → soft barring → hard barring → disconnection; reconnect on payment.
11. Port in / port out (MNP) through the clearing house.
12. Activate roaming and roaming packs; process TAP files.
13. SIM swap / replacement, number change.
14. Raise and resolve trouble tickets against SLAs.
15. Terminate contract; final bill; refund deposit.

### Object lifecycles
- **Subscriber:** Created → Pending activation → Active → Suspended (voluntary / fraud) → Barred (outgoing / full) → Disconnected → Ported out / Terminated → Number quarantined → Recycled.
- **Order:** Draft → Submitted → Credit-checked → In provisioning → Partially completed → Completed / Failed → Cancelled.
- **Invoice:** Open → Due → Partially paid → Paid / Overdue → Disputed → Adjusted → Written off.
- **Port request:** Requested → Validated by donor → Scheduled → In port window → Completed / Rejected / Cancelled.

## Regulations and standards

- National regulators: TRAI (India), FCC (US), Ofcom (UK), BEREC guidance (EU); number portability rules and timelines; tariff and billing transparency rules.
- Lawful interception and data retention obligations (jurisdiction-specific).
- KYC / eKYC rules for subscriber identification; SIM registration laws.
- EU Roaming Regulation (Roam-like-at-home, fair use policy).
- CPNI rules (US) for customer proprietary network information.
- GDPR (EU), DPDP Act 2023 (India), CCPA/CPRA (California) for subscriber data.
- PCI DSS for card payments in self-care and retail.
- TM Forum frameworks: eTOM (processes), SID (information model), Open APIs (e.g. TMF620 Product Catalog, TMF622 Product Ordering, TMF629 Customer, TMF678 Customer Bill, TMF640 Service Activation).
- 3GPP specifications for charging (online/offline) and 5G SA/NSA; GSMA SGP.22 for consumer eSIM remote provisioning.
- Accessibility law for consumer portals (ADA, EN 301 549 / European Accessibility Act, RPwD Act).

## Risk hotspots

- Rating and charging accuracy (revenue leakage or over-charging).
- Proration on mid-cycle plan changes, activations and terminations.
- Bill-run correctness, completeness and duration.
- Balance consistency between OCS and billing; double deduction on retries.
- SIM swap and port-out fraud (account takeover, OTP interception).
- Activation failures and partial provisioning across the OSS chain.
- Time-zone stamping of roaming usage; late TAP files.
- Tax computation per jurisdiction and service type.
- Usage notifications at quota thresholds and bill-shock limits.
- Number recycling and quarantine periods.
- Dealer commission calculation and clawback.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Mid-cycle upgrade proration | Charge = new monthly rental × remaining days / days in cycle − credit for old rental × remaining days / days in cycle (method per configuration: daily or per second) | Change on day 1, mid-cycle and last day; compare invoice lines to computed values |
| Data quota throttling | If used ≥ 100 % of quota → throttle speed or start overage; notify at configured thresholds (e.g. 80 %, 100 %) | Feed usage to 79.99 %, 80 %, 99.99 %, 100 %, 100.01 % |
| Overage charge | Overage = ceil(excess units / rating unit) × rate per unit | Excess just above 0, at one unit, at many units |
| Prepaid validity | New validity = max(current expiry, today) + pack validity (or per configured stacking rule) | Recharge before and after expiry; stacking two packs |
| Credit limit (postpaid) | Bar outgoing when unbilled + outstanding ≥ credit limit | Usage reaching limit − 0.01, limit, limit + 0.01 |
| Dunning ladder | Day N after due date → reminder; N2 → soft bar; N3 → hard bar; N4 → disconnect | Time-travel test data across each day boundary; payment between steps |
| Late payment fee | Fee applied if payment date > due date (+ grace days) | Pay on due date, due + grace, due + grace + 1 |
| Roaming rating | Rate by visited network zone; pack rates override standard; usage timestamp in event's local or GMT time per contract | Usage at zone borders, pack expiry during trip |
| Family / shared data pool | Pool balance = sum of member allocations; member caps enforced per member | Members consuming concurrently; one member at cap |
| Number quarantine | Released number not reassigned before quarantine period ends | Allocate number one day before and on end of quarantine |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Product catalogue eligibility (plan × device × channel), rating rules, proration, discounts, bundles, barring and reconnection logic, KYC rules |
| Regression | Bill-run comparison (old vs new release on the same data set), tariff regression packs, activation and porting flows |
| API | TM Forum Open APIs (TMF620, TMF622, TMF629, TMF678, TMF640), provisioning APIs, payment gateway, MNP clearing house interfaces |
| UI/UX | Self-care app (usage dashboard, recharge, plan comparison, bill view); retail POS speed and error recovery |
| Localisation | Multi-language self-care, currency and tax by region, roaming usage shown in local time, number formats (E.164) |
| Accessibility | Self-care web/app WCAG 2.2 AA, IVR alternatives, accessible bill PDFs |
| Security | SIM swap / port-out OTP controls, CPNI protection, account takeover, IDOR on bills, fraud rules, dealer data scope |
| Performance | Bill-run window, recharge TPS at festive/New Year peaks, OCS latency (milliseconds), activation throughput |
| Integration | CRM ↔ order management ↔ OSS ↔ network elements; mediation ↔ rating ↔ billing ↔ GL; payment gateways |
| Data migration | Subscriber, balance and contract migration between billing platforms; reconciliation of counts and balances |
| Resilience | OCS failover without lost or double charges, provisioning retry and compensation, mediation backlog recovery |

## Scenario bank

ID convention `TEL-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-POS-001 | Activate a new postpaid connection with valid KYC, plan and SIM | Order completes; MSISDN active on network; welcome SMS; billing account created with correct plan and bill cycle | P1 |
| TEL-FUN-POS-002 | Prepaid recharge with a valid voucher or online payment | Balance and validity updated in real time; SMS confirmation; transaction in history | P1 |
| TEL-FUN-POS-003 | Upgrade plan mid-cycle | New allowances effective per rule; prorated charges on next bill equal the configured formula | P1 |
| TEL-FUN-POS-004 | Download and activate an eSIM via QR code | Profile installed on device; ICCID linked to subscriber; data session works | P1 |
| TEL-FUN-POS-005 | Buy a data add-on from the self-care app | Add-on bucket created with the purchased quota and validity; charge on balance or bill | P2 |
| TEL-PERF-POS-001 | Bill run for 5 million subscribers | Completes within the agreed window; zero rating errors; totals reconcile with rated usage | P1 |
| TEL-API-POS-001 | Create a product order through TMF622 with a valid payload | 201 response with order id; state progresses to completed; services visible in inventory | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-NEG-001 | Activate a SIM whose ICCID is already in use, or a blacklisted IMEI | Rejected with a specific error; no partial provisioning in OSS | P1 |
| TEL-FUN-NEG-002 | Recharge with a used or expired voucher | Rejected; balance unchanged; attempt logged for fraud monitoring | P1 |
| TEL-SEC-NEG-003 | SIM swap request without valid OTP / identity verification | Blocked; customer alerted; SMS-OTP services held per policy | P1 |
| TEL-FUN-NEG-004 | Order a plan not eligible for the customer's channel or device | Order blocked with eligibility message; no charge raised | P2 |
| TEL-FUN-NEG-005 | Port-out request with wrong porting code or name mismatch | Request rejected by donor validation with reason code | P1 |
| TEL-SEC-NEG-006 | Change bill id in the self-care API to another customer's bill | 403/404; no bill data returned; access attempt logged | P1 |
| TEL-API-NEG-007 | Submit TMF622 order with missing mandatory product characteristic | 400 with field-level error; no order created | P3 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-BVA-001 | Data usage at 99.99 %, 100 %, 100.01 % of quota | Notifications at thresholds; throttling / overage starts exactly at 100 % | P1 |
| TEL-FUN-BVA-002 | Recharge at minimum and maximum allowed amount, and ±1 unit | Min and max accepted; out-of-range rejected with message | P2 |
| TEL-FUN-BVA-003 | Call crossing bill-cycle cut-off (starts 23:59:30, ends 00:01:00) | Rated per configured rule (start-time or split); appears on the correct bill | P2 |
| TEL-FUN-BVA-004 | Postpaid usage reaching credit limit − 0.01, limit, limit + 0.01 | Outgoing barred exactly at the limit; alert sent | P1 |
| TEL-FUN-BVA-005 | Payment on due date, due date + grace, due date + grace + 1 day | Late fee only on the last case | P2 |
| TEL-FUN-BVA-006 | Prepaid validity expiring at 23:59:59 vs recharge at 00:00:00 | Validity extended per stacking rule; no balance forfeited before expiry | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-E2E-001 | Order → credit check → activation → first usage → bill run → payment → receipt | CRM, OM, OSS, OCS, billing, payment and GL consistent; invoice matches usage and plan | P1 |
| TEL-FUN-E2E-002 | Port in: request → donor validation → port window → activation | Number active on recipient on the scheduled date; donor deactivated; outage within SLA | P1 |
| TEL-FUN-E2E-003 | Non-payment → reminders → soft bar → hard bar → payment → reconnection | Each dunning step on the configured day; service restored within SLA after payment | P1 |
| TEL-INT-E2E-004 | Roaming usage → TAP file → rating → bill → dispute → adjustment | Usage rated at roaming rates; adjustment credit appears on the next bill | P2 |
| TEL-FUN-E2E-005 | Device on instalment plan → monthly instalment on bill → early termination | Instalments billed monthly; remaining balance billed on termination | P2 |
| TEL-FUN-E2E-006 | Trouble ticket → field visit → resolution → SLA credit | Ticket closed with resolution code; SLA credit applied when breached | P3 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-BUS-001 | Family plan: primary adds 3 members sharing a data pool | Pool decremented correctly; member caps honoured; one consolidated bill | P2 |
| TEL-FUN-BUS-002 | Customer travels abroad, buys a roaming pack, returns home | Pack activated for the country; usage rated at pack rates; alerts sent; home rates resume on return | P2 |
| TEL-FUN-BUS-003 | Enterprise admin bulk-activates 500 SIMs with a pooled plan | All SIMs active; pooled allowance shared; one corporate invoice with per-line detail | P2 |
| TEL-FUN-BUS-004 | Customer downgrades plan at end of contract to avoid penalty | Downgrade effective next cycle; no early termination fee | P3 |
| TEL-FUN-BUS-005 | Prepaid customer converts to postpaid keeping the number | Balance handled per policy (refund or transfer); postpaid account and bill cycle created | P2 |
| TEL-FUN-BUS-006 | Dealer sells a connection and earns commission; customer churns within 90 days | Commission paid, then clawed back per rule | P3 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| TEL-FUN-EDG-001 | Plan change and bill run triggered in the same minute | Deterministic outcome; no double proration; audit trail present | P2 |
| TEL-FUN-EDG-002 | Payment received after barring but before disconnection | Automatic reconnect; late fee per rule; barring lifted within SLA | P1 |
| TEL-FUN-EDG-003 | Roaming CDR arrives 5 days late (TAP delay) | Rated on the correct cycle or next bill per rule; no double charge | P2 |
| TEL-RES-EDG-004 | OCS failover during an active data session | Session continues or re-authorises; usage charged once | P1 |
| TEL-FUN-EDG-005 | Recharge request retried after gateway timeout | Single credit to balance (idempotent); duplicate payment refunded | P1 |
| TEL-FUN-EDG-006 | Daylight-saving change during a night-tariff window | Night-rate boundaries applied per configured time base; no free or double-rated minutes | P3 |

## Integrations

CRM ↔ CPQ ↔ order management; order management ↔ OSS activation ↔ HLR/HSS, PCRF/PCF, voicemail, APN; mediation ↔ OCS / rating ↔ billing ↔ GL; payment gateway and wallets; MNP clearing house; credit bureau; KYC / identity services; SM-DP+ for eSIM; TAP / RAP roaming clearing; SMS gateway; tax engine; dealer commission system; data warehouse and revenue assurance.

## Non-functional profile

- **Performance:** recharge TPS at festive peaks; OCS authorisation in milliseconds; bill run for millions of subscribers within a nightly window; activation throughput for bulk enterprise orders; mediation backlog catch-up.
- **Security and privacy:** SIM swap and port-out controls, CPNI and DPDP/GDPR protection of call records, dealer data scope, lawful-interception confidentiality.
- **Accessibility:** self-care web and app, accessible bill PDFs, IVR alternatives.
- **Localisation:** multiple languages, E.164 numbers, currency and tax by jurisdiction, local time for usage and roaming.

## Test data

Synthetic MSISDN / ICCID / IMSI ranges reserved for test; CDR generators per service (voice, SMS, data, roaming); subscribers in every lifecycle state (active, suspended, barred, terminated, ported out); tariffs with historical versions; time-travel capable bill cycles; test payment cards from the gateway sandbox; eSIM test profiles.

## Automation notes

- Automate first: recharge, activation, plan change with proration, usage threshold notifications, bill view and download (P1 flows).
- Oracles: independently computed proration and overage values; reconciliation of rated usage totals with invoice totals.
- Data setup through provisioning and rating APIs rather than UI; reset balances between scenarios.
- In the application's automation folder (<AppName>/): page objects per self-care screen (plans, recharge, usage, bill), API services for ordering (TMF622) and billing (TMF678), features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
