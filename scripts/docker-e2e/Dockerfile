# A clean machine for QAMaster's end-to-end run, with each prerequisite the 0.3.0 run found, in the order it was needed.
# Build and run it with run.sh. The report: docs/demos/2026-11-02-0.3.0-docker-e2e.md.
FROM node:24-bookworm-slim

# git: setup, plan, approve and the hook all call it. python3: the pytest runner without uv.lock (Debian 12 gives 3.11).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 \
 && rm -rf /var/lib/apt/lists/*

# uv: the pytest runner uses `uv run pytest` when the test root has uv.lock. Kept off /usr/local/bin so the run can
# hide it from PATH while node stays.
COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /opt/uv/uv
ENV PATH=/opt/uv:$PATH

# Chromium's OS libraries (libglib and others): needs root, so a user's `playwright install chromium` alone isn't enough.
RUN npx -y playwright@1.64.1 install-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm

USER node
WORKDIR /home/node
