# Standalone Mac app

Speechify 0.2.0 is a native SwiftUI app with a bundled reader runtime and prebuilt
Chrome extension. The installed app needs no project folder, Python, Node.js, uv,
Homebrew, Xcode or Terminal. This build targets Apple Silicon and macOS 14+.

## Install and set up

Open the DMG, drag Speechify into Applications, quit an older copy, then open
Speechify from Applications. Choose Prepare this Mac to download about 142 MB of
verified Kokoro voice files. Setup displays download progress and can be retried.
Speech generation works offline afterwards. Chrome's unpacked installation and
pairing confirmation remain manual, guided from Browser setup.

Import previous setup accepts the old project folder, its .data folder, or its
models folder. It validates both model hashes before stopping the old reader,
then copies voices and available settings/key. Existing destination preferences
and key are preserved. Original source files are kept. Tracked folders inside the
old data directory are omitted so the new app does not depend on that directory.

## Storage and lifecycle

User data is in `~/Library/Application Support/Speechify`:

- `models/`: verified engine and shared voice pack.
- `BrowserExtension/`: stable unpacked extension path across app moves/updates.
- `desktop.json`: preferences and explicitly tracked model folders.
- `backend.key`: pairing key, mode 0600; never packaged into the app.
- `desktop-service.log`: truncated on each reader start, mode 0600.

The app contains the reader in `Contents/Helpers/Reader.app`, with CPython,
ONNX Runtime, eSpeak/phonemizer, soundfile and certificate data. Its entry point
calls multiprocessing.freeze_support before dispatching app or worker code.
The app starts this helper directly with loopback authentication and owns its
child process. One inference worker, two threads, bounded text chunks and the
three-minute idle unload remain in force. App and browser share that one service.
A long app path uses a short, private phonemizer-data copy cleaned by the worker's
multiprocessing finalizer. No system speech library is needed.

No login service is installed. Quitting stops the app's owned reader. A reader
started elsewhere is only stopped after Manage here or an explicit import.
Removing or updating the app leaves user data intact. Browser bookmarks remain
in Chrome's local extension storage. Changing the unpacked extension path can
change its browser identity; export or retain the old extension's saved passages
before removing it. Importing app settings does not migrate Chrome profile data.

## Reading and model inventory

Listen splits pasted text (up to 50,000 characters) into sections of at most
240 UTF-16 units. AVAudioPlayer plays a section in memory and uses actual model
word timings. Pause/resume, section navigation and speed changes remain local.
The desktop adds no prefetch or persistent audio cache. Browser original-page
highlighting stays in the extension.

Voice library measures actual file sizes and allocated bytes. Bella, Heart and
Nicole share the same engine/pack, counted once. Other folders are opt-in,
read-only inventories; other inference engines are not enabled automatically.
The scanner skips symlinks, hidden files, package contents and partial downloads,
bounds depth/entry counts, and deduplicates overlapping roots. Allocation sums
are not exclusive physical-byte measurements for APFS clones/hard links.

The extension reports only its version through authenticated /v1/companion while
its paired reader is visible. Presence expires after 75 seconds; URLs, page text
and reading history are not reported. No additional browser permission is added.

## Build and release

Developers run `make macos` or `make installer`. Build dependencies are managed
with uv's locked packaging group and npm's lockfile. All generated files live in
`.data/`, including the frozen runtime, Swift outputs, app and DMG. The app bundle
contains no source-checkout pointer, model weights, keys or development previews.
Third-party copyright/license metadata is included under Resources.

The current personal installer is ad hoc signed and verified locally. The
available Apple Development identity is not a Developer ID distribution identity.
Public Internet distribution still needs Developer ID signing/notarization;
set SPEECHIFY_CODESIGN_IDENTITY for a suitable release identity. Notarization
submission/stapling is a separate release action. There is no automatic updater.

## Verification

`make check` includes model-free Swift tests on macOS. Normal CI never downloads
models. It checks asset relocation and updates, Unicode chunking, storage
accounting, verified import/reuse and migration, plus the existing backend and
extension tests.

The explicit `scripts/test-standalone.py` real-model check copies the built app
into a temporary Applications directory with spaces in its path, denies reads
from the repository, uv and Homebrew, and removes the temporary previous setup
before native testing. It tests first-run HTTPS downloads, then blocks external
network access while native setup publishes the extension, starts the bundled
reader, requests Bella audio, decodes WAV/timings and stops the child. Evidence
is saved in `.data/output/standalone-smoke.json`. `--reuse-models` skips network
downloads for later iterations. Native `--check-installation`, `--support-dir`
and `--port` switches exist for isolated packaging QA, not ordinary onboarding.
