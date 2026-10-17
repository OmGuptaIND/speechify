"""Create a drag-to-Applications installer from the standalone app."""

import platform
import plistlib
import shutil
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
app = root / ".data/standalone/Speechify.app"
with (app / "Contents/Info.plist").open("rb") as source:
    version = plistlib.load(source)["CFBundleShortVersionString"]
releases = root / ".data/releases"
releases.mkdir(parents=True, exist_ok=True)
stage = root / ".data/dmg-staging"
shutil.rmtree(stage, ignore_errors=True)
stage.mkdir()
shutil.copytree(app, stage / "Speechify.app", symlinks=True)
(stage / "Applications").symlink_to("/Applications")
(stage / "Start here.txt").write_text(
    "Speechify for Mac\n\n"
    "1. Drag Speechify.app into Applications.\n"
    "2. Quit any older Speechify app, then open Speechify from Applications.\n"
    "3. Choose Prepare this Mac, or Import previous setup.\n"
    "4. Follow Browser setup to add and pair the Chrome extension.\n\n"
    "No project folder, Python, Node.js, or Terminal is needed.\n"
    "Initial setup downloads about 142 MB of verified voice files.\n"
    "After setup, local speech works offline.\n"
    "Your voices and preferences are kept in Application Support/Speechify.\n\n"
    "This personal build is locally signed, not Developer ID notarized.\n"
)
image = releases / f"Speechify-{version}-{platform.machine()}.dmg"
subprocess.run(
    [
        "/usr/bin/hdiutil",
        "create",
        "-volname",
        "Speechify",
        "-srcfolder",
        str(stage),
        "-ov",
        "-format",
        "UDZO",
        str(image),
    ],
    check=True,
)
shutil.rmtree(stage)
print(image)
