---
name: "Domain_Test_Design_Skill-Domain-PublicSector"
description: "Public Sector and Government domain test design sub-skill of Domain_Test_Design_Skill: citizen digital services (identity and sign-in, eligibility and benefits, tax filing and refunds, permits and licensing, registrations and certificates, grants, case management, inspections and enforcement, courts and justice, public payments, open data, records management, procurement), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a government portal, benefits or tax system, licensing or permit application, case management, e-procurement, citizen identity service or municipal service, or when TestGen / Domain_Test_Design_Skill routes a public sector application here."
---

# Public Sector — domain test design (sub-skill of Domain_Test_Design_Skill)

Black-box test design for government and public-sector digital services: citizen and business identity, applications for benefits, permits, licences and registrations, eligibility determination, tax returns and refunds, case management with caseworkers, payments and fees, notices and appeals, records and transparency. Services must work for everyone (accessibility and assisted digital), decisions must be explainable and auditable, and policy rules change by law on fixed dates. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview
- **Sub-domains:** citizen identity and sign-in, benefits and social security (eligibility, calculation, payments, overpayments), tax administration (registration, returns, assessments, refunds, payments), permits and licensing (building, business, driving, firearms, professional), civil registration (birth, marriage, death certificates), grants management, case management and inspections / enforcement, courts and justice (e-filing, case tracking, fines), public health programmes, elections administration, municipal services (311, property tax, utilities, parking), e-procurement, open data portals, records and archives, FOI / public records requests.
- **Users:** citizens (including people with disabilities, low digital literacy, non-native speakers), businesses and their agents, intermediaries (accountants, lawyers), caseworkers, approvers / adjudicators, inspectors, call-centre agents, auditors, policy administrators, other agencies.
- **Business drivers:** correct and timely decisions, fraud and error reduction, digital take-up, cost per transaction, user satisfaction, accessibility and inclusion, transparency, statutory deadlines.

## Detection signals
- UI: "Start now" service pages, eligibility checkers, multi-page forms with "Check your answers" summary, sign-in with national identity (Login.gov, GOV.UK One Login, DigiLocker / Aadhaar-based eKYC, eIDAS schemes), application reference numbers, document upload, fee payment, status tracker, notices / letters, appeal forms, caseworker queue screens.
- Terms: applicant, claimant, taxpayer, citizen ID / SSN / National Insurance number / PAN / Aadhaar, eligibility, determination, entitlement, award, overpayment, assessment, notice of decision, appeal / reconsideration, permit, licence, inspection, case, caseworker, adjudication, statutory deadline, FOI.
- Design systems / platforms: US Web Design System (USWDS), GOV.UK Design System, GOV.UK Pay / Notify, Pay.gov, India UX4G / API Setu, Salesforce Public Sector Solutions, Microsoft Dynamics for government, Pega / Appian case management.

## Business objects and workflows

### Business objects
Person / citizen, household, business / organisation, identity proof, account, application / claim, form section, evidence document, eligibility rule set, determination / decision, entitlement / award, payment schedule, overpayment / debt, tax return, assessment, refund, permit / licence (type, conditions, expiry), inspection, violation / enforcement action, case, task, caseworker, notice / letter, appeal, hearing, fee, payment, receipt, certificate, grant, grant application, grant award, record (with retention schedule), FOI request, audit log.

### Core workflows
1. Sign-in and identity proofing to the required assurance level; account recovery; delegated access for agents.
2. Eligibility check (anonymous pre-check) and full application with save-and-return, evidence upload and "check your answers".
3. Submission, acknowledgement with reference number, notification preferences.
4. Automated verification against other agency data (income, residency, identity, death records) and risk / fraud scoring.
5. Caseworker review: triage, request for information (RFI) with deadlines, decision with reasons, quality check / second approval.
6. Determination and calculation of entitlement or tax; notice of decision with appeal rights.
7. Payments (benefits, refunds) and collections (fees, taxes, fines), instalment plans, overpayment recovery.
8. Changes of circumstances, renewals, re-determinations, and periodic reviews.
9. Appeals / reconsideration, hearings, decision outcomes and corrections.
10. Permits and licensing: application, plan review, inspections, conditions, issuance, renewals, suspensions and revocations.
11. Records management: retention, legal hold, archiving, disposal; FOI / public records requests with redaction.
12. Assisted digital: phone or in-person channel completing the same process on behalf of a citizen.

