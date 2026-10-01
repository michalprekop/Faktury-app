#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
swift build -c release
# Keep build artifacts out of Spotlight's application results.
APP="$PWD/.build/distribution.noindex/INVOY.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/INVOY "$APP/Contents/MacOS/INVOY"
rm -rf "$APP/Contents/Resources/INVOY_INVOY.bundle"
cp web/public/brand/invoy-wordmark.svg web/public/brand/invoy-icon-yellow.svg "$APP/Contents/Resources/"
mkdir -p "$APP/Contents/Resources/manolo-bay-v1"
cp web/public/templates/manolo-bay-v1/logo.svg web/public/templates/manolo-bay-v1/background.png "$APP/Contents/Resources/manolo-bay-v1/"
cp packaging/Info.plist "$APP/Contents/Info.plist"
swift scripts/create-icon.swift .build/AppIcon.iconset
ICON_NAME=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$APP/Contents/Info.plist")
iconutil -c icns .build/AppIcon.iconset -o "$APP/Contents/Resources/$ICON_NAME.icns"
rm -f "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP"
printf '%s\n' "$APP"
