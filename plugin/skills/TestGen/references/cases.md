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

`coverage_exclusions` leaves out a coverage gap on purpose, with a reason. Each gap line the validator prints ends with `(to exclude: item "<key>")`: copy that key. The keys are:

| Key | Excludes |
|---|---|
| `category:<C>` | no case of category C (Positive, Negative, Boundary, E2E, Business, Edge) |
| `type:<T>` | no case of a required type |
| `screen:<id>` | a screen no step visits, e.g. `screen:/cart/admin` |
| `form:<screen>:<form>:positive` or `:negative` | a form with no positive or no negative test; a dialog's form is named by its title (`form:/todo:Add todo:negative`) |
| `journey:<n>` | journey n has no E2E or Business case |

An exclusion whose key no check produces (a form that doesn't exist, a misspelt screen) is a finding, so a typo can't hide a gap.

`generated_at` is the current time in **UTC** (`date -u +%Y-%m-%dT%H:%M:%SZ`), not the local time from the run's folder name. The validator reports one that's in the future.

`requirements_scope` is the folder name under `requirements/` that `qam requirements fetch` or `import` printed. Leave it out when there are no saved requirements.

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
- **`session`:** `signed-out` or `signed-in`, the state the case starts in. Required when the context pack shows `access` on screens (see [signin-forms.md](signin-forms.md)).
- **Report fields:** `feature` is exactly one word. `test_data` is `{}` when the case needs none.
- **No credentials in the text.** A password, token or key value goes in `test_data` only. Titles, objectives, expected results and steps name it ("the registered user's password"), never quote it: they are published to the test case store as written. The validator reports a credential-like value there as a finding.
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
| `dsm:api:<METHOD> <path>` | an API route (API cases, [api-cases.md](api-cases.md)) | in the code model's `kind: api` routes, verb and path |
| `code:<repo>:<path>[:<line>[-<line>]]` | a file, a line in it, or a range of lines (`:18-25`) | in the scanned code; a line, or both ends of a range, must exist at the scanned commit |
| `aut:<Skill>[#<heading>]` | an AUT skill, or a heading in it | the skill and the heading exist |
| `domain:<SubSkill>[#<heading>]` | a domain sub-skill section | exists; the `Domain_Test_Design_Skill-` prefix is optional |
| `req:<id>` | a fetched requirement | exact ID in `requirements/<requirements_scope>/requirements.json` |

## The feature file

`qam testgen render` writes one `<Component>.feature` per component:
- **Background:** the shared opening steps.
- **Scenario Outline:** cases that differ only in their test data values, with one `Examples` table per case, tagged `@TC-<id>`.
- **Scenario:** every other case.

The automation (feature 8) and the gate find each case by its `@TC-<id>` tag.

## Names to copy exactly

Copy every name from `qam testgen context` as printed. A paraphrase is a validator finding and a retry.

- **Elements.** The context lists each as `kind: label`, for example `field: Registry URL` or `link: Products`. A step's `element` is the label (`Registry URL`) and never the `kind: label` text or a reworded one.
- **Screens** are the `route` values (`/cart`), forms are `forms[].name`, and a journey is cited by its `n`.
- **AUT headings.** Cite `aut:<Skill>#<heading>` with a heading that is in that skill's file. The generated AUT skills use headings such as `## Business understanding` and `## Screen details`; open the skill and copy the heading. Don't invent a `#Business rules`.
- **Routes marked `kind: api`** are server endpoints, not screens (Q48). They have no DSM screen to cite, so write no UI case for them; an API case cites them as `dsm:api:<METHOD> <path>` ([api-cases.md](api-cases.md)).
- **API request bodies.** A step whose action calls an endpoint (`POST /workflows`) types the request model's fields: open the model (a Pydantic `BaseModel` in `schemas.py`), use its field names exactly in `test_data`, include the required ones, add none the model does not have (`extra="forbid"` rejects them), and cite `code:<repo>:<path>:<line of the class>`. A `test_data` key found in no cited file, or an API step with no `code:` evidence, is a validator finding.

## One component at a time

A whole module in one `testcases.json` runs out of output and context. Per component:

1. `qam testgen context --component <Name>`, then write only that component's cases.
2. Add them to `testcases.json`, run `qam testgen validate <run>`, and fix the findings before the next component.
3. Keep the earlier components' cases as they are; the final validate covers the whole run.

## Long values and the test account

- **Long values.** There is no `{len:N}` placeholder (D15): a case holds the full literal string. To cover a boundary such as 55 or 201 characters, generate the string with a one-line script and paste its output into `test_data`, for example `python3 -c "print('a'*55)"`. The validator counts the literal, so check the length it printed.
- **The test account.** Its data is shared by every gate run (Q57). Runs add rows (a case that creates a todo leaves it, and a retry creates another), and QAMaster has no cleanup step (D20). Before a gate run that depends on the list's content, reset the account to its seed data: re-seed the app's database, or delete the rows the runs added. A list that answers differently with more rows can fail a case for no code reason.
