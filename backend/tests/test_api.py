import pytest
from fastapi.testclient import TestClient

from speechify_backend.app import create_app
from speechify_backend.config import Settings
from speechify_backend.service import BusyError

KEY = "a-test-connection-key-with-enough-characters"


class StubService:
    pool = None
    busy = False

    async def speak(self, request):
        if self.busy:
            raise BusyError
        return {"audio": "", "duration": 1, "sample_rate": 24000, "words": [], "generation_ms": 1}

    async def unload_if_idle(self):
        pass

    async def close(self):
        pass


@pytest.fixture
def client(tmp_path):
    settings = Settings(data_dir=tmp_path)
    settings.models_dir.mkdir()
    for name in ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin"):
        (settings.models_dir / name).touch()
    with TestClient(create_app(settings, service=StubService(), key=KEY)) as client:
        yield client


def test_speech_requires_the_connection_key(client):
    assert client.post("/v1/speech", json={"text": "Hello"}).status_code == 401
    assert (
        client.post(
            "/v1/speech", headers={"Authorization": "Bearer " + KEY}, json={"text": "Hello"}
        ).status_code
        == 200
    )


def test_website_origins_cannot_read_or_generate_speech(client):
    assert client.get("/v1/health", headers={"Origin": "https://example.com"}).status_code == 403
    response = client.options(
        "/v1/speech",
        headers={
            "Origin": "chrome-extension://" + "a" * 32,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"].startswith("chrome-extension://")


def test_input_and_request_size_limits(client):
    headers = {"Authorization": "Bearer " + KEY}
    for text in (" ", "a" * 241):
        assert client.post("/v1/speech", headers=headers, json={"text": text}).status_code == 422
    assert client.post("/v1/speech", headers=headers, content=b"x" * 9000).status_code == 413
    assert (
        client.post(
            "/v1/speech", headers=headers, json={"text": "Hello", "voice": "unavailable"}
        ).status_code
        == 422
    )


def test_busy_worker_returns_retryable_response(client):
    client.app.state.speech.busy = True
    response = client.post(
        "/v1/speech", headers={"Authorization": "Bearer " + KEY}, json={"text": "Hello"}
    )
    assert response.status_code == 409
    assert response.headers["retry-after"] == "1"