### Object lifecycles
- **Application / claim:** Draft → Submitted → Verification → Pending information (RFI) → Under review → Decided (Approved / Partially approved / Denied) → Appealed → Final → Closed; Withdrawn at any point before decision.
- **Permit / licence:** Applied → Under review → Inspection scheduled → Approved with conditions / Rejected → Issued → Active → Renewal due → Renewed / Expired → Suspended / Revoked.
- **Case:** Opened → Assigned → In progress → Escalated → Resolved → Closed → Reopened.
- **Tax return:** Filed → Accepted / Rejected (validation) → Processed → Assessed → Refund issued / Payment due → Amended → Audited.
- **Record:** Active → Inactive → Retention period running → Legal hold (pauses disposal) → Archived / Destroyed per schedule.

## Regulations and standards
- **Accessibility:** US Section 508 (Revised 508 Standards incorporate WCAG 2.0 AA), ADA Title II DOJ rule (2024) requiring WCAG 2.1 AA for state and local government web and mobile; UK Public Sector Bodies Accessibility Regulations 2018 (WCAG 2.2 AA and accessibility statement); EU Web Accessibility Directive 2016/2102 with EN 301 549; India GIGW 3.0 guidelines.
- **Service standards:** GOV.UK Service Standard and Technology Code of Practice (GDS); US 21st Century Integrated Digital Experience Act (21st Century IDEA) and OMB guidance; USWDS.
- **Security and cloud:** FedRAMP (cloud services used by US federal agencies), FISMA with NIST SP 800-53 controls, NIST SP 800-63-3 / 800-63-4 digital identity guidelines (IAL / AAL / FAL), StateRAMP for states, CJIS Security Policy (criminal justice data), IRS Publication 1075 (federal tax information), UK Cyber Essentials and Government Security Classifications, India CERT-In directions and MeitY cloud empanelment.
- **Privacy and records:** US Privacy Act of 1974, E-Government Act Privacy Impact Assessments, GDPR / UK GDPR and DPA 2018 (public task basis), India DPDP Act; Federal Records Act and NARA schedules, UK Public Records Act; FOIA (US), UK Freedom of Information Act 2000, India RTI Act 2005.
- **Identity:** eIDAS / eIDAS 2.0 (EU Digital Identity Wallet), Aadhaar Act and UIDAI authentication rules (India), REAL ID (US driving licences).
- **Language and plain English:** US Plain Writing Act 2010, Executive Order 13166 (limited English proficiency access); Welsh Language Standards (Wales).
- **Payments:** PCI DSS for card payments; Treasury / government payment rules.

## Risk hotspots
- Eligibility and calculation rules implemented differently from legislation / policy; rule changes effective on statutory dates.
- Wrong decisions with legal consequences; missing reasons or appeal rights in notices.
- Identity fraud and synthetic identities; account takeover redirecting benefit payments.
- Accessibility failures excluding citizens; complex forms; timeouts losing data.
- Data sharing between agencies (matching errors, stale data, consent and legal basis).
- Peak deadlines (tax filing day, benefit renewal windows, emergency programmes) causing outages.
- Caseworker access to records beyond their need (insider misuse), audit trail gaps.
- Legacy mainframe integrations and batch timing.
- Records retention and legal hold failures; FOI redaction leaks.
- Multilingual content and notices out of sync with English source.

