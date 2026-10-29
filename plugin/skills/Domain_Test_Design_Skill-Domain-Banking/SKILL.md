---
name: "Domain_Test_Design_Skill-Domain-Banking"
description: "Banking domain test design sub-skill of Domain_Test_Design_Skill: retail, corporate and digital banking (core banking CASA/deposits/loans, internet and mobile banking, payments, cards, loan origination and servicing, trade finance, treasury, AML/KYC, fraud, branch, ATM, Open Banking), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a core banking system, internet or mobile banking app, payment hub, card management, loan origination, AML or Open Banking API, or when TestGen / Domain_Test_Design_Skill routes a banking application here."
---

# Banking — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers deposit-taking and lending institutions: accounts, money movement, cards, loans, compliance and end-of-day processing, where every unit of currency must reconcile. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** retail banking (CASA, deposits, retail loans), corporate and transaction banking (cash management, bulk payments, trade finance), cards (debit, credit, prepaid), digital channels (internet, mobile, chatbot), payments (domestic real-time and batch rails, cross-border), lending (origination, servicing, collections), compliance (KYC, AML, sanctions, fraud), treasury, branch and ATM.
- **Users:** retail and corporate customers, branch tellers, relationship managers, operations (maker / checker), credit officers, compliance analysts, collections agents.

## Detection signals

- Terms: CIF, CASA, IBAN, IFSC, sort code, routing number, beneficiary, NEFT, RTGS, IMPS, UPI, ACH, SEPA, Faster Payments, SWIFT, FD/TD, RD, EMI, overdraft, sanction, disbursal, maker-checker, EOD, dormancy, KYC, AML, SCA.
- Screens/routes: `/accounts`, `/transfer`, `/beneficiary`, `/payees`, `/statement`, `/deposits`, `/loans`, `/cards`, `/bill-pay`, `/limits`.
- Fields: account number, available balance, ledger balance, value date, cut-off, daily limit, interest rate, tenure, MCLR / base rate.

## Business objects and workflows

### Business objects
Customer (CIF), Account (savings, current, term deposit, recurring deposit, loan, overdraft), Joint holder / mandate, Beneficiary / payee, Transaction, Standing instruction, Direct debit mandate, Loan, Repayment (EMI) schedule, Collateral, Card, Limit, Cheque, Statement, Interest rule, Fee / charge schedule, GL account, Alert, KYC document, AML alert.

### Core workflows
1. Onboard customer digitally with eKYC / video KYC; risk-categorise.
2. Open an account and fund it.
3. Add a beneficiary (with cooling period) and transfer funds over each rail.
4. Pay bills and set up standing instructions / direct debits.
5. Issue a card; activate; set PIN; manage limits; block / unblock.
6. Apply for a loan → bureau check → underwriting → sanction → documentation → disbursement.
7. Service loans: EMI debit, part-prepayment, rate reset, foreclosure.
8. Open, renew and prematurely close term deposits.
9. Clear cheques (CTS / image clearing) and handle returns.
10. Run EOD / EOM / EOY batches: interest accrual and capitalisation, fees, dormancy, statements.
11. Screen transactions and customers for AML and sanctions; investigate alerts.
12. Raise disputes and chargebacks; reverse transactions.
13. Close accounts; settle and transfer balances.

### Object lifecycles
- **Account:** Applied → Opened → Active → Dormant / Inoperative → Reactivated → Frozen / Debit-frozen → Closed.
- **Payment:** Initiated → Authorised (SCA) → Validated → Screened → Submitted to rail → Settled / Rejected / Returned → Reversed.
- **Loan:** Application → Under appraisal → Sanctioned / Rejected → Disbursed (partially / fully) → Regular → Overdue (DPD buckets) → NPA → Restructured / Written off → Closed.
- **Card:** Requested → Issued → Inactive → Active → Temporarily blocked → Hot-listed → Replaced / Expired → Closed.

## Regulations and standards

