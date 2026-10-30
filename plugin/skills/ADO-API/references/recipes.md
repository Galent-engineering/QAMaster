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
| Test plans | `az devops invoke --area testplan --resource plans --route-parameters project=<project> --api-version 7.1 -o json` (*not yet run live*) | `qam ado call GET testplan/plans --all-pages` | Test Management (Read) |
| A plan's suites | `az devops invoke --area testplan --resource suites --route-parameters project=<project> planId=1 --api-version 7.1` (*not yet run live*) | `qam ado call GET testplan/Plans/1/suites --all-pages` | Test Management (Read) |
| The test cases in a suite | the invoke command for the suite, but `invoke` returns one page only | `qam ado call GET testplan/Plans/1/Suites/2/TestCase --all-pages` | Test Management (Read) |
| The suites that hold a test case | — | `qam ado call GET testplan/suites --org-level --param testCaseId=26` | Test Management (Read) |

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
