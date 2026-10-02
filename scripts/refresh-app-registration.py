#!/usr/bin/env python3
"""Keep Launch Services pointed at the installed INVOY, not old build copies."""

import plistlib
import re
import subprocess
from pathlib import Path


APP = Path.home() / "Applications/INVOY.app"
BUNDLE_ID = "sk.faktury.desktop"
LSREGISTER = (
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/"
    "LaunchServices.framework/Support/lsregister"
)


def registrations():
    dump = subprocess.check_output([LSREGISTER, "-dump"], text=True)
    result = []
    for block in re.split(r"\n-{20,}\n", dump):
        identifier = re.search(r"^identifier:\s+(.+)$", block, re.MULTILINE)
        path = re.search(r"^path:\s+(.+?) \(0x[0-9a-f]+\)$", block, re.MULTILINE)
        if identifier and identifier.group(1).strip() == BUNDLE_ID and path:
            result.append(Path(path.group(1)))
    return result


def main():
    with (APP / "Contents/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    if info.get("CFBundleIdentifier") != BUNDLE_ID:
        raise SystemExit("Nainštalovaná aplikácia nemá očakávanú identitu INVOY.")
    icon = info.get("CFBundleIconFile", "")
    if not icon:
        raise SystemExit("Nainštalovaná aplikácia nemá nastavenú ikonu.")
    icon_path = APP / "Contents/Resources" / icon
    if not icon_path.suffix:
        icon_path = icon_path.with_suffix(".icns")
    if not icon_path.is_file():
        raise SystemExit("Ikona nainštalovanej aplikácie chýba.")

    # Unregister only this product. Files, backups and invoice data stay intact.
    for path in registrations():
        if path != APP:
            subprocess.run([LSREGISTER, "-u", str(path)], check=True)
            print(f"Odregistrovaná stará kópia: {path}")
    subprocess.run([LSREGISTER, "-f", str(APP)], check=True)
    remaining = registrations()
    if remaining != [APP]:
        raise SystemExit(f"Registrácie treba skontrolovať: {remaining}")
    print(f"Overené: jediná registrovaná aplikácia je {APP}, ikona {icon}.")


if __name__ == "__main__":
    main()
