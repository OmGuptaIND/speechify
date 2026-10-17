"""Explicit real-model install smoke test. Never run by model-free CI checks.

Copies the app outside the checkout, denies access to the checkout/developer tools,
tests HTTPS downloads and migration, then runs native setup/speech fully offline.
"""

import argparse
import json
import os
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--reuse-models",
    type=Path,
    help="Reuse verified model files instead of testing HTTPS downloads.",
)
args = parser.parse_args()
original_short_caches = set(Path("/private/tmp").glob("speechify-espeak-*"))
port = 18769
with socket.socket() as probe:
    probe.bind(("127.0.0.1", port))

with tempfile.TemporaryDirectory(prefix="Speechify standalone test ") as temporary:
    installed = Path(temporary) / "Applications/Speechify.app"
    shutil.copytree(root / ".data/standalone/Speechify.app", installed, symlinks=True)
    helper = installed / "Contents/Helpers/Reader.app/Contents/MacOS/SpeechifyService"
    native = installed / "Contents/MacOS/SpeechifyDesktop"
    previous = Path(temporary) / "Previous Setup"
    support = Path(temporary) / "Application Support/Speechify"
    previous.mkdir()
    support.mkdir(parents=True)
    deny = [str(root), str(Path.home() / ".local/share/uv"), "/opt/homebrew"]
    profile = "(version 1)(allow default)" + "".join(
        f"(deny file-read* (subpath {json.dumps(path)}))" for path in deny
    )
    offline = (
        profile
        + '(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))'
    )
    environment = {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "PYTHONNOUSERSITE": "1"}

    def run(executable, arguments, data, *, disconnected=False, timeout=180):
        value = subprocess.run(
            [
                "/usr/bin/sandbox-exec",
                "-p",
                offline if disconnected else profile,
                str(executable),
                *arguments,
            ],
            check=False,
            cwd=temporary,
            env={**environment, "SPEECHIFY_DATA_DIR": str(data)},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        if value.returncode:
            raise RuntimeError(value.stdout.decode(errors="replace")[-7000:])
        return value.stdout.decode(errors="replace")

    print(
        "Checking the copied runtime with checkout and developer tools blocked…",
        flush=True,
    )
    runtime = json.loads(run(helper, ["verify-runtime"], previous))
    assert runtime["frozen"] and runtime["ca_bundle_present"]
    if args.reuse_models:
        shutil.copytree(args.reuse_models, previous / "models")
        run(helper, ["download"], previous, disconnected=True)
    else:
        print("Testing the actual first-run HTTPS voice downloads…", flush=True)
        run(helper, ["download"], previous)
    (previous / "backend.key").write_text(
        "test-pairing-key-created-for-this-isolated-installation"
    )
    (previous / "desktop.json").write_text(
        json.dumps(
            {
                "onboardingComplete": False,
                "autoStart": True,
                "voice": "af_bella",
                "rate": 1,
                "trackedFolders": [],
            }
        )
    )
    print("Migrating the previous setup into independent app data…", flush=True)
    run(helper, ["migrate", str(previous)], support, disconnected=True)
    shutil.rmtree(previous)
    run(helper, ["download"], support, disconnected=True)
    print(
        "Running native setup, real Bella speech, and shutdown without internet access…",
        flush=True,
    )
    run(
        native,
        ["--support-dir", str(support), "--port", str(port), "--check-installation"],
        support,
        disconnected=True,
    )
    result = json.loads((support / "installation-check.json").read_text())
    if not all(
        result.get(key)
        for key in (
            "ready",
            "standalone",
            "runtime_in_bundle",
            "extension_ready",
            "models_ready",
            "child_stopped",
        )
    ):
        log = support / "desktop-service.log"
        raise RuntimeError(
            json.dumps(result)
            + "\n"
            + (log.read_text()[-7000:] if log.exists() else "")
        )
    assert (support / "BrowserExtension/manifest.json").is_file()
    assert (support / "backend.key").stat().st_mode & 0o777 == 0o600
    assert (
        b"SpeechifyProjectRoot" not in (installed / "Contents/Info.plist").read_bytes()
    )
    for path in installed.rglob("*"):
        if path.is_symlink():
            assert path.resolve().is_relative_to(installed.resolve()), str(path)
    subprocess.run(
        ["/usr/bin/codesign", "--verify", "--deep", "--strict", str(installed)],
        check=True,
    )
    with socket.socket() as probe:
        assert probe.connect_ex(("127.0.0.1", port)) != 0, (
            "An owned reader was left behind."
        )
    for cache in (
        set(Path("/private/tmp").glob("speechify-espeak-*")) - original_short_caches
    ):
        try:
            owner = int(cache.name.split("-")[2])
        except ValueError:
            continue
        try:
            os.kill(owner, 0)
        except ProcessLookupError:
            raise AssertionError(
                f"A stopped worker left its temporary voice data: {cache.name}"
            ) from None
    result.update(
        {
            "https_downloads_tested": args.reuse_models is None,
            "checkout_access_denied": True,
            "developer_tools_access_denied": True,
            "speech_network_disabled": True,
            "previous_setup_removed_before_native_test": True,
            "app_bytes": sum(
                path.stat().st_size
                for path in installed.rglob("*")
                if path.is_file() and not path.is_symlink()
            ),
        }
    )
    evidence = root / ".data/output/standalone-smoke.json"
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
