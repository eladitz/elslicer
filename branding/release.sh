#!/bin/zsh
# Makes a notarized Elslicer.dmg for download from the installed /Applications/Elslicer.app
# (run branding/install.sh first). Usage: branding/release.sh [out_dir]
set -euo pipefail
ROOT=${0:A:h:h}
OUT=${1:-$ROOT/build/release}
SRC=/Applications/Elslicer.app
ID="Developer ID Application: Elad Itzkin (SZ6ZN9RLXR)"
ENT=$ROOT/scripts/disable_validation.entitlements
STAGE=$OUT/dmg
rm -rf "$OUT"; mkdir -p "$STAGE"
ditto "$SRC" "$STAGE/Elslicer.app"
# Page and resource fixes ship without a rebuild, and without touching the installed app.
rsync -a "$ROOT/resources/" "$STAGE/Elslicer.app/Contents/Resources/"
xattr -cr "$STAGE/Elslicer.app"

# Notarization needs a hardened-runtime signature on every nested Mach-O, then the bundle sealed last.
sign() { codesign --force --options runtime --timestamp --entitlements "$ENT" --sign "$ID" "$@"; }
machos=("${(@f)$(find "$STAGE/Elslicer.app" -type f -print0 | xargs -0 file --no-pad --mime-type -- |
  grep -v ' (for architecture ' | grep ': application/x-mach-binary$' | sed 's|: application/x-mach-binary$||')}")
echo "signing ${#machos} Mach-O files"
sign "${machos[@]}"
sign "$STAGE/Elslicer.app"
codesign --verify --deep --strict "$STAGE/Elslicer.app"

ln -s /Applications "$STAGE/Applications"
hdiutil create -volname Elslicer -srcfolder "$STAGE" -fs HFS+ -format ULMO -ov "$OUT/Elslicer.dmg"
codesign --force --timestamp --sign "$ID" "$OUT/Elslicer.dmg"
xcrun notarytool submit "$OUT/Elslicer.dmg" --keychain-profile notary --wait
xcrun stapler staple "$OUT/Elslicer.dmg"
spctl -a -t open --context context:primary-signature -vv "$OUT/Elslicer.dmg"
ls -lh "$OUT/Elslicer.dmg"
