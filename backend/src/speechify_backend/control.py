"""Start/stop the local companion without keeping a Terminal window open."""

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

from .config import Settings, connection_key
from .runtime import running_pid


def healthy(settings: Settings) -> bool:
    try:
        opener = build_opener(ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{settings.port}/v1/health", timeout=0.5) as response:
            return json.load(response).get("app") == "speechify-local-reader"
    except (URLError, TimeoutError, ValueError, OSError):
        return False


def start(settings: Settings):
    if not settings.models_ready:
        raise RuntimeError("Run Setup Speechify.command first to download the local voices.")
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    if running_pid(settings) is None:
        if healthy(settings):
            raise RuntimeError("A reader is already using this port from another project folder.")
        log = settings.data_dir / "backend.log"
        descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        os.chmod(log, 0o600)
        with os.fdopen(descriptor, "a") as destination:
            subprocess.Popen(
                [sys.executable, "-m", "speechify_backend.app", "--quiet-key"],
                stdin=subprocess.DEVNULL,
                stdout=destination,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                env={**os.environ, "SPEECHIFY_DATA_DIR": str(settings.data_dir)},
            )
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if running_pid(settings) and healthy(settings):
            return
        time.sleep(0.2)
    raise RuntimeError("The reader did not start. Check .data/backend.log for details.")


def stop(settings: Settings):
    pid = running_pid(settings)
    if pid is None:
        return
    if pid <= 1:
        raise RuntimeError("The reader is still starting. Try Stop again in a moment.")
    # A live advisory lock proves this PID belongs to this checkout's backend.
    try:
        os.kill(pid, signal.SIGINT)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if running_pid(settings) is None:
            return
        time.sleep(0.2)
    raise RuntimeError("The reader is still finishing its current passage. Try Stop again shortly.")


def main():
    parser = argparse.ArgumentParser(description="Manage the local Speechify companion.")
    parser.add_argument("action", choices=["start", "stop", "status"])
    parser.add_argument("--copy-key", action="store_true", help="Copy the pairing key on macOS.")
    args = parser.parse_args()
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # Serialize repeated double-clicks, including concurrent start/stop requests.
    import fcntl

    try:
        with (settings.data_dir / "control.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.action == "stop":
                stop(settings)
                print("Speechify stopped. Bella and the local service have released their memory.")
            elif args.action == "status":
                if running_pid(settings) is not None:
                    print(
                        "Speechify is running."
                        if healthy(settings)
                        else "Speechify is starting or stopping."
                    )
                else:
                    print("Speechify is stopped.")
            else:
                start(settings)
                key = connection_key(settings)
                if args.copy_key and shutil.which("pbcopy"):
                    subprocess.run(["pbcopy"], input=key.encode(), check=True)
                    print(
                        "Your connection key is copied. Paste it into the extension once per browser."
                    )
                else:
                    print(
                        "Your connection key (paste into the extension once per browser):\n" + key
                    )
                print("\nSpeechify is ready. Open a webpage and click the extension icon.")
                print(
                    "You can close this Terminal window. Use Stop Speechify when you are finished."
                )
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f"Speechify: {error}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
