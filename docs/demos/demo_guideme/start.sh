#!/bin/bash
# Start TodoApp's backend (:8000) and frontend (:5173) in the background; logs in .logs/. Re-run after switching the
# clone's branch: it restarts the backend so the code under test is the code that runs.
cd "$(dirname "$0")/.."
"$(dirname "$0")/stop.sh" >/dev/null 2>&1 || true
# fresh logs each start, so the observer never reads an earlier start's noise
: > .logs/backend.log; : > .logs/frontend.log
( cd fastapi-react-app/backend; nohup ../../.venv-app/bin/uvicorn app.main:app --port 8000 < /dev/null >> ../../.logs/backend.log 2>&1 & echo $! > ../../.logs/backend.pid )
( cd fastapi-react-app/frontend; nohup ./node_modules/.bin/vite --port 5173 --strictPort < /dev/null >> ../../.logs/frontend.log 2>&1 & echo $! > ../../.logs/frontend.pid )
for i in $(seq 1 30); do curl -sf localhost:8000/api/v1/health >/dev/null && curl -sf localhost:5173 >/dev/null && break; sleep 1; done
curl -sf localhost:8000/api/v1/health >/dev/null && echo "backend up :8000" || echo "backend NOT up: see .logs/backend.log"
curl -sf localhost:5173 >/dev/null && echo "frontend up :5173" || echo "frontend NOT up: see .logs/frontend.log"
