#!/usr/bin/env bash
# One-command iOS release → TestFlight (local build, no human in the loop).
# Bumps CFBundleVersion, archives, exports an App Store IPA, uploads via altool.
# Secrets come from scripts/release.env (gitignored). Requires the ASC app record
# to already exist (one-time, manual — Apple has no API to create it).
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f scripts/release.env ]; then echo "✗ scripts/release.env missing — copy scripts/release.env.example"; exit 1; fi
source scripts/release.env

PLIST=ios/Veloscape/Info.plist
cur=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PLIST")
next=$(( cur + 1 ))
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $next" "$PLIST"
echo "▶ iOS build number $cur → $next"

# Clean only the archive/export outputs — never ios/build/generated (RN codegen).
rm -rf ios/build/Veloscape.xcarchive ios/build/ipa ios/build-device
# Always re-pod so RN codegen under ios/build/generated is complete & current
# (the build consumes those files as inputs; a partial/missing set fails the archive).
echo "▶ pod install (refresh RN codegen)…"
( cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install >/dev/null )

cat > /tmp/VeloscapeExportOptions.plist <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>teamID</key><string>${APPLE_TEAM}</string>
<key>signingStyle</key><string>automatic</string>
<key>uploadSymbols</key><true/>
<key>destination</key><string>export</string>
</dict></plist>
PLISTEOF

echo "▶ archiving…"
xcodebuild -workspace ios/Veloscape.xcworkspace -scheme Veloscape -configuration Release \
  -destination 'generic/platform=iOS' -archivePath ios/build/Veloscape.xcarchive -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER" \
  DEVELOPMENT_TEAM="$APPLE_TEAM" CODE_SIGN_STYLE=Automatic archive

echo "▶ exporting IPA…"
xcodebuild -exportArchive -archivePath ios/build/Veloscape.xcarchive \
  -exportOptionsPlist /tmp/VeloscapeExportOptions.plist -exportPath ios/build/ipa \
  -allowProvisioningUpdates -authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER"

echo "▶ uploading to TestFlight…"
xcrun altool --upload-app -f ios/build/ipa/Veloscape.ipa -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER"
echo "✅ iOS build $next uploaded. Apple processes it in ~5–15 min, then it's in TestFlight."
