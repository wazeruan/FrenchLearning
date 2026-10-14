#!/bin/bash
# Builds "Coco French.app": a native macOS window around the course, with all lessons, audio and
# (if installed) the offline speech model inside the app. Needs Xcode Command Line Tools.
# Usage: scripts/build-mac-app.sh [--install]   (--install copies the app to /Applications)
set -euo pipefail
cd "$(dirname "$0")/.."

APP="build/Coco French.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

echo "→ compiling"
xcrun swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos13.0" \
  macos/LocalServer.swift macos/main.swift \
  -framework Cocoa -framework WebKit -framework Network \
  -o "$APP/Contents/MacOS/CocoFrench"
cp macos/Info.plist "$APP/Contents/Info.plist"

echo "→ copying the course"
rsync -a --exclude '.DS_Store' index.html css js assets "$APP/Contents/Resources/web/"
M=models/onnx-community/whisper-base/onnx
if [ -f $M/encoder_model.onnx ] && [ -f $M/decoder_model_merged_quantized.onnx ] && [ -f vendor/transformers/transformers.min.js ]; then
  rsync -a --exclude '*.part' models vendor "$APP/Contents/Resources/web/"
else
  echo "  (speech model not installed — run scripts/setup-speech.sh first to include speaking practice)"
fi

echo "→ icon"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
qlmanage -t -s 1024 -o "$TMP" assets/img/icon.svg >/dev/null 2>&1 || true
[ -f "$TMP/icon.svg.png" ] || { echo "Could not render the icon (qlmanage)" >&2; exit 1; }
ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$TMP/icon.svg.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$TMP/icon.svg.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

# Ad-hoc signing is enough on this Mac. (macOS may ask for microphone access again after a rebuild,
# and a copy on another Mac would need right-click → Open the first time.)
echo "→ signing (local, ad hoc)"
codesign --force --sign - "$APP" >/dev/null 2>&1

echo "✓ Built $APP ($(du -sh "$APP" | cut -f1))"
if [ "${1:-}" = "--install" ]; then
  # Quit a running copy first, so it isn't replaced underneath itself.
  osascript -e 'tell application id "local.cocofrench.app" to quit' >/dev/null 2>&1 || true
  sleep 1
  rm -rf "/Applications/Coco French.app"
  cp -R "$APP" /Applications/
  echo "✓ Installed to /Applications/Coco French.app"
fi
