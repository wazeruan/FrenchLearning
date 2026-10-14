#!/bin/bash
# Double-click to open Coco · French. Serves this folder on localhost only and opens your browser.
# Always opening the app the same way keeps your progress in one place (browser storage is per address).
cd "$(dirname "$0")" || exit 1
PORT=8642
if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  sleep 0.6
fi
open "http://127.0.0.1:$PORT/index.html"
echo "Coco · French is running at http://127.0.0.1:$PORT — you can close this window."
