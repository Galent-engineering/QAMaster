---
name: "Domain_Test_Design_Skill-Domain-EnergyUtilities"
description: "Energy and Utilities domain test design sub-skill of Domain_Test_Design_Skill: electricity, gas and water retail and distribution (customer information and billing, meter-to-cash, smart metering / AMI and meter data management, tariffs and time-of-use pricing, prepayment, outage and work management, net metering and distributed energy, demand response, field service, grid operations interfaces), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a utility CIS / billing system, MDM, AMI head-end, customer self-service portal, outage management, smart meter app, EV charging or energy retail platform, or when TestGen / Domain_Test_Design_Skill routes an energy or utilities application here."
---

# Energy and Utilities — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for utility business systems: customer onboarding and move-in / move-out, meter reading and meter data management, tariff rating and billing (meter-to-cash), payments and collections, prepayment, outage management, field work, distributed generation and net metering, and customer self-service. Billing accuracy, regulatory protections for vulnerable customers and the volume of interval data are the main risks. Testing of operational technology (SCADA / grid control) is limited here to business-system interfaces. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** customer information system (CIS) and billing, meter-to-cash, advanced metering infrastructure (AMI) head-end and meter data management (MDM), tariff / rate engine, prepayment metering, payments and collections, customer self-service portal and app, outage management system (OMS) and interfaces to ADMS / SCADA, work and asset management, field service mobility, distributed energy resources (rooftop solar, batteries, EV charging) and net metering, demand response, energy retail market processes (switching, settlement), water and wastewater billing.
- **Users:** residential and business customers, landlords and tenants, call-centre agents, billing analysts, collections, field technicians, meter readers, outage dispatchers, market operations, regulators (reports).
- **Business drivers:** billing accuracy and timeliness, estimated-bill ratio, days sales outstanding, debt and disconnection policy compliance, outage restoration times (SAIDI, SAIFI, CAIDI), customer complaints, smart meter read rate.

## Detection signals
- UI: account / premise / meter details, consumption charts (daily, half-hourly, 15-minute), tariff plan selection, bill view with line items (standing charge, energy charge, taxes, levies), meter reading submission, outage map and "report an outage", move-in / move-out forms, payment plans, prepay top-up, solar export credit.
- Terms: premise / service point, MPAN / MPRN (UK), NMI (Australia), ESI ID (Texas), consumer number (India), kWh, kW demand, kVAh, power factor, therms / m³, tariff, time-of-use (TOU), tiered / block rates, standing / fixed charge, estimated read, actual read, bill cycle, VEE (validation, estimation, editing), net metering, feed-in tariff, disconnection, reconnection.
- APIs / standards: MDM interval data loads, AMI head-end commands (remote connect / disconnect, on-demand read), CIM (IEC 61968 / 61970), MultiSpeak, Green Button (ESPI), OpenADR for demand response, OCPP for EV chargers, DLMS / COSEM meters.

## Business objects and workflows

### Business objects
Customer, account, premise / service point, service agreement / contract, meter, register, meter read (actual, estimated, customer, smart interval), interval data, tariff / rate plan, rate component (standing charge, energy, demand, TOU bands, tiers), bill, bill line, adjustment, payment, payment arrangement / instalment plan, deposit, security, collections case, disconnection order, prepay account and credit, outage event, outage ticket, work order, field appointment, asset, DER interconnection, export / generation read, demand response event, switching request, settlement record.

### Core workflows
1. Move-in / sign-up: identity and credit check, premise lookup, tariff selection, deposit decision, opening read, welcome pack.
2. Meter reading: scheduled manual read, customer self-read, smart meter interval collection, VEE (validate, estimate, edit), read exceptions.
3. Billing (meter-to-cash): bill determinants from reads → rating against tariff (standing charge, tiered / TOU energy, demand, taxes and levies) → bill review (high / low bill checks) → bill issue (paper / e-bill) → posting to account.
4. Payments: direct debit, card, bank transfer, kiosk / agent, payment allocation to oldest debt, refunds of credit balances.
5. Collections: reminders, payment arrangements, hardship programmes, disconnection notices, protected periods, disconnection and reconnection orders.
6. Move-out: final read, final bill, deposit refund or offset, transfer of service.
7. Rate change: new tariff effective date, proration of bills that span the change.
8. Prepayment: top-up, credit balance, emergency credit, friendly-credit periods, self-disconnection alerts.
9. Outage management: customer report / smart meter last-gasp → outage prediction → crew dispatch → estimated restoration time (ETR) updates → restoration → notifications → compensation where regulated.
10. Field service: meter install / exchange, connection / disconnection, inspections, safety checks.
11. Distributed generation: interconnection application, net meter installation, import / export reads, export credits.
12. Supplier switching (competitive markets): switch request, cooling-off period, transfer read, final bill from losing supplier.

