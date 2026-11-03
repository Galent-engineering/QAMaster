#!/bin/sh
# Builds QAMaster's two installable zips from the committed HEAD into dist/, and checks each one.
#
#   dist/qamaster-<version>-plugin.zip       the plugin folder itself, with .claude-plugin/plugin.json inside one top-level
#                                            folder. For Claude desktop: Settings > Plugins > Upload a plugin.
#   dist/qamaster-<version>-marketplace.zip  the marketplace layout (.claude-plugin/marketplace.json and plugin/). For the
#                                            CLI: unzip it, then `claude plugin marketplace add <folder>` and
#                                            `claude plugin install qamaster@qamaster-local`.
#
# Usage: scripts/package.sh        (docs/install.md says how to load each one)
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
version=$(node -p "require('./plugin/.claude-plugin/plugin.json').version")
# git archive packs HEAD, so a change that isn't committed would be missing from the zip
if [ -n "$(git status --porcelain -- plugin .claude-plugin)" ]; then
  echo "plugin/ or .claude-plugin/ has uncommitted changes: commit them first, git archive packs HEAD." >&2
  exit 2
fi
mkdir -p dist
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
plugin_zip=dist/qamaster-$version-plugin.zip
market_zip=dist/qamaster-$version-marketplace.zip
git archive --format=zip --prefix="qamaster-$version/" -o "$plugin_zip" HEAD:plugin
git archive --format=zip --prefix="qamaster-$version/" -o "$market_zip" HEAD .claude-plugin plugin

# each zip unzips, has its manifest where its installer looks, and passes the CLI's own validation
unzip -q "$plugin_zip" -d "$tmp/plugin"
unzip -q "$market_zip" -d "$tmp/market"
test -f "$tmp/plugin/qamaster-$version/.claude-plugin/plugin.json" || { echo "$plugin_zip: no .claude-plugin/plugin.json in its top-level folder" >&2; exit 1; }
test -f "$tmp/market/qamaster-$version/.claude-plugin/marketplace.json" || { echo "$market_zip: no .claude-plugin/marketplace.json" >&2; exit 1; }
claude plugin validate "$tmp/plugin/qamaster-$version" >/dev/null || { echo "$plugin_zip failed claude plugin validate" >&2; exit 1; }
claude plugin validate "$tmp/market/qamaster-$version" >/dev/null || { echo "$market_zip failed claude plugin validate" >&2; exit 1; }
# Claude desktop's upload refuses a hosted plugin with a top-level bin/ (executables it can't show for approval, Q45)
if unzip -Z1 "$plugin_zip" | grep -E "^qamaster-$version/bin/" >/dev/null || unzip -Z1 "$market_zip" | grep -E "^qamaster-$version/plugin/bin/" >/dev/null; then
  echo "a zip has the plugin's bin/: Claude desktop refuses hosted plugins that ship executables. Keep wrappers in the repo-root bin/." >&2
  exit 1
fi
if unzip -l "$plugin_zip" "$market_zip" | grep -E '/(\.env|node_modules|\.git)(/|$)' >/dev/null; then
  echo "a zip contains .env, node_modules or .git" >&2
  exit 1
fi
printf 'Built and checked (version %s):\n  %s\n  %s\n' "$version" "$plugin_zip" "$market_zip"
