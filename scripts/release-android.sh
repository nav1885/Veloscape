#!/usr/bin/env bash
# One-command Android release → Google Play internal track (local build).
# Bumps versionCode, builds a signed .aab, uploads via `eas submit`.
# Requires: the Play app listing to exist (one-time, manual — no API to create it),
# the upload keystore (android/keystore.properties), and a Google Play service-account
# JSON at ./google-play-service-account.json (gitignored; see scripts/README.md).
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
[ -f scripts/release.env ] && source scripts/release.env

export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"; export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [ ! -f android/keystore.properties ]; then echo "✗ android/keystore.properties missing — release would be debug-signed (Play rejects)."; exit 1; fi
if [ ! -f google-play-service-account.json ]; then echo "✗ google-play-service-account.json missing — see scripts/README.md."; exit 1; fi

GRADLE=android/app/build.gradle
cur=$(grep -oE 'versionCode [0-9]+' "$GRADLE" | grep -oE '[0-9]+')
next=$(( cur + 1 ))
sed -i '' "s/versionCode ${cur}/versionCode ${next}/" "$GRADLE"
echo "▶ Android versionCode $cur → $next"

echo "▶ bundling signed .aab…"
( cd android && ./gradlew :app:bundleRelease )
AAB=android/app/build/outputs/bundle/release/app-release.aab
[ -f "$AAB" ] || { echo "✗ .aab not produced"; exit 1; }

echo "▶ submitting to Play (internal track)…"
eas submit -p android --profile production --path "$AAB" --non-interactive
echo "✅ Android versionCode $next submitted to Play internal testing."
