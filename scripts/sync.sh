#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Syncing src/ → chrome/ and src/ → firefox/..."

cp "$ROOT/src/background.js" "$ROOT/chrome/background.js"
cp "$ROOT/src/content-script.js" "$ROOT/chrome/content-script.js"
cp -r "$ROOT/src/popup" "$ROOT/chrome/"
cp -r "$ROOT/src/icons" "$ROOT/chrome/"

cp "$ROOT/src/background.js" "$ROOT/firefox/background.js"
cp "$ROOT/src/content-script.js" "$ROOT/firefox/content-script.js"
cp -r "$ROOT/src/popup" "$ROOT/firefox/"
cp -r "$ROOT/src/icons" "$ROOT/firefox/"

echo "Done. Edit files in src/, then run this script to sync."
