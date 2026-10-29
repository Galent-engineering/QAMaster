---
name: "Domain_Test_Design_Skill-Domain-Insurance"
description: "Insurance domain test design sub-skill of Domain_Test_Design_Skill: life, health, property and casualty, motor, commercial lines and reinsurance (quote and rating, policy administration, underwriting, billing and collections, claims, agent and broker portals, customer portals, document generation, reinsurance, actuarial interfaces, fraud detection), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a quote engine, policy administration system, underwriting workbench, claims system, agent portal or insurance customer app, or when TestGen / Domain_Test_Design_Skill routes an insurance application here."
---

# Insurance — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers the insurance value chain from quote to claim: rating, underwriting, policy servicing, billing, claims, distribution and reinsurance. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** life (term, endowment, whole life, unit-linked, annuities), health (individual, family floater, group), property and casualty (home, commercial property, liability), motor (own damage, third party), travel, specialty and commercial lines, reinsurance (treaty, facultative), bancassurance and aggregators.
- **Users:** prospects and policyholders, agents and brokers, underwriters, claims handlers and surveyors, TPAs, finance and collections, actuaries, fraud investigators, operations.

## Detection signals

- Terms: quote, premium, sum assured / insured, IDV, NCB, deductible / excess, rider, add-on, proposal, underwriting, loading, exclusion, waiting period, policy schedule, endorsement, renewal, grace period, lapse, reinstatement, free-look, surrender, maturity, FNOL, claim, reserve, settlement, subrogation, salvage, commission.
- Screens/routes: `/quote`, `/proposal`, `/policy`, `/endorsement`, `/renewal`, `/claims`, `/fnol`, `/agent`, `/commission`.
- Fields: date of birth, smoker status, occupation class, vehicle make/model/year, registration, territory / zone, cover type, policy term, premium payment term, mode.

## Business objects and workflows

### Business objects
Prospect, Quote, Proposal / application, Policy, Coverage, Rider / add-on, Insured, Proposer, Nominee / beneficiary, Premium, Instalment, Endorsement, Renewal notice, Claim, Claimant, Reserve, Payment, Recovery (subrogation / salvage), Agent / broker, Commission, Document (schedule, certificate, wording), Reinsurance treaty / cession, Rate table.

### Core workflows
1. Generate a quote: capture risk details → rate → present options.
2. Submit proposal with disclosures and documents.
3. Underwrite: auto-decision by rules or refer to underwriter (medicals, inspections); accept, load, exclude, postpone or decline.
4. Collect premium and issue policy with documents.
5. Bill premiums by mode; handle grace, lapse and reinstatement.
6. Process mid-term endorsements (financial and non-financial).
7. Renew policies (auto-renewal, renewal quotes, NCB transfer).
8. Cancel policies (free-look, customer-initiated, insurer-initiated) and refund.
9. Register claim (FNOL) → verify coverage → investigate / survey → assess → reserve → approve → settle → close.
10. Recover through subrogation and salvage; reopen claims.
11. Pay maturity, surrender and death benefits (life).
12. Calculate, pay and claw back agent commissions.
13. Cede risk to reinsurers and process recoveries.

### Object lifecycles
- **Policy:** Quoted → Proposed → Under underwriting → Issued → In force → Grace → Lapsed → Reinstated / Paid-up → Matured / Surrendered / Cancelled / Expired → Renewed.
- **Claim:** Notified → Registered → Under investigation → Assessed → Approved / Repudiated → Paid (partial / final) → Closed → Reopened.
- **Quote:** Draft → Rated → Presented → Expired / Converted to proposal.
- **Endorsement:** Requested → Rated → Approved → Effective → Reversed.

## Regulations and standards

- Regulators: IRDAI (India), NAIC model laws and state Departments of Insurance (US), PRA / FCA (UK), EIOPA (EU).
- Solvency II (EU / UK), IFRS 17 (insurance contract accounting), US statutory accounting (SAP).
- Free-look period rules (e.g. IRDAI: 30 days for life and health policies per 2024 regulations; other products and markets per local law — verify the configured value against current regulation).
- Anti-rebating and fair-treatment / consumer duty rules; disclosure and key-information documents (e.g. PRIIPs KID for investment-based products in the EU).
- AML for life products; sanctions screening for claims payments.
- HIPAA for US health plans; GDPR / DPDP for personal data.
- ACORD data standards (XML / JSON forms) for distribution and policy data exchange.
- Motor third-party liability mandates per jurisdiction; regulated tariffs where applicable.

## Risk hotspots

