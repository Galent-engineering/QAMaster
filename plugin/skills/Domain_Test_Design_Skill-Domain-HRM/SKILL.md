---
name: "Domain_Test_Design_Skill-Domain-HRM"
description: "HRM / HCM and Payroll domain test design sub-skill of Domain_Test_Design_Skill: core HR, recruitment/ATS, onboarding, time and attendance, leave, payroll, statutory compliance, benefits, expenses, performance, learning, compensation, offboarding and full-and-final settlement, ESS/MSS and HR helpdesk, key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is an HRMS, HCM suite, payroll engine, attendance or leave system, ATS, ESS portal or HR mobile app, or when TestGen / Domain_Test_Design_Skill routes an HR or payroll application here."
---

# HRM / HCM and Payroll — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers the hire-to-retire employee lifecycle and gross-to-net payroll, where statutory accuracy, data privacy and approval routing drive most of the risk. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** core HR and organisation management, recruitment and onboarding, time and attendance (shifts, biometric, geo-fenced mobile), leave management, payroll and statutory compliance, tax declarations and proofs, benefits and flexible benefit plans, reimbursements and expenses, loans and advances, performance and goals, learning (LMS), compensation planning, offboarding and full-and-final (F&F) settlement, ESS / MSS, HR helpdesk, people analytics.
- **Users:** employees, managers, HR business partners, HR operations, payroll administrators (maker / checker), finance, recruiters, candidates, auditors.

## Detection signals

- Terms: employee code, CTC, gross, net pay, payslip, pay component, LOP, arrears, F&F, PF, ESI, PT, LWF, TDS, Form 16, gratuity, leave balance, accrual, carry forward, encashment, attendance, regularisation, shift, cut-off, investment declaration, proof, probation, confirmation, appraisal, notice period, LWD.
- Screens/routes: `/employee`, `/leave`, `/attendance`, `/payroll`, `/payslip`, `/ctc`, `/tax`, `/declaration`, `/reimbursement`, `/offboarding`, `/onboarding`, `/appraisal`.
- Fields: date of joining, date of leaving, grade, department, cost centre, pay group, tax regime, bank account, UAN, PAN.

## Business objects and workflows

### Business objects
Employee, Position, Department, Location, Legal entity, Grade / band, Manager hierarchy, Job requisition, Candidate, Offer, Onboarding task, Shift, Attendance record, Regularisation request, Leave type / policy, Leave balance, Holiday calendar, Pay group, Pay component, CTC / salary structure, Payroll run, Payslip, Tax declaration, Proof, Loan, Reimbursement claim, Expense claim, Appraisal, Goal, Separation, F&F settlement, Letter, Bank transfer file, Statutory return.

### Core workflows
1. Raise and approve a requisition; source, interview and offer candidates.
2. Pre-board and onboard (documents, assets, accounts); complete probation → confirmation.
3. Capture attendance (biometric / mobile / web), regularise exceptions and approve.
4. Apply, approve, cancel and encash leave; accrue and carry forward balances.
5. Freeze inputs at payroll cut-off (attendance, LOP, variables, reimbursements, arrears).
6. Run payroll: dry run → review variances → approve (checker) → lock → payslips → bank file → GL posting.
7. Deduct and file statutory contributions and taxes; issue annual tax certificates.
8. Submit investment declarations and proofs; recompute tax projections.
9. Revise salary (including retrospective revisions) and process arrears.
10. Transfer, promote and change managers with workflow reassignment.
11. Run appraisal cycles and link outcomes to compensation.
12. Resign → approve → serve notice → last working day → F&F → relieving and experience letters → alumni access.

### Object lifecycles
- **Employee:** Candidate → Offered → Pre-hire → Active (probation) → Confirmed → On notice → Separated → Alumni / Rehired.
- **Leave request:** Draft → Applied → Approved / Rejected → Cancelled / Partially cancelled → Availed.
- **Payroll run:** Inputs open → Cut-off → Dry run → Under review → Approved → Locked / Finalised → Reversed / Rerun (with approval) → Published.
- **Separation:** Submitted → Manager approved → HR approved → Notice period → LWD reached → F&F processed → Closed; Withdrawn before LWD.

