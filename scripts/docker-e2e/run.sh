#!/bin/sh
# QAMaster end to end in a clean container (docs/demos/2026-11-02-0.3.0-docker-e2e.md).
# Usage: scripts/docker-e2e/run.sh [release zip]
# It needs three inputs, each a path it only reads, set by an environment variable. The folders it was first written
# against were deleted on 2026-11-03, so there are no defaults that exist any more:
#   CHECKMASTER_DEMO  a git repo with site/ (coupon.js, cart.js), tests/ (pytest-playwright) and a uv.lock, with the
#                     seeded cases in scripts/docker-e2e/seed-checkmaster.mts matching its tests
#   JUICE_SHOP        a full clone of github.com/juice-shop/juice-shop at v20.3.0
#   QA_SOURCE         a QA project with config/, dsm/, .claude/skills/ and a reviewed testgen/ run (the Juice Shop
#                     CatalogEngagement run was used)
# Downloads: the image layers, Python 3.12 and the demo's wheels (uv sync), Chromium, and the automation folder's npm
# packages. Juice Shop runs from bkimminich/juice-shop:v20.3.0.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
# the main checkout, also from a worktree: the demos and dist/ sit next to it and in it
repo=$(cd "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
zip=${1:-$repo/dist/qamaster-0.3.0.zip}
demo=${CHECKMASTER_DEMO:-$repo/../CheckMasterDemo}  # no longer exists: set CHECKMASTER_DEMO
juice=${JUICE_SHOP:-$HOME/Desktop/Workspace/juice-shop}
qa=${QA_SOURCE:-$HOME/Downloads/DemoTestv0.2.1}
for p in "$zip" "$demo" "$juice" "$qa"; do [ -e "$p" ] || { echo "Missing: $p" >&2; exit 2; }; done

tmp=$(mktemp -d)
cleanup() {
  docker rm -f qam-e2e-run qam-e2e-juice >/dev/null 2>&1 || true
  docker network rm qam-e2e-net >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
unzip -q "$zip" -d "$tmp"

docker build -q -t qamaster-e2e "$here" >/dev/null
docker network create qam-e2e-net >/dev/null
docker run -d --name qam-e2e-juice --network qam-e2e-net --network-alias juice-shop bkimminich/juice-shop:v20.3.0 >/dev/null
docker run --name qam-e2e-run --network qam-e2e-net \
  -v "$tmp/qamaster:/opt/qamaster:ro" -v "$here:/opt/e2e:ro" \
  -v "$demo:/src/CheckMasterDemo:ro" -v "$juice:/src/juice-shop:ro" -v "$qa:/src/qa:ro" \
  qamaster-e2e sh /opt/e2e/inside.sh
