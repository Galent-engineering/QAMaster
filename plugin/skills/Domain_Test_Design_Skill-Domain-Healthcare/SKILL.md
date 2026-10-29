---
name: "Domain_Test_Design_Skill-Domain-Healthcare"
description: "Healthcare domain test design sub-skill of Domain_Test_Design_Skill: providers, payers and health-tech (EHR/EMR, patient portals, scheduling, CPOE, e-prescribing, LIS/RIS/PACS, pharmacy, revenue cycle, telehealth, remote monitoring, HIE, payer enrolment, claims adjudication and prior authorisation), key business objects and workflows, regulations, risk hotspots, test strategy per test type, a scenario bank across Positive, Negative, Boundary, End-to-end, Business and Edge categories, business rules, integrations, non-functional profile and test data. Use when the application under test is an EHR, patient portal, practice management, RCM, claims, pharmacy, telehealth, FHIR / HL7 interface or payer system, or when TestGen / Domain_Test_Design_Skill routes a healthcare application here."
---

# Healthcare — domain test design (sub-skill of Domain_Test_Design_Skill)

Covers clinical care delivery, patient engagement, revenue cycle and payer operations, where patient safety and privacy outweigh every other risk. Use with the application-type and test-type sub-skills; methodology in Domain_Test_Design_Skill.

## Overview

- **Sub-domains:** inpatient and ambulatory EHR, emergency department, pharmacy and medication administration, laboratory and radiology, patient portal and mobile health, telehealth and remote patient monitoring, revenue cycle management, payer (enrolment, claims adjudication, utilisation management), health information exchange, population health.
- **Users:** physicians, nurses, pharmacists, lab and radiology technicians, registration and scheduling staff, coders, billers, payer adjudicators, patients and their proxies, privacy officers.

## Detection signals

- Terms: MRN, encounter, admission/discharge/transfer (ADT), order, result, eMAR, CPOE, allergy, problem list, ICD-10, CPT, HCPCS, claim, 837, 835, 270/271, 278, prior authorisation, EOB, copay, deductible, FHIR, HL7, DICOM, break-the-glass.
- Screens/routes: `/patient`, `/chart`, `/encounter`, `/orders`, `/results`, `/medications`, `/appointments`, `/claims`, `/eligibility`, `/portal`.
- Fields: date of birth, sex, payer id, member id, NPI, diagnosis code, dose, route, frequency, weight (kg).

## Business objects and workflows

### Business objects
Patient (MRN, identifiers), Guarantor, Coverage / insurance, Encounter, Appointment, Provider (NPI), Location / bed, Order (lab, imaging, medication), Result, Prescription, Medication administration record, Allergy, Problem, Vital sign, Clinical note, Diagnosis (ICD-10-CM), Procedure (CPT / HCPCS / ICD-10-PCS), Charge, Claim (837P / 837I), Remittance (835), Eligibility (270 / 271), Prior authorisation (278), Denial, Consent, Referral.

### Core workflows
1. Register patient and match identity (enterprise MPI).
2. Schedule appointment, check in and verify eligibility.
3. Document encounter (vitals, history, assessment, plan).
4. Place orders (lab, radiology, medications) with clinical decision support.
5. Receive and acknowledge results; notify critical values.
6. Prescribe electronically (including EPCS for controlled substances).
7. Administer medications with barcode scanning (eMAR).
8. Admit, transfer and discharge with medication reconciliation.
9. Capture charges, code, scrub and submit claims.
10. Adjudicate claims (payer), post remittances, manage denials and appeals.
11. Request and decide prior authorisations.
12. Conduct telehealth visits and remote monitoring.
13. Give patients and proxies portal access; release results and records.

### Object lifecycles
- **Encounter:** Scheduled → Arrived → In progress → Discharged → Coded → Billed → Closed.
- **Order:** Ordered → Verified (pharmacy) → In progress / Collected → Resulted → Acknowledged → Cancelled / Discontinued.
- **Claim:** Created → Scrubbed → Submitted → Accepted (277CA) / Rejected → Adjudicated (paid / denied / partially paid) → Appealed → Closed.
- **Prior authorisation:** Requested → Pended for information → Approved / Denied / Partially approved → Expired.

## Regulations and standards

