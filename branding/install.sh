#!/bin/zsh
# Installs the built app as /Applications/Elslicer.app, signed with the private local certificate.
set -euo pipefail
ROOT=${0:A:h:h}
APP=/Applications/Elslicer.app
SIGNING="$HOME/Library/Application Support/Itzkin Signing"
pkill -x OrcaSlicer 2>/dev/null || true
rm -rf "$APP"
cp -R "$ROOT/build/arm64/OrcaSlicer/OrcaSlicer.app" "$APP"
/usr/libexec/PlistBuddy -c 'Set CFBundleIdentifier com.itzkin.elslicer' "$APP/Contents/Info.plist"
xattr -cr "$APP"
KEYCHAIN=$(ls "$SIGNING"/signing.keychain* | head -1)
security unlock-keychain -p "$(cat "$SIGNING/password")" "$KEYCHAIN"
codesign --force --deep --keychain "$KEYCHAIN" --sign "$(cat "$SIGNING/identity")" "$APP"
codesign --verify --deep "$APP"
echo "Installed $APP"
