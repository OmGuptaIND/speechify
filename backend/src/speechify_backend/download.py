"""Download the upstream ONNX release and verify its published SHA-256 digests."""

import argparse
import fcntl
import hashlib
import shutil
import urllib.request
from pathlib import Path

from .config import Settings

DIRECTORY = Settings().models_dir
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
FILES = {
    "kokoro-v1.0.int8.onnx": "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def install(directory: Path, source: Path | None = None):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory.parent / "downloads.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        _install(directory, source)


def _install(directory, source):
    for name, expected in FILES.items():
        destination = directory / name
        if destination.exists() and digest(destination) == expected:
            print(f"Already verified: {name}", flush=True)
            continue
        pending = destination.with_suffix(destination.suffix + ".part")
        try:
            previous = source / name if source else None
            if previous and previous.is_file() and digest(previous) == expected:
                print(f"Copying verified file: {name}", flush=True)
                shutil.copyfile(previous, pending)
            else:
                print(f"Downloading {name} from the upstream release…", flush=True)
                with urllib.request.urlopen(RELEASE + name, timeout=60) as response:
                    received = 0
                    total = int(response.headers.get("Content-Length", "0"))
                    with pending.open("wb") as target:
                        while data := response.read(1024 * 1024):
                            target.write(data)
                            received += len(data)
                            if received // (8 * 1024 * 1024) != (received - len(data)) // (
                                8 * 1024 * 1024
                            ):
                                suffix = f" / {total / 1e6:.1f} MB" if total else " MB"
                                print(f"{name}: {received / 1e6:.1f}{suffix}", flush=True)
            if digest(pending) != expected:
                raise RuntimeError(f"The checksum does not match for {name}.")
            pending.replace(destination)
            print(f"Verified: {name} ({destination.stat().st_size / 1e6:.1f} MB)", flush=True)
        finally:
            pending.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-from", type=Path, help="Reuse verified files from this folder.")
    args = parser.parse_args()
    install(DIRECTORY, source=args.import_from)


if __name__ == "__main__":
    main()