- HIPAA Privacy, Security and Breach Notification Rules; HITECH; 42 CFR Part 2 (substance use disorder records).
- 21st Century Cures Act (information blocking), ONC Health IT Certification, USCDI.
- CMS rules (e.g. Interoperability and Patient Access, Price Transparency, timely filing per payer contract / Medicare 12 months).
- Standards: HL7 v2, HL7 FHIR R4 (US Core), SMART on FHIR, CDA / C-CDA, DICOM, X12 EDI (837, 835, 270/271, 276/277, 278), NCPDP SCRIPT, ICD-10-CM/PCS, CPT, HCPCS, SNOMED CT, LOINC, RxNorm.
- EPCS (DEA 21 CFR Part 1311) for controlled-substance e-prescribing.
- Section 1557 of the ACA and ADA for accessibility; WCAG 2.x AA.
- Outside the US: GDPR and NHS DSPT / DCB0129 / DCB0160 clinical safety (UK), ABDM (India), medical device rules where software is SaMD.

## Risk hotspots

- Wrong-patient identification, overlays and merges.
- Drug–drug and drug–allergy interaction alerts, dose-range checks, weight-based and paediatric dosing, unit conversions.
- Critical result notification and acknowledgement.
- Privacy: break-the-glass, VIP / sensitive records, minor and proxy access, 42 CFR Part 2 segmentation.
- Coding and claim edits (NCCI, medical necessity), timely filing limits, duplicate claims.
- Interface message loss or misrouting (ADT, ORM, ORU).
- Downtime procedures and data reconciliation after recovery.
- Alert fatigue causing missed safety alerts.

## Business rules to verify

| Rule | Typical formula / decision logic | How to test |
|---|---|---|
| Weight-based dose | Dose = mg/kg × weight (kg); alert when dose > configured max mg/kg or max absolute dose | Weights at boundaries; lb entered and converted (1 kg = 2.20462 lb) |
| Drug–allergy check | If drug's ingredient or class matches documented allergy → interruptive alert; override needs reason | Allergy to class vs ingredient; inactive allergy |
| Duplicate patient | Match score on name, DOB, sex, SSN/identifier, address; above threshold → potential duplicate | Name variants, transposed DOB, twins |
| Eligibility | 271 active coverage for date of service → proceed; inactive → self-pay / alternate coverage workflow | Coverage ending day before / on date of service |
| Patient responsibility | Allowed amount = contracted rate; patient pays deductible remaining, then coinsurance %, subject to out-of-pocket maximum; copay per plan | Deductible partly met; OOP max reached mid-claim |
| Timely filing | Claim accepted if submission date − date of service ≤ payer limit (days) | Day = limit, limit + 1 |
| Proxy access | Parent proxy for minor until configured age; adolescent confidential data hidden per state rules | Birthdays at configured ages |
| Critical result | Value outside critical limits → notify ordering provider within SLA; escalate if not acknowledged | Values at critical limits; no acknowledgement |
| Prior authorisation | Service on PA-required list → claim denied without valid approved PA for dates and units | Units above approved; dates outside approval |
| BMI / BSA | BMI = kg / m²; BSA (Mosteller) = √(cm × kg / 3600) | Known values, unit conversions |

## Test strategy by test type

| Test type | Emphasis |
|---|---|
| Functional | Clinical decision support alerts, order sets, dose calculators, scheduling rules, claim scrubbing rules, eligibility and benefits |
| Regression | Clinical content updates (drug database), interface regression, alert regressions, code-set annual updates (ICD-10, CPT) |
| API | FHIR resources (Patient, Encounter, Observation, MedicationRequest), SMART on FHIR authorisation, HL7 v2 ADT / ORM / ORU, X12 EDI |
| UI/UX | Clinician efficiency (clicks to complete), alert fatigue, critical information visibility, patient portal ease of use |
| Localisation | Multilingual patient portal and discharge instructions, units (kg/lb, °C/°F), date formats |
| Accessibility | Patient portal and telehealth WCAG 2.x AA (Section 1557 / ADA), accessible after-visit summaries |
| Security | Minimum-necessary access, audit of PHI access, break-the-glass, session timeouts on shared workstations, SMART scopes |
| Performance | EHR response at shift change, ED peak, portal at open enrolment, telehealth video quality, claim batch throughput |
| Integration | EHR ↔ LIS / RIS / PACS / pharmacy, HIE, clearinghouse, payer portals, device integration |
| Data migration | Legacy EHR conversion: patients, allergies, problems, medications, results; identity and history preserved |
| Resilience | Downtime read-only access, interface queue replay without duplicates, recovery reconciliation |