- Rating accuracy across factors (age, sum insured, territory, vehicle, claims history, occupation).
- Age calculation basis (age last birthday vs age nearest birthday).
- Proration of endorsements and cancellations (pro-rata vs short-period scale).
- Grace period, lapse and reinstatement logic.
- Free-look cancellation refunds and allowed deductions.
- Claim eligibility versus waiting periods, exclusions, sub-limits and deductibles.
- Duplicate claims and fraud indicators.
- Commission calculation and clawback on cancellation.
- Generated document content (schedule, certificate) matching policy data.
- Rate-table versioning by effective date.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Motor own-damage premium | OD premium = IDV × OD rate (by vehicle age, cc, zone) − NCB % − other discounts + add-on premiums; total = OD + TP + tax | Each factor at its slab edges; NCB 0–50 % ladder |
| NCB progression | Claim-free renewal → next slab (e.g. 20 → 25 → 35 → 45 → 50 %); claim → reset to 0 per rule | Renew with and without claim |
| Age basis | ALB = completed years; ANB = age at nearest birthday (rounds up after 6 months) | DOB 5 months 29 days and 6 months 1 day from last birthday |
| Pro-rata endorsement | Additional premium = (new annual premium − old annual premium) × remaining days / policy days | Endorsements on day 1, mid-term and last day |
| Short-period cancellation | Refund = premium − earned premium per short-period scale (customer-initiated) or pro-rata (insurer-initiated) | Cancel in each scale band |
| Grace period | Premium paid within grace days after due date → policy continues; after → lapse | Due + grace, due + grace + 1 |
| Claim payable | Payable = min(assessed loss, sum insured, sub-limit) − deductible − co-pay %; depreciation on parts for motor unless zero-dep add-on | Loss above sum insured; with and without add-on |
| Waiting period | Claim for condition X rejected if loss date − policy start < waiting days (initial / specific / pre-existing) | Day before and on waiting-period end |
| Commission | Commission = premium (excl. tax) × rate by product and year; clawback on cancellation within period | Cancel within and after clawback window |
| Sum insured restoration | Restored after exhaustion per product (once / unlimited) for unrelated claims | Second claim same illness vs unrelated |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Rating tables, underwriting rules, policy lifecycle states, claims adjudication rules, commissions, documents |
| Regression | Rate revision regression (compare old vs new rate tables), document template regression, product launch regression |
| API | Rating API, aggregator / comparator APIs, ACORD messages, payment, medical / garage network integrations, regulatory databases |
| UI/UX | Quote journeys (drop-off reduction), claim FNOL on mobile with photo upload, plain-language disclosures |
| Localisation | State / country-specific forms, disclosures, taxes (GST / premium tax), languages for policy documents |
| Accessibility | Customer quote and claim journeys, policy documents (tagged PDFs) |
| Security | PII / PHI protection, agent data scope, claim fraud rule bypass, document access via URL |
| Performance | Renewal batch, aggregator quote spikes, catastrophe (CAT) event claim surge |
| Integration | PAS ↔ rating ↔ billing ↔ claims ↔ GL; aggregators; TPAs; garages and hospitals; reinsurance systems |
| Data migration | Policy migration with in-force status, premium history, claims history and NCB preserved |
| Resilience | Payment success but issuance failure recovery; batch restart; quote service fallback |

## Scenario bank

