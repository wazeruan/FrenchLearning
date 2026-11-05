#!/bin/bash
# Renders the README screenshots (docs/screenshots/*.png) with the Mac app's --snapshot mode, from demo
# progress. Snapshots use their own port and a throwaway data store: an open copy of the app and its
# saved progress are left alone. Needs a build first: scripts/build-mac-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BIN="build/Coco French.app/Contents/MacOS/CocoFrench"
[ -x "$BIN" ] || { echo "Build the app first: scripts/build-mac-app.sh" >&2; exit 1; }
STATES=$(mktemp -d)
trap 'rm -rf "$STATES"' EXIT
node scripts/screenshot-states.mjs "$STATES"
mkdir -p docs/screenshots

# name → route. A state with an unfinished practice opens straight at the exercise it was left on.
SHOTS="home:#/ sounds-drill:#/practice/p01 chunks:#/practice/d01 gender:#/practice/u06 dialogue:#/dialogue/d02 progress:#/progress"
for shot in $SHOTS; do
  name=${shot%%:*}; route=${shot#*:}
  "$BIN" --snapshot "$PWD/docs/screenshots/$name.png" "$route" --state "$STATES/$name.json" | grep -q SNAPSHOT \
    || { echo "snapshot failed: $name" >&2; exit 1; }
  # Retina snapshots are 2x; halve them to keep the repository small.
  sips -Z 1200 "docs/screenshots/$name.png" >/dev/null
  echo "✓ docs/screenshots/$name.png"
done
