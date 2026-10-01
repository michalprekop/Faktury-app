#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# CLT builds the application; Xcode supplies the XCTest framework and runner.
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
TEST_PLATFORM=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer
swift test -Xswiftc -F -Xswiftc "$TEST_PLATFORM/Library/Frameworks" -Xswiftc -I -Xswiftc "$TEST_PLATFORM/usr/lib" -Xlinker "-F$TEST_PLATFORM/Library/Frameworks" -Xlinker "-L$TEST_PLATFORM/usr/lib" -Xlinker -rpath -Xlinker "$TEST_PLATFORM/Library/Frameworks" -Xlinker -rpath -Xlinker "$TEST_PLATFORM/usr/lib"
/Applications/Xcode.app/Contents/Developer/usr/bin/xctest .build/debug/INVOYPackageTests.xctest
