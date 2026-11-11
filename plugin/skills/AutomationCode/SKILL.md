---
name: AutomationCode
description: Writes playwright-bdd automation scripts (feature files, step definitions, page objects and locator files) for reviewed test cases, in the QA project's automation folder, following its layers and reuse rules. Use when qam automate lists cases to draft or update, when asked to automate test cases, write or fix BDD scenarios or step definitions, or when /qamaster:check reaches its automate step.
---

# Automation code (playwright-bdd: web, API, mobile web)

Scripts are written only from **reviewed test cases** (a TestGen run under `testgen/output/<run>/`), only for the cases `qam automate <plan-id>` lists as **draft** or **update**, and only into the QA project's automation folder (`<App>/`, made by `qam app create`). Never into the app's repository, and never into the plugin's template.

Run the CLI as `node "${CLAUDE_PLUGIN_ROOT}/src/cli/main.mts" <command>` from the QA project. When you hand the person a command to run in their own terminal, give one they can paste: every value (run name, plan id, path) filled in, never a `<placeholder>`, and the launcher by its absolute path, `node <absolute path of the QA project>/.qamaster/bin/qam.mjs <command>` (the launcher exists only in the QA project, written by `qam setup`). If `qam doctor` shows `WARN launcher`, hand over the plugin path instead and suggest running setup again from the plugin.

## Inputs (hallucination tolerance 0)

- **The test case**: its steps, expected results, test data, `screen` and `leads_to`, from the run's `testcases.json`. Automate exactly these; add no checks of your own.
- **Elements**: from the DSM and the application's front-end code (`config/dsm-config.json` → `repositories`). Prefer test ids, then role and name, then label or text, then stable ids, then CSS. Never guess a selector. If the source can't give a reliable one, ask, or mark it `// custom: <why>`. Copy the crawl's `test_id`, or its `aria_label`, or its role and name; never the DSM's CSS selector path, and never a positional locator (`:nth-of-type`, `:nth-child`) or a bare `form` (`qam check-scripts` flags them).
- **The folder's step catalogue**: `steps/shared/` and `steps/pages/`. Reuse a step word for word before adding one.

## Layers

| What | Where |
|---|---|
| One feature per module, tagged `@web` | `features/web/<module>.feature` |
| An API case's feature, tagged `@api` | `features/api/<module>.feature` |
| A Mobile Web case's feature, tagged `@mobile-web` | `features/mobile-web/<module>.feature` |
| API steps, calling a service | `steps/api/<service>.api.steps.ts` |
| One API service per resource, `extends BaseApiClient` | `src/api/services/<Resource>Service.ts` |
| One scenario per test case, tagged `@TC-<id>`, named after it | in that feature |
| Steps of one screen | `steps/pages/<page>.page.steps.ts` (generic ones in `steps/shared/`) |
| A page object per screen, business-level methods, `extends BasePage` | `src/web/pages/<Page>.ts` |
| API helpers for preconditions (create a record, reset state) | `src/web/api/<name>.ts` |
| Its selectors, and nowhere else | `src/web/locators/<page>.page.locators.ts`, imported as `'../locators/<page>.page.locators'` |

Steps import `Given`, `When`, `Then` and `expect` from `src/fixtures`. Test data comes from the case's `test_data`. A password or other credential is read from an environment variable (`process.env.<NAME>`), never written into a script.

**The test account** is a pair of variables in the QA project's `.env`, named after the app (`<APP>_USER`, `<APP>_PASSWORD`, for example `TODO_USER`); the scripts read them with `process.env`, and `.env` is never committed. **Preconditions** (a record the case needs, a clean state) are set up through the app's API from a helper in `src/web/api/`, called from a step or a `Background`, not by clicking through the UI.

**Undo what you create.** A step that creates data on the test account (a todo, an order, a user) registers its undo with the `cleanup` fixture right after the create, so the account is as it was after the run:

```ts
Given('I add a todo {string}', async ({ page, cleanup }, title: string) => {
  const id = await createTodo(page, title);
  cleanup.add(`todo "${title}"`, () => deleteTodo(id)); // delete through the app's API or UI; throw if it fails
});
```

The undos run last-in first-out when the case ends, whatever its result. An undo that fails fails the case with "left data on the test account: <label>" and `cleanup.json` attached, so make each one delete exactly what its step created (the record's id, not "all todos"). Registering one for every create is your job; `qam check-scripts` flags a step that creates data in a folder whose `src/fixtures.ts` has no `cleanup` fixture (an older folder: add it from the plugin's `framework/playwright-bdd/src/fixtures.ts`; `qam app create` adds `src/cleanup.ts`).

**A locator is used whole.** The locator file holds the role and the name (or the test id); the page object passes both from there, so a rename is one edit:

```ts
// src/web/locators/todo.page.locators.ts
export const L = { save: { role: 'button', name: 'Save' } } as const;
// src/web/pages/TodoPage.ts
await this.page.getByRole(L.save.role, { name: L.save.name }).click();
```

## Reuse the scenario text as it is

TestGen's `<Component>.feature` (in the run folder) already words its steps in the phrasings the template's generic steps (`steps/shared/common.steps.ts`) define:

| Step text | Generic step |
|---|---|
| `I open the path "/todo"` | goes to the path |
| `I click the "Save" button` / `I click the "Back" link` | clicks the named button or link |
| `I fill the "Title" field with "Buy milk"` | fills the named field |
| `I should see the text "Title"` | the text is visible |
| `the URL should contain "/login"` | the URL has that part |

A step that leads to a screen keeps two checks: `the URL should contain "<route>"` and, after it, the step's own expected text (`And the /cart screen opens with the Coupon field`). The second is in its own words, so it needs a step definition (check what the screen shows; don't just repeat the URL check).

**Signed in or out.** A scenario tagged `@signed-in` starts with the test account signed in, and one tagged `@signed-out` with no session. Keep the tag on the copied scenario and write no sign-in step for it: a framework hook (`steps/shared/session.steps.ts`) signs the test account in before a `@signed-in` web or mobile-web scenario, with the two variables of the QA project's `.env`. A `Given ... is signed in` in the scenario or in a `Background` signs in twice: leave it out, and `qam check-scripts` flags a Background or a `@signed-in` scenario that does it. A sign-in case itself (the form, a wrong password) is `@signed-out` and fills the form in its own steps.

Copy a case's scenario into `features/<channel>/<module>.feature` **with its step text unchanged**, and write a step definition only for a step no generic one covers (a step in its own words, such as a precondition or a business check). Don't reword a step to a near-synonym: that creates a second definition for the same thing. Where a value is a credential, the step text names it ("the registered user's password") and the definition you write for that step reads `process.env`.

## Channels

The case's `channel` (in its run's `testcases.json`) says where its script goes: **Web** to `features/web/`, **API** to `features/api/`, **Mobile Web** to `features/mobile-web/`. A case belongs to one channel; write it once, there. Each folder runs in its own Playwright project, made only when the folder has a feature (`chromium`, `api`, `mobile-chrome`), so a case runs in its channel's project and nowhere else. A folder that doesn't exist in an older automation folder is added by `qam app create` (it never overwrites a file).

### API cases

An API case has no screen, so there is no page object, locator or browser:
- A **service** per resource in `src/api/services/<Resource>Service.ts` extends `BaseApiClient` and has one method per route the cases call. Its method calls `this.get`, `this.post`, `this.put`, `this.patch` or `this.delete` with the route's path and body; the path and body field names come from the case and its cited `dsm:api:` and `code:` evidence.
- A **step** in `steps/api/<service>.api.steps.ts` creates the service from Playwright's `request` fixture, calls it and keeps the response with `lastResponse.set(request, response)`; a Then reads `lastResponse.get(request)` and asserts with `expectStatus`, `expectBody` or `expectHeader` of `ApiResponse`.
- A step **never calls `request.fetch`** (or `request.get`, `.post` and so on) itself, and a service never does either: only `BaseApiClient` makes the request. `qam check-scripts` flags it.
- The base URL is the API's (`apiUrl` in `app.json`, set with `qam app create --api-url`); paths in services are relative to it. A token or credential is read from `process.env`, set on the client with `setAuth`, and never written into a script.
- Expected results come from the case: the status code and body fields it states. Add no checks of your own.

```ts
// src/api/services/TodoService.ts
export class TodoService extends BaseApiClient {
  create(title: string) { return this.post<{ id: number; title: string }>('/api/todos', { data: { title } }); }
}
// steps/api/todos.api.steps.ts
When('I create a todo with the title {string}', async ({ request }, title: string) => {
  lastResponse.set(request, await new TodoService(request).create(title));
});
```

### Mobile Web cases

A Mobile Web case's scenario goes in `features/mobile-web/` tagged `@mobile-web`, and runs only in the `mobile-chrome` project: Chromium with a Pixel 7's viewport and touch. Steps, page objects and locators are the same ones the Web scripts use (reuse them, don't copy). The DSM's elements come from the **desktop** crawl, so what a phone's narrow layout hides behind a menu is still in the DSM but not on screen: open the menu first (a step such as `I click the "Menu" button`, from the app's code or the page), then click the link. Don't guess a phone-only control the DSM doesn't have; ask, or mark it `// custom: <why>`.

## Rules the check enforces (`qam check-scripts`)

- No inline selectors in page objects or steps.
- API layers: steps in `steps/api/` use a service from `src/api/services/`, a service extends `BaseApiClient` and is used by a step, and nothing but the base client calls `request.fetch` or its siblings.
- A feature in `features/api/` is tagged `@api`, and one in `features/mobile-web/` is tagged `@mobile-web`.
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
4. **Trial run (optional, offered by `/qamaster:check`).** `qam automate <plan-id> --try` runs the new scripts once against the running app, records nothing and exits 0 or 1. Each failure says its kind: assertion failed (the app showed something else; the case or the app is wrong), step couldn't act on the page (a locator or the page; fix the script), or script error (fix the script). Fix what failed, run `qam check-scripts` again, then `--try` again. A trial pass does not make a script proven: it stays new until an approved run passes it (Q39). It needs the app running and the test account set.
5. `qam automate <plan-id> --done` records them and binds the plan. The scripts stay uncommitted: tell the person to review and commit them, and that their automation links reach the test case store only after they're pushed and published again (Q39).
