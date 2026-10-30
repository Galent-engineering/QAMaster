# Azure DevOps recipes

Each recipe gives the az CLI command first, then the `qam ado call` fallback. API version 7.1.

`<org>` and `<project>` come from `QAMASTER_ADO_ORG` and `QAMASTER_ADO_PROJECT`. Set the CLI defaults once:

```bash
az devops configure --defaults organization=https://dev.azure.com/<org> project=<project>
```

**How far each recipe is verified:**
- **REST route:** QAMaster's adapter makes this exact call, and `tests/ado.test.mts` covers it against Microsoft's documented responses and CheckMaster's recorded ones.
- **az command:** its options were checked against `--help` of azure-devops 1.0.10. A recipe marked *not yet run live* hasn't been run against a real organization. The first session that runs it confirms or corrects the line, with the date.

## Read

| Task | az CLI | Fallback | Scopes |
|---|---|---|---|
| Who am I, is the CLI ready | `az account show` · `az extension show --name azure-devops` | — | — |
| Query work items | `az boards query --wiql "SELECT [System.Id] FROM workitems WHERE [System.TeamProject] = '<project>' AND [System.Title] CONTAINS 'coupon'" -o json` | `qam ado call POST wit/wiql --body q.json --param '$top=50'`, with `{"query": "…"}`. A WIQL POST only reads, so it needs no `--apply` | Work Items (Read) |
| Show a work item with its links | `az boards work-item show --id 26 --expand relations -o json` | `qam ado call GET wit/workitems/26 --param '$expand=relations'` | Work Items (Read) |
| A sprint's requirements | `az boards query --wiql "… [System.WorkItemType] IN GROUP 'Microsoft.RequirementCategory' AND [System.IterationPath] UNDER '<project>\Sprint 24'"` | WIQL as above | Work Items (Read) |
| The current sprint | WIQL `[System.IterationPath] = @CurrentIteration('[<project>]\<project> Team')` | WIQL as above | Work Items (Read) |
| Test plans | `az devops invoke --area testplan --resource plans --route-parameters project=<project> --api-version 7.1 -o json` (*run live 2026-10-30*) | `qam ado call GET testplan/plans --all-pages` | Test Management (Read) |
| A plan's suites | `az devops invoke --area testplan --resource suites --route-parameters project=<project> planId=1 --api-version 7.1` (*run live 2026-10-30*) | `qam ado call GET testplan/Plans/1/suites --all-pages` | Test Management (Read) |
| The test cases in a suite | the invoke command for the suite, but `invoke` returns one page only | `qam ado call GET testplan/Plans/1/Suites/2/TestCase --all-pages` | Test Management (Read) |
| The suites that hold a test case | — | `qam ado call GET testplan/suites --org-level --param testCaseId=26` | Test Management (Read) |

Live notes (2026-10-30, a live Agile org): `az devops invoke` printed the `value` list with `count` and `continuation_token: null`, the same shape as the REST route. `az boards query` prints nothing at all, not `[]`, when no work item matches. `qam ado call POST wit/workitemsbatch` is refused without `--apply` (only `wit/wiql` is let through as a read): read several items with `GET wit/workitems --param ids=1,2,3`.

## Permissions and project structure (read-only, run live 2026-10-30)

Paths for `qam ado call` are relative to `_apis/`: write `permissions/…`, never `_apis/permissions/…` (that is a 404 page). Routes that belong to the organization, not the project, need `--org-level`. A dash in the "az CLI" column means only REST has the route; the REST calls were run live, the az options were checked against `--help`. `qam doctor --check-write` makes the permission query below for you.

