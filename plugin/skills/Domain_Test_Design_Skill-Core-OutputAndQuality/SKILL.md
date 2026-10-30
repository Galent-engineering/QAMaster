---
name: "Domain_Test_Design_Skill-Core-OutputAndQuality"
description: "Core sub-skill of Domain_Test_Design_Skill with the deliverable templates (scenario list, detailed test case, BDD/Gherkin, API test case, requirements traceability matrix, coverage summary, exploratory charter, test strategy outline), the ID convention, the quality gates and self-review checklist, and the glossary. Use when writing test design deliverables or reviewing test cases for completeness, traceability and observable expected results."
---

# Output templates and quality gates (sub-skill of Domain_Test_Design_Skill)

How test design is **delivered** and **reviewed**. Default output = Scenario list + Coverage summary unless another format is requested.

## ID convention
`<PFX>-<TYPE>-<CAT>-<NNN>`
- PFX: domain prefix from the domain sub-skill (e.g. BNK, HRM, RTL) or the module code.
- TYPE: FUN, REG, API, UIX, L10N, A11Y, SEC, PERF, INT, CMP (compatibility), MIG, RES.
- CAT: POS, NEG, BVA, E2E, BUS, EDG.

## Templates

### Test scenario list (default)
| Scenario ID | Module / Feature | Test Type | Category | Scenario Title | Preconditions | Test Data | Expected Result | Priority | Requirement / Rule Ref | Automation Candidate |
|---|---|---|---|---|---|---|---|---|---|---|

### Detailed test case
```
Test Case ID     : <PFX>-<TYPE>-<CAT>-<NNN>
Title            : <Verb> <object> <condition>
Module / Feature :
Requirement Ref  :
Test Type        : Functional | Regression | API | UI/UX | L10n | A11y | Security | Performance | Integration | Compatibility | Data migration | Resilience
Category         : Positive | Negative | Boundary | E2E | Business | Edge
Priority         : P1 | P2 | P3 | P4
Application Type : Web | API | Mobile | Desktop | Cloud/SaaS | Image-based | Data platform | AI/ML
Role / Persona   :
Preconditions    :
Test Data        :
Steps            :
  1.
  2.
Expected Result  : (observable, verifiable — UI, data, response, notification, audit)
Post-conditions  :
Notes / Risks    :
```

### BDD / Gherkin
```gherkin
@web @feature:<component>
Feature: <Feature name>
  As a <role>
  I want <capability>
  So that <business value>

  Background:
    Given <common precondition>

  @P1 @functional @positive
  Scenario: <title>
    Given <context>
    When <action>
    Then <observable outcome>
    And <additional outcome>

  @P1 @functional @boundary
  Scenario Outline: <title with boundaries>
    Given <context>
    When the user enters <value>
    Then the system <result>

    Examples:
      | value     | result              |
      | min - 1   | rejects with error  |
      | min       | accepts             |
      | max       | accepts             |
      | max + 1   | rejects with error  |
```
Gherkin rules: one behaviour per scenario; declarative steps (business language, not clicks); `Then` asserts observable outcomes; reuse shared steps; tag platform (`@web`, `@mobile-web`, `@api`, `@native`) and trace tags (`@TC-<id>`).

### API test case
```
ID            :
Endpoint      : <METHOD> /path
Auth          : <scheme, role, scope>
Headers       :
Request Body  :
Expected Code :
Expected Body : (schema + key assertions)
Side Effects  : (records created, events published)
Negative Vars : (missing field, wrong type, unauthorised, other tenant ID)
```

### Requirements traceability matrix (RTM)
| Requirement ID | Requirement Summary | Scenario IDs | Test Types Covered | Categories Covered | Status |
|---|---|---|---|---|---|

### Coverage summary (append to every deliverable)
```
Coverage Summary — <AUT / Module>
Domain: <…>   App type(s): <…>   Sub-skills used: <…>
Workflows covered: <n>/<total>
Scenarios by category : POS <n> | NEG <n> | BVA <n> | E2E <n> | BUS <n> | EDG <n>
Scenarios by test type: FUN <n> | REG <n> | API <n> | UIX <n> | L10N <n> | A11Y <n> | SEC <n> | PERF <n> | INT <n> | CMP <n> | MIG <n> | RES <n>
Priority split        : P1 <n> | P2 <n> | P3 <n> | P4 <n>
Regulations addressed : <list>
Assumptions           : <list>
Gaps / Open questions : <list>
Excluded (with reason): <list>
```