- Central bank and supervisor rules: RBI (India), Federal Reserve / OCC / FDIC (US), ECB / EBA (EU), PRA / FCA (UK).
- KYC / AML / CFT (FATF recommendations, Bank Secrecy Act, EU AML directives, PMLA India); sanctions screening (OFAC, UN, EU, HMT lists).
- PSD2 and Regulatory Technical Standards on SCA; UK Open Banking; Berlin Group NextGenPSD2; India Account Aggregator framework.
- PCI DSS (cards), PCI PIN, EMV, 3-D Secure.
- SOX (financial reporting controls), Basel III (capital and liquidity), IFRS 9 (expected credit loss staging).
- ISO 20022 (pain, pacs, camt messages), SWIFT MT / MX, NACHA (ACH), SEPA rulebooks, NPCI rules for UPI / IMPS.
- Consumer protection: Reg E (EFT errors), Reg Z / TILA (APR disclosure), Reg CC (funds availability), Reg DD (Truth in Savings); RBI Fair Practices Code.
- Privacy: GDPR, DPDP Act 2023, GLBA; FFIEC authentication guidance.

## Risk hotspots

- Money movement correctness and idempotency (double debit, lost credit).
- Interest and fee calculation precision, rounding and day-count conventions (30/360, Act/365, Act/Act).
- Holiday calendars, cut-off times and value dating.
- Limits (per-transaction, daily, velocity, channel-combined).
- Sanctions false negatives; AML scenario thresholds.
- Account takeover, SIM-swap, device binding and SCA bypass.
- Maker-checker bypass and self-approval.
- EOD batch failures, partial runs, re-runs and reconciliation breaks.
- Statement and GL consistency.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| EMI | EMI = P × r × (1 + r)^n / ((1 + r)^n − 1), r = annual rate / 12, n = months | Compare schedule to independent calculation; last instalment adjustment |
| Term deposit maturity | A = P × (1 + r / m)^(m × t) for compounding m per year; simple interest for short tenures per product | Quarterly vs monthly payout; tenures at slab edges |
| Savings interest | Daily balance × rate / days in year (per convention), accrued daily, credited per frequency | Leap year; balance changes mid-period |
| Day-count | 30/360, Act/365 (fixed), Act/Act as configured per product | Same period under each convention |
| Transfer limit | Allow if amount ≤ per-transaction limit and today's cumulative + amount ≤ daily limit (all channels) | Limit − 0.01, limit, limit + 0.01; across channels |
| Cut-off and value date | Initiated before rail cut-off on a working day → same-day value; else next working day | Cut-off ± 1 second; holidays and weekends |
| Minimum balance charge | If average monthly balance < required → charge per slab of shortfall | AMB exactly at requirement and 0.01 below |
| Beneficiary cooling | New beneficiary: limit X for first N hours; full limit after | Transfer at N hours ± 1 minute |
| Maker-checker | Transaction above threshold needs a different user with checker role to approve | Same user approves own; checker without role |
| Prepayment | Reduced tenure: keep EMI, recompute n; reduced EMI: keep n, recompute EMI; fee per product | Both options with the same prepayment |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Interest / fee calculations, limits, cut-offs, maker-checker, product parameters, EMI schedules, dormancy |
| Regression | Calculation regression packs, EOD batch comparison, statement regression |
| API | Open Banking APIs (accounts, payments, consents), payment rails, core banking services, ISO 20022 message validation |
| UI/UX | Mobile banking flows (≤3 taps for frequent tasks), transaction confirmation clarity, error recovery |
| Localisation | Multi-currency, number formats, regional language apps, local regulatory disclosures |
| Accessibility | Mobile and internet banking WCAG 2.2 AA, talking ATMs, accessible statements |
| Security | SCA / MFA, device binding, session, IDOR on accounts, transaction tampering, fraud rules, SIM-swap detection |
| Performance | Salary day / month-end spikes, real-time payment TPS, EOD batch window |
| Integration | Core ↔ channels ↔ payment hub ↔ rails ↔ card switch ↔ AML ↔ GL; credit bureau; KYC registries |
| Data migration | Core banking conversion: balances, accrued interest, schedules, mandates reconcile to the unit |
| Resilience | Timeout and reversal handling, rail outage queueing, DR failover with no duplicate postings |

