---
name: "Domain_Test_Design_Skill"
description: "Domain-specific black-box test design skill and router to its sub-skills. Use it to understand an application under test, classify its application type (Web, API, Mobile, Desktop, Cloud/SaaS, Image-based, Data platform, AI/ML) and business domain (Telecom, Life Sciences, Healthcare, Banking, Financial Services, Insurance, HRM/Payroll, CRM, Salesforce, Retail, Travel, Logistics, Energy, Education, Manufacturing, Public Sector), select test types (Functional, Regression, API, UI/UX, Localisation, Accessibility, Security, Performance, Integration, Compatibility, Data migration, Resilience) and design Positive, Negative, Boundary, End-to-End, Business and Edge scenarios with the matching Domain-, App-, Test- and Core- sub-skills. Trigger on \"test strategy for a {domain} application\", \"black box test design\", \"which test types for\", or any QA planning task where the domain or application type matters. To write test cases for a module, use the TestGen skill, which loads this one."
---

# Domain Test Design Skill (router)

> A black-box test design playbook split into focused sub-skills. This main skill holds the procedure, the AUT profile, how to recognise the domain and application type, the cross-cutting matrices, and the index of sub-skills. The detail lives in the sub-skills — load only the ones the AUT needs.

## 1. Purpose and when to use

Turn *"here is an application, in this domain, on this platform"* into a structured, risk-based, traceable set of test scenarios without needing the source code.

**Use when**
- A test strategy, plan, scenarios or test cases are needed for an application or module.
- Requirements, user stories, wireframes, API contracts (OpenAPI, WSDL, GraphQL), or recordings are provided and tests are needed.
- Regression scope must be selected for a release or a change.
- A coverage review of existing test cases is requested ("what are we missing?").
- The domain is regulated and compliance-driven tests are needed.
- TestGen (zero-hallucination test generation) needs the domain, required test types, techniques and domain risks.

**Do not use for** white-box/unit test design from source code, or framework engineering (this skill designs *what* to test; the E2EAutomation and UI-Locator-Sync skills cover *how to automate*).

## 2. Sub-skill index

Load each sub-skill with the Skill tool by its exact name.

### 2.1 Core (method — use on every task)
| Sub-skill | Holds |
|---|---|
| `Domain_Test_Design_Skill-Core-Techniques` | 19 black-box techniques with worked examples, generic error-guessing list, the six scenario categories, category × technique map, models |
| `Domain_Test_Design_Skill-Core-RiskAndData` | Impact × likelihood scoring, P1–P4, always-P1 areas, suite tags, automation candidacy, test data classes and provisioning |
| `Domain_Test_Design_Skill-Core-OutputAndQuality` | ID convention, scenario list, detailed test case, Gherkin, API case, RTM, coverage summary, charters, quality gates, glossary |

### 2.2 Application types (where it runs)
| Sub-skill | Application type |
|---|---|
| `Domain_Test_Design_Skill-App-Web` | Browser UI: SPA, MPA, portals, PWA |
| `Domain_Test_Design_Skill-App-API` | REST, SOAP, GraphQL, gRPC, webhooks, events, microservices |
| `Domain_Test_Design_Skill-App-Mobile` | Native iOS/Android, hybrid, React Native, Flutter, mobile web |
| `Domain_Test_Design_Skill-App-Desktop` | Windows/macOS/Linux thick clients, Electron, WPF, Swing, Qt |
| `Domain_Test_Design_Skill-App-CloudSaaS` | Multi-tenant SaaS, subscriptions, SSO/SCIM, entitlements |
| `Domain_Test_Design_Skill-App-ImageBased` | OCR/IDP, ID and face verification, DICOM imaging, computer vision |
| `Domain_Test_Design_Skill-App-DataPlatform` | ETL/ELT, streaming, warehouse/lakehouse, BI reports |
| `Domain_Test_Design_Skill-App-AIML` | Predictive models, recommenders, chatbots, LLM/RAG, agents |

### 2.3 Test types (which quality)
| Sub-skill | Test type | Code |
|---|---|---|
| `Domain_Test_Design_Skill-Test-Functional` | Functional | FUN |
| `Domain_Test_Design_Skill-Test-Regression` | Regression | REG |
| `Domain_Test_Design_Skill-Test-API` | API | API |
| `Domain_Test_Design_Skill-Test-UIUX` | UI/UX | UIX |
| `Domain_Test_Design_Skill-Test-Localisation` | Localisation / i18n | L10N |
| `Domain_Test_Design_Skill-Test-Accessibility` | Accessibility (WCAG 2.2 AA) | A11Y |
| `Domain_Test_Design_Skill-Test-Security` | Security (OWASP, API Top 10, MASVS) | SEC |
| `Domain_Test_Design_Skill-Test-Performance` | Performance | PERF |
| `Domain_Test_Design_Skill-Test-Integration` | Integration / contract / system E2E | INT |
| `Domain_Test_Design_Skill-Test-Compatibility` | Browser / OS / device / version compatibility | CMP |
| `Domain_Test_Design_Skill-Test-DataMigration` | Data migration, ETL validation, reconciliation | MIG |
| `Domain_Test_Design_Skill-Test-Resilience` | Failover, DR, backup/restore, chaos, degradation | RES |

