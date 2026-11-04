#!/usr/bin/env bash
# Publishes the app to https://www.michael-han.com/blackjack/ by copying it into the
# michaellhan/michaellhan.github.io repo (folder: blackjack/) and pushing, then pushes this repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# The cache-busting version is the commit, so uncommitted edits would ship under an already-cached URL.
git -C "$HERE" diff --quiet HEAD || { echo "Commit your changes first; not deploying."; exit 1; }
node "$HERE/scripts/test-strategy.mjs" >/dev/null || { echo "Strategy tests failed; not deploying."; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
gh repo clone michaellhan/michaellhan.github.io "$WORK/site" -- -q --depth 1
rm -rf "$WORK/site/blackjack"
mkdir -p "$WORK/site/blackjack"
cp -R "$HERE/css" "$HERE/js" "$WORK/site/blackjack/"
# Cloudflare caches .js/.css for hours, so tag them with the commit to make each deploy load fresh files.
VER="$(cd "$HERE" && git rev-parse --short HEAD)"
sed -E "s#(href|src)=\"((css|js)/[^\"]+)\"#\1=\"\2?v=$VER\"#g" "$HERE/index.html" > "$WORK/site/blackjack/index.html"
cd "$WORK/site"
git add -A
if git diff --cached --quiet; then
  echo "Site already up to date."
else
  git commit -q -m "blackjack: deploy $VER"
  git push -q origin main
  echo "Deployed. GitHub Pages will update https://www.michael-han.com/blackjack/ in about a minute."
fi
git -C "$HERE" push -q && echo "Pushed → $(git -C "$HERE" remote get-url origin)"