### Object lifecycles
- **Service agreement:** Pending start → Active → Pending stop → Stopped → Final billed → Closed.
- **Meter read:** Received → Validated (pass) / Failed VEE → Estimated / Edited → Billed → Superseded (by later actual read and rebill).
- **Bill:** Calculated → In review (exception) → Approved → Issued → Paid / Partially paid / Overdue → Cancelled and rebilled.
- **Collections case:** Overdue → Reminder → Final notice → Payment arrangement or Disconnection order → Disconnected → Reconnected on payment / Closed.
- **Outage:** Reported / Predicted → Confirmed → Crew assigned → Restoring → Restored → Closed.

## Regulations and standards
- **Electricity regulators (economic and consumer):** US: FERC (wholesale and interstate transmission) and state public utility commissions (retail tariffs, disconnection rules, billing); UK: Ofgem Standard Licence Conditions (billing, back-billing limit of 12 months for domestic customers, vulnerable-customer protections, Guaranteed Standards of Performance compensation); India: CERC (central) and SERCs (state tariffs, supply codes, Electricity (Rights of Consumers) Rules 2020); Australia: AER and National Energy Retail Rules; EU: Electricity Directive (EU) 2019/944 (switching, billing information, smart meters).
- **Grid and cyber security:** NERC CIP standards (CIP-002 to CIP-014) for bulk electric system cyber assets in North America; IEC 62443 for industrial control systems; ISO/IEC 27019 for energy-sector information security; EU NIS2 Directive (energy is an essential sector).
- **Metering:** measurement / metering accuracy standards (e.g. IEC 62053 / ANSI C12 series for meter accuracy classes), smart meter data privacy rules (e.g. UK Data Access and Privacy Framework), Green Button for data access.
- **Data protection:** GDPR, CCPA, India DPDP Act — consumption data is personal data.
- **Accessibility:** WCAG 2.1 AA for customer portals; US Section 508 for publicly owned utilities where applicable.
- **Payments:** PCI DSS for card payments; direct debit scheme rules (e.g. UK Direct Debit Guarantee, SEPA).

## Risk hotspots
- Bills spanning tariff changes, tier boundaries, DST days (23 / 25-hour days for interval data) and leap years.
- Estimated reads followed by actual reads (catch-up bills, rebills, back-billing limits).
- Meter rollovers (register wraps from 99999 to 00000) and meter exchanges mid-cycle.
- Net metering import / export netting and credit carry-forward.
- Disconnection rules: protected customers (medical equipment, elderly), weather / winter moratoriums, notice periods.
- Interval data volume and VEE performance; missing or duplicated intervals.
- Payment allocation, refunds and deposit interest.
- Outage storms: thousands of reports, ETR accuracy, notification floods.
- Remote disconnect commands executed on wrong meter (safety and regulatory incident).
- Multiple units: kWh vs kVAh, m³ vs therms with calorific value conversion.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Consumption | Consumption = current read − previous read (× multiplier / CT ratio); rollover: (max register + 1 − previous) + current | Normal reads, rollover, meter exchange with final and initial reads |
| Tiered (inclining block) energy charge | Charge = Σ over tiers min(remaining kWh, tier size) × tier rate | Consumption at each tier edge − 1, edge, edge + 1 |
| Time-of-use charge | Charge = Σ (kWh in each TOU period × period rate); periods by local time, weekday / weekend, season, holidays | Intervals at period start / end, weekend, public holiday, DST changeover day |
| Standing / fixed charge proration | Fixed charge = daily rate × days in bill period (or monthly × days ÷ days in month per tariff) | 28-, 29-, 30-, 31-day periods; move-in mid-cycle |
| Rate change proration | Split consumption by days before / after effective date (or by actual interval data if available) | Bill period spanning the effective date |
| Demand charge | Demand charge = max interval demand (kW, e.g. 15- or 30-min) in period × demand rate; ratchet = max(current, % of peak in prior N months) | Peak in different intervals; ratchet case |
| Gas energy conversion | kWh = m³ × volume correction factor × calorific value (MJ/m³) ÷ 3.6 | Different calorific values; imperial (ft³) meters |
| Net metering | Net = import − export; if negative, credit at export rate (or carry forward kWh) per programme | Import > export, equal, export > import |
| Estimation | Estimate = historical daily average × days (same season last year or recent average) per VEE rule | No history, partial history, seasonal history |
| Back-billing limit | Undercharged amounts older than the limit (e.g. 12 months, UK domestic) cannot be billed when the error was the supplier's | Catch-up bill covering 11, 12 and 13 months |
| Late payment / disconnection eligibility | Disconnection allowed only if overdue > N days, notices sent, customer not protected, not in moratorium | Each condition false individually |
| Payment allocation | Payments applied to oldest charges first (or per regulator-defined order) | Multiple overdue bills and an arrangement |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Move-in / out, reads and VEE, rating per tariff, bill presentation, payments, collections and disconnection rules, prepay, outage reporting, DER credits |
| Regression | Annual / regulatory tariff changes, bill print templates, VEE rule changes, regulatory report changes; run a bill-comparison regression on a sample of accounts |
| API | MDM interval loads, head-end commands (read, connect, disconnect), outage feeds, Green Button / data-access APIs, payment gateways, market messages |
| UI/UX | Bill explanation clarity, consumption charts, outage map, self-read submission with photo, payment plan set-up, accessible notices |
| Localisation | Units and number formats, currency and tax names, local holidays for TOU, languages required by regulator, address formats |
| Accessibility | Customer portal and app (WCAG 2.1 AA), accessible bills (large print, screen-reader-friendly PDFs), priority services registration forms |
| Security | Account takeover (payment redirection), IDOR on accounts and consumption data, remote disconnect authorisation, NERC CIP / IEC 62443 boundaries for OT interfaces, privacy of interval data |
| Performance | Bill run windows (millions of accounts per night), interval data ingestion (e.g. 96 reads / meter / day), VEE throughput, outage storm load on portal and IVR |
| Integration | CIS ↔ MDM ↔ head-end, CIS ↔ OMS / ADMS, work management, GIS, payment providers, print / e-bill vendor, market operator, CRM |
| Data migration | CIS replacement: accounts, premises, meters, read history, balances, payment arrangements, deposits, open service orders; parallel bill comparison |
| Resilience | Head-end outage (reads queued and back-filled), MDM delay (bills estimated per rule), portal under outage storms, bill run restart after failure without duplicates |

