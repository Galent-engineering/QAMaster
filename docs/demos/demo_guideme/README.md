# demo_guideme: a three-thread QAMaster demo

A light, repeatable live test of the QAMaster plugin on TodoApp ([finsberg/fastapi-react-app](https://github.com/finsberg/fastapi-react-app): React + FastAPI, sign-in), in a fresh folder, with three threads:

| Thread | Runs as | Does |
|---|---|---|
| 1 · Assistant | Claude desktop session in the demo folder, plugin loaded | Claude for the user: runs QAMaster's commands and skills, asks the user when QAMaster says to |
| 2 · Test user | A second Claude desktop session in the same folder | Plays the QA lead: sends Thread 1 each step of a 20-step checklist, answers its questions, checks the result, logs it in `RUN.md` |
| 3 · Observer | Headless `claude -p` loop in a terminal | Every 3 minutes reads the transcripts, logs and QAMaster's state, compares with QAMaster's code and the known findings (R1–R30), and appends to `FEEDBACK.md` |

Threads 1 and 2 talk with SendMessage. Only Thread 2 runs in bypass-permissions mode (you choose it when you open that session); Thread 1 runs normally, so you approve its permission prompts.

## Run it

**1. Set up** (about 1 minute; needs ports 8000 and 5173 free; add a folder path to choose where it goes):

```bash
~/Desktop/Workspace/QAMaster/docs/demos/demo_guideme/setup.sh
```

This makes `~/Desktop/Workspace/qamaster-demo-<date-time>/` with:
- the app cloned, installed and running;
- a test account with two todos, in `.env.dsm`;
- two prepared branches, `demo/good-change` (passes) and `demo/bad-change` (a badge typo that should fail);
- a local bare remote named `local` for push tests.

It doesn't set up QAMaster: that's the demo's first step.

**2. Thread 1.** In Claude desktop, open a new Code session in the demo folder, with the QAMaster plugin enabled (the same build as your checkout; see R27). Paste the text of `guideme/thread1-assistant.md`.

**3. Thread 2.** Open a second session in the same folder and paste `guideme/thread2-test-user.md`. It finds Thread 1 and starts with step 1. Put the two side by side (drag one to split view).

**4. Thread 3.** In a terminal:

```bash
cd ~/Desktop/Workspace/qamaster-demo-<date-time> && guideme/observe.sh
```

Open `FEEDBACK.md` in the demo folder to watch it fill.

You only step in when Thread 2 asks. It does so before anything that leaves the machine (Azure DevOps, step 20).

## After the run

```bash
cd ~/Desktop/Workspace/qamaster-demo-<date-time> && ONCE=1 guideme/observe.sh && guideme/stop.sh
```

Then copy the new `F<n>` entries from `FEEDBACK.md` into the release's demo record, as `docs/demos/README.md` describes.

## Files

| File | For |
|---|---|
| `setup.sh` | A fresh demo folder: app, test account, branches, prompts, `RUN.md`, `FEEDBACK.md` |
| `start.sh` / `stop.sh` | Start or stop the app. Re-run `start.sh` after switching the clone's branch |
| `thread1-assistant.md` | Prompt for Thread 1 |
| `thread2-test-user.md` | Prompt and the 20-step checklist for Thread 2 |
| `thread3-observer.md` | One observer pass |
| `observe.sh` | Runs the observer pass every 3 minutes (`INTERVAL=` to change, `ONCE=1` for one pass) |

## Notes

- The demo folder's `.claude/settings.local.json` only lets the two sessions accept each other's messages. Bypass is never written to a file.
- Azure DevOps: the SessionStart hook in `~/.claude/settings.json` maps `AZURE_DEVOPS_EXT_PAT` / `AZURE_DEVOPS_ORG_URL` from `~/Desktop/.env.env` to `QAMASTER_ADO_*` for every session. Thread 2 may read those `AZURE_DEVOPS_*` lines to check `az` access and never repeats a value.
- Thread 1 pushes only to the `local` remote and touches Azure DevOps only when a message carries `HUMAN-OK`.
- The observer is read-only apart from `FEEDBACK.md` and its cursor. It's told never to open `.env*` files.
- The app's Python pins don't install on Python 3.12, so setup overrides three of them (R1).
