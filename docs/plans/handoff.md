# Handoff: where the work stands (2026-11-11)

Read this first in a new session, then [0.8.0.md](0.8.0.md) (r2) and [Q58](../decisions.md). Older plans hold their own history.

## Where things are
- `main` (pushed): **0.5.0**. Nothing later is merged or tagged; merging waits for the user.
- Release branches, all pushed 2026-11-11, each built on the one before: `release/0.6.0` → `release/0.7.0` → `release/0.7.1` (**released** 0.7.1) → `release/0.7.2` (built: fixes from the TodoApp walkthrough, items 1–19) → **`release/0.8.0`** (built, not released: the gate you can trust, items 1–20, Q58). 892 tests, typecheck, lint and plugin validation clean on `release/0.8.0`.
- No QAMaster plugin is installed locally: the old copies and the 0.7.1 upload's local files were removed on 2026-11-11. If 0.7.1 is still listed under Customize → Plugins → My Uploads in Claude desktop, remove it there or it syncs back. To try 0.8.0: `scripts/package.sh` on the release commit, then load the zip from `dist/` ([install.md](../install.md)).
- The 0.7.1 demo folder was deleted (its findings are in the [walkthrough record](../demos/2026-11-10-0.7.1-todoapp.md)). The ADO project `fastapi-react-v0.7.1` (story 414, plan 415, 13 cases) is kept for the next walkthrough.

## The road (Q54, amended by Q58)
0.7.2 fixes → **0.8.0 the gate you can trust** → its walkthrough and a 0.8.x patch → 1.0.0 proof, no new feature → 1.1.0 native Android and iOS → 1.2.0 product v1.1. Detail: [backlog.md](backlog.md).

## Next
1. **The 0.8.0 walkthrough on TodoApp** with [demo_guideme](../demos/demo_guideme/README.md) (`setup.sh` makes a fresh demo folder). Update its checklist for 0.8.0 first. Check: an edit case from the crawl (hover cards), a 500 on the API failing a case, `AB#` selecting the story's cases, an empty plan refused, the permission prompts for `qam review` / `qam approve`, cleanup leaving the account as it was, `qam setup --move-account`, the sign-in hook on a real app. Findings go to a 0.8.x patch.
2. **Confirm Q58's "added while building"** items with the user: `--move-account`, the `QAMASTER_LOGIN_*_SELECTOR` variables, trace scrubbing, the eight `ask` rules, `--try`'s exit 3.
3. **Still undecided (user, 2026-11-11):** publish without `--to` also writing the file store; exempting a push from the QA project itself.
4. **Never run:** the Docker check (`scripts/docker-e2e/`), the Restful Booker rehearsal (saved for 1.0.0).

## What sessions learned
- **Build a release** on its own branch from the previous one; split items into groups by file ownership, one worktree and branch each (`git worktree add -b 0xy-<group> …`, symlink `node_modules`), review each branch with a second agent refuting every finding, then replay with `git cherry-pick BASE..<branch>` in order (zsh doesn't split `$revs`, so use the range). Remove the worktrees after `git status` shows them clean.
- **Checks:** `env -u QAMASTER_ADO_ORG -u QAMASTER_ADO_PROJECT -u QAMASTER_STORE npm run check`, then `claude plugin validate .`. This machine also sets `AZURE_DEVOPS_ORG_URL`, which 0.8.0 reads; `tests/project.test.mts`'s helper strips it.
- **Release steps:** bump `plugin.json`, add a revision row and a Built section to the plan, update `releases.md`, `plans/README.md`, the backlog, this handoff, the README status line, and rename the setup guide (`v<version>-setup-guide.html`, fix links with `sed -i ''`). Zips with `scripts/package.sh` after committing. No tags.
- **Pushing:** `env -u GH_TOKEN git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`, only when asked.
- **Q46:** a patch adds no command, flag, config key, file format or behaviour a user must learn; behaviour findings from a run go to a decision table and a minor release.
- **ADO:** the SessionStart hook `~/.claude/hooks/qamaster-ado-env.sh` maps `~/Desktop/.env.env` to `QAMASTER_ADO_*`; `az` isn't logged in, so `az` calls need `AZURE_DEVOPS_EXT_PAT`. In WIQL name the project, not `@project`.
- **Desktop plugins** load from the app-managed `rpm/` and `synced/` copies, not from a local marketplace setting; check which version a session loaded before a demo.
- **Working style:** short status when a step is slow; decisions asked with a recommendation first; docs updated with every release; answers plain.