## Scenario bank
ID convention: `ENU-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-POS-001 | Residential move-in with opening read and default tariff | Service agreement active from move-in date; first bill prorates fixed charge from that date | P1 |
| ENU-FUN-POS-002 | Monthly bill for a tiered tariff with actual reads | Energy charge = Σ tier quantities × rates; taxes and levies correct; bill issued on schedule | P1 |
| ENU-FUN-POS-003 | Smart meter TOU bill from interval data | kWh per TOU period sums to total; each period charged at its rate | P1 |
| ENU-FUN-POS-004 | Customer submits a self-read via app with a photo | Read validated and used for the next bill; confirmation shown | P2 |
| ENU-FUN-POS-005 | Customer pays by card on the portal | Payment posted; balance updated; receipt sent | P1 |
| ENU-FUN-POS-006 | Customer reports an outage at their premise | Ticket linked to existing outage or new outage created; ETR shown; notifications subscribed | P2 |
| ENU-FUN-POS-007 | Prepay customer tops up | Credit applied to meter; balance updated in app | P2 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-NEG-001 | Self-read lower than the previous actual read (no rollover) | Read rejected or sent to review with message; not billed | P1 |
| ENU-FUN-NEG-002 | Disconnection order for a customer on the priority / medical register | Order blocked with protected-customer reason | P1 |
| ENU-SEC-NEG-003 | User requests another account's consumption data by changing the account ID | 403 / 404; no data exposed | P1 |
| ENU-FUN-NEG-004 | Move-in with a date before the previous occupant's move-out | Validation error; overlapping agreements prevented | P2 |
| ENU-SEC-NEG-005 | Remote disconnect command without the required authorisation role | Command refused and audited | P1 |
| ENU-FUN-NEG-006 | Interval data file with duplicate and missing intervals | VEE flags failures; estimates for gaps; duplicates rejected | P2 |
| ENU-FUN-NEG-007 | Payment with an amount of zero or negative | Validation error | P3 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-BVA-001 | Consumption at tier boundary (e.g. 100 kWh) and boundary ± 1 kWh | Correct tier split and charges | P1 |
| ENU-FUN-BVA-002 | Interval at TOU period start (e.g. 16:00) and end (20:59 / 21:00) | Intervals charged in the right period | P1 |
| ENU-FUN-BVA-003 | Meter rollover from 99 990 to 00 010 | Consumption = 20 units, not negative | P1 |
| ENU-FUN-BVA-004 | Catch-up bill at the back-billing limit (12 months) and 12 months + 1 day | Older charges excluded where the supplier was at fault | P1 |
| ENU-FUN-BVA-005 | Overdue days at disconnection threshold − 1 and threshold | Not eligible / eligible (if all other conditions met) | P2 |
| ENU-FUN-BVA-006 | Bill period of 28 vs 31 days with daily fixed charge | Fixed charge = daily rate × days | P2 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-E2E-001 | Smart meter interval data → MDM VEE → CIS billing determinants → bill → e-bill → direct debit collection | Values reconcile at each hand-off; bill paid and account balanced | P1 |
| ENU-FUN-E2E-002 | Overdue account → reminders → final notice → payment arrangement → missed instalment → disconnection → payment → reconnection | Each step within regulated timelines; reconnection within SLA | P1 |
| ENU-FUN-E2E-003 | Move-out with final read → final bill → deposit offset → refund of credit | Final bill correct; refund issued to customer | P2 |
| ENU-FUN-E2E-004 | Storm outage: smart meter last-gasp → OMS outage → crew dispatched → ETR updates → restoration → notification | Customers notified; outage duration recorded for reliability indices | P1 |
| ENU-FUN-E2E-005 | Rooftop solar interconnection → net meter install → import / export reads → bill with export credit | Net calculation and credit carry-forward per programme | P2 |
| ENU-FUN-E2E-006 | Estimated bills for 3 months → actual read → rebill | Estimates reversed and replaced by actual-based charges; customer sees adjustment clearly | P1 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-BUS-001 | Regulator approves a tariff increase effective mid-cycle | Bills spanning the date prorated; new bills at new rates | P1 |
| ENU-FUN-BUS-002 | Winter disconnection moratorium active | No disconnection orders created for eligible customers during the period | P1 |
| ENU-FUN-BUS-003 | Demand response event for enrolled customers | Event notification sent; baseline vs actual calculated; incentive credited | P3 |
| ENU-FUN-BUS-004 | High-bill exception (> 2× historical average) | Bill held for review before issue | P2 |
| ENU-FUN-BUS-005 | Supplier switch (competitive market) with cooling-off cancellation | Switch cancelled; customer stays with current supplier; no final bill | P2 |
| ENU-FUN-BUS-006 | Guaranteed standard missed (late reconnection) | Compensation payment credited automatically where regulated | P2 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| ENU-FUN-EDG-001 | DST spring-forward day (23 h) and fall-back day (25 h) interval data | 92 / 100 quarter-hour intervals accepted; TOU allocation correct | P1 |
| ENU-FUN-EDG-002 | Meter exchange mid-cycle | Consumption = (old final − old previous) + (new current − new initial) | P1 |
| ENU-FUN-EDG-003 | Bill period including 29 February | Days counted correctly; daily charges correct | P3 |
| ENU-RES-EDG-004 | Bill run fails halfway and is restarted | No duplicate bills; remaining accounts billed | P1 |
| ENU-FUN-EDG-005 | Payment received the same day as disconnection order | Order cancelled if payment clears the arrears per rule | P1 |
| ENU-FUN-EDG-006 | Customer with both import and export registers where export > import for a year | Credit carried forward or paid out per programme rules | P3 |

## Integrations
AMI head-end, MDM, CIS / billing, CRM, OMS / ADMS (via CIM / MultiSpeak), GIS, work and asset management (e.g. SAP PM, IBM Maximo), field service mobility, payment gateways and banks (direct debit), print and e-bill vendors, credit bureaus, market operators / data hubs (switching and settlement), DER management and EV charging platforms (OCPP), demand response platforms (OpenADR), IVR and notification services, regulator reporting.

## Non-functional profile
- Interval data: e.g. 1 million meters × 96 reads / day ≈ 96 million reads / day to ingest and validate.
- Bill run windows: complete each cycle's bills overnight; bill print / e-bill file generation SLAs.
- Outage storms: portal and IVR at 10–50× normal traffic; outage map refresh.
- Availability of payment and outage reporting 24×7.
- Data retention for reads and bills per regulator.

## Test data
Accounts per customer class (residential, commercial, industrial), tariffs (flat, tiered, TOU, demand, net metering, prepay), meters (manual, smart, rollover-near, exchanged), read histories with gaps and estimates, priority-register customers, overdue accounts at each collections stage, holidays and DST dates, DER installations, synthetic customer identities and bank details only.

## Automation notes
- Automate first: rating engine per tariff (API-level, data-driven), VEE rules, move-in / move-out, collections eligibility rules, bill presentation of key lines.
- Bill-comparison regression: run old vs new rating on a sample of accounts and compare line items.
- Oracles: independent rating calculator from tariff definitions; reconciliation of MDM totals to billed quantities.
- Freeze clock and time zone; generate interval data synthetically including DST days.
- Automation mapping (<AppName>/): page objects for account, bill, usage, payments, outage report; API services for reads, bills, payments, outages; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