## Business rules to verify
| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Income eligibility | Eligible if household countable income ≤ threshold for household size (e.g. % of poverty guideline); countable income = gross − allowed deductions / disregards | Income at threshold − 1, threshold, threshold + 1 for several household sizes |
| Eligibility decision table | Conditions (age, residency, income, assets, citizenship / immigration status, disability) → outcome (eligible / ineligible / refer) | Full decision table with one condition flipped per case (MC/DC style) |
| Benefit amount | Award = maximum benefit − (countable income × reduction rate), floored at 0 (or minimum award) and rounded per policy | Income producing award 0, minimum, maximum |
| Proration | First-period amount = full amount × days remaining from application date ÷ days in period | Applications on first, middle and last day of month |
| Overpayment | Overpayment = Σ (paid − correctly due) for affected periods; recovery instalment = min(% of ongoing award, cap) | Retrospective change of circumstances |
| Progressive tax | Tax = Σ over brackets (taxable income in bracket × bracket rate) − credits; taxable income = gross − deductions / allowances | Incomes at each bracket edge |
| Late filing / payment penalty | Penalty = rate × unpaid tax × months late (capped), plus interest at statutory rate | Filing on due date, 1 day late, at the cap |
| Statutory deadline | Response due = event date + N days (calendar or working days, excluding public holidays per statute) | Deadlines falling on weekends / holidays |
| Permit fee | Fee = base fee + rate × project valuation / area, by permit type, with exemptions | Values at fee band edges; exempt applicants |
| Licence expiry and renewal | Expiry = issue date + term; renewal window opens N days before; grace period after expiry with late fee | Dates at window open, expiry and grace end |
| Age-based rule | Age on the qualifying date (e.g. on application date or start of tax year) | Birthdays the day before / on / after the qualifying date; 29 February births |
| Retention | Disposal date = trigger event (case closed) + retention period, unless legal hold | Case closed with and without legal hold |

## Test strategy by test type
| Test type | Emphasis |
|---|---|
| Functional | Eligibility and calculation rules against legislation, multi-page form logic (branching, save and return, check your answers), caseworker workflows, notices, payments, appeals, permits and renewals |
| Regression | Rule changes on statutory effective dates (annual uprating, tax year changes), design-system upgrades, legacy interface changes; run old-vs-new determinations on a sample of cases |
| API | Inter-agency data exchange APIs, identity provider (OIDC / SAML), payment gateways, notification services, open data APIs; consent and legal-basis enforcement |
| UI/UX | Plain language, one-thing-per-page patterns, error summaries, session timeout warnings, mobile-first, assisted digital usability, usability tests with real users |
| Localisation | Required languages (e.g. Spanish, Welsh, Hindi and regional languages), translated notices, name and address formats, scripts, date formats |
| Accessibility | WCAG 2.1 / 2.2 AA conformance, Section 508, screen readers, keyboard, zoom 400 %, cognitive accessibility, accessible PDFs and notices, accessibility statement |
| Security | Identity proofing levels, MFA, account recovery abuse, IDOR on applications and cases, caseworker least privilege and audit, PII protection, FedRAMP / NIST control evidence, bot protection on forms |
| Performance | Deadline peaks (tax day), emergency programme launches, concurrent caseworkers, batch processing windows for payments and notices |
| Integration | Identity providers, other agencies (income, residency, vital records), payment and banking, mail / print, legacy mainframe and batch, document management |
| Data migration | Legacy case and benefit systems: people, cases, awards, payment histories, overpayments, documents; parallel run of determinations |
| Resilience | Peak overload (waiting room / queue), partner agency API down (pending verification path), payment file failures and reruns without duplicate payments, disaster recovery |

## Scenario bank
ID convention: `GOV-<TYPE>-<CAT>-<NNN>`; TYPE = FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT = POS / NEG / BVA / E2E / BUS / EDG.

