---
name: "Domain_Test_Design_Skill-Domain-LifeSciences"
description: "Life Sciences domain test design sub-skill of Domain_Test_Design_Skill: pharma, biotech, medical devices and CROs (clinical trials CTMS/EDC/IRT/eTMF, pharmacovigilance, LIMS, QMS, RIM, MES, commercial), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is a GxP / computerised system such as EDC, CTMS, IRT/RTSM, eTMF, safety database, LIMS, QMS, eQMS, RIM/eCTD, MES or pharma commercial CRM, or when TestGen / Domain_Test_Design_Skill routes a life sciences application here."
---

# Life Sciences — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers regulated (GxP) computerised systems across research, clinical development, safety, manufacturing, quality, regulatory and commercial operations. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** clinical operations (CTMS, EDC, eCOA/ePRO, eConsent, IRT/RTSM, eTMF), pharmacovigilance / drug safety, laboratory (LIMS, ELN, CDS), manufacturing (MES, electronic batch records), quality (QMS: deviations, CAPA, change control, complaints, training), regulatory (RIM, eCTD publishing), medical devices (UDI, complaint handling, post-market surveillance), commercial (rep CRM, sample management, HCP transparency).
- **Users:** sponsors, CRAs/monitors, site staff (investigators, coordinators), subjects/patients, data managers, safety physicians, QA, QC analysts, regulatory affairs, manufacturing operators, sales reps.
- **Validation context:** systems are validated under a risk-based CSV / CSA approach; test execution itself is regulated evidence.

## Detection signals

- Terms: protocol, subject, site, visit, eCRF, query, SDV, randomisation, blinding, kit, IP (investigational product), AE/SAE, SUSAR, MedDRA, WHODrug, E2B, batch, lot, CoA, OOS, deviation, CAPA, change control, e-signature, audit trail, GxP, IQ/OQ/PQ.
- Screens/routes: `/study`, `/subject`, `/visit`, `/ecrf`, `/queries`, `/randomize`, `/case`, `/batch`, `/sample`, `/capa`, `/deviation`, `/esign`.
- Fields: signature meaning, reason for change, visit window, stratification factor, seriousness criteria, onset date, lot number, expiry date, specification limit.

## Business objects and workflows

### Business objects
Study / Protocol (and amendments), Site, Investigator, Subject, Informed consent, Visit, eCRF / form version, Edit check, Query, Randomisation list, Stratum, Drug kit / IP, Shipment, Adverse Event (AE / SAE), Safety case (ICSR), Product, Batch / Lot, Sample, Test / Specification, Result, Deviation, CAPA, Change control, Controlled document, Training record, Submission, Audit trail entry, Electronic signature.

### Core workflows
1. Build and validate a study (forms, edit checks, randomisation, UAT).
2. Activate sites and train users (role grants only after training).
3. Screen subjects and capture informed consent (paper or eConsent).
4. Randomise subjects and dispense kits through IRT.
5. Enter visit data, fire edit checks, raise and resolve queries.
6. Perform source data verification and freeze / lock data.
7. Intake, triage, code (MedDRA) and assess safety cases; submit expedited reports (E2B R3).
8. Receive samples, test in LIMS, review and approve results, issue CoA.
9. Execute batch records, review exceptions, QA release (QP certification in the EU).
10. Raise deviations, investigate root cause, raise and verify CAPA effectiveness.
11. Control documents: draft → review → approve with e-signature → effective → periodic review → retire.
12. Compile and publish regulatory submissions (eCTD).
13. Withdraw subjects and close out sites; archive the TMF.

### Object lifecycles
- **Subject:** Screened → Screen failed / Enrolled → Randomised → On treatment → Completed / Discontinued / Withdrawn consent → Lost to follow-up.
- **Query:** Open → Answered → Closed / Re-opened → Cancelled.
- **Safety case:** Received → Triage (valid ICSR?) → Data entry → Coded → Medical review → Submitted → Follow-up → Closed.
- **Batch:** Planned → In production → Awaiting QC → Under QA review → Released / Rejected / Quarantined.

## Regulations and standards

