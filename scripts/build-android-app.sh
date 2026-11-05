#!/bin/bash
# Builds "Coco-French.apk": the course in an Android WebView app, with all lessons, audio and
# (if installed) the offline speech model inside the APK. Needs JDK 17 and the Android SDK
# (platform 35, build-tools 35); the Gradle wrapper downloads Gradle itself on first use.
# Usage: scripts/build-android-app.sh [--lite] [--install]
#   --lite     leave out speaking practice (APK ~8 MB instead of ~160 MB)
#   --install  put it on the connected device/emulator via adb
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ -z "${JAVA_HOME:-}" ]; then
  for j in /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home "$(/usr/libexec/java_home -v 17 2>/dev/null || true)"; do
    [ -n "$j" ] && [ -x "$j/bin/java" ] && { export JAVA_HOME="$j"; break; }
  done
fi
[ -d "$ANDROID_HOME/platforms/android-35" ] || { echo "Android SDK platform 35 not found in $ANDROID_HOME (set ANDROID_HOME)" >&2; exit 1; }
[ -n "${JAVA_HOME:-}" ] || { echo "JDK 17 not found (set JAVA_HOME)" >&2; exit 1; }

LITE=""; INSTALL=""
for a in "$@"; do case "$a" in --lite) LITE="-Plite" ;; --install) INSTALL=1 ;; *) echo "unknown option $a" >&2; exit 1 ;; esac; done

echo "→ building (Gradle)"
(cd android && ./gradlew --quiet assembleRelease $LITE)

mkdir -p build
cp android/app/build/outputs/apk/release/app-release.apk build/Coco-French.apk
echo "✓ Built build/Coco-French.apk ($(du -h build/Coco-French.apk | cut -f1))"
if [ -n "$INSTALL" ]; then
  "$ANDROID_HOME/platform-tools/adb" install -r build/Coco-French.apk
  echo "✓ Installed on $("$ANDROID_HOME/platform-tools/adb" get-serialno)"
fi
