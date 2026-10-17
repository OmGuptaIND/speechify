import hashlib
import json

import pytest

from speechify_backend import desktop, download
from speechify_backend.config import Settings


@pytest.fixture
def tiny_models(tmp_path, monkeypatch):
    source = tmp_path / "previous" / "models"
    source.mkdir(parents=True)
    contents = {"engine.onnx": b"test model", "voices.bin": b"test voices"}
    checksums = {name: hashlib.sha256(value).hexdigest() for name, value in contents.items()}
    monkeypatch.setattr(download, "FILES", checksums)
    for name, value in contents.items():
        (source / name).write_bytes(value)
    return source


def test_import_copies_verified_models_and_reuses_them_offline(tmp_path, tiny_models, monkeypatch):
    def no_network(*args, **kwargs):
        raise AssertionError("Import and verified reuse must not use the network.")

    monkeypatch.setattr(download.urllib.request, "urlopen", no_network)
    target = tmp_path / "new" / "models"
    download.install(target, source=tiny_models)
    download.install(target)
    assert {p.name for p in target.iterdir()} == set(download.FILES)
    assert not list(target.glob("*.part"))
    assert tiny_models.is_dir()


def test_migration_preserves_pairing_and_preferences_without_linking_source(
    tmp_path, tiny_models, monkeypatch
):
    previous = tiny_models.parent
    (previous / "backend.key").write_text("a-previous-connection-key-at-least-24-characters")
    (previous / "desktop.json").write_text(
        json.dumps(
            {
                "voice": "af_nicole",
                "rate": 1.3,
                "autoStart": True,
                "onboardingComplete": True,
                "trackedFolders": [str(tiny_models), str(tmp_path / "other-models")],
            }
        )
    )
    stopped = []
    monkeypatch.setattr(
        "speechify_backend.control.stop", lambda settings: stopped.append(settings.data_dir)
    )
    settings = Settings(data_dir=tmp_path / "app-support")
    desktop.migrate(previous, settings)
    assert stopped == [previous]
    assert (settings.data_dir / "backend.key").stat().st_mode & 0o777 == 0o600
    saved = json.loads((settings.data_dir / "desktop.json").read_text())
    assert saved["voice"] == "af_nicole"
    assert saved["onboardingComplete"] is False
    assert saved["trackedFolders"] == [str(tmp_path / "other-models")]
    assert all(not p.is_symlink() for p in settings.models_dir.iterdir())
    # Validate all files before stopping the previous reader.
    (tiny_models / "engine.onnx").write_bytes(b"corrupt")
    with pytest.raises(RuntimeError, match="verified voice files"):
        desktop.migrate(previous, Settings(data_dir=tmp_path / "another-install"))
    assert len(stopped) == 1
