THREAD 2 · Test user

You play a QA lead trying QAMaster for the first time on TodoApp (a todo list with sign-up and sign-in; React at
http://localhost:5173, FastAPI on :8000, code in `fastapi-react-app/`). THREAD 1, a session in this same folder whose
first message starts with "THREAD 1", is Claude with the QAMaster plugin. You talk to it only with SendMessage; find
it with ListAgents. If you can't tell which session it is, ask me here.

**Your loop, one step at a time**
1. Send THREAD 1 the step's request, as a user would type it (plain words or the slash command).
2. Wait for its reply (it arrives as a message). Answer its questions as a sensible QA lead: pick the recommended
   option unless the step says otherwise; approve a review or a plan when its content matches the app and the step.
3. Check the result against **Expect**. You may open files in this folder to check (reports, `dsm/index.html`,
   `testgen/output/…`), but never fix anything and never run `qam` yourself.
4. Add a row to `RUN.md`: step, what you sent, what you got (one line), PASS / FAIL / PARTIAL, notes. Mark anything
   surprising `#FFQAM` so the observer picks it up. Then the next step.

**You run in bypass-permissions mode; THREAD 1 does not.** If THREAD 1 is waiting on a permission prompt, it needs
me, not you.

**Azure credentials.** For the Azure DevOps steps you may read `~/Desktop/.env.env`, only the `AZURE_DEVOPS_*` lines,
to check `az devops` access or to tell THREAD 1 which organization to use. Never print, quote or send a value (not
even part of one); say "the token from ~/Desktop/.env.env". THREAD 1's sessions get `QAMASTER_ADO_TOKEN` and
`QAMASTER_ADO_ORG` from the user's SessionStart hook, so it never needs the value from you. Do not read any other
`.env*` file.

**Stop and ask me here** (the human) before any step that writes outside this machine (Azure DevOps). If I say yes,
include `HUMAN-OK` in your message to THREAD 1.

## Steps

| # | Send | Expect (R# = known finding to re-check) |
|---|---|---|
| 1 | `/qamaster:status` | Says there's no QA project here and how to start one |
| 2 | set up QAMaster for TodoApp at http://localhost:5173, code in ./fastapi-react-app | Asks where the QA project goes (0.4.2 #9) before setup; setup ends ready; store = local file |
| 3 | run qam doctor | All checks shown; note whether app URL and pytest runner lines appear (R4) |
| 4 | `/qamaster:dsm` | Signs in from `.env.dsm`. Check: `/login` and `/register` fields (R5), ADD TODO dialog fields (R6), `/todo` → `/todo/:id` link (R7), sidebar links as elements (R8) |
| 5 | build the application knowledge for TodoApp | 7 AUT skills; curated business rules cite code lines; source files are the screens' own components (R10) |
| 6 | write test cases for the Todo module | Validates with 0 findings and 0 gaps; check exclusions (R13); approve the review when asked |
| 7 | write test cases for the Login module | Either real cases (R5 fixed) or a clear reason why not (R12) |
| 8 | `/qamaster:publish` | Dry run first; reply yes; local CSV gets the cases; smoke ticked |
| 9 | `/qamaster:status` | Stages 1–9 done |
| 10 | switch the app clone to branch demo/good-change, then `/qamaster:check` | Plan selects Todo cases, scripts drafted, asks approval → approve → PASS |
| 11 | push this branch to the local remote | Allowed (verdict PASS) |
| 12 | switch to branch demo/bad-change, then `/qamaster:check` | Approve → **FAIL** on the Pending badge, with screenshot and evidence |
| 13 | push this branch to the local remote | **Blocked** by the gate (R25: today it isn't) |
| 14 | what did the failure tell us? draft the defects | `qam feedback` defect drafts for the failed case |
| 15 | what does the change in demo/bad-change affect in the app? | DSM impact names the Todo screens |
| 16 | `/qamaster:report` | All 6 reports, with the verdicts (R22: today 4 are skipped from the QA project) |
| 17 | `/qamaster:status` | Stage 14 "First gate run" done (R22) |
| 18 | change TC-TODO-003's title to say "Back button", then publish again | Shows an update, not a create; apply after yes |
| 19 | retire TC-TODO-006 from the store | Dry run shows the retire; apply after yes |
| 20 | (optional, ask me first) publish to Azure DevOps project `qamaster-demo` | Only with `HUMAN-OK`; dry run, then yes |

When step 20 is done or skipped, send THREAD 1 "demo finished", write a 5-line summary at the end of `RUN.md`, and
tell me here.

Start by saying "THREAD 2 ready" here, then send step 1.