## Regulations and standards

- India: Employees' Provident Funds Act (PF / EPS / EDLI), ESI Act, state Professional Tax and Labour Welfare Fund, Income-tax Act (TDS on salary, old and new regimes, Form 16, Form 12BB), Payment of Gratuity Act, Payment of Bonus Act, Shops and Establishments Acts, Maternity Benefit Act; the four Labour Codes as notified and in force.
- US: FLSA (minimum wage, overtime), FICA, FUTA / SUTA, federal and state income tax withholding (W-4, W-2), ACA reporting, FMLA, state paid-leave laws.
- UK: PAYE, National Insurance, RTI submissions, auto-enrolment pensions, statutory sick / maternity pay, Working Time Regulations.
- Privacy: GDPR (incl. employee data), DPDP Act 2023, CCPA/CPRA employee data provisions.
- Equal pay and anti-discrimination laws; pay transparency where enacted.
- SOC 1 / SOC 2 and ISO 27001 for HR SaaS providers.
- Statutory rates, ceilings and slabs change frequently: always verify the configured values against the current notified rules for the payroll period under test.

## Risk hotspots

- Payroll accuracy (gross-to-net) and rounding.
- Proration for joiners, leavers and loss of pay (LOP).
- Retro pay and arrears including statutory recalculation.
- Tax regime selection, slab and rebate boundaries, projected annual income.
- Statutory ceilings and thresholds (PF wage ceiling, ESI eligibility).
- Leave accrual, carry-forward and lapse at year-end.
- Attendance cut-offs and late regularisations.
- Approval routing on manager change; orphaned approvals.
- F&F calculations (leave encashment, gratuity, notice recovery, loan recovery).
- Data-scope security (salary visibility, payslip access by ID).
- Bank file format and payment reconciliation.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Proration | Component × payable days / divisor, where divisor = calendar days, working days or fixed 30 per configuration | Joiner on 1st, 15th, last day; February; LOP days |
| LOP deduction | LOP amount = (monthly gross of LOP-applicable components / divisor) × LOP days | 0, 0.5, 1 and full-month LOP |
| PF contribution (India) | Employee 12 % of PF wages; wages capped at the statutory ceiling unless voluntary higher contribution is configured; employer share split between EPF and EPS (EPS on capped wages) | PF wages at ceiling − 1, ceiling, ceiling + 1 |
| ESI applicability (India) | Covered when gross wages ≤ notified threshold at the start of the contribution period; employee and employer rates per notification | Gross at threshold ± 1; mid-period salary increase |
| Gratuity (India) | 15 / 26 × last drawn (basic + DA) × completed years of service (part-year above 6 months rounds up); eligible after 5 years of continuous service except death / disablement; capped at the statutory maximum | 4 y 11 m, 5 y, 5 y 6 m 1 d; amount above cap |
| Income tax on salary | Annual tax = slab tax on projected taxable income (per selected regime) − rebate (if within limit) + surcharge + cess; monthly TDS = (annual tax − TDS deducted) / remaining months | Income at slab edges and at rebate limit ± 1 |
| Overtime (US FLSA) | Non-exempt: hours worked > 40 in a workweek paid at ≥ 1.5 × regular rate (state daily-overtime rules where applicable) | 40, 40.25, 50 hours; state overrides |
| Leave accrual | Accrual per period = annual entitlement / periods; prorated for joiners; carry forward = min(balance, cap); excess lapsed or encashed per policy | Joiner mid-year; balance above cap at year-end |
| Leave encashment at exit | Encashment = encashable days × (encashment base / divisor) | Balance zero, partial day, at cap |
| Notice recovery | Shortfall days × (recovery base / divisor), unless waived by approver | Full notice served, partial, waived |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Pay component formulas, statutory calculations, leave policies, attendance rules, workflow approvals, letters / templates |
| Regression | Parallel payroll run comparison (previous release vs new release), statutory year-end changes, budget-driven tax changes |
| API | HRIS ↔ payroll ↔ ATS ↔ biometric ↔ bank ↔ SSO / SCIM ↔ ERP (GL posting) |
| UI/UX | ESS mobile app: apply leave, view payslip, declarations in few taps; manager approvals inbox |
| Localisation | Country-specific payroll, multi-currency compensation, local holiday calendars, payslip languages |
| Accessibility | ESS portal and payslip PDFs WCAG 2.2 AA |
| Security | Salary and PII field-level access, payslip password protection, audit trails, segregation of duties (maker / checker for payroll), IDOR on employee IDs |
| Performance | Payroll processing for large headcount, month-end ESS spike (payslip download), appraisal deadline peaks, bulk uploads |
| Integration | Biometric devices, banks, statutory portals, GL / ERP, identity provider, benefits providers |
| Data migration | Mid-year payroll migration: YTD earnings, tax deducted, leave balances, loans carried accurately |
| Resilience | Payroll run interruption and restart, bank file regeneration without duplicate payments |

