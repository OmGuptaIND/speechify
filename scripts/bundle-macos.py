"""Assemble a relocatable Mac app with a frozen reader and prebuilt extension."""

import hashlib
import importlib.metadata
import os
import plistlib
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[1]
binary = Path(sys.argv[1]) / "SpeechifyDesktop"
destination = root / ".data/standalone"
destination.mkdir(parents=True, exist_ok=True)
bundle = destination / "Speechify.app"
staging = destination / (".Speechify-" + uuid.uuid4().hex + ".app")
contents = staging / "Contents"
(contents / "MacOS").mkdir(parents=True)
resources = contents / "Resources"
resources.mkdir()
shutil.copy2(binary, contents / "MacOS/SpeechifyDesktop")
with (root / "macos/Info.plist").open("rb") as source:
    info = plistlib.load(source)
with (contents / "Info.plist").open("wb") as target:
    plistlib.dump(info, target)
shutil.copy2(root / ".data/macos-icon/Speechify.icns", resources / "Speechify.icns")
service = root / ".data/frozen/SpeechifyReader.app"
if not (service / "Contents/MacOS/SpeechifyService").is_file():
    raise SystemExit("Build the frozen service before assembling the Mac app.")
shutil.copytree(service, contents / "Helpers/Reader.app", symlinks=True)
shutil.copytree(
    root / "extension/dist",
    resources / "BrowserExtension",
    ignore=shutil.ignore_patterns("*.map", "preview*"),
)
fingerprint = hashlib.sha256()
for path in sorted((resources / "BrowserExtension").rglob("*")):
    if path.is_file():
        fingerprint.update(str(path.relative_to(resources)).encode())
        fingerprint.update(path.read_bytes())
(resources / "BrowserExtension/build-id.txt").write_text(fingerprint.hexdigest() + "\n")

notices = resources / "ThirdPartyNotices"
notices.mkdir()
for distribution in importlib.metadata.distributions():
    name = distribution.metadata["Name"]
    folder = notices / name
    for file in distribution.files or []:
        path = Path(str(file))
        if any(part.startswith("..") for part in path.parts):
            continue
        upper = path.name.upper()
        if (
            upper.startswith(("LICENSE", "COPYING", "NOTICE"))
            or path.name == "METADATA"
        ):
            actual = Path(distribution.locate_file(file))
            if actual.is_file():
                folder.mkdir(exist_ok=True)
                target = folder / (
                    hashlib.sha256(str(file).encode()).hexdigest()[:8] + "-" + path.name
                )
                shutil.copyfile(actual, target)
python_license = (
    Path(sys.base_prefix)
    / "lib"
    / f"python{sys.version_info.major}.{sys.version_info.minor}"
    / "LICENSE.txt"
)
if python_license.is_file():
    shutil.copyfile(python_license, notices / "Python-LICENSE.txt")
(resources / "ABOUT.txt").write_text(
    "Speechify 0.2.0 · local Mac reader\n\n"
    "The reader runtime and Chrome extension are included. First-run setup downloads\n"
    "and verifies the Kokoro voice files, or imports a previous setup.\n"
    "No Python, Node.js, uv, project folder, or Terminal is needed to use this app.\n"
    "User data: ~/Library/Application Support/Speechify\n"
    "Chrome requires manual confirmation to load the bundled local extension.\n"
    "This build is for Apple Silicon Macs running macOS 14 or later.\n"
)
identity = os.environ.get("SPEECHIFY_CODESIGN_IDENTITY", "-")
subprocess.run(
    ["/usr/bin/codesign", "--force", "--deep", "--sign", identity, str(staging)],
    check=True,
)
subprocess.run(
    ["/usr/bin/codesign", "--verify", "--deep", "--strict", str(staging)], check=True
)
previous = destination / (".previous-" + uuid.uuid4().hex + ".app")
if bundle.exists():
    bundle.rename(previous)
try:
    staging.rename(bundle)
except BaseException:
    if previous.exists():
        previous.rename(bundle)
    raise
if previous.exists():
    shutil.rmtree(previous)
shortcut = root / "Speechify.app"
if shortcut.is_symlink() or not shortcut.exists():
    shortcut.unlink(missing_ok=True)
    shortcut.symlink_to(".data/standalone/Speechify.app")
print(bundle)