### 2.4 Domains (what matters to the business)
| Sub-skill | Domain | Prefix |
|---|---|---|
| `Domain_Test_Design_Skill-Domain-Telecom` | Telecom (BSS/OSS, charging, billing, porting, eSIM) | TEL |
| `Domain_Test_Design_Skill-Domain-LifeSciences` | Life Sciences (clinical, PV, LIMS, QMS, GxP) | LSC |
| `Domain_Test_Design_Skill-Domain-Healthcare` | Healthcare (EHR, portals, RCM, claims, HL7/FHIR) | HLC |
| `Domain_Test_Design_Skill-Domain-Banking` | Banking (core, digital, payments, cards, lending, AML) | BNK |
| `Domain_Test_Design_Skill-Domain-FinancialServices` | Capital markets, payments, wealth | FIN |
| `Domain_Test_Design_Skill-Domain-Insurance` | P&C, life, health insurance | INS |
| `Domain_Test_Design_Skill-Domain-HRM` | HRM / HCM and payroll | HRM |
| `Domain_Test_Design_Skill-Domain-CRM` | CRM (sales, service, marketing) | CRM |
| `Domain_Test_Design_Skill-Domain-Salesforce` | Salesforce clouds, CPQ, Flows, Apex/LWC | SFDC |
| `Domain_Test_Design_Skill-Domain-Retail` | Retail and eCommerce | RTL |
| `Domain_Test_Design_Skill-Domain-Travel` | Travel and hospitality | TRV |
| `Domain_Test_Design_Skill-Domain-Logistics` | Logistics and supply chain | LOG |
| `Domain_Test_Design_Skill-Domain-EnergyUtilities` | Energy and utilities | ENU |
| `Domain_Test_Design_Skill-Domain-Education` | Education / EdTech | EDU |
| `Domain_Test_Design_Skill-Domain-Manufacturing` | Manufacturing (ERP, MES, quality, traceability) | MFG |
| `Domain_Test_Design_Skill-Domain-PublicSector` | Government / public sector | GOV |

Every domain sub-skill has the same headings: Overview · Detection signals · Business objects and workflows · Regulations and standards · Risk hotspots · Business rules to verify · Test strategy by test type · Scenario bank (Positive / Negative / Boundary / End-to-end / Business scenarios / Edge conditions) · Integrations · Non-functional profile · Test data · Automation notes · Related sub-skills.

Every test-type sub-skill has: Purpose and scope · When to apply · Checklist · Design techniques · Scenario patterns · Entry and exit criteria · Metrics · Tools and automation · Common pitfalls · Related sub-skills.

## 3. Operating procedure

Each step produces an artefact the next step consumes.

1. **Understand the AUT** — fill the AUT profile (section 4). Sources: AUT_<App> skills, DSM, requirements, screens, contracts.
2. **Classify** — match the domain (section 5) and application type(s) (section 6). Load the matching domain and app-type sub-skills. A hybrid AUT (e.g. Salesforce-based insurance portal) loads both domain sub-skills.
3. **Model the application** — field inventory, rule tables, state diagrams, journeys, CRUD matrix, integration map (`-Core-Techniques` → Models).
4. **Select test types** — from the matrices in section 7 plus the domain sub-skill's *Test strategy by test type*. Load each selected test-type sub-skill. Record the reason for every excluded type.
5. **Design scenarios** — for every key workflow and selected test type, cover all six categories using `-Core-Techniques`. Seed from the domain *Scenario bank* and the test-type *Scenario patterns* — adapt to the AUT, don't copy blindly.
6. **Prioritise** — risk score and P1–P4, smoke/sanity/regression tags, automation candidates (`-Core-RiskAndData`).
7. **Specify test data** — data class per scenario, privacy-safe (`-Core-RiskAndData`).
8. **Produce output** — default Scenario list + Coverage summary (`-Core-OutputAndQuality`).
9. **Self-review** — quality gates in `-Core-OutputAndQuality`; every scenario cites its source (requirement, AUT skill, code, or sub-skill heading).

### Citing this skill (TestGen evidence)
Reference the sub-skill and heading that justifies a rule or risk:
`domain:Domain_Test_Design_Skill-Domain-HRM#Risk hotspots`, `domain:Domain-Banking#Business rules to verify`, `domain:Test-Security#Checklist`. The `Domain_Test_Design_Skill-` prefix is optional. Former section numbers (`domain:7.7`) still resolve to the sub-skill that now holds that content.

