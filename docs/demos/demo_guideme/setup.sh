#!/bin/bash
# demo_guideme setup: a fresh demo folder with TodoApp (finsberg/fastapi-react-app) running, a test account,
# three prepared code changes and the thread prompts. QAMaster itself is NOT set up here: that is Thread 1's job.
#
#   docs/demos/demo_guideme/setup.sh [demo-folder]
#
# Needs: git, Node 24, python3 (3.12 is fine), the claude CLI, ports 8000 and 5173 free (the app hard-codes both).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
QAM_REPO="$(cd "$HERE/../../.." && pwd)"
DEMO="${1:-$HOME/Desktop/Workspace/qamaster-demo-$(date +%Y%m%d-%H%M)}"
APP_URL=https://github.com/finsberg/fastapi-react-app.git

for port in 8000 5173; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $port is in use. Stop that server first (the app needs 8000 and 5173)." >&2
    exit 1
  fi
done
[ -e "$DEMO" ] && { echo "$DEMO already exists; pass another folder." >&2; exit 1; }

echo "== Demo folder: $DEMO"
mkdir -p "$DEMO"/{.logs,guideme}
cd "$DEMO"
git init -q
git clone -q "$APP_URL" fastapi-react-app
git init -q --bare local-remote.git
git -C fastapi-react-app remote add local ../local-remote.git

echo "== Backend (Python venv; the repo's pins don't install on 3.12, so three are overridden)"
sed -E -e '/^([Pp]y[Yy][Aa][Mm][Ll]|httptools|uvloop|watchfiles)==/d' \
       -e 's/^pydantic(\[email\])?==.*/pydantic\1==1.10.18/' \
       -e 's/^typing-extensions==.*/typing-extensions>=4.12/' \
       fastapi-react-app/backend/requirements.txt > .logs/app-requirements.txt
python3 -m venv .venv-app
.venv-app/bin/pip install -q -r .logs/app-requirements.txt "httpx==0.23.3" pytest pytest-cov 2>&1 | grep -v -i notice || true
cp fastapi-react-app/backend/.env.example fastapi-react-app/backend/.env

echo "== Frontend (npm; yarn.lock restored so the clone stays clean)"
(cd fastapi-react-app/frontend && npm install --no-audit --no-fund --loglevel=error >/dev/null)
git -C fastapi-react-app checkout -q -- frontend/yarn.lock
rm -f fastapi-react-app/frontend/package-lock.json

echo "== Two prepared changes for the gate (local branches, never pushed to GitHub)"
EMAIL="$(git config user.email || echo demo@example.com)"
g() { git -C fastapi-react-app -c user.email="$EMAIL" -c user.name="QAMaster demo" "$@"; }
g switch -q -c demo/good-change
python3 - <<'EOF'
p = 'fastapi-react-app/backend/app/services/todo_service.py'
s = open(p).read()
old = "    todo = await retrieve_todo(user, todo_id, session=session)\n    session.delete(todo)"
new = ("    todo = await retrieve_todo(user, todo_id, session=session)\n    if todo is None:\n"
       "        raise TodoNotFoundError(f\"Todo with id {todo_id} not found\")\n    session.delete(todo)")
assert old in s
open(p, 'w').write(s.replace(old, new))
EOF
g commit -q -am "Raise TodoNotFoundError when deleting a missing todo"
g switch -q main
g switch -q -c demo/bad-change
sed -i '' "s/'Pending'/'Pendng'/" fastapi-react-app/frontend/src/components/Todo/TodoCard.tsx
g commit -q -am "Todo card: badge text (contains a deliberate typo for the FAIL path)"
g switch -q main
g switch -q -c demo/server-error
python3 - <<'EOF'
p = 'fastapi-react-app/backend/app/api/api_v1/handlers/todo.py'
s = open(p).read()
old = "    return await todo_service.list_todos(user=user, session=session)\n"
new = ("    todos = await todo_service.list_todos(user=user, session=session)\n    if len(todos) > 2:\n"
       "        raise RuntimeError(\"list_todos: more than one page\")\n    return todos\n")
assert old in s
open(p, 'w').write(s.replace(old, new))
EOF
g commit -q -am "List todos: one page only (contains a deliberate server error: the list answers 500 once a third todo exists, and the UI hides it)"
g switch -q main

echo "== Settings for this folder: accept messages between the two threads (bypass is NOT set: only Thread 2 gets it, from you)"
mkdir -p .claude
cat > .claude/settings.local.json <<'EOF'
{
  "crossSessionInbound": "accept"
}
EOF
printf '.venv-app/\n.logs/\nlocal-remote.git/\n.claude/settings.local.json\nguideme/.observer-cursor\n' > .gitignore

echo "== Guide files, and the light testing agents Thread 2 may hand checks to"
cp "$HERE"/thread*.md "$HERE"/observe.sh "$HERE"/report.sh "$HERE"/start.sh "$HERE"/stop.sh guideme/
chmod +x guideme/*.sh
mkdir -p .claude/agents
cp "$HERE"/agents/*.md .claude/agents/
cat > guideme/demo.env <<EOF
DEMO=$DEMO
QAM_REPO=$QAM_REPO
QAM_PLUGIN=$QAM_REPO/plugin
TRANSCRIPTS=$HOME/.claude/projects/$(printf '%s' "$DEMO" | sed 's/[^A-Za-z0-9]/-/g')
EOF
cat > FEEDBACK.md <<EOF
# QAMaster demo feedback · $(date +%Y-%m-%d)

Written by Thread 3 (observer). Known findings are R1–R30 in
\`$QAM_REPO/docs/demos/2026-11-04-0.4.3-fastapi-react-todo.md\`.

EOF
printf '# Test-user run log\n\n| Step | Sent | Got | Verdict | Notes |\n|---|---|---|---|---|\n' > RUN.md

echo "== Start the app and create the test account"
guideme/start.sh > .logs/start.out 2>&1; cat .logs/start.out
for i in $(seq 1 30); do curl -sf localhost:8000/api/v1/health >/dev/null && break; sleep 1; done
PW="demo$(openssl rand -hex 6)"; U=qa-demo-user
curl -sf -o /dev/null -X POST localhost:8000/api/v1/users/ -H 'content-type: application/json' \
  -d "{\"username\":\"$U\",\"email\":\"$U@example.com\",\"password\":\"$PW\",\"firstName\":\"QA\"}"
TOKEN=$(curl -sf -X POST localhost:8000/api/v1/auth/login --data-urlencode "username=$U" --data-urlencode "password=$PW" |
  python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
for t in "Buy milk" "Write report"; do
  curl -sf -o /dev/null -X POST localhost:8000/api/v1/todo/ -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' -d "{\"title\":\"$t\",\"description\":\"seed for the demo\"}"
done
( umask 077; printf 'DSM_APP_USERNAME=%s\nDSM_APP_PASSWORD=%s\nTODOAPP_USERNAME=%s\nTODOAPP_PASSWORD=%s\n' "$U" "$PW" "$U" "$PW" > .env.dsm )
unset PW TOKEN

cat <<EOF

Ready: $DEMO
  App   http://localhost:5173 (API on :8000), test account in .env.dsm (git-ignored, 0600)
  Next  open README.md in docs/demos/demo_guideme and follow steps 2-4
EOF
