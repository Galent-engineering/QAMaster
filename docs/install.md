# Installing QAMaster from a zip

Build the zips from a release commit with `scripts/package.sh`. It writes two files into `dist/` and checks each: they unzip, hold their manifest where the installer looks, and pass `claude plugin validate`.

| Zip | For | Layout |
|---|---|---|
| `qamaster-<version>-plugin.zip` | Claude desktop | The plugin folder itself: `.claude-plugin/plugin.json` inside one top-level folder |
| `qamaster-<version>-marketplace.zip` | The Claude CLI | `.claude-plugin/marketplace.json` and a `plugin/` folder, inside one top-level folder |

The two layouts aren't interchangeable. Claude desktop rejects the marketplace zip with "plugin.json must be at .claude-plugin/plugin.json at the zip root".

## Claude desktop

Settings → Plugins → **Upload a plugin**, and choose `qamaster-<version>-plugin.zip`.

## Claude CLI

Unzip `qamaster-<version>-marketplace.zip` somewhere permanent, such as `~/claude-plugins/`, then from the project that should have QAMaster:

```bash
claude plugin marketplace add ~/claude-plugins/qamaster-<version> --scope project
claude plugin install qamaster@qamaster-local --scope project
claude plugin list
```

`claude plugin list` should show `qamaster`, the version, and "enabled". To replace an older install, run `claude plugin uninstall qamaster@qamaster-local --scope project` first, and unzip the new version over the old folder.

## Without a zip

From a checkout of this repository: `claude --plugin-dir ./plugin`. Changes to the plugin's TypeScript apply on the next call; changes to commands, skills, hooks or `plugin.json` apply after restarting `claude`.

## Running `qam` in a terminal

The plugin ships no `bin/`: Claude desktop refuses a hosted plugin that ships executables (Q45). So installing it doesn't put `qam` on the PATH. Use the slash commands in Claude, or in a terminal:
- in a QA project, `node .qamaster/bin/qam.mjs <command>`, which `qam setup` writes;
- in a checkout of this repository, `bin/qam <command>`.

## What it needs on the machine

QAMaster checks each of these and says how to fix it. Install only what you already know you need, and note whether QAMaster's messages were enough for the rest.

| For | What | QAMaster checks it in |
|---|---|---|
| Everything | Node.js 24 or later, npm, git 2.20+, `git config user.email` | `qam setup` (git, Node), `qam approve` (email), each gate command (git) |
| Running the app | Whatever its README needs (Docker, a database, seed data) | not QAMaster's |
| Mapping the app | Playwright and Chromium in the QA project; on Linux also `sudo npx playwright install-deps chromium` | `qam setup` installs them; `qam doctor` |
| Running drafted scripts | `npm install` in the automation folder (it downloads `@playwright/test` and `playwright-bdd`) | `qam check-scripts`; `qam doctor`, the `runner playwright-bdd` lines |
| The app's own pytest tests, if any | uv (or python3 with pytest), and `uv sync` in the test folder | `qam doctor`, `runner pytest`; the gate blocks with the command |
| The app answering | Running at its URL | `qam doctor`, `app URL`; a run that can't reach it is blocked, not failed |
