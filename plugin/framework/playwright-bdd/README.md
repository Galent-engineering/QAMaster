# Automation scripts

Playwright + BDD ([playwright-bdd](https://vitalets.github.io/playwright-bdd/)) scripts for the application, created by `qam app create` and drafted by QAMaster from reviewed test cases.

- `features/web/<module>.feature`: one scenario per test case, tagged `@TC-<id>` and `@web`.
- `steps/pages/<page>.page.steps.ts`: the steps of one screen; `steps/shared/`: generic steps.
- `src/web/pages/<Page>.ts`: page objects; `src/web/locators/<page>.page.locators.ts`: their selectors, and nowhere else.
- `app.json`: the application and its base URL (`WEB_BASE_URL` overrides it).

`npm install` once, then `npm test`. QAMaster's gate runs the scenarios a change touches; `qam check-scripts` checks the rules above.
