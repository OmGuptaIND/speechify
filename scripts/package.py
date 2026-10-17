"""Package already-built browser extensions. No model, key or local history is included."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "extension/package.json").read_text())["version"]
destination = root / ".data/releases"
destination.mkdir(parents=True, exist_ok=True)

for build, name in (("dist", "sidebar"), ("dist-portable", "floating")):
    source = root / "extension" / build
    if not (source / "manifest.json").exists():
        raise SystemExit("Build the extension first with make extension.")
    archive = destination / f"speechify-{version}-{name}.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
        for path in sorted(source.rglob("*")):
            if (
                path.is_file()
                and path.suffix != ".map"
                and not path.name.startswith("preview")
            ):
                bundle.write(path, f"speechify-{name}/{path.relative_to(source)}")
        bundle.writestr(
            "INSTALL.txt",
            "Speechify local reader\n\n"
            "1. Start the Python companion on your Mac using Start Speechify.command.\n"
            "2. Extract this ZIP. Open your Chromium browser's Extensions page.\n"
            "3. Enable Developer mode, choose Load unpacked and select the speechify folder.\n"
            "4. Click the extension on an ordinary webpage, paste the connection key once, then Play.\n\n"
            "Sidebar: native side panel on browsers that support chrome.sidePanel.\n"
            "Floating: separate reader window without the sidePanel permission.\n"
            "Install only one variant per browser profile. The backend is a separate local installation.\n"
            "No subscription or cloud API is required. Internet is needed for initial dependency/model downloads.\n"
            "PDF viewers, protected content and cross-origin frames may not expose readable text.\n",
        )
    print(archive)
