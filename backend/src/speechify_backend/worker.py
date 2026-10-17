"""The single disposable process that owns ONNX and the voice model."""

import base64
import io
import os
import signal
import time
from pathlib import Path

from .alignment import align_words, prepare_words

_engine = None


def initialize_worker():
    # The parent owns Control-C and retires the worker through the process pool.
    signal.signal(signal.SIGINT, signal.SIG_IGN)


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
    engine = Kokoro.from_session(session, str(model_path / "voices-v1.0.bin"))
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
