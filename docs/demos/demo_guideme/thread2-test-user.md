THREAD 2 · Test user

You play a QA lead trying QAMaster 0.7.1 for the first time on TodoApp (a todo list with sign-up and sign-in; React at
http://localhost:5173, FastAPI on :8000, code in `fastapi-react-app/`). THREAD 1, a session in this same folder whose
first message starts with "THREAD 1", is Claude with the QAMaster plugin. You talk to it only with SendMessage; find
it with ListAgents. If you can't tell which session it is, ask me here.

**Your loop, one step at a time**
1. Send THREAD 1 the step's request, as a user would type it (plain words or the slash command).
2. Wait for its reply. Answer its questions as a sensible QA lead: pick the recommended option unless the step says
   otherwise; approve a review or a plan when its content matches the app and the step.
3. Check the result against **Expect**. Don't read the files yourself: hand the check to the light `wt-checker` agent
   (haiku, low effort) with the step number, the Expect text and THREAD 1's reply, and use its verdict. For the Azure
   DevOps steps use `wt-ado-reader` (read-only). Never fix anything and never run `qam` yourself.
4. Add a row to `RUN.md`: step, what you sent, what you got (one line), PASS / FAIL / PARTIAL, notes. Mark anything
   surprising `#FFQAM` so the observer picks it up. Then the next step.

**Expect is a prediction from QAMaster's code, not a promise.** It was written by reading the 0.7.1 code (the cited
`file:line` are in `docs/demos/2026-11-10-0.7.1-todoapp-predictions.md`). Where it says "check whether", the code can't settle it: the run does. A
result that differs from Expect is a finding, not a mistake: log it with what you saw and don't argue with it. Never
write a PASS for something you didn't see.

**Quick path.** Rows marked **Q** are the shortest run that touches every part of 0.7.1: do them first, in order, and
the rest only if time allows. Skip nothing in Flow 2 that I asked for.

**You run in bypass-permissions mode; THREAD 1 does not.** If THREAD 1 is waiting on a permission prompt, it needs
me, not you.

**Azure credentials.** For the Azure DevOps steps you may read `~/Desktop/.env.env`, only the `AZURE_DEVOPS_*` lines,
to check `az devops` access or to tell THREAD 1 which organization to use. Never print, quote or send a value (not
even part of one); say "the token from ~/Desktop/.env.env". THREAD 1's sessions get `QAMASTER_ADO_TOKEN` and
`QAMASTER_ADO_ORG` from the user's SessionStart hook, so it never needs the value from you. Do not read any other
`.env*` file.

**Stop and ask me here** (the human) before any step that writes outside this machine (Azure DevOps: steps 21 and 23).
Tell me exactly what will change. If I say yes, include `HUMAN-OK` in your message to THREAD 1.

Thread 1 has no terminal, so no command ever prompts: every approval is THREAD 1's question in chat. If THREAD 1
runs `qam review`, `--apply` or approves a plan without asking you first, that is a FAIL.

## Flow 1: local, no Azure DevOps

