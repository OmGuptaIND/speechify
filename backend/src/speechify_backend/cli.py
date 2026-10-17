"""Read with Bella using one CPU inference job and at most one chunk ahead."""

import argparse
import fcntl
import json
import os
import re
import resource
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .config import Settings

# Set numerical-library defaults before importing numpy or ONNX Runtime.
for variable in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ[variable] = "2"

SETTINGS = Settings()
ROOT = SETTINGS.data_dir
SAMPLE = (
    "Hello. This is Bella, speaking from your own MacBook. "
    "You can listen at your own pace and come back to any sentence you like. "
    "The computer only needs to prepare a little audio ahead of you. "
    "While that audio plays, the voice model can rest. "
    "A familiar voice, a comfortable speed, and a clear place on the page "
    "can make an article easier to follow."
)
CHUNK_CHARACTERS = 240
MAX_CHARACTERS = 100_000


def chunks(text):
    """Prefer paragraph and sentence boundaries; bound long sentences by words."""
    for paragraph in re.split(r"\n\s*\n", text):
        pending = ""
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph.strip()):
            for word in sentence.split():
                if pending and len(pending) + len(word) + 1 > CHUNK_CHARACTERS:
                    yield pending
                    pending = ""
                pending = (pending + " " + word).strip()
            if len(pending) >= CHUNK_CHARACTERS * 0.6:
                yield pending
                pending = ""
        if pending:
            yield pending


def arguments():
    parser = argparse.ArgumentParser(
        description="Bella, running locally with conservative CPU settings."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--clipboard", action="store_true", help="Read the text you copied on this Mac."
    )
    source.add_argument("--file", type=Path, help="Read a UTF-8 text file.")
    source.add_argument("--text", help="Read the supplied text.")
    source.add_argument("--sample", action="store_true", help="Generate a short sample.")
    parser.add_argument(
        "--play", action="store_true", help="Play with macOS audio as chunks become ready."
    )
    parser.add_argument(
        "--speed", type=float, default=1.0, help="Voice generation speed, 0.5 to 2.0 (default 1.0)."
    )
    parser.add_argument("--output", type=Path, help="Save the spoken audio as a WAV file.")
    parser.add_argument("--stats", type=Path, help="Also save measured runtime statistics as JSON.")
    return parser.parse_args()


def read_input(args):
    if args.clipboard:
        text = subprocess.run(
            ["/usr/bin/pbpaste"], capture_output=True, text=True, check=True
        ).stdout
    elif args.file:
        if args.file.stat().st_size > MAX_CHARACTERS * 4:
            raise ValueError("Please select a shorter text file for this lightweight reader.")
        text = args.file.read_text(encoding="utf-8")
    elif args.text is not None:
        text = args.text
    else:
        text = SAMPLE
    if not text.strip():
        raise ValueError("Copy some article text first, then run Read with Bella again.")
    if len(text) > MAX_CHARACTERS:
        raise ValueError("Please copy a section of the document rather than the whole book.")
    if not 0.5 <= args.speed <= 2:
        raise ValueError("Choose a speed between 0.5 and 2.0.")
    return text


def load_engine():
    from .worker import load_engine as create_engine

    return create_engine(str(SETTINGS.models_dir), SETTINGS.threads)