## Scenario bank

ID convention `HLC-<TYPE>-<CAT>-<NNN>`; TYPE FUN / REG / API / UIX / L10N / A11Y / SEC / PERF / INT / MIG / RES; CAT POS / NEG / BVA / E2E / BUS / EDG.

### Positive

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-POS-001 | Register a new patient with complete demographics and insurance | MRN generated; eligibility (270/271) returned and displayed | P1 |
| HLC-FUN-POS-002 | Prescribe medication with no interactions | e-Rx transmitted to pharmacy; status acknowledged | P1 |
| HLC-FUN-POS-003 | Schedule a follow-up appointment in an open slot | Slot booked; confirmation sent; slot no longer available to others | P2 |
| HLC-FUN-POS-004 | Nurse scans patient wristband and medication barcode before administration | Five rights verified; administration recorded on eMAR with time | P1 |
| HLC-API-POS-001 | Read a Patient resource via FHIR with a valid SMART token | 200 with US Core-conformant resource; only scoped data returned | P2 |
| HLC-FUN-POS-005 | Post an 835 remittance that fully pays a claim | Payment and adjustments posted to correct lines; account balance zero | P2 |

### Negative

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-NEG-001 | Order drug to which the patient has a documented allergy | Hard-stop / interruptive alert; override requires reason and is audited | P1 |
| HLC-FUN-NEG-002 | Register patient whose name + DOB matches existing patient | Duplicate check prompts; no silent duplicate MRN | P1 |
| HLC-SEC-NEG-001 | Staff member searches a celebrity/VIP patient without care relationship | Access warning; audited; reported to privacy officer | P1 |
| HLC-FUN-NEG-003 | Administer medication to a patient whose wristband does not match the order | Wrong-patient alert; administration blocked | P1 |
| HLC-FUN-NEG-004 | Submit claim missing required diagnosis pointer | Scrubber rejects with edit message before submission | P2 |
| HLC-SEC-NEG-002 | FHIR call with token scoped to patient A requesting patient B | 403; no data returned; access logged | P1 |

### Boundary

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-BVA-001 | Paediatric dose at max mg/kg, max+1 mg/kg | Max accepted; above max triggers dose-range alert | P1 |
| HLC-FUN-BVA-002 | Claim submitted on day 90, 91 of a 90-day timely-filing limit | Day 90 accepted; day 91 denied / flagged | P2 |
| HLC-FUN-BVA-003 | Patient age exactly 18 for portal proxy access | Proxy access for parent ends per configured rule at 18th birthday | P2 |
| HLC-FUN-BVA-004 | Potassium result at critical limit and one unit beyond | Critical notification fires at the configured comparison (≥ or >) consistently | P1 |
| HLC-FUN-BVA-005 | Deductible remaining 0.01 vs 0.00 when claim adjudicates | Patient responsibility splits between deductible and coinsurance exactly | P2 |
| HLC-FUN-BVA-006 | Coverage end date equals date of service | Eligibility active for that day per payer rule | P2 |

### End-to-end

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-E2E-001 | Appointment → check-in → visit → lab order → result → diagnosis → claim → remittance → posting | Charges match orders; claim codes match documentation; 835 posts and balances account | P1 |
| HLC-FUN-E2E-002 | Critical lab result received via HL7 ORU | Result filed to correct patient; critical alert to ordering provider within SLA; acknowledgement tracked | P1 |
| HLC-FUN-E2E-003 | ED arrival → admission → transfer to ICU → discharge with medication reconciliation | ADT A01/A02/A03 sent; bed board updated; discharge summary and prescriptions issued | P1 |
| HLC-INT-E2E-004 | Prior authorisation request (278) → payer approval → service → claim → payment | Claim references PA number; paid within approved units and dates | P2 |
| HLC-FUN-E2E-005 | Denied claim → correction → resubmission / appeal → payment | Denial reason captured; corrected claim frequency code used; payment posted | P2 |
| HLC-FUN-E2E-006 | Patient books via portal → completes questionnaire → telehealth visit → after-visit summary in portal | Questionnaire in chart; summary released per policy | P3 |

