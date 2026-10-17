import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path


def project_data() -> Path:
    configured = os.environ.get("SPEECHIFY_DATA_DIR")
    return (
        Path(configured).expanduser().resolve()
        if configured
        else Path(__file__).resolve().parents[3] / ".data"
    )


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=project_data)
    threads: int = 2
    idle_seconds: int = 180
    port: int = 8767
    preview: bool = False

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def models_ready(self) -> bool:
        return all(
            (self.models_dir / name).is_file()
            for name in ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin")
        )


def connection_key(settings: Settings) -> str:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    path = settings.data_dir / "backend.key"
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        key = path.read_text().strip()
        if len(key) < 24:
            raise RuntimeError(
                "The local connection key is invalid. Remove .data/backend.key to regenerate it."
            )
        path.chmod(0o600)
        return key
    key = secrets.token_urlsafe(32)
    with os.fdopen(descriptor, "w") as destination:
        destination.write(key + "\n")
    return key
