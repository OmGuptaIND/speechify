"""Commands used by the standalone Mac app's bundled service."""

import json
import os
import shutil
import sys
from pathlib import Path

from .config import Settings


def migrate(source: Path, settings: Settings):
    from .control import stop
    from .download import FILES, digest, install

    source = source.expanduser().resolve()
    if (source / ".data").is_dir():
        source = source / ".data"
    if source.name == "models":
        source = source.parent
    if source == settings.data_dir.resolve():
        raise RuntimeError("This is already the app's data folder. Choose your previous setup.")
    # Verify every source file before stopping anything or changing preferences.
    for name, expected in FILES.items():
        path = source / "models" / name
        if not path.is_file() or digest(path) != expected:
            raise RuntimeError("Choose a previous Speechify setup with both verified voice files.")
    print("Verified the previous voice files. Moving reader controls…", flush=True)
    stop(Settings(data_dir=source))
    install(settings.models_dir, source=source / "models")
    for name in ("backend.key", "desktop.json"):
        previous, destination = source / name, settings.data_dir / name
        if not previous.is_file() or destination.exists():
            continue
        if name == "backend.key" and len(previous.read_text().strip()) < 24:
            continue
        if name == "desktop.json":
            saved = json.loads(previous.read_text())
            saved["onboardingComplete"] = False
            saved["trackedFolders"] = [
                path
                for path in saved.get("trackedFolders", [])
                if not Path(path).resolve().is_relative_to(source)
            ]
            destination.write_text(json.dumps(saved))
        else:
            shutil.copyfile(previous, destination)
        destination.chmod(0o600)
    print("Your setup is copied. The previous files are unchanged.", flush=True)


def main():
    # The frozen runtime carries its own CA bundle; never use a build-machine path.
    if getattr(sys, "frozen", False):
        import certifi

        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    command = sys.argv.pop(1) if len(sys.argv) > 1 else "serve"
    if command == "serve":
        from .app import main as serve

        serve()
    elif command == "download":
        from .download import main as download

        download()
    elif command == "control" and sys.argv[1:] == ["stop"]:
        from .control import main as control

        control()
    elif command == "migrate" and len(sys.argv) == 2:
        try:
            migrate(Path(sys.argv[1]), Settings())
        except (OSError, RuntimeError, ValueError) as error:
            raise SystemExit(str(error)) from None
    elif command == "verify-runtime":
        import ssl

        import kokoro_onnx
        import onnxruntime
        import soundfile
        from kokoro_onnx.tokenizer import Tokenizer

        from .worker import phonemizer_config

        tokenizer = Tokenizer(phonemizer_config())
        phonemes = tokenizer.phonemize("Hello")

        ssl.create_default_context()
        print(
            json.dumps(
                {
                    "frozen": bool(getattr(sys, "frozen", False)),
                    "python": sys.version.split()[0],
                    "onnxruntime": onnxruntime.__version__,
                    "soundfile": soundfile.__version__,
                    "kokoro": kokoro_onnx.__name__,
                    "ca_bundle_present": Path(os.environ.get("SSL_CERT_FILE", "")).is_file(),
                    "phonemizer_ready": bool(phonemes),
                }
            )
        )
    else:
        raise SystemExit("Unknown standalone service command.")