## Scenario bank

ID convention `BNK-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-POS-001 | Transfer to a registered beneficiary within limits | Debit and credit posted; reference number; SMS / email; balances updated; statement entry | P1 |
| BNK-FUN-POS-002 | Open fixed deposit for 1 year at published rate | Maturity value = formula with configured compounding; certificate generated | P1 |
| BNK-FUN-POS-003 | Pay a utility bill from savings account | Biller confirmation received; receipt available; account debited once | P2 |
| BNK-FUN-POS-004 | Activate a new debit card and set PIN in the app | Card active; PIN set; first transaction authorised | P2 |
| BNK-API-POS-001 | Third-party provider reads balances with a valid, authorised consent | 200 with balances for consented accounts only | P2 |
| BNK-FUN-POS-005 | Download a 6-month account statement | Opening balance + credits − debits = closing balance; every transaction listed once | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-NEG-001 | Transfer amount exceeding available balance | Rejected; no debit; clear message | P1 |
| BNK-FUN-NEG-002 | Transfer to a beneficiary during cooling period above allowed amount | Blocked per rule | P1 |
| BNK-FUN-NEG-003 | Transaction to a sanctioned name / country | Held for compliance review; not released; alert generated | P1 |
| BNK-SEC-NEG-001 | Change account ID in API request to another customer's account | 403/404; no data returned; incident logged | P1 |
| BNK-FUN-NEG-004 | Maker approves own transaction as checker | Blocked; segregation-of-duties message; audit entry | P1 |
| BNK-FUN-NEG-005 | Debit a frozen / debit-frozen account | Rejected with status reason | P2 |
| BNK-API-NEG-006 | Payment initiation with an expired or revoked consent | 401/403; no payment created | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-BVA-001 | Transfer at daily limit, limit − 0.01, limit + 0.01 | Up to limit allowed; above limit rejected; cumulative limit across channels honoured | P1 |
| BNK-FUN-BVA-002 | Payment initiated at cut-off time ± 1 second | Before cut-off: same-day value; after: next working day | P1 |
| BNK-FUN-BVA-003 | Minimum balance exactly met vs 0.01 below | Below triggers charge per schedule at EOD / EOM | P2 |
| BNK-FUN-BVA-004 | FD tenure at slab edge (e.g. 364, 365, 366 days) | Rate from correct slab applied | P2 |
| BNK-FUN-BVA-005 | Account inactive for exactly the dormancy period and one day less | Dormant flag only at the configured period | P2 |
| BNK-FUN-BVA-006 | Loan days past due 89, 90, 91 (NPA classification) | Classified NPA at the regulatory threshold; provisioning per rule | P1 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-E2E-001 | Online loan application → credit bureau → underwriting → sanction letter → e-sign → disbursal → EMI auto-debit | Loan account created; disbursal credited; repayment schedule correct; first EMI debited on due date | P1 |
| BNK-FUN-E2E-002 | Cross-border SWIFT payment with FX conversion | FX rate locked and shown; charges (OUR/SHA/BEN) applied; MT103 / pacs.008 correct; GL entries balanced | P1 |
| BNK-FUN-E2E-003 | Digital onboarding → video KYC → account open → debit card → first UPI / instant payment | Account active; card dispatched; payment settled; KYC record stored | P1 |
| BNK-FUN-E2E-004 | Cheque deposit → clearing → return for insufficient funds → charges | Shadow credit reversed; return charge levied; customer notified | P2 |
| BNK-INT-E2E-005 | Card transaction dispute → provisional credit → chargeback → resolution | Provisional credit within regulatory timeline; final outcome posted | P2 |
| BNK-FUN-E2E-006 | EOD → interest accrual → EOM capitalisation → statement generation | Interest credited equals daily accruals; GL matches sub-ledger | P1 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-BUS-001 | Customer prepays 30 % of home loan and chooses reduced tenure | New schedule with reduced tenure; same EMI; prepayment charges per product | P1 |
| BNK-FUN-BUS-002 | Corporate payroll bulk upload of 10 000 payments with maker-checker | Validation report; checker approval; individual credits; failed rows reported with reasons | P1 |
| BNK-FUN-BUS-003 | Floating-rate loan benchmark rate changes | EMI or tenure revised per customer choice; communication sent | P2 |
| BNK-FUN-BUS-004 | Senior citizen opens FD | Additional senior-citizen rate applied per product | P2 |
| BNK-FUN-BUS-005 | Joint account with "either or survivor" mandate; one holder deceased | Survivor operates per mandate after claim settlement; deceased holder removed | P3 |
| BNK-FUN-BUS-006 | Customer reports lost card in app | Card hot-listed instantly; pending authorisations declined; replacement ordered | P1 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| BNK-FUN-EDG-001 | FD maturity falls on a bank holiday | Matures / pays on next working day with interest per policy | P2 |
| BNK-FUN-EDG-002 | Network timeout after debit, before credit confirmation | Transaction status reconciled; auto-reversal within TAT or credit completed; never lost money | P1 |
| BNK-FUN-EDG-003 | Interest calculation in leap year for Act/365 vs Act/Act products | Matches configured convention to the paisa / cent | P2 |
| BNK-FUN-EDG-004 | Same transfer submitted twice (double tap / retry with same idempotency key) | One debit only; second request returns original result | P1 |
| BNK-RES-EDG-005 | EOD batch fails midway and is restarted | Restart from checkpoint; no double accrual or fee | P1 |
| BNK-FUN-EDG-006 | Standing instruction due on 31st in a 30-day month | Executes on configured date (last day or next working day) | P3 |

## Integrations

Core banking ↔ internet / mobile channels ↔ payment hub ↔ rails (RTGS, NEFT, IMPS, UPI, ACH, SEPA, Faster Payments, SWIFT); card management ↔ switch ↔ schemes (Visa, Mastercard, RuPay) ↔ 3-D Secure; loan origination ↔ credit bureaus; eKYC / identity registries; AML / sanctions engines; fraud monitoring; GL / finance; CRM; SMS / email gateway; Open Banking API gateway and consent manager; regulatory reporting.

## Non-functional profile

- **Performance:** salary-day and month-end peaks; real-time payment TPS with sub-second responses; EOD within the batch window; statement generation for millions of accounts.
- **Security:** SCA, device binding, fraud scoring, encryption of PAN and PII, HSM-based PIN handling, audit logs.
- **Availability:** 24×7 digital channels; DR with RPO/RTO per regulator; graceful degradation when a rail is down.
- **Accessibility and localisation:** WCAG AA channels, regional languages, currency formatting, local disclosures.

## Test data

Synthetic customers across segments (minor, senior citizen, NRI, corporate, joint); accounts in every status (active, dormant, frozen, closed); holiday calendar test data; masked card numbers (use scheme test BINs); sanctions test lists; loans in each DPD bucket; time-travel capable business date for EOD testing.

## Automation notes

- Automate first: login with SCA (test OTP from a stub), transfer to beneficiary, limits, statement, FD calculator, loan EMI schedule, Open Banking consent flow.
- Oracles: independent interest / EMI calculators; double-entry balance checks (debits = credits) and statement reconciliation.
- Reset balances and business date between scenarios through APIs or database fixtures; never share accounts across parallel tests.
- In the application's automation folder (<AppName>/): page objects for accounts, transfer, beneficiary, deposits and loans; API services for payments and consents; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-FinancialServices, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Test-Resilience, Domain_Test_Design_Skill-Core-Techniques.