## 4. AUT profile and inputs

```
AUT Profile
- Name / Module           :
- Domain / Sub-domain     : (domain sub-skill)
- Application type(s)     : Web | API | Mobile | Desktop | Cloud/SaaS | Image-based | Data platform | AI/ML
- Primary users & roles   :
- Core business objects   : (e.g. Account, Policy, Order, Patient, Employee, Subscriber)
- Key workflows           : (top 5–10, verb + object)
- Business rules          : (calculations, eligibility, limits, state transitions)
- Integrations            : (upstream / downstream systems, third parties)
- Regulations             : (from the domain sub-skill)
- NFRs                    : (performance, availability, accessibility level, locales)
- Known risks / history   : (defect-prone areas, recent changes, incidents)
- Assumptions             :
```

| Input | Why it matters | If missing (state the assumption, never block) |
|---|---|---|
| Domain and sub-domain | Drives rules, regulations, data | Infer from detection signals (section 5) |
| Application type(s) | Drives platform tests | Infer (section 6); default Web + API |
| Requirements / stories / acceptance criteria | Source of expected results | Derive from domain norms; mark "assumed rule" (TestGen: cite only fetched requirements) |
| Roles and permissions | Access control and workflows | Assume Admin, Standard user, Read-only, Approver |
| Integrations | E2E, contract, failure modes | List as "integration points to confirm" |
| Locales, currencies, time zones | Localisation | en-US + one RTL + one double-byte locale |
| Browsers / devices / OS | Compatibility | Default matrices in the app-type sub-skills |
| NFRs | Performance, resilience | Defaults in `-Test-Performance`, marked assumed |
| Compliance obligations | Security, audit, privacy | Domain defaults |
| Change description (regression) | Impact analysis | Risk-based selection (`-Test-Regression`) |

## 5. Recognising the domain

Match the AUT's terms, objects, screens, routes and data fields against these signals, then confirm with the domain sub-skill's *Detection signals*.

| Signals | Domain sub-skill |
|---|---|
| Subscriber, MSISDN, SIM/eSIM, plan, tariff, CDR, porting, recharge, roaming | Domain-Telecom |
| Study, protocol, subject, randomisation, adverse event, batch record, GxP, 21 CFR Part 11 | Domain-LifeSciences |
| Patient, encounter, MRN, order, medication, HL7/FHIR, claim 837/835, appointment | Domain-Healthcare |
| Account, IBAN, CASA, deposit, loan, EMI, card, beneficiary, KYC, statement | Domain-Banking |
| Order book, trade, settlement, portfolio, NAV, fund, ISIN, broker, payment rail | Domain-FinancialServices |
| Policy, premium, quote, underwriting, claim, FNOL, endorsement, renewal, agent | Domain-Insurance |
| Employee, payroll, CTC, payslip, leave, attendance, PF, TDS, onboarding, F&F | Domain-HRM |
| Lead, contact, opportunity, pipeline, case, campaign, SLA, territory | Domain-CRM |
| Lightning, Apex, Flow, record type, profile/permission set, CPQ, org, sandbox | Domain-Salesforce |
| Product, SKU, cart, checkout, promotion, coupon, inventory, POS, return | Domain-Retail |
| PNR, fare, itinerary, booking, check-in, room, rate plan, GDS, loyalty miles | Domain-Travel |
| Shipment, consignment, AWB, waybill, warehouse, pick/pack, route, carrier, POD | Domain-Logistics |
| Meter, tariff, kWh, outage, connection, bill cycle, smart meter, grid | Domain-EnergyUtilities |
| Student, course, enrolment, grade, transcript, LMS, assessment, semester | Domain-Education |
| BOM, work order, routing, MRP, lot/serial, inspection, shop floor, OEE | Domain-Manufacturing |
| Citizen, applicant, eligibility, benefit, permit, licence, case worker, tax return | Domain-PublicSector |

No match → build a new domain sub-skill with the same headings (section 9) and state the assumption.

## 6. Recognising the application type

| Signals | App-type sub-skill |
|---|---|
| Browser URL, HTML/JS front end, SPA routes | App-Web |
| OpenAPI/WSDL/GraphQL/proto, no UI, message brokers | App-API |
| APK/IPA, Xcode/Gradle, React Native/Flutter, push and deep links | App-Mobile |
| Installer (MSI/DMG/PKG), Electron/WPF/Swing/Qt, local files | App-Desktop |
| Tenants/workspaces, plans and seats, SSO/SCIM, webhooks | App-CloudSaaS |
| Image/scan upload, OCR/IDP, face match, DICOM | App-ImageBased |
| ETL/ELT jobs, warehouse, dbt/Airflow, BI dashboards | App-DataPlatform |
| Model endpoints, scores, chat assistant, LLM/RAG, vector DB | App-AIML |