### Positive
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-FUN-POS-001 | Citizen completes an eligibility pre-check and is likely eligible | Result with reasons and a link to apply; no personal data stored for anonymous check | P2 |
| GOV-FUN-POS-002 | Signed-in citizen submits a benefit application with evidence | Reference number shown and sent; status Submitted; caseworker task created | P1 |
| GOV-FUN-POS-003 | Caseworker approves a claim | Award calculated per rules; notice of decision with amount, reasons and appeal rights issued | P1 |
| GOV-FUN-POS-004 | Business applies for a permit and pays the fee | Fee = rules for permit type; receipt; application in review queue | P1 |
| GOV-FUN-POS-005 | Taxpayer files a return with a refund due | Return accepted; refund amount = overpaid tax; refund issued to verified account | P1 |
| GOV-FUN-POS-006 | Licence holder renews within the renewal window | New expiry = old expiry + term; renewal fee charged; licence status Active | P2 |
| GOV-FUN-POS-007 | Citizen saves an application and returns later | Answers restored; session-expiry warning was given before timeout | P2 |

### Negative
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-FUN-NEG-001 | Submit application missing a mandatory answer | Error summary at top linking to the field; inline error message; nothing submitted | P1 |
| GOV-SEC-NEG-002 | Citizen accesses another person's application by changing the reference | 403 / 404; access attempt logged | P1 |
| GOV-SEC-NEG-003 | Caseworker opens a case outside their assigned office / caseload | Access denied or break-glass with justification and audit, per policy | P1 |
| GOV-FUN-NEG-004 | Upload an evidence file of a disallowed type or over the size limit | Clear error naming allowed types and size; no upload | P2 |
| GOV-SEC-NEG-005 | Account recovery attempt with partially known identity data | Recovery refused without required proofing; no account details revealed | P1 |
| GOV-FUN-NEG-006 | Appeal submitted after the statutory deadline | Rejected as late or routed for late-appeal consideration with reasons | P2 |
| GOV-FUN-NEG-007 | Duplicate application for the same benefit and period | Duplicate detected; citizen directed to existing application | P2 |

### Boundary
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-FUN-BVA-001 | Household income at threshold − 1, threshold and threshold + 1 | Eligible, eligible (if ≤), ineligible | P1 |
| GOV-FUN-BVA-002 | Applicant aged exactly the qualifying age on the qualifying date | Eligible per rule; one day younger ineligible | P1 |
| GOV-FUN-BVA-003 | Taxable income at each bracket edge | Tax computed with correct bracket split | P1 |
| GOV-FUN-BVA-004 | Statutory response deadline falling on a public holiday | Deadline moved per statute rule (next working day or not) | P2 |
| GOV-FUN-BVA-005 | Renewal on the first day of the window and the day before | Accepted vs "too early" message | P3 |
| GOV-UIX-BVA-006 | Session timeout: activity at timeout − 1 min after warning, and no activity until timeout | Session extended vs safely ended with data saved | P2 |

### End-to-end
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-FUN-E2E-001 | Sign-in with identity proofing → application → automated data matching → RFI → evidence upload → decision → notice → first payment | Each step recorded; payment to verified account; notice content matches decision | P1 |
| GOV-FUN-E2E-002 | Change of circumstances reported late → re-determination → overpayment calculated → recovery plan → notice with appeal rights | Overpayment and deductions correct; citizen notified | P1 |
| GOV-FUN-E2E-003 | Building permit: application → plan review comments → resubmission → inspection fail → re-inspection pass → permit issued | Statuses, fees and conditions correct; inspection results recorded | P2 |
| GOV-FUN-E2E-004 | Denied claim → appeal → hearing scheduled → decision overturned → back payment | Back payment from original effective date; records updated | P1 |
| GOV-FUN-E2E-005 | Assisted digital: phone agent completes application on behalf of a citizen | Same validation and outcome as online; agent identity and consent recorded | P2 |
| GOV-FUN-E2E-006 | FOI request → records search → redaction → response within statutory deadline | Exempt data redacted; response logged; deadline tracked | P3 |

