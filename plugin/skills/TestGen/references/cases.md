# The run format

A run is a folder `testgen/output/<YYYYMMDD-HHMM>-<module>/` holding two files you write: `manifest.json` and `testcases.json`. `qam testgen validate` adds `validation.json`. `qam review` adds `run.json`.

## manifest.json

```json
{
  "app": "Shop",
  "scope": { "module": "Cart", "sub_module": "" },
  "components": ["Cart"],
  "test_types": ["Functional"],
  "required_types": ["Functional"],
  "channels": ["Web"],
  "domain": "Retail",
  "domain_evidence": ["domain:Domain_Test_Design_Skill-Domain-Retail#Detection signals", "aut:AUT_Shop"],
  "techniques": ["Equivalence partitioning", "Boundary value analysis"],
  "requirements_scope": "sprint-24",
  "coverage_exclusions": [{ "component": "Cart", "item": "screen:/cart/admin", "reason": "admin-only; the run has no admin account" }],
  "generated_at": "2026-10-29T12:00:00Z"
}
```

Leave out `requirements_scope` when there are no fetched requirements.

## testcases.json

A list of cases:

```json
{
  "id": "TC-CART-002",
  "title": "Checkout form posts with coupon SAVE10 to /checkout",
  "component": "Cart",
  "type": "Functional",
  "category": "E2E",
  "priority": "P1",
  "severity": "High",
  "sub_module": "AUT_Shop-Cart",
  "feature": "Checkout",
  "channel": "Web",
  "coverage": ["Functional", "Navigation", "Journey"],
  "objective": "Walk journey 1 from home to checkout through the cart",
  "business_scenario": "A shopper goes from the home page to checkout with a coupon",
  "preconditions": [],
  "test_data": { "coupon": "SAVE10" },
  "steps": [
    {
      "screen": "/",
      "action": "Click the Products link",
      "element": "Products",
      "leads_to": "/products",
      "expected": "The /products screen opens with its Cart link",
      "evidence": ["dsm:relation:/->/products"]
    }
  ],
  "expected_result": "The checkout form posts to /checkout and the /checkout screen opens",
  "evidence": ["aut:AUT_Shop-Cart#Screen details", "code:shop:src/Cart.tsx:12"]
}
```

- **Allowed values:**
  - `type`: Functional, Regression, API, UI/UX, Localisation, Accessibility, Security, Performance, Integration, Compatibility, Data migration, Resilience;
  - `category`: Positive, Negative, Boundary, E2E, Business, Edge;
  - `priority`: P1–P4;
  - `severity`: Critical, High, Medium, Low, from the domain's risk hotspots and the requirement, never guessed;
  - `channel`: Web, Mobile Web, Android, iOS, API, Desktop.
- **Report fields:** `feature` is exactly one word. `test_data` is `{}` when the case needs none.
- **Steps:**
  - `screen` is where the action happens; `leads_to` is where it navigates.
  - The first step is on an entry screen from the context pack, unless `start_via: "deep-link"` with a `start_via_reason`.
  - Every change of screen must be a DSM navigation.
- **Business and E2E cases** need a `business_scenario`, and a precise citation for the rule (a line, a heading or a requirement).
- **Wording:** expected results state what's shown or stored ("The Coupon field shows SAVE10"). The validator rejects generic wording ("valid data", "fill the form", "as expected", "works fine") and placeholder test data ("test", "xyz").

## Evidence

| Format | Means | Checked |
|---|---|---|
| `dsm:screen:<route>` | a screen | in the DSM |
| `dsm:element:<route>:<label>` | an element, field, form or button on it | exact name, ignoring case, punctuation and a kind word |
| `dsm:relation:<from>-><to>` | a navigation | in the DSM |
| `dsm:journey:<n>` | candidate journey n | in the context pack |
| `code:<repo>:<path>[:<line>]` | a file, or a line in it | in the scanned code; a line must exist at the scanned commit |
| `aut:<Skill>[#<heading>]` | an AUT skill, or a heading in it | the skill and the heading exist |
| `domain:<SubSkill>[#<heading>]` | a domain sub-skill section | exists; the `Domain_Test_Design_Skill-` prefix is optional |
| `req:<id>` | a fetched requirement | exact ID in `requirements/<requirements_scope>/requirements.json` |

## The feature file

`qam testgen render` writes one `<Component>.feature` per component:
- **Background:** the shared opening steps.
- **Scenario Outline:** cases that differ only in their test data values, with one `Examples` table per case, tagged `@TC-<id>`.
- **Scenario:** every other case.

The automation (feature 8) and the gate find each case by its `@TC-<id>` tag.
