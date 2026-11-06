#!/bin/bash
# THREAD 3: the headless observer. Every INTERVAL seconds (default 180) one `claude -p` pass reads what's new in the
# demo and appends findings to FEEDBACK.md; this terminal shows each pass's new entries. Ctrl-C to stop.
#   guideme/observe.sh            # loop
#   ONCE=1 guideme/observe.sh     # one pass (e.g. a final one after the demo)
cd "$(dirname "$0")/.."
. guideme/demo.env
INTERVAL="${INTERVAL:-180}"

pass() {
  echo "== observer pass $(date +%H:%M:%S)"
  claude -p "$(cat guideme/thread3-observer.md)" \
    --add-dir "$QAM_REPO" --add-dir "$TRANSCRIPTS" \
    --permission-mode acceptEdits \
    --allowedTools "Read" "Grep" "Glob" "Edit" "Write" \
      "Bash(tail:*)" "Bash(ls:*)" "Bash(grep:*)" "Bash(wc:*)" "Bash(date:*)" "Bash(git log:*)" "Bash(git diff:*)" \
      "Bash(git status:*)" "Bash(node $QAM_PLUGIN/src/cli/main.mts pipeline status)" \
    --disallowedTools "Read(./.env)" "Read(./.env.*)" "Read(./fastapi-react-app/backend/.env)" \
    || echo "(pass failed; next pass in ${INTERVAL}s)"
}

if [ -n "${ONCE:-}" ]; then pass; exit; fi
while true; do pass; sleep "$INTERVAL"; done
