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

QAMaster itself needs only Node.js 24 and git. `qam doctor` checks the rest and says how to fix it: the runner a test case uses (uv and pytest, or the automation folder's npm packages), Playwright's browser, and the app's URL. See [the prerequisites table](demos/2026-11-02-0.3.2-unknown-app.md#part-0-prerequisites).
