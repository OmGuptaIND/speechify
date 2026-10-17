# Architecture

The extension and backend are separate applications with a small JSON API boundary.
The UI owns the reading session; the backend owns synthesis and model lifetime.

```mermaid
flowchart LR
  Page[Original webpage] <--> Content[Active-tab content script]
  Content <--> Panel[React Chrome sidebar]
  Panel <--> API[Python API on loopback]
  API --> Worker[One disposable CPU worker]
  Worker --> Model[Local Kokoro ONNX + Bella]
```

## Backend

`config.py` defines paths and the resource budget. `app.py` exposes health, voices,
and speech endpoints using FastAPI. `service.py` schedules a single process worker;
`worker.py` is the only service module that loads ONNX. A disconnected browser does
not release the busy slot until its in-flight inference actually finishes.

The worker loads lazily, uses two inference threads with spinning disabled, and
exits after 180 idle seconds. Exiting the worker releases its model and allocator
memory. Stopping playback prevents new browser requests; an already-running small
chunk finishes. This is bounded work, not immediate interruption of an ONNX call.
These are resource settings, not hard system-wide CPU or RAM quotas.

`download.py` downloads two files from the upstream kokoro-onnx release and verifies
published SHA-256 digests. `cli.py` preserves the clipboard-reading workflow.
The local HTTP service is not a cloud service or a login daemon.

## API

- `GET /v1/health`: installation and worker status, without private content.
- `GET /v1/voices`: authenticate the connection key and enumerate the three voices.
- `POST /v1/speech`: authenticated `{text, voice}`; maximum 240 characters.

Speech returns a WAV encoded in base64, duration, and word timestamps. `start_char`
and `end_char` use **UTF-16 code units**, matching JavaScript strings and DOM Range.
`start` and `end` use seconds in the generated audio at normal playback speed.
The browser adjusts playbackRate, so highlighting continues to follow currentTime.
Status 409 means the single worker is busy; the extension retries with a short,
bounded delay. No text or audio is persisted by the service or written to access logs.

Speech requests require a random key in `.data/backend.key` (mode 0600). The
extension keeps it in trusted extension-local storage. CORS accepts extension
origins; normal web origins are rejected. The standalone preview origin is allowed
only when the backend is explicitly launched with `--preview`.

## Alignment

Each original non-whitespace token is phonemized, and its phoneme interval is
recorded before synthesis. The model's duration output supplies actual phoneme
times. Those intervals are grouped back into original word spans; an expanded
number remains associated with the number written on the page. Mismatched timing
sequences produce an error instead of a fabricated words-per-second animation.

Per-token phonemization can affect context-sensitive pronunciation and cadence.
Timing accuracy and voice quality need further long-form listening on diverse
documents. This is not a claim of equivalence to Speechify on every webpage.

## Extension

- `background.ts`: toolbar/context-menu entry points and active-tab injection.
- `lib/reader.ts`: original text-node mapping, CSS Custom Highlights, click-to-seek.
- `lib/segments.ts`: sentence-aware, bounded chunks retaining source offsets.
- `lib/player.ts`: audio, timing synchronization, pause/seek, six-item memory cache
  and one-chunk prefetch.
- `lib/platform.ts`: Chrome storage/tab messaging, plus the local preview adapter.
- `panel/`: accessible React controls and product styling.

No persistent all-sites host permission is requested. The only declared persistent
host is the local backend. Reading is activated by a toolbar click or selection
context menu. Browser-restricted pages and cross-origin frames remain restricted.

Website text is never wrapped or replaced. DOM Range and CSS Custom Highlights
paint it in place. Dynamic sites can invalidate stored node ranges; refresh the
captured page if the site replaces its content. The first version captures loaded
text and does not drive infinite scrolling, book-page turning or OCR.
