#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
: "${INVOY_SIGN_IDENTITY:=Developer ID Application: Michal Prekop (2UK483PFM5)}"
: "${INVOY_NOTARY_PROFILE:=PaperToDoNotary}"
bash scripts/build-app.sh
RELEASE_APP="$PWD/.build/distribution.noindex/INVOY.app"
mkdir -p output/release
codesign --force --options runtime --timestamp --sign "$INVOY_SIGN_IDENTITY" "$RELEASE_APP"
codesign --verify --deep --strict --verbose=2 "$RELEASE_APP"
ditto -c -k --sequesterRsrc --keepParent "$RELEASE_APP" output/release/INVOY-Mac.zip
xcrun notarytool submit output/release/INVOY-Mac.zip --keychain-profile "$INVOY_NOTARY_PROFILE" --wait --output-format json > output/release/notary-result.json
python3 -c 'import json; d=json.load(open("output/release/notary-result.json")); print("Notarization:",d.get("status")); assert d.get("status")=="Accepted", "Notarization failed"'
xcrun stapler staple "$RELEASE_APP"
xcrun stapler validate "$RELEASE_APP"
spctl --assess --type execute --verbose=2 "$RELEASE_APP"
ditto -c -k --sequesterRsrc --keepParent "$RELEASE_APP" output/release/INVOY-Mac.zip
shasum -a 256 output/release/INVOY-Mac.zip > output/release/SHA256SUMS