- FDA 21 CFR Part 11 (electronic records and signatures); EU GMP Annex 11 (computerised systems).
- GxP: GCP (ICH E6(R3)), GLP (21 CFR Part 58, OECD), GMP (21 CFR 210/211, EU GMP), GDP.
- ICH E2B(R3) (ICSR transmission), ICH E2A / E2D (expedited and post-approval safety reporting), EU GVP modules; 21 CFR 312.32 (IND safety reports).
- GAMP 5 (second edition) risk-based validation; FDA Computer Software Assurance guidance.
- Data integrity: ALCOA+ (MHRA, FDA and PIC/S data integrity guidance).
- CDISC (CDASH, SDTM, ADaM, ODM), MedDRA, WHODrug, IDMP (ISO 11615/11616), eCTD (ICH M8).
- Medical devices: 21 CFR Part 820 / QMSR, ISO 13485, EU MDR / IVDR, IEC 62304 (device software), ISO 14971 (risk management), UDI.
- Privacy: HIPAA (US subject data where applicable), GDPR (EU trials), local data-protection law.
- Commercial: US Physician Payments Sunshine Act (Open Payments), PhRMA / EFPIA codes.

## Risk hotspots

- Audit trail completeness: who, what, when, why, old → new value; cannot be disabled or edited.
- E-signature binding to the record, signature meaning, re-authentication and signing sequence.
- Data integrity (ALCOA+): contemporaneous timestamps, no silent overwrites, original data retained.
- Edit-check logic and derived fields (BMI, BSA, dose by weight, age at consent).
- Randomisation and blinding: stratification, kit allocation, emergency unblinding, blind leaks via exports.
- Expedited reporting clocks (7 and 15 calendar days from day 0 = first awareness).
- Protocol amendments mid-study and eCRF version migration.
- Time-zone of visit, dosing and sample-collection timestamps across sites.
- Specification limits, OOS detection and batch release gating.
- Validation evidence traceability (URS → risk → test → result).

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Visit window | Target day = baseline day + scheduled offset; in window if target − lower ≤ actual ≤ target + upper | Actual at −w−1, −w, target, +w, +w+1 days |
| BMI derivation | BMI = weight (kg) / height (m)² (rounding per data management plan) | Known pairs incl. unit conversion lb/in |
| Body surface area | Mosteller: BSA (m²) = √(height cm × weight kg / 3600) | Compare to independently computed values |
| Age at consent | Age = completed years between date of birth and consent date | Birthday on, before and after consent date; partial dates |
| Expedited SAE reporting | Fatal / life-threatening unexpected related → 7 calendar days; other serious unexpected related → 15 calendar days; day 0 = first awareness | Awareness dates producing deadlines on weekends / holidays |
| Seriousness criteria | Serious if death, life-threatening, hospitalisation (initial or prolonged), disability, congenital anomaly or other medically important event | Each criterion alone and none |
| Randomisation | Assignment from validated list / algorithm per stratum; next available kit not expired and at site | Exhaust a stratum block; expired kits in stock |
| Specification check | Result within [lower, upper] spec → pass; otherwise OOS → investigation | Results at limits and just outside, rounding per USP / reporting rules |
| E-signature | Requires two components (user ID + password) at first signing of a session; each later signing at least the password; manifestation shows name, date/time, meaning | Sign twice in a session; sign after session expiry |
| Training gate | Role activated only when required training records are complete and effective | Grant role with one course pending |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Edit checks, derivations, visit windows, randomisation and stratification, workflow approvals, e-signatures, audit trails, OOS logic, CAPA workflow |
| Regression | Protocol amendment impact, validated-state preservation, re-execution of OQ scripts after patches, dictionary up-versioning (MedDRA releases) |
| API | EDC ↔ IRT ↔ CTMS ↔ safety integrations, E2B gateway, lab data imports (HL7 / CDISC ODM), LIMS ↔ instruments / CDS |
| UI/UX | Site-user efficiency for eCRF entry, query resolution UX, ePRO usability for patients |
| Localisation | Multi-country trials: translated ePRO / eConsent, date formats (DD-MMM-YYYY), units (mg/dL vs mmol/L) |
| Accessibility | ePRO / eConsent for patients with impairments; WCAG 2.2 AA |
| Security | Role-based blinding, site-level data isolation, password / e-signature controls, audit-trail tamper-proofing, account lockout |
| Performance | Concurrent site data entry at peak, database lock extracts, safety case volume, LIMS sample throughput |
| Integration | Lab vendor transfers, IRT drug supply, safety → regulators (FDA ESG, EudraVigilance), ERP ↔ MES ↔ LIMS |
| Data migration | Legacy safety database migration (case counts, coded terms, narratives), study migration between EDC versions with audit trail retained |
| Resilience | Backup / restore with record integrity, disaster recovery of validated systems, offline ePRO sync |

