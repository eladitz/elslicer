#!/bin/zsh
# Installs the built app as /Applications/Elslicer.app, signed with the private local certificate.
set -euo pipefail
ROOT=${0:A:h:h}
APP=/Applications/Elslicer.app
SIGNING="$HOME/Library/Application Support/Itzkin Signing"
# Quit properly, so an open project can be saved. Never replace an app that's still in use.
if pgrep -x OrcaSlicer >/dev/null; then
  osascript -e 'tell application id "com.itzkin.elslicer" to quit' 2>/dev/null || true
  for i in {1..15}; do pgrep -x OrcaSlicer >/dev/null || break; /bin/sleep 1; done
  if pgrep -x OrcaSlicer >/dev/null; then echo "Elslicer is still open, so it wasn't replaced."; exit 2; fi
fi
rm -rf "$APP"
cp -R "$ROOT/build/arm64/OrcaSlicer/OrcaSlicer.app" "$APP"
rsync -a "$ROOT/resources/" "$APP/Contents/Resources/"
/usr/libexec/PlistBuddy -c 'Set CFBundleIdentifier com.itzkin.elslicer' "$APP/Contents/Info.plist"
xattr -cr "$APP"
KEYCHAIN=$(ls "$SIGNING"/signing.keychain* | head -1)
security unlock-keychain -p "$(cat "$SIGNING/password")" "$KEYCHAIN"
codesign --force --deep --keychain "$KEYCHAIN" --sign "$(cat "$SIGNING/identity")" "$APP"
codesign --verify --deep "$APP"
echo "Installed $APP"
