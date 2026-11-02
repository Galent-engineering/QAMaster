---
name: AutomationCode
description: Writes playwright-bdd automation scripts (feature files, step definitions, page objects and locator files) for reviewed test cases, in the QA project's automation folder, following its layers and reuse rules. Use when qam automate lists cases to draft or update, when asked to automate test cases, write or fix BDD scenarios or step definitions, or when /qamaster:check reaches its automate step.
---

# Automation code (playwright-bdd, web)

Scripts are written only from **reviewed test cases** (a TestGen run under `testgen/output/<run>/`), only for the cases `qam automate <plan-id>` lists as **draft** or **update**, and only into the QA project's automation folder (`<App>/`, made by `qam app create`). Never into the app's repository, and never into the plugin's template.

Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" <command>`.

## Inputs (hallucination tolerance 0)

- **The test case**: its steps, expected results, test data, `screen` and `leads_to`, from the run's `testcases.json`. Automate exactly these; add no checks of your own.
- **Elements**: from the DSM and the application's front-end code (`config/dsm-config.json` → `repositories`). Prefer test ids, then role and name, then label or text, then stable ids, then CSS. Never guess a selector. If the source can't give a reliable one, ask, or mark it `// custom: <why>`.
- **The folder's step catalogue**: `steps/shared/` and `steps/pages/`. Reuse a step word for word before adding one.

## Layers

| What | Where |
|---|---|
| One feature per module, tagged `@web` | `features/web/<module>.feature` |
| One scenario per test case, tagged `@TC-<id>`, named after it | in that feature |
| Steps of one screen | `steps/pages/<page>.page.steps.ts` (generic ones in `steps/shared/`) |
| A page object per screen, business-level methods, `extends BasePage` | `src/web/pages/<Page>.ts` |
| Its selectors, and nowhere else | `src/web/locators/<page>.page.locators.ts`, imported as `'../locators/<page>.page.locators'` |

Steps import `Given`, `When`, `Then` and `expect` from `src/fixtures`. Test data comes from the case's `test_data`. A password or other credential is read from an environment variable (`process.env.<NAME>`), never written into a script.

## Rules the check enforces (`qam check-scripts`)

- No inline selectors in page objects or steps.
- Every page object imports its locator file, and every locator file is used.
- Steps sit in their place.
- Every feature has a platform tag, and every `@TC-<id>` exists in a TestGen run.
- No step pattern is defined twice. Patterns that differ only in a value become one step with `{string}` or `{int}`.
- Scenarios that differ only in values become one `Scenario Outline`, with one tagged `Examples` block per test case to keep `@TC` traceability.
- `bddgen` finds a definition for every step, and `playwright test --list` resolves.

## Steps

1. `qam automate <plan-id>` lists the cases. Read each draft or update case in its run.
2. Write or change the scripts for those cases only. An **update** changes the scenario to match the changed case. A case that can't be automated reliably yet (it needs an account that isn't set up, a CAPTCHA, a real payment) stays manual: say which and why, and draft the rest.
3. `qam check-scripts` until it passes. Fix the scripts, never the check.
4. `qam automate <plan-id> --done` records them and binds the plan. The scripts stay uncommitted: tell the person to review and commit them, and that their automation links reach the test case store only after they're pushed and published again (Q39).
