import time

from fastapi.testclient import TestClient

from speechify_backend.app import create_app
from speechify_backend.config import Settings

KEY = "test-companion-key-long-enough"


def test_presence_is_authenticated_ephemeral_and_expires(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=tmp_path), key=KEY)
    headers = {"Authorization": "Bearer " + KEY}
    with TestClient(app) as client:
        assert client.get("/v1/companion").status_code == 401
        assert client.post("/v1/companion", json={"version": "0.1.0"}).status_code == 401
        assert not client.get("/v1/companion", headers=headers).json()["extension_connected"]
        assert (
            client.post("/v1/companion", headers=headers, json={"version": "0.1.0"}).status_code
            == 200
        )
        assert client.get("/v1/companion", headers=headers).json()["extension_connected"]
        now = time.monotonic()
        monkeypatch.setattr("speechify_backend.companion.time.monotonic", lambda: now + 80)
        assert not client.get("/v1/companion", headers=headers).json()["extension_connected"]
        assert not list(tmp_path.glob("*presence*"))