ID convention `INS-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-POS-001 | Motor quote for valid vehicle and driver profile | Premium = base × factors (IDV, NCB, zone, add-ons) + tax; quote saved with validity | P1 |
| INS-FUN-POS-002 | Issue term life policy after auto-underwriting | Policy number, schedule, welcome kit; premium due dates scheduled | P1 |
| INS-PERF-POS-001 | Catastrophe event: 20× normal FNOL volume | Intake available; queueing and assignment within SLA | P1 |
| INS-FUN-POS-003 | Non-financial endorsement (address / contact change without rating impact) | Endorsement effective; revised schedule issued; no premium change | P3 |
| INS-FUN-POS-004 | Renew a claim-free motor policy | NCB moves up one slab; renewal premium and documents correct | P1 |
| INS-FUN-POS-005 | Cashless health claim pre-authorisation at a network hospital | Pre-auth approved within limits; hospital notified; balance sum insured reduced | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-NEG-001 | Claim during waiting period for a specific illness | Rejected with clause reference | P1 |
| INS-FUN-NEG-002 | Endorsement on a lapsed policy | Blocked; reinstatement suggested | P2 |
| INS-FUN-NEG-003 | Quote for a vehicle older than the product's maximum age | Rejected with eligibility message | P2 |
| INS-FUN-NEG-004 | Claim with loss date before policy start date | Rejected as not covered | P1 |
| INS-SEC-NEG-005 | Agent views a policy belonging to another agent's portfolio | Access denied; attempt logged | P1 |
| INS-FUN-NEG-006 | Proposal with mandatory health disclosure unanswered | Submission blocked with field-level message | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-BVA-001 | Proposer age at min entry age, max entry age, and ±1 day | In-range accepted; outside rejected; age basis (ALB/ANB) applied correctly | P1 |
| INS-FUN-BVA-002 | Premium paid on last day of grace period vs day after | Within grace: policy in force; after: lapsed | P1 |
| INS-FUN-BVA-003 | Free-look cancellation on the last free-look day vs the day after (period per configured regulation) | Last day: refund minus allowed deductions; day after: normal surrender / cancel rules | P1 |
| INS-FUN-BVA-004 | Sum insured at product minimum, maximum and auto-underwriting limit ± 1 | Above auto-UW limit referred to underwriter | P2 |
| INS-FUN-BVA-005 | Claim amount equal to deductible, deductible + 1 | Nothing payable at deductible; 1 payable above | P2 |
| INS-FUN-BVA-006 | Renewal on expiry date vs one day after (break-in) | On time: continuity; break-in: inspection / NCB rules per product | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-E2E-001 | Quote → proposal → medicals → underwriting decision with loading → payment → issuance → e-policy → commission | Loading reflected in premium; commission computed and paid to agent | P1 |
| INS-FUN-E2E-002 | Motor claim: FNOL with photos → surveyor assignment → estimate → approval → cashless garage payment → NCB reset at renewal | Reserve set; payment matches approved amount minus deductible; renewal NCB recalculated | P1 |
| INS-FUN-E2E-003 | Reimbursement health claim: submission → document check → adjudication → payment → closure | Payable per sub-limits and co-pay; settlement letter with deductions explained | P1 |
| INS-INT-E2E-004 | Aggregator quote → redirect → purchase → policy data back to aggregator | Premium identical across systems; policy confirmation delivered | P2 |
| INS-FUN-E2E-005 | Policy lapses → reinstatement with medical declaration and arrears → in force | Arrears and interest collected; continuity of benefits per rules | P2 |
| INS-FUN-E2E-006 | Third-party recovery: claim paid → subrogation → recovery received | Recovery posted against claim; net incurred reduced | P3 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-BUS-001 | Mid-term address change to higher-risk zone | Endorsement premium prorated for remaining term; new schedule issued | P2 |
| INS-FUN-BUS-002 | Death claim with nominee change made one week earlier | Flagged for investigation; payment to valid nominee per law after verification | P1 |
| INS-FUN-BUS-003 | Vehicle sold mid-term; policy transferred to new owner | Transfer endorsement; NCB not transferred to new owner; recovery of NCB per rule | P2 |
| INS-FUN-BUS-004 | Group health policy: employer adds and deletes members mid-term | Pro-rata additions and refunds; e-cards issued / revoked | P2 |
| INS-FUN-BUS-005 | Annual rate revision effective from a date | Quotes before the date use old rates; on / after use new rates | P1 |
| INS-FUN-BUS-006 | Policy cancelled within commission clawback period | Commission clawed back from agent's next payout | P2 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| INS-FUN-EDG-001 | Policy anniversary on 29 Feb | Renewal / anniversary dates per configured rule in non-leap years | P2 |
| INS-FUN-EDG-002 | Two claims for the same incident from two channels | Duplicate detected; single claim processed | P1 |
| INS-RES-EDG-003 | Payment succeeds but policy issuance service fails | Policy issued on retry or premium refunded; no paid-but-uninsured customer | P1 |
| INS-FUN-EDG-004 | Quote validity expires during checkout | Re-rated before payment; customer sees updated premium | P2 |
| INS-FUN-EDG-005 | Insured's birthday falls between quote and issuance, changing age band | Premium recalculated on the issuance date per rule | P2 |
| INS-FUN-EDG-006 | Claim reopened after closure with additional documents | Reserve reinstated; history retained; additional payment only | P3 |

## Integrations

Rating engine, PAS, billing and payment gateway, claims, document generation and e-signature, aggregators and bancassurance partners, agent / broker portals, medical networks and TPAs, garages and surveyors, vehicle registration and driving-licence databases, credit / fraud bureaus, reinsurance systems, GL / IFRS 17 engines, CRM, SMS / email / WhatsApp notifications.

## Non-functional profile

- **Performance:** aggregator quote APIs with sub-second responses at campaign peaks; renewal batches of hundreds of thousands of policies; CAT-event claim surges.
- **Security and privacy:** PII / PHI protection, agent and broker data scope, secure document URLs, fraud rules.
- **Availability:** 24×7 FNOL; payment–issuance consistency.
- **Accessibility and localisation:** accessible quote and claim journeys, tagged PDF policy documents, local languages and tax.

## Test data

Rate tables per product version; policies in each lifecycle state; insured profiles at age boundaries; vehicles at age and cc boundaries; claims with documents (image-based test set for damage photos); agents with active and terminated licences; group policies with membership changes.

## Automation notes

- Automate first: quote and premium calculation, proposal submission, issuance, endorsement, renewal with NCB, FNOL and claim status.
- Oracles: independent rating calculator from rate tables; document content checks against policy data.
- Freeze dates (rate effective dates, ages) through test configuration; create policies via APIs.
- In the application's automation folder (<AppName>/): page objects for quote, proposal, policy and claim screens; API services for rating and claims; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Domain-Banking, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-ImageBased, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-Techniques.