## Scenario bank

ID convention `HRM-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-POS-001 | Employee applies for casual leave with sufficient balance | Request routed to manager; on approval balance reduced; attendance updated; payroll unaffected | P1 |
| HRM-FUN-POS-002 | Run payroll for a full-month employee with no variables | Gross, deductions and net match CTC structure; payslip generated; bank file entry | P1 |
| HRM-PERF-POS-001 | Payroll run for 50 000 employees | Completes within window; outputs reconcile with dry run | P1 |
| HRM-FUN-POS-003 | Employee regularises a missed punch within the allowed window | Request approved; attendance status corrected; no LOP | P2 |
| HRM-FUN-POS-004 | Employee submits investment declaration in the open window | Declaration saved; projected tax and monthly TDS recalculated | P1 |
| HRM-FUN-POS-005 | HR adds a new employee with complete details | Employee code generated; manager, pay group and CTC mapped; welcome email sent | P1 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-NEG-001 | Apply leave exceeding balance where negative balance not allowed | Blocked with balance shown | P1 |
| HRM-FUN-NEG-002 | Employee attempts to view another employee's payslip via URL / ID change | Denied; audited | P1 |
| HRM-FUN-NEG-003 | Submit investment proof after proof window closed | Rejected; message shows window dates | P2 |
| HRM-FUN-NEG-004 | Payroll maker approves own payroll run as checker | Blocked by segregation of duties | P1 |
| HRM-FUN-NEG-005 | Apply leave overlapping an already approved leave | Rejected with overlap message | P2 |
| HRM-FUN-NEG-006 | Add employee with duplicate PAN / national ID or bank account | Duplicate validation error; record not saved | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-BVA-001 | Joiner on 1st, 15th and last day of month | Salary prorated by configured basis (calendar days / working days / fixed 30) | P1 |
| HRM-FUN-BVA-002 | Basic salary at statutory PF wage ceiling, ceiling ± 1 | Contribution capped / not capped per configuration | P1 |
| HRM-FUN-BVA-003 | Taxable income exactly at slab boundary / rebate limit | Tax computed per slab; rebate applied only within limit | P1 |
| HRM-FUN-BVA-004 | Service of 4 years 11 months, 5 years and 5 years 6 months 1 day at exit | Gratuity eligibility and rounded years per rule | P1 |
| HRM-FUN-BVA-005 | Leave balance at carry-forward cap, cap + 1 at year-end | Excess lapsed or encashed per policy | P2 |
| HRM-FUN-BVA-006 | Gross wages at ESI threshold and threshold + 1 | Coverage decided per the contribution-period rule | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-E2E-001 | Offer → onboarding → first-month payroll → investment declaration → tax computation → payslip | Employee master complete; prorated pay; TDS projected for remaining months | P1 |
| HRM-FUN-E2E-002 | Resignation → manager approval → notice period → LWD → F&F → relieving letter → alumni access | F&F = pending salary + leave encashment + gratuity (if eligible) − notice recovery − loans; documents generated | P1 |
| HRM-FUN-E2E-003 | Attendance → cut-off → LOP → payroll → payslip shows LOP days | LOP deduction equals formula; payslip and register match | P1 |
| HRM-INT-E2E-004 | Payroll lock → bank file → bank acknowledgement → failed credits → re-payment | Failed accounts reported; re-payment once; status updated | P2 |
| HRM-FUN-E2E-005 | Expense claim → manager approval → finance audit → reimbursement in payroll | Approved amount paid; taxable / non-taxable treatment per component | P2 |
| HRM-FUN-E2E-006 | Appraisal cycle → ratings → increment letter → revised CTC from effective date | New CTC applied; letter content matches; arrears if retro | P2 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-BUS-001 | Retro salary revision effective 3 months back | Arrears computed per component; tax and statutory recalculated; shown separately on payslip | P1 |
| HRM-FUN-BUS-002 | Manager leaves organisation with pending approvals | Pending items reassigned to new / skip-level manager per rule; none orphaned | P1 |
| HRM-FUN-BUS-003 | Employee switches tax regime at the permitted time | Tax projection recomputed under new regime; exemptions applied only where allowed | P1 |
| HRM-FUN-BUS-004 | Employee on maternity leave across payroll months | Leave balance and pay treatment per policy and statute; benefits continue | P2 |
| HRM-FUN-BUS-005 | Employee takes a salary advance repaid in instalments | Recovery scheduled; F&F recovers outstanding on early exit | P2 |
| HRM-FUN-BUS-006 | Rehire of an alumnus | Previous record linked; service continuity per policy; new employee code if configured | P3 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HRM-FUN-EDG-001 | Leave spanning year-end (28 Dec – 5 Jan) with year-end carry-forward run | Balance deducted from correct years; carry-forward calculated after correct deduction | P2 |
| HRM-FUN-EDG-002 | Employee transferred between legal entities mid-month | Split payroll per entity; statutory registrations switched; single YTD continuity per rules | P2 |
| HRM-FUN-EDG-003 | Attendance regularised after payroll cut-off | Adjustment flows into next month as LOP reversal / arrear | P2 |
| HRM-FUN-EDG-004 | Employee resigns and LWD falls during payroll processing | Included in F&F, excluded from regular payroll, no double payment | P1 |
| HRM-FUN-EDG-005 | Holiday declared after leave was applied across that date | Leave days recalculated; balance credited back | P3 |
| HRM-RES-EDG-006 | Payroll run fails at 70 % and is restarted | Completes without duplicate payslips or bank entries | P1 |

## Integrations

Biometric / access-control devices and mobile attendance; ATS and background verification; identity provider (SSO, SCIM provisioning); banks (salary transfer files, account validation); statutory portals (PF, ESI, tax, PT); GL / ERP for payroll postings; benefits and insurance providers; LMS; expense and travel tools; e-signature for letters; email / SMS / chat notifications.

## Non-functional profile

- **Performance:** payroll for tens of thousands of employees within the processing window; ESS spikes at payslip release and declaration deadlines; bulk uploads of inputs.
- **Security and privacy:** field-level salary visibility, payslip encryption / password, audit trails for every pay change, maker-checker, data minimisation.
- **Availability:** high availability around payroll close and month-end.
- **Accessibility and localisation:** WCAG AA ESS, multi-country payroll rules, local languages and holiday calendars.

## Test data

Employees across grades, locations, statutory applicability (PF / ESI eligible and ineligible), tax regimes, joiners / leavers in-month, employees with loans and arrears; holiday calendars per location; anonymised salary data; attendance logs with missed punches, late marks and overtime; employees at service-length boundaries for gratuity.

## Automation notes

- Automate first: leave apply / approve, attendance regularisation, payslip view and download, declaration submission, payroll dry-run comparison, F&F computation.
- Oracles: independent gross-to-net calculator for each pay group; payroll register vs payslip vs bank file reconciliation.
- Use dedicated test pay groups and frozen payroll periods; reset balances between runs.
- In the application's automation folder (<AppName>/): page objects for leave, attendance, payslip, declaration and offboarding screens; API services for employee and payroll inputs; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-CRM, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData.
