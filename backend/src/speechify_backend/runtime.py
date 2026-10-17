"""Process ownership for foreground and double-click launches on macOS/Linux."""

import fcntl
import os
from contextlib import contextmanager

from .config import Settings


@contextmanager
def backend_lock(settings: Settings):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    path = settings.data_dir / "backend.lock"
    with path.open("a+") as lock:
        path.chmod(0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(
                "Speechify is already running. Use Start Speechify to reconnect."
            ) from None
        try:
            lock.seek(0)
            lock.truncate()
            lock.write(str(os.getpid()))
            lock.flush()
            yield
        finally:
            lock.seek(0)
            lock.truncate()
            fcntl.flock(lock, fcntl.LOCK_UN)


def running_pid(settings: Settings) -> int | None:
    """Return the lock owner's PID, 0 during startup, or None after shutdown.

    The file's existence is never evidence of a running server. The OS releases
    the lock even after a crash, so stale files do not cause stale-PID signals.
    """
    path = settings.data_dir / "backend.lock"
    try:
        lock = path.open("r+")
    except FileNotFoundError:
        return None
    with lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            try:
                return int(lock.read())
            except ValueError:
                return 0
        else:
            fcntl.flock(lock, fcntl.LOCK_UN)
            return None
