#!/bin/sh
# Feeds QAMaster's push hook a Claude Code PreToolUse event for `git push`, as Claude Code would, and prints its exit code.
# Usage: hook-event.sh <repo dir> [plugin root]
dir=$1
root=${2:-/opt/qamaster/plugin}
printf '{"session_id":"e2e","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git push origin HEAD"},"cwd":"%s"}' "$dir" |
  node "$root/hooks/pre-push.mts"
echo "hook exit=$?"