### Business scenarios
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-REG-BUS-001 | Annual uprating of benefit rates effective on a statutory date | Payments for periods from the date use new rates; earlier periods unchanged | P1 |
| GOV-FUN-BUS-002 | Emergency programme launched with new eligibility rules within days | Rules configurable and tested; peak load handled; fraud controls active | P1 |
| GOV-FUN-BUS-003 | Death notification from vital records for a benefit recipient | Payments stopped from the correct date; overpayment handling started; sensitive notice to estate | P1 |
| GOV-FUN-BUS-004 | Legal hold placed on records involved in litigation | Disposal blocked until hold released | P2 |
| GOV-FUN-BUS-005 | Licence suspended after enforcement action | Public register updated; renewals blocked; notice of suspension issued | P2 |
| GOV-FUN-BUS-006 | Inter-agency data shows a mismatch with self-declared income | Case flagged for review; citizen given opportunity to respond before adverse decision | P1 |

### Edge conditions
| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| GOV-FUN-EDG-001 | Applicant born on 29 February reaching the qualifying age in a non-leap year | Age computed per legal rule (28 February or 1 March) consistently | P3 |
| GOV-FUN-EDG-002 | Rule change effective date falls mid-way through a pending application | Rules applied per the policy on which date governs (application or decision date) | P1 |
| GOV-RES-EDG-003 | Partner agency verification API unavailable | Application accepted as pending verification; no automatic denial; retry scheduled | P2 |
| GOV-RES-EDG-004 | Payment batch file rerun after partial failure | No duplicate payments; all unpaid items paid | P1 |
| GOV-L10N-EDG-005 | Notice generated in a language other than English | Content equivalent to English version including amounts, dates and appeal rights | P2 |
| GOV-A11Y-EDG-006 | Screen-reader user completes a multi-page form with errors | Errors announced; focus moves to error summary; completion without sighted help | P1 |

## Integrations
National / state identity providers (Login.gov, GOV.UK One Login, eIDAS nodes, Aadhaar / DigiLocker), other agencies (tax, social security, vital records, immigration, employment, education), payment gateways and treasury systems, banks (direct deposit / account verification), notification services (email, SMS, postal print), document and records management, GIS (property and zoning), legacy mainframes and batch files, case management platforms, open data portals, fraud analytics.

## Non-functional profile
- Seasonal and deadline peaks (tax filing day, benefit renewal windows) of 10× normal or more; queueing with fair access.
- Availability 24×7 for online services with published maintenance windows; assisted channels as fallback.
- Batch processing windows for payments and notices with strict cut-offs for bank files.
- Long retention of records (years to permanent) with retrieval performance.
- Accessibility conformance as a release criterion.

## Test data
Synthetic citizens and households across ages, incomes, household sizes, residency and disability statuses; businesses of different types; test identities from the identity provider's integration environment only; benefit and tax rule tables per effective date; permit types and fee schedules; public holiday calendars; translated content; documents of allowed / disallowed types. Never use real citizen records or real identifiers (use reserved / invalid ranges where the scheme defines them).

## Automation notes
- Automate first: eligibility and calculation rules (data-driven from decision tables), form validation and branching, access control per role, notices content, payment file generation.
- Oracles: independent rule calculator built from the policy / legislation tables; old-vs-new determination comparison on rule changes.
- Use frozen clocks for effective-date logic; parameterise holidays.
- Automated accessibility checks (axe) on every page plus manual screen-reader passes on key journeys.
- Automation mapping (<AppName>/): page objects per form page and caseworker screen, API services for applications, determinations, payments; features tagged `@feature:<Component>`.

## Related sub-skills
Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Localisation, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Domain-Education, Domain_Test_Design_Skill-Core-Techniques.