### Exploratory test charter
```
Charter : Explore <area> with <resources/data/tools> to discover <risks/information>
Time box: 60–90 min
Persona : <role>
Notes   : <observations>
Bugs    : <ids>
Issues  : <questions, risks>
```

### Test strategy outline (when a strategy is requested)
1. Scope and objectives (in / out of scope). 2. AUT profile and assumptions. 3. Test levels and types with rationale (from the applicability matrix). 4. Approach per type (link sub-skills). 5. Environments and data. 6. Entry / exit criteria. 7. Tools and automation. 8. Risks and mitigations. 9. Schedule and roles. 10. Deliverables and metrics.

## Quality gates and self-review checklist

**Understanding**
- [ ] AUT profile completed; assumptions stated explicitly.
- [ ] Domain identified from detection signals; the domain sub-skill used; regulations mapped to scenarios.

**Coverage**
- [ ] Every key workflow has Positive, Negative, Boundary, E2E, Business and Edge scenarios (or a stated reason why not).
- [ ] Every selected test type has scenarios; excluded types are justified.
- [ ] Every business rule/calculation has an independently computed expected value.
- [ ] Every state transition (valid and invalid) for critical objects is covered.
- [ ] Every role has allowed and denied access checks for critical objects.
- [ ] Integrations have success, failure, timeout and retry/idempotency scenarios.
- [ ] Platform-specific checks from the application-type sub-skill applied for each app type in scope.

**Quality of scenarios**
- [ ] Titles are specific (verb + object + condition), not vague.
- [ ] Expected results are observable and verifiable; no "works fine" / "as expected".
- [ ] Steps include navigation to the screen where the action happens.
- [ ] No duplicates; each scenario tests one primary objective.
- [ ] Test data identified and privacy-safe.
- [ ] Priorities assigned by risk; P1 set lean enough for smoke runs.
- [ ] Traceability to requirement/rule/regulation present; nothing invented (cite the source).

**Delivery**
- [ ] Output in requested format (default: Scenario list + Coverage summary).
- [ ] Open questions and gaps listed for stakeholder review.

## Glossary

| Term | Meaning |
|---|---|
| AUT | Application Under Test |
| BVA / EP | Boundary Value Analysis / Equivalence Partitioning |
| E2E | End-to-End |
| BOLA / IDOR | Broken Object Level Authorization / Insecure Direct Object Reference |
| SCA | Strong Customer Authentication |
| ALCOA+ | Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available |
| GxP | Good x Practice (GCP, GLP, GMP) |
| PHI / PII | Protected Health Information / Personally Identifiable Information |
| CDR / OCS | Call Detail Record / Online Charging System |
| PNR / NDC | Passenger Name Record / New Distribution Capability (IATA) |
| FNOL | First Notice of Loss |
| CTC / F&F / LOP | Cost to Company / Full and Final settlement / Loss of Pay |
| OWD | Organisation-Wide Defaults (Salesforce sharing baseline) |
| CPQ | Configure, Price, Quote |
| OMS / WMS / TMS | Order / Warehouse / Transportation Management System |
| ERP / MES | Enterprise Resource Planning / Manufacturing Execution System |
| SIS / LMS | Student Information System / Learning Management System |
| WCAG / MASVS | Web Content Accessibility Guidelines / OWASP Mobile Application Security Verification Standard |
| RPO / RTO | Recovery Point / Recovery Time Objective |
| RTM | Requirements Traceability Matrix |
| CER / WER | Character / Word Error Rate |
| IoU | Intersection over Union |
| ETL / CDC | Extract-Transform-Load / Change Data Capture |
| RAG | Retrieval-Augmented Generation |

## Related sub-skills
- Domain_Test_Design_Skill (router), Domain_Test_Design_Skill-Core-Techniques, Domain_Test_Design_Skill-Core-RiskAndData
