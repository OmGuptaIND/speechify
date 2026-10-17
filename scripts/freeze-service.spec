# Build with: uv run --project backend --group packaging --locked pyinstaller ...
import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
datas, binaries, hidden = [], [], []
for package in ("kokoro_onnx", "espeakng_loader", "phonemizer", "certifi"):
    package_data, package_binaries, package_hidden = collect_all(package)
    datas += package_data
    binaries += package_binaries
    hidden += package_hidden

hidden += [
    "uvicorn.logging", "uvicorn.loops.auto", "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto", "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto", "uvicorn.lifespan.on",
]
a = Analysis(
    [str(root / "scripts/frozen-service.py")],
    pathex=[str(root / "backend/src")],
    binaries=binaries, datas=datas, hiddenimports=hidden,
    excludes=["pytest", "ruff", "tkinter", "matplotlib", "IPython", "torch",
              "onnxruntime.tools", "onnxruntime.quantization"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name="SpeechifyService",
    console=True, strip=False, upx=False,
    codesign_identity=os.environ.get("SPEECHIFY_CODESIGN_IDENTITY"),
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="SpeechifyService")
app = BUNDLE(
    coll, name="SpeechifyReader.app", bundle_identifier="local.speechify.reader",
    info_plist={"LSBackgroundOnly": True, "LSUIElement": True,
                "CFBundleShortVersionString": "0.2.0"},
)