Most AUTs are several types at once (Web + API + Cloud/SaaS is the common default).

## 7. Cross-cutting matrices

### 7.1 Application type × test type applicability
(● core, ◐ conditional, ○ rarely)

| App type \ Test type | FUN | REG | API | UIX | L10N | A11Y | SEC | PERF | INT | CMP | MIG | RES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Web | ● | ● | ◐ | ● | ● | ● | ● | ● | ◐ | ● | ◐ | ◐ |
| API / Microservices | ● | ● | ● | ○ | ◐ | ○ | ● | ● | ● | ◐ (versions) | ◐ | ● |
| Mobile | ● | ● | ◐ | ● | ● | ● | ● (MASVS) | ● (device) | ◐ | ● | ◐ (upgrade) | ◐ (offline) |
| Desktop | ● | ● | ◐ | ● | ● | ● | ● | ◐ | ◐ | ● | ◐ (upgrade) | ◐ |
| Cloud / SaaS | ● | ● | ● | ● | ● | ● | ● (tenancy) | ● (elasticity) | ● | ● | ● | ● |
| Image-based | ● (accuracy) | ● (model) | ● | ◐ | ◐ (scripts) | ◐ | ● (privacy, spoofing) | ● (throughput) | ◐ | ◐ | ○ | ◐ |
| Data platform | ● (transform) | ● | ◐ | ◐ (BI) | ◐ | ◐ (BI) | ● (PII) | ● (windows) | ● | ○ | ● | ● (restart) |
| AI / ML | ● (eval) | ● (model) | ● | ◐ | ◐ | ◐ | ● (LLM Top 10) | ● (latency, cost) | ● | ○ | ○ | ● (fallback) |

### 7.2 Domain × test type emphasis
(H high, M medium, L low)

| Domain | FUN | REG | API | UIX | L10N | A11Y | SEC | PERF | INT | CMP | MIG | RES |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Telecom | H | H | H | M | M | M | H | H | H | M | H | H |
| Life Sciences | H | H | M | M | M | M | H | M | H | M | H | M |
| Healthcare | H | H | H | H | M | H | H | M | H | M | H | H |
| Banking | H | H | H | H | M | H | H | H | H | H | H | H |
| Financial Services | H | H | H | M | M | M | H | H | H | M | H | H |
| Insurance | H | H | H | M | M | M | H | M | H | M | H | M |
| HRM / Payroll | H | H | M | M | H | M | H | M | H | M | H | M |
| CRM | H | M | H | H | M | M | H | M | H | M | H | M |
| Salesforce | H | H (3 releases/yr) | H | M | M | M | H | M | H | M | H | M |
| Retail / eCommerce | H | H | H | H | H | H | H | H | H | H | M | H |
| Travel & Hospitality | H | H | H | H | H | H | M | H | H | H | M | H |
| Logistics | H | M | H | M | M | L | M | H | H | M | M | H |
| Energy & Utilities | H | H | H | M | M | M | H | H | H | M | H | H |
| Education | H | M | M | H | M | H | H | H (peaks) | H | H | M | M |
| Manufacturing | H | M | H | M | M | L | H (OT) | M | H | M | H | H |
| Public Sector | H | H | M | H | H | H | H | H (peaks) | H | H | H | H |

### 7.3 Category × technique map
See `Domain_Test_Design_Skill-Core-Techniques` → *Category × technique map*.

## 8. Quality gates (summary)
Before delivering: AUT profile complete with assumptions; domain, app type and test-type sub-skills named; every key workflow covered in all six categories (or reason given); rules have independently computed expected values; valid and invalid transitions; allowed and denied access per role; integration failure modes; observable expected results; navigation steps present; priorities by risk; traceability to a source. Full checklist: `Domain_Test_Design_Skill-Core-OutputAndQuality`.

## 9. Adding a sub-skill
- **New domain:** create `skills/Domain_Test_Design_Skill-Domain-<Name>/SKILL.md` with frontmatter `name` = folder name and the 13 domain headings listed in 2.4 (in that order); add a row to 2.4, section 5 and 7.2.
- **New test type:** `Domain_Test_Design_Skill-Test-<Name>` with the 10 test-type headings; add to 2.3, 7.1 and 7.2, and to `TYPES` in `tools/testgen/testgen.mts` if TestGen should accept it.
- **New application type:** `Domain_Test_Design_Skill-App-<Name>` (Detection signals, Focus areas, Checklist, Scenario patterns, Test-type applicability, Tools and automation, Common pitfalls, Related sub-skills); add to 2.2, 6 and 7.1.
