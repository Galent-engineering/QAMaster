# Automation scripts

Playwright + BDD ([playwright-bdd](https://vitalets.github.io/playwright-bdd/)) scripts for the application, created by `qam app create` and drafted by QAMaster from reviewed test cases.

- `features/web/<module>.feature`: one scenario per test case, tagged `@TC-<id>` and `@web`.
- `steps/pages/<page>.page.steps.ts`: the steps of one screen; `steps/shared/`: generic steps (open a path, click a named button or link, fill a named field, see a text, the URL contains).
- `src/web/pages/<Page>.ts`: page objects; `src/web/locators/<page>.page.locators.ts`: their selectors, and nowhere else.
- `app.json`: the application, its base URL (`WEB_BASE_URL` overrides it) and, for API scripts, `apiUrl` (`API_BASE_URL` overrides it).

## Channels

Each channel has a folder and its own Playwright project, made only when the folder has a feature. A test case runs in its channel's project and nowhere else.

| Channel | Features | Project | Tag |
|---|---|---|---|
| Web | `features/web/` | `chromium` (desktop Chrome) | `@web` |
| API | `features/api/` | `api` (no browser) | `@api` |
| Mobile Web | `features/mobile-web/` | `mobile-chrome` (Chromium as a Pixel 7: phone viewport and touch) | `@mobile-web` |

**API scripts:** `steps/api/<service>.api.steps.ts` call a service in `src/api/services/` (one per resource, extending `src/api/base/BaseApiClient.ts`), which is the only code that calls Playwright's request context. A scenario's last response is kept with `lastResponse` from `src/api/state.ts`. Set the API's base URL with `qam app create --api-url <URL>`.

**Mobile Web scripts** use the same steps, page objects and locators as Web. The page's elements come from the desktop crawl: on a phone a menu may hide a link a desktop page shows, so open the menu first in the scenario.

`npm install` once, then `npm test`. QAMaster's gate runs the scenarios a change touches; `qam check-scripts` checks the rules above.

**App errors:** a case fails, even when every step passed, if the app or its API (`apiUrl`, or `API_BASE_URL`) answered 5xx, a request to them got no answer (anything but `net::ERR_ABORTED`), or the page threw an error. `gate.allowErrors` in `config/qamaster.json` names what to ignore. `src/app-errors.ts` is QAMaster's file: `qam app create` replaces it when it differs from the template, so keep your own code in other files.

**Undo what a step creates:** a step that creates data on the test account registers its undo with the `cleanup` fixture (`cleanup.add('todo "Buy milk"', () => deleteTodo(id))`, `src/cleanup.ts`). The undos run when the case ends; one that fails fails the case with "left data on the test account: <label>" and `cleanup.json` attached.

**Signed in:** a scenario tagged `@signed-in` is signed in before its first step by `steps/shared/session.steps.ts` (`src/web/session.ts`), using the test account's two variables from the QA project's `.env` (QAMaster's runner passes them). Write no sign-in step for it. To run by hand with `npm test`, set `QAMASTER_LOGIN_USER_VAR` and `QAMASTER_LOGIN_PASSWORD_VAR` to the names of the two variables, and the variables themselves.
