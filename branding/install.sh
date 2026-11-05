#!/bin/zsh
# Installs the built app as /Applications/Elslicer.app, signed with the Developer ID certificate.
set -euo pipefail
ROOT=${0:A:h:h}
APP=/Applications/Elslicer.app
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
/usr/libexec/PlistBuddy -c 'Add :NSLocalNetworkUsageDescription string Elslicer connects to your printer on your network to show its status and camera and to read its filaments.' "$APP/Contents/Info.plist" 2>/dev/null || true
xattr -cr "$APP"
# macOS only tracks Local Network permission reliably for Apple-issued signatures (Apple TN3179).
codesign --force --deep --timestamp=none --sign "Developer ID Application: Elad Itzkin (SZ6ZN9RLXR)" "$APP"
codesign --verify --deep "$APP"
echo "Installed $APP"
