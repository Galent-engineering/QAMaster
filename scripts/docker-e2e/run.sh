#!/bin/sh
# QAMaster end to end in a clean container (docs/demos/2026-11-02-0.3.0-docker-e2e.md).
# Usage: scripts/docker-e2e/run.sh [release zip]
# With no zip it runs this checkout's plugin/ folder. With one (the plugin zip or the marketplace zip that
# scripts/package.sh builds) it runs what the zip holds.
#
# It runs from a plain checkout: the three inputs are small fixtures under tests/fixtures/docker-e2e/, each a path
# the container only reads. Set an environment variable to use your own instead:
#   CHECKMASTER_DEMO  the pytest app: site/ (coupon.js, cart.js, login.js), tests/ (pytest-playwright) and
#                     pyproject.toml, with the cases seeded by seed-checkmaster.mts matching its tests. A git repo, or a
#                     plain folder (the container makes it a repo). A uv.lock is used if it has one, else the
#                     container makes it (uv lock needs PyPI, so the fixture can't hold one made offline)
#   JUICE_SHOP        the Juice Shop code QAMaster reads (routes, components, history): a git repo with its full
#                     history, or a plain folder (the fixture holds only the files the check reads). The running app is
#                     always the bkimminich/juice-shop:v20.3.0 image, never this folder
#   QA_SOURCE         a QA project with config/, dsm/ and a reviewed testgen/output/<run>; .claude/, package.json and
#                     .gitignore are copied if it has them
# Downloads: the image layers, the demo's wheels (uv lock, uv sync), Chromium, and the automation folder's npm
# packages. Python is the image's own 3.11: the demo's requires-python allows it, so uv downloads none.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
fixtures=$root/tests/fixtures/docker-e2e
demo=${CHECKMASTER_DEMO:-$fixtures/checkmaster-demo}
juice=${JUICE_SHOP:-$fixtures/juice-shop-source}
qa=${QA_SOURCE:-$fixtures/qa-project}
for p in "$demo" "$juice" "$qa" ${1:+"$1"}; do [ -e "$p" ] || { echo "Missing: $p" >&2; exit 2; }; done

tmp=$(mktemp -d)
cleanup() {
  docker rm -f qam-e2e-run qam-e2e-juice >/dev/null 2>&1 || true
  docker network rm qam-e2e-net >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
if [ -n "${1:-}" ]; then
  unzip -q "$1" -d "$tmp/zip"
  plugin=$(echo "$tmp"/zip/*/plugin) # the marketplace zip: qamaster-<version>/plugin
  [ -d "$plugin" ] || plugin=$(echo "$tmp"/zip/*) # the plugin zip: qamaster-<version> is the plugin
else
  plugin=$root/plugin
fi
[ -f "$plugin/src/cli/main.mts" ] || { echo "No plugin with src/cli/main.mts in ${1:-$root/plugin}" >&2; exit 2; }

docker build -q -t qamaster-e2e "$here" >/dev/null
docker network create qam-e2e-net >/dev/null
docker run -d --name qam-e2e-juice --network qam-e2e-net --network-alias juice-shop bkimminich/juice-shop:v20.3.0 >/dev/null
docker run --name qam-e2e-run --network qam-e2e-net \
  -v "$plugin:/opt/qamaster/plugin:ro" -v "$here:/opt/e2e:ro" \
  -v "$demo:/src/CheckMasterDemo:ro" -v "$juice:/src/juice-shop:ro" -v "$qa:/src/qa:ro" \
  qamaster-e2e sh /opt/e2e/inside.sh