## Scenario bank

ID convention `LSC-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-POS-001 | Enter valid visit data within visit window | Saved; no queries fired; audit trail records user, time and value | P1 |
| LSC-FUN-POS-002 | Approve document with e-signature (user ID + password + meaning) | Signature manifestation shows printed name, date/time and meaning; record locked | P1 |
| LSC-FUN-POS-003 | Randomise an eligible subject in a stratified study | Arm assigned per list for the stratum; kit number issued; blinded users see kit only | P1 |
| LSC-FUN-POS-004 | Data manager raises a query; site answers; data manager closes it | Query states Open → Answered → Closed with timestamps and users | P2 |
| LSC-FUN-POS-005 | Book in a sample, enter results within specification, approve | Result approved; CoA generated; sample status complete | P2 |
| LSC-FUN-POS-006 | Code an AE verbatim term to MedDRA LLT/PT | Coded hierarchy stored (LLT, PT, HLT, HLGT, SOC); dictionary version recorded | P2 |
| LSC-API-POS-001 | Generate an E2B(R3) ICSR for a valid case | XML validates against the ICH schema; acknowledgement (ACK) received and stored | P1 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-NEG-001 | Modify a locked / signed record | Blocked, or change requires reason and invalidates signature per SOP; audit trail updated | P1 |
| LSC-FUN-NEG-002 | E-sign with wrong password three times | Account locked; security event logged | P1 |
| LSC-FUN-NEG-003 | Randomise a subject failing inclusion criteria | Randomisation blocked with reason | P1 |
| LSC-SEC-NEG-001 | Blinded user attempts to access treatment arm via API / export | Denied; no arm information leaked in any field or file name | P1 |
| LSC-FUN-NEG-004 | Change a data value without entering a reason for change | Save blocked until reason entered | P1 |
| LSC-FUN-NEG-005 | Dispense an expired or quarantined kit | IRT refuses; next valid kit offered | P1 |
| LSC-SEC-NEG-002 | Site A user searches for a subject at site B | No results; access attempt audited | P2 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-BVA-001 | Visit on day −3, −2, +2, +3 of a ±2-day window | −2/+2 in window; −3/+3 out of window → protocol deviation query | P1 |
| LSC-FUN-BVA-002 | Lab value at reference range limits | In range: no flag; out of range: flagged; clinically significant prompts AE consideration | P2 |
| LSC-FUN-BVA-003 | Subject age exactly at minimum and maximum inclusion age, and ±1 day | Ages at limits eligible; outside rejected by edit check | P1 |
| LSC-FUN-BVA-004 | 15-day SAE report submitted on day 15 vs day 16 after awareness | Day 15 on time; day 16 flagged late in compliance metrics | P1 |
| LSC-FUN-BVA-005 | Assay result at specification limit and one reporting increment outside | At limit passes; outside triggers OOS investigation | P1 |
| LSC-FUN-BVA-006 | Kit expiry date equals projected next-visit date (do-not-dispense window) | Kit excluded per configured do-not-dispense days | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-E2E-001 | Screen → consent → randomise → dispense kit → visit → AE → SAE report | IRT kit assignment correct; SAE in safety system with E2B XML generated within timeline | P1 |
| LSC-FUN-E2E-002 | Batch record → QC testing in LIMS → QA review → release | Batch released only after all specifications pass and QA e-signature | P1 |
| LSC-FUN-E2E-003 | Deviation → investigation → CAPA → effectiveness check → closure | Each step signed; CAPA linked to deviation; overdue CAPAs escalated | P2 |
| LSC-INT-E2E-004 | Central lab file transfer → EDC import → edit checks → queries | All records loaded or rejected with report; reconciled counts | P2 |
| LSC-FUN-E2E-005 | Last subject last visit → query resolution → SDV complete → database lock → unblinding | Lock prevents edits; unblinding only after lock with authorised role | P1 |
| LSC-FUN-E2E-006 | SOP revision: draft → review → approve → training assigned → effective | Users without training cannot perform the governed task after effective date | P2 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-BUS-001 | Protocol amendment adds a new visit mid-study | Ongoing subjects follow transition rules; existing data untouched; new eCRF version applied | P1 |
| LSC-FUN-BUS-002 | Emergency unblinding by investigator | Only authorised role; reason captured; sponsor notified; blinded users stay blinded | P1 |
| LSC-FUN-BUS-003 | Drug supply resupply triggered when site stock falls below threshold | Shipment created automatically; site receipt updates inventory | P2 |
| LSC-FUN-BUS-004 | Follow-up information upgrades a non-serious AE to serious | Case reclassified; new reporting clock calculated from awareness of seriousness | P1 |
| LSC-FUN-BUS-005 | Product complaint for a medical device with injury | Complaint triaged as reportable; MDR / vigilance report timeline started | P2 |
| LSC-FUN-BUS-006 | MedDRA version upgrade during an ongoing study | Coded terms re-mapped; changed codes listed for review; history retained | P3 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| LSC-FUN-EDG-001 | Subject withdraws consent and requests data deletion | Collection stops; retained data per regulation; audit trail intact | P1 |
| LSC-FUN-EDG-002 | Site in UTC+13 enters visit at 23:30 local, server in UTC | Visit date stored and displayed per site's local date | P2 |
| LSC-FUN-EDG-003 | Partial dates (UNK-Mar-2025) for medical history onset | Accepted per CDASH rules; derivations handle imputation per specification | P3 |
| LSC-FUN-EDG-004 | Two users edit the same eCRF page concurrently | Second save detects conflict; no silent overwrite; both changes audited | P2 |
| LSC-RES-EDG-005 | ePRO device offline for 3 days, then syncs | Entries keep original capture timestamps; late entries flagged per diary rules | P2 |
| LSC-FUN-EDG-006 | System clock change / DST on audit-trail timestamps | Timestamps remain in UTC with offset; sequence preserved | P3 |

## Integrations

EDC ↔ IRT (randomisation, dispensing), EDC ↔ CTMS (visit tracking, payments), EDC ↔ safety database (SAE forms), safety ↔ regulators (FDA ESG / FAERS, EudraVigilance, PMDA), central labs and imaging vendors, eCOA / ePRO devices, eTMF ↔ CTMS, LIMS ↔ instruments / chromatography data systems, MES ↔ ERP ↔ LIMS, QMS ↔ training (LMS), RIM ↔ eCTD publishing, commercial CRM ↔ HCP master data and transparency reporting, SSO / identity provider.

## Non-functional profile

- **Performance:** peak concurrent site entry at enrolment surges; database-lock extracts (SDTM) within planned window; safety case intake during product launches or recalls.
- **Security:** blinding enforcement, site data isolation, Part 11 controls (unique IDs, password ageing, lockout, session timeout), audit trail immutability.
- **Availability and resilience:** validated backup / restore; disaster recovery tested with data-integrity verification; offline-capable ePRO.
- **Accessibility and localisation:** translated and linguistically validated ePRO / eConsent, WCAG 2.2 AA for patient-facing tools.

## Test data

Fully synthetic subjects; MedDRA / WHODrug test dictionaries; lab reference ranges by age and sex; randomisation test lists separate from production lists; kits with varied expiry dates; batches with in-spec, at-limit and OOS results; documented test evidence (screenshots, signed execution records) for GxP validation.

## Automation notes

- Automate first: eCRF data entry with edit checks, query lifecycle, e-signature, audit-trail verification, randomisation, SAE submission.
- Oracles: independently computed derivations (BMI, BSA, visit windows, reporting deadlines); audit-trail entry assertions on every change.
- Keep execution evidence (Allure attachments, screenshots, timestamps) suitable for validation packages; never auto-edit a validated script without change control.
- In the application's automation folder (<AppName>/): page objects for subject, visit/eCRF, query and e-signature dialogs; API services for IRT and E2B gateways; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-CloudSaaS, Domain_Test_Design_Skill-App-DataPlatform, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Regression, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-RiskAndData, Domain_Test_Design_Skill-Core-OutputAndQuality.