### Business scenarios

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-BUS-001 | Telehealth visit for a patient in a different state | Provider licensure check; consent captured; visit documented; billed with correct place-of-service / modifier | P2 |
| HLC-FUN-BUS-002 | ED clinician uses break-the-glass to view a restricted record | Access granted with reason; privacy office notified; full audit trail | P1 |
| HLC-FUN-BUS-003 | Patient with two coverages (coordination of benefits) | Primary billed first; secondary claim with primary payment information | P2 |
| HLC-FUN-BUS-004 | Patient requests release of records to a third-party app via API | Released per consent within required time; no information blocking | P2 |
| HLC-FUN-BUS-005 | Adolescent confidential visit with parent proxy access | Confidential notes and results hidden from proxy | P1 |
| HLC-FUN-BUS-006 | Drug database update adds a new interaction | New alert fires for affected combinations; no alert loss for others | P2 |

### Edge conditions

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| HLC-FUN-EDG-001 | Merge two patient records, then unmerge | Encounters, results and orders reassigned and restored; downstream systems notified (ADT A40) | P1 |
| HLC-FUN-EDG-002 | Medication administered during DST fall-back hour | MAR timeline correct; no duplicate or missed dose alerts | P2 |
| HLC-FUN-EDG-003 | Unidentified trauma patient registered with temporary name, later identified | Records merged into true identity; orders and results retained | P1 |
| HLC-RES-EDG-004 | Interface engine down 2 hours, then replays queued messages | All messages processed once, in order; no duplicate results | P1 |
| HLC-FUN-EDG-005 | Newborn registered before name assigned (baby boy / baby girl) | Linked to mother; twins distinguishable; later name update propagates | P2 |
| HLC-FUN-EDG-006 | Order discontinued while pharmacy verification in progress | Dispense cancelled; eMAR shows discontinued; no administration task | P2 |

## Integrations

EHR ↔ LIS, RIS / PACS, pharmacy and dispensing cabinets; e-prescribing network; HIE / regional exchanges; clearinghouse ↔ payers (X12); payer portals; medical devices and monitors; patient portal and mobile apps; telehealth video platform; identity proofing; MPI; drug knowledge base; ERP / GL; analytics and registries.

## Non-functional profile

- **Performance:** chart open and order entry response at shift change; ED peak; portal at open enrolment; claim batches of hundreds of thousands of lines.
- **Security and privacy:** role-based and relationship-based access, PHI access audits, session timeout on shared devices, encryption, 42 CFR Part 2 segmentation.
- **Availability:** 24×7 clinical operations, downtime procedures, read-only BCA (business continuity access).
- **Accessibility and localisation:** patient-facing WCAG AA, multilingual instructions, unit conversions.

## Test data

Synthetic patients (e.g. generated with Synthea); never production PHI; drug knowledge base test edition; payer test endpoints / clearinghouse sandboxes; patients at age boundaries (newborn, paediatric, 18, geriatric), with allergies, multiple coverages, merged identities and sensitive records.

## Automation notes

- Automate first: registration and duplicate check, order entry with alerts, results acknowledgement, claim scrubbing, eligibility, FHIR read/search.
- Oracles: independent dose and patient-responsibility calculations; HL7 / FHIR / X12 schema validation.
- Seed patients through FHIR or HL7 rather than UI; isolate tests per patient.
- In the application's automation folder (<AppName>/): page objects for chart, orders, MAR and portal screens; API services for FHIR and eligibility; features tagged `@feature:<Component>` with `@TC-` ids from TestGen.

## Related sub-skills

Domain_Test_Design_Skill-Domain-LifeSciences, Domain_Test_Design_Skill-Domain-Insurance, Domain_Test_Design_Skill-App-Web, Domain_Test_Design_Skill-App-Mobile, Domain_Test_Design_Skill-App-API, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Accessibility, Domain_Test_Design_Skill-Test-Integration, Domain_Test_Design_Skill-Test-DataMigration, Domain_Test_Design_Skill-Core-RiskAndData.
