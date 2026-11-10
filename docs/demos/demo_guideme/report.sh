#!/bin/bash
# THREAD 4: the reporter. One Opus pass after the demo: reads RUN.md, FEEDBACK.md and QAMaster's state, checks each
# finding against the code, and writes the walkthrough record into QAMaster's docs/demos/.
#   guideme/report.sh
cd "$(dirname "$0")/.."
. guideme/demo.env
claude -p "$(cat guideme/thread4-reporter.md)" \
  --model "${REPORTER_MODEL:-opus}" --effort "${REPORTER_EFFORT:-high}" \
  --add-dir "$QAM_REPO" --add-dir "$TRANSCRIPTS" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Grep" "Glob" "Edit" "Write" \
    "Bash(tail:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(date:*)" "Bash(git log:*)" "Bash(git diff:*)" \
    "Bash(git status:*)" "Bash(git -C:*)" "Bash(node $QAM_PLUGIN/src/cli/main.mts pipeline status)" \
  --disallowedTools "Read(./.env)" "Read(./.env.*)" "Read(./fastapi-react-app/backend/.env)"
