#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
swift build -c release
# Keep build artifacts out of Spotlight's application results.
APP="$PWD/.build/distribution.noindex/Faktúry.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/Faktury "$APP/Contents/MacOS/Faktury"
rm -rf "$APP/Contents/Resources/Faktury_Faktury.bundle"
cp packaging/Info.plist "$APP/Contents/Info.plist"
swift scripts/create-icon.swift .build/AppIcon.iconset
iconutil -c icns .build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep --sign - "$APP"
printf '%s\n' "$APP"
