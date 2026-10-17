"""The single disposable process that owns ONNX and the voice model."""

import base64
import io
import os
import shutil
import signal
import tempfile
import time
from multiprocessing.util import Finalize
from pathlib import Path

from .alignment import align_words, prepare_words

_engine = None
_phoneme_directory = None


def phonemizer_config():
    """Keep eSpeak's data path below its native path-buffer limit after relocation."""
    global _phoneme_directory
    import espeakng_loader
    from kokoro_onnx.config import EspeakConfig

    data = Path(espeakng_loader.get_data_path()).resolve()
    if len(os.fsencode(data)) > 120:
        if _phoneme_directory is None:
            _phoneme_directory = tempfile.TemporaryDirectory(
                prefix=f"speechify-espeak-{os.getpid()}-", dir="/tmp"
            )
            shutil.copytree(data, Path(_phoneme_directory.name) / "espeak-ng-data")
            # ProcessPool workers use os._exit; register with multiprocessing too.
            Finalize(None, _phoneme_directory.cleanup, exitpriority=10)
        data = Path(_phoneme_directory.name) / "espeak-ng-data"
    return EspeakConfig(data_path=str(data), lib_path=espeakng_loader.get_library_path())


def initialize_worker():
    # The parent handles shutdown and retires the worker through the pool. A
    # process-group signal must not bypass the worker's cleanup finalizers.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)


def load_engine(models_dir: str, threads: int = 2):
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
        os.environ[name] = str(threads)
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    options = ort.SessionOptions()
    options.intra_op_num_threads = threads
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.add_session_config_entry("session.intra_op.allow_spinning", "0")
    options.add_session_config_entry("session.inter_op.allow_spinning", "0")
    options.enable_cpu_mem_arena = False
    options.log_severity_level = 3
    model_path = Path(models_dir)
    session = ort.InferenceSession(
        str(model_path / "kokoro-v1.0.int8.onnx"),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    engine = Kokoro.from_session(
        session, str(model_path / "voices-v1.0.bin"), espeak_config=phonemizer_config()
    )
    if not engine.has_timings:
        raise RuntimeError(
            "This model has no timing output. Run speechify-download to install the verified model."
        )
    return engine


def synthesize(text: str, voice: str, models_dir: str, threads: int):
    global _engine
    import soundfile as sf

    if _engine is None:
        os.nice(10)
        _engine = load_engine(models_dir, threads)
    began = time.perf_counter()
    phonemes, spans = prepare_words(text, _engine.tokenizer)
    audio, rate, timings = _engine.create_timed(
        phonemes, voice=voice, speed=1.0, lang="en-us", is_phonemes=True
    )
    duration = len(audio) / rate
    words = align_words(phonemes, spans, timings, duration)
    destination = io.BytesIO()
    sf.write(destination, audio, rate, format="WAV", subtype="PCM_16")
    return {
        "audio": base64.b64encode(destination.getvalue()).decode("ascii"),
        "mime_type": "audio/wav",
        "sample_rate": rate,
        "duration": duration,
        "words": words,
        "alignment": "model-phonemes",
        "generation_ms": round((time.perf_counter() - began) * 1000),
    }
