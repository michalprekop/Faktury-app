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
cp packaging/Info.plist "$APP/Contents/Info.plist"
swift scripts/create-icon.swift .build/AppIcon.iconset
iconutil -c icns .build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP"
printf '%s\n' "$APP"
