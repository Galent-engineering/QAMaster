#!/bin/bash
# Stop the servers start.sh started.
cd "$(dirname "$0")/.."
for f in .logs/backend.pid .logs/frontend.pid; do
  [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null && echo "stopped $(basename "$f" .pid)"
  rm -f "$f"
done