def main():
    args = arguments()
    text = read_input(args)
    # Only this process gets lower scheduling priority. No system setting changes.
    os.nice(10)
    ROOT.joinpath("output").mkdir(exist_ok=True)
    lock = ROOT.joinpath(".bella.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ValueError(
            "Bella is already running. Stop that reading before starting another."
        ) from None

    import soundfile as sf

    start = time.perf_counter()
    cpu_start = resource.getrusage(resource.RUSAGE_SELF)
    print("Loading Bella · CPU only · 2 inference threads", flush=True)
    engine = load_engine()
    loaded = time.perf_counter()
    pieces = list(chunks(text))
    output = (args.output or ROOT / "output/latest.wav").resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    total_audio = 0.0
    generation_seconds = 0.0
    first_audio_seconds = None
    player = None
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="bella-one-job")
    future = None
    stopped = False

    def generate(piece):
        began = time.perf_counter()
        audio, rate = engine.create(piece, voice="af_bella", speed=args.speed, lang="en-us")
        return audio, rate, time.perf_counter() - began

    print("Press Control-C to stop." if args.play else "Generating speech…", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="bella-") as temporary:
            with sf.SoundFile(
                output, mode="w", samplerate=24000, channels=1, subtype="PCM_16"
            ) as recording:
                future = pool.submit(generate, pieces[0])
                for index in range(len(pieces)):
                    audio, rate, elapsed = future.result()
                    if rate != 24000:
                        raise RuntimeError("Unexpected audio sample rate.")
                    if first_audio_seconds is None:
                        first_audio_seconds = time.perf_counter() - start
                    generation_seconds += elapsed
                    total_audio += len(audio) / rate
                    recording.write(audio)
                    recording.flush()
                    if args.play:
                        wav = Path(temporary) / f"chunk-{index}.wav"
                        sf.write(wav, audio, rate, subtype="PCM_16")
                    # Exactly one following chunk may be prepared during playback.
                    if index + 1 < len(pieces):
                        future = pool.submit(generate, pieces[index + 1])
                    else:
                        future = None
                    print(
                        f"{'Reading' if args.play else 'Prepared'} section {index + 1}/{len(pieces)}",
                        flush=True,
                    )
                    if args.play:
                        player = subprocess.Popen(["/usr/bin/afplay", str(wav)])
                        try:
                            if player.wait() != 0:
                                raise RuntimeError("macOS could not play the audio.")
                        finally:
                            if player.poll() is None:
                                player.terminate()
                                player.wait()
                            player = None
                            wav.unlink(missing_ok=True)
    except KeyboardInterrupt:
        stopped = True
        print("\nStopping Bella…", flush=True)
    finally:
        if player is not None and player.poll() is None:
            player.terminate()
            player.wait()
        if future is not None:
            future.cancel()
        # An in-flight short chunk finishes; no further inference is started.
        pool.shutdown(wait=True, cancel_futures=True)

    end_usage = resource.getrusage(resource.RUSAGE_SELF)
    wall_seconds = time.perf_counter() - start
    cpu_seconds = (end_usage.ru_utime + end_usage.ru_stime) - (
        cpu_start.ru_utime + cpu_start.ru_stime
    )
    peak_bytes = end_usage.ru_maxrss if sys.platform == "darwin" else end_usage.ru_maxrss * 1024
    stats = {
        "voice": "af_bella",
        "provider": "CPUExecutionProvider",
        "inference_threads": 2,
        "spin_wait": False,
        "model": "int8",
        "characters": len(text),
        "chunks": len(pieces),
        "stopped": stopped,
        "load_seconds": round(loaded - start, 3),
        "first_audio_seconds": round(first_audio_seconds, 3)
        if first_audio_seconds is not None
        else None,
        "generation_seconds": round(generation_seconds, 3),
        "audio_seconds": round(total_audio, 3),
        "generation_speed_multiple": round(total_audio / generation_seconds, 2)
        if generation_seconds
        else None,
        "total_wall_seconds": round(wall_seconds, 3),
        "cpu_seconds": round(cpu_seconds, 3),
        "peak_process_memory_mb": round(peak_bytes / 1e6, 1),
        "output": str(output),
    }
    if args.stats:
        args.stats.parent.mkdir(parents=True, exist_ok=True)
        args.stats.write_text(json.dumps(stats, indent=2) + "\n")
    print(json.dumps(stats, indent=2), flush=True)
    print("Bella has stopped. The model is released when this process exits.", flush=True)
    return 130 if stopped else 0


def entrypoint():
    try:
        sys.exit(main())
    except (ValueError, OSError, RuntimeError) as error:
        print(f"Bella: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    entrypoint()