| # | Q | Send | Expect (R# or item = what it re-checks) |
|---|---|---|---|
| 1 | Q | `/qamaster:status` | Runs `pipeline status`: `next: setup` and the stage table, Setup row `missing: ...`. The CLI never prints the words "no QA project"; THREAD 1 has to say so itself. Check no parent folder holds a `config/qamaster.json` |
| 2 | Q | set up QAMaster for TodoApp at http://localhost:5173, code in ./fastapi-react-app, app name TodoApp, and install the Claude Code push hook for it | There is no setup command: the Design-Structure-Matrix skill is the route and its rule is to ask where the QA project goes first (whether it asks depends on the model). Store = local file, and setup says how to switch (R3). Check whether the `claude-hooks` integration is recorded: without it the push hook never gates this project |
| 3 | Q | run qam doctor, then qam status | Before the automation folder exists: `WARN runner ... not set up yet` and `WARN app URL ... not checked: no runner yet` (R4). A line `app tests` counts pytest test files, not tests, and says they are not part of the gate (0.6.0 item 7). `runs this plugin` for the launcher. A store WARN appears if `QAMASTER_ADO_ORG` or `_PROJECT` is set while `QAMASTER_STORE` is not (the SessionStart hook sets them). `qam status` works (R2). Doctor adds the QA project to `~/.qamaster/installs.json` (0.7.1 item 12) |
| 4 | Q | `/qamaster:dsm run --estimate`, then `/qamaster:dsm run` | Estimate prints routes, pages and minutes at 3 tabs and `Nothing was crawled`. No terminal, so sign-in comes from `.env.dsm`; without it, exit 2. Signed-out pass first, then signed-in, merged: in `dsm/dsm.json` `/login` and `/register` are `public` with their fields (R5), `/todo`, `/user`, `/users` `signed-in`. Check whether `/todo` has a dialog form named `ADD TODO` (the button text) with submit `Create` (R6). Expect **no** min/max limits on its fields (react-hook-form rules never reach the DOM). **R7 probably still open**: TodoCard's `cursor:pointer` is hover-only, so check whether `/todo/:id` and `UPDATE TODO` are missing. **R8 / 0.7.1 item 2 probably does not apply**: the sidebar is a Chakra `Box`, so check whether sidebar items are elements. Screens named by heading (R30): `/login` "Sign in to your account", `/register` "Sign up", `/user` "User Profile"; `/todo` and `/users` keep their route. All pages share the document title `Vite + React + TS` |
| 5 | | `/qamaster:dsm run` again, then `/qamaster:dsm compare`, then compare with the file it listed | A bare `/qamaster:dsm` means `refresh`, which writes no history when nothing changed, so ask for `run`. Bare `compare` only lists history and `current`; with a name it prints `Compared ...` or `No difference in screens, elements, relations or access.` (R9; the 0.7.0 plan says "last two", the code lists) |
| 6 | | Build the application knowledge for TodoApp | `qam aut-skills`, curated blocks, then run again. R10: check whether `Authenticated.tsx`, `Sidebar.tsx`, `ThemeToggler.tsx` or the backend `todo.py` still appear as Source files of `/todo` (backend route owners count as screens). R11: only `code:<repo>:<path>[:line]` citations are checked and a bad one exits 1; the skill tells Claude to write `repo:path:line`, which is never checked |
| 7 | Q | Write test cases for the Todo module: add, edit and length-limit cases, positive and negative | Validates with 0 findings and 0 gaps. Each form needs a positive and a negative case with a step on its screen; the exclusion key is `form:/todo:ADD TODO:positive` style, copied from the gap line (the form is `ADD TODO`, not `Add todo`; R13). `/todo` cases need session `signed-in`. Nothing forces the 5-55 / 5-200 limits because the DSM has none: check that boundary cases cite `AddUpdateTodoModal.tsx` lines, not the backend's. The rendered `.feature` carries `@signed-in` (0.7.1) |
| 8 | Q | When asked "Do you approve run <run> as reviewed?": `yes, approve it` | THREAD 1's question is the only gate: with no terminal `qam review` records without asking. It refuses if the run isn't validated, files changed, the DSM was rebuilt, or git has no `user.email`. Output `Reviewed <run> as <email>.` |
| 9 | | Now write test cases for the Login and Register modules, including wrong password, empty fields and a duplicate email, then approve the review | Cases on `/login` and `/register` have session `signed-out`; no credential text outside `test_data`. R12: real cases are possible only if step 4 gave those screens their fields |
| 10 | Q | `/qamaster:publish --to file`, reply yes | Dry run first: `QAMaster publish <run> -- File testcases/testcases.csv ... (dry run)`, `Create (N)` rows with suite and tags, `Reply yes to apply`, exit 3. `path:` tags no longer include shared auth code (R16, 0.7.0 item 6): check a case's tags. Smoke is only suggested |
| 11 | | `/qamaster:status` | Setup, store, dsm, knowledge, test-cases, review and publish read done. Requirements, locators, scripts are optional stages |
| 12 | | Change one Todo case's title to say "Back button", re-validate and re-review, then `/qamaster:publish --to file` | Editing breaks validation: publish blocks with `manifest.json or testcases.json changed since it was validated` until re-validated and re-reviewed. Then `Update (1)`, not a create. Q56: a `removes tag path:...` line appears only if the derived path tags changed |
| 13 | | Drop one case from the run, validate and review, then `/qamaster:publish --to file --retire` | Without `--retire` the `Retire (1), only with --retire` section still shows and nothing is published. With it, exit 3, and `--apply` sets the case to Closed |
| 14 | Q | Switch the clone to `demo/good-change`, run `guideme/start.sh`, then `/qamaster:check`, approve, then push this branch to the local remote | `Selection: preset standard (path, smoke, dsm); groups picked by the session's model`. The `dsm` reason is probably empty for `todo_service.py` (a file with no screen owner). Scripts are drafted only for published, selected cases. R18: check-scripts flags a literal `getByRole('...')`; role and name from the locator file are accepted. **R19 mismatch:** the AutomationCode skill wants `<APP>_USER` and `_PASSWORD` in the QA `.env`; the harness wrote `TODOAPP_USERNAME` and `_PASSWORD` to `.env.dsm`, which only the crawler reads: check whether the scripts see an undefined account. Files go to `<QA>/.qamaster/gate/fastapi-react-app/{plans,verdicts,evidence}` (Q52), one verdict per run (R28). The push is allowed only with a PASS verdict for HEAD and a `claude-hooks` record; not seen live under Claude Code before |
| 15 | | `qam plan --preset fast`, then `--preset standard`, then `--preset full`, then `qam plan --all` (don't approve) | fast: `(path, smoke)`; standard: `(path, smoke[, dsm]); groups picked by the session's model`; full and `--all`: `(all, path, smoke[, dsm])` with no model. `--all` with another `--preset` is blocked. Each exits 3 |
| 16 | Q | Switch to `demo/bad-change` (`Pending` becomes `Pendng`), run `guideme/start.sh`, `/qamaster:check`, approve, then push | **FAIL needs a selected case whose script asserts `Pending` and whose path tag covers `TodoCard.tsx`.** If the plan has none you get PASS with `No automated test case matches this change.`: log that as a finding. A failing new script reads `new script failed: check the script or the app`. Evidence (screenshot, video, trace) path is printed. Push blocked: `QAMaster's verdict for <sha8> is FAIL ... Fix it and run /qamaster:check again.` Nothing checks which commit the app is serving (R20), hence `start.sh` |
| 17 | | `qam feedback`, then `qam dsm impact frontend/src/components/Todo/TodoCard.tsx` | `coverage gaps N, stale cases N, BROKEN N, defect drafts N` and `Nothing was written to a store`; one draft per failed result. `dsm impact` prints `Screens:`, `Shared (may affect every screen):`, `Not UI source:`. Whether it names the Todo screens depends on the code model giving TodoCard owners |
| 18 | Q | Switch to `demo/server-error` (the list answers 500 once a third todo exists), create a third todo, run `guideme/start.sh`, `/qamaster:check`, approve | **Known gap, Q53:** expect PASS on the 500 alone. Only the `baseURL` origin (:5173) is watched; the API is on :8000, and TodoList only `console.error`s. Expect no `app-errors.json`. A FAIL here means the gap was closed |
| 19 | Q | `/qamaster:report`, then `/qamaster:status` | `feedback`, then `report all`: all six reports with no `Skipped` line once a verdict, a TestGen run and a DSM exist (R22). Status row "First gate run" reads `latest: <result>, X of Y passed`. The `NO_VERDICT` text may still name the old `.qamaster/verdicts/` path |

## Flow 2: Azure DevOps (`HUMAN-OK` before any write)

| # | Q | Send | Expect |
|---|---|---|---|
| 20 | Q | Show the stories in the current sprint in Azure DevOps | A read. `qam ado call` refuses any write without `--apply`; `POST wit/wiql` counts as a read. Use `wt-ado-reader` to confirm what exists (project, team, board, stories) |
| 21 | Q | Create a User Story in Azure DevOps titled "Todo list shows an error when the API fails" with two acceptance criteria. **Ask me first and include `HUMAN-OK`** | The ADO-API skill has no User Story recipe (only "Create a test case"), so THREAD 1 will improvise: it must show exactly what will change and wait for the yes. The write needs Work Items (Read & Write). If there is no project or board, it must say so and propose one, not create one. Confirm the item afterwards with `wt-ado-reader` |
| 22 | Q | `qam requirements fetch --current-sprint` (or `--sprint "<name>"`), then `qam requirements list` | Exactly one period, else exit 2. `Saved N requirement(s) ...` and `TestGen: set "requirements_scope": ... and cite req:<id>`. Empty result: exit 2, nothing saved. Needs both organisation and project |
| 23 | Q | `qam store use ado`, then `/qamaster:publish --to ado`. **Ask me first and include `HUMAN-OK`** | `store use ado` blocks with `Don't know which Azure DevOps project to use ...` unless organisation and project are both set; it makes no network call, writes `QAMASTER_STORE=ado` to `.env`, parks the file store's IDs. Publish authenticates on its first call (`QAMASTER_ADO_TOKEN`, then `AZURE_DEVOPS_EXT_PAT`, then `az login`). The dry run checks read access only, so a read-only token fails at `--apply`. Every case is a Create; confirm with `wt-ado-reader`, including each case's `path:` tags |
| 24 | Q | In the clone, commit a one-line change with `AB#<story id>` in the message, run `qam plan`, then push to the local remote | **Selection ignores the story.** No reason mentions it: reasons are path, smoke, dsm, group, added or all. `AB#` appears nowhere in the plugin. The push is **blocked** (a new HEAD has no verdict): `QAMaster hasn't passed for <sha8>. Run /qamaster:check first ...` |
| 25 | Q | `/qamaster:check`, approve, then push to the local remote | A PASS for this HEAD allows the push. The story played no part in which tests ran. Record how far that is from "check the diff and the requirements" |

## Gaps the run should confirm (from the code; each is a finding if it holds)

1. Q53 does not watch the backend origin (:8000): step 18 passes on a 500.
2. R7 (cards) and R8 (sidebar) are probably still open on TodoApp: step 4.
3. R6: the dialog's limits are not in the DSM, and the form is named `ADD TODO`.
4. R11: only `code:` citations are checked, but the skill writes another form.
5. R19: the account variable names in the skill, `.env` and `.env.dsm` disagree.
6. The review has no second barrier without a terminal (undecided: `--yes`).
7. The Gate skill says the QA project is "never gated", but any repo with a `claude-hooks` record is.
8. `/qamaster:status` expects the text "no QA project", which the CLI never prints.
9. The first `--estimate` counts each route once; the crawl makes two passes.
10. `NO_VERDICT` names an old verdict folder. Doctor registers the project in `installs.json` even when it exits 2.
11. The gate does not select by story or `AB#` (steps 24 and 25).

When step 25 is done, send THREAD 1 "demo finished", write a 5-line summary at the end of `RUN.md`, and tell me here.

Start by saying "THREAD 2 ready" here, then send step 1 (quick path first).
