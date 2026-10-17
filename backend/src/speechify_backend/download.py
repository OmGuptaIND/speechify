"""Download the upstream ONNX release and verify its published SHA-256 digests."""

import hashlib
import urllib.request

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


def main():
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        destination = DIRECTORY / name
        if destination.exists() and digest(destination) == expected:
            print(f"Already verified: {name}", flush=True)
            continue
        pending = destination.with_suffix(destination.suffix + ".part")
        print(f"Downloading {name} from the upstream release…", flush=True)
        try:
            with urllib.request.urlopen(RELEASE + name, timeout=60) as source:
                with pending.open("wb") as target:
                    while data := source.read(1024 * 1024):
                        target.write(data)
            if digest(pending) != expected:
                raise RuntimeError(f"The checksum does not match for {name}.")
            pending.replace(destination)
            print(f"Verified: {name} ({destination.stat().st_size / 1e6:.1f} MB)", flush=True)
        finally:
            pending.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
