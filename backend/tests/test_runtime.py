import os

import pytest

from speechify_backend.config import Settings
from speechify_backend.control import stop
from speechify_backend.runtime import backend_lock, running_pid


def test_runtime_lock_prevents_duplicate_services_and_releases_on_failure(tmp_path):
    settings = Settings(data_dir=tmp_path)
    assert running_pid(settings) is None
    with pytest.raises(ValueError), backend_lock(settings):
        assert running_pid(settings) == os.getpid()
        with pytest.raises(RuntimeError, match="already running"), backend_lock(settings):
            pass
        raise ValueError("Simulated server failure")
    assert running_pid(settings) is None


def test_stale_pid_file_does_not_signal_an_unrelated_process(tmp_path, monkeypatch):
    settings = Settings(data_dir=tmp_path)
    (tmp_path / "backend.lock").write_text(str(os.getpid()))
    monkeypatch.setattr(os, "kill", lambda *_: pytest.fail("Signaled a stale PID"))
    assert running_pid(settings) is None
    stop(settings)