| Task | az CLI | Fallback | Scopes |
|---|---|---|---|
| Does my user hold these rights on an area? | — | `qam ado call GET permissions/83e28ad4-2d72-4ceb-97b0-c7726d5502c3/224 --org-level --param tokens=vstfs:///Classification/Node/<area id>`. Answer: `{"count":1,"value":[true]}`, one entry per comma-separated token. 224 = 64 manage test plans + 128 manage test suites + 32 edit work items; ask the bits one by one only after a false, to name the missing one | Security (a narrow token may get 401/403: then it is unknown, not "no") |
| Security namespaces and their bits | `az devops security permission namespace list` | `qam ado call GET securitynamespaces --org-level`, or one: `securitynamespaces/83e28ad4-2d72-4ceb-97b0-c7726d5502c3` (CSS, the area namespace: 16 read work items, 32 edit work items, 64 manage test plans, 128 manage test suites) | Security (Read) |
| An area's id, and the area tree | `az boards area project list --depth 5` (options checked against `--help`, *not yet run live*) | `qam ado call GET wit/classificationnodes/areas --param '$depth=10'`. Each node has `identifier` (the GUID for tokens) and `children`. A child area's token joins its ancestors' tokens with `:` (`vstfs:///Classification/Node/<root>:vstfs:///Classification/Node/<child>`); a child's own id alone silently answers like the root | Work Items (Read) |
| The sprint tree | `az boards iteration project list --depth 5` | `qam ado call GET wit/classificationnodes/iterations --param '$depth=5'` | Work Items (Read) |
| Does the project's process have Test Case? | — | `qam ado call GET 'wit/workitemtypes/Test%20Case'` (404 `VS402323`: no such type, as in the Basic process, or not visible) | Work Items (Read) |
| The process's requirement, task and bug types | — | `qam ado call GET work/processconfiguration`: `requirementBacklog.workItemTypes`, `taskBacklog`, `bugWorkItems` | Work Items (Read) |
| A plan's area path | — | `qam ado call GET testplan/plans`: each plan has `areaPath`, the area its permissions are checked on | Test Management (Read) |

Live notes (2026-10-30): the permission query answered `true` for a made-up token too, so a `true` shows the call works and that Azure DevOps says the user holds the rights, never that the token's Test Management and Work Items (Read & Write) scopes are right: only the first write proves those. The licence (Basic + Test Plans) can't be read without organization-admin rights and isn't checked. `az boards query` prints nothing at all, not `[]`, when no work item matches.

## Write: show the change first, and act only after the person's yes

| Task | az CLI | Fallback | Scopes |
|---|---|---|---|
| Create a test plan | `az devops invoke --area testplan --resource plans --route-parameters project=<project> --http-method POST --in-file plan.json --api-version 7.1` (*not yet run live*) | `qam ado call POST testplan/plans --body plan.json --apply`, with `{"name": "Shop Web"}`. The response's `rootSuite.id` is where suites go | Test Management (Read & Write) |
| Create a static suite | the invoke command for suites, with `--http-method POST --in-file suite.json` (*not yet run live*) | `qam ado call POST testplan/Plans/1/suites --body suite.json --apply`, with `{"suiteType": "staticTestSuite", "name": "Checkout", "parentSuite": {"id": <root suite>}}` | Test Management (Read & Write) |
| Add test cases to a suite | — | `qam ado call POST testplan/Plans/1/Suites/5/TestCase --body add.json --apply`, with `[{"workItem": {"id": 26}}]` | Test Management (Read & Write) |
| Create a test case | `az boards work-item create --type "Test Case" --title "…"` (no steps or automation fields) | `qam ado call POST 'wit/workitems/$Test Case' --patch --body ops.json --apply`, with JSON Patch `add` ops for `/fields/…` | Work Items (Read & Write) |
| Update without overwriting someone else's change | not possible: `az boards work-item update` has no revision check | `qam ado call PATCH wit/workitems/26 --patch --body ops.json --apply`, with `[{"op": "test", "path": "/rev", "value": 3}, …]` | Work Items (Read & Write) |
| Retire a test case | — | the guarded PATCH setting `/fields/System.State` to `Closed`, then `qam ado call DELETE testplan/Plans/1/Suites/5/TestCase --param testIds=26 --apply` for each suite | both Read & Write |
| Move a requirement to the Recycle Bin | `az boards work-item delete --id 3` (no `--destroy`) | `qam ado call DELETE wit/workitems/3 --apply` | Work Items (Read & Write) |

## Saved by sessions

New calls go in the QA project's `.qamaster/ado-recipes.md` first, as one table row like those above, plus the date it worked. They move here in the next release.
