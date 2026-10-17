# Initial validation

The canonical checkout is `/Users/omg/Desktop/Speechify`.

Actual unpacked Chrome and Comet acceptance was subsequently completed on
2026-10-16. See [installed-browser acceptance](browser-acceptance.md) for the
tested flow and limits; the preview-only results below describe the earlier checks.

## Automated checks

`make check` passed: Ruff lint and formatting, 13 Python tests, Prettier, TypeScript,
8 extension tests and both production extension builds. Python tests cover
request authentication, origin restrictions, input limits, busy-worker responses,
UTF-16 word offsets, expanded numbers, cancellation, idle-worker retirement,
process ownership/stale PID safety, and the companion presence integration.
Extension tests cover chunk offsets, sidebar feature detection/rejection,
portable opening, window reuse/recreation, fast repeated clicks, source-tab
retention, selected-text routing and restricted-page errors.
The current Starlette test client emits one non-fatal upstream httpx deprecation warning.

The built manifests, referenced entry points, icon dimensions, shell syntax,
and ignored runtime/build/dependency files were also checked. Both release ZIPs
passed integrity checks and omit model files, keys, preview pages and source maps.

## Native Mac app validation · October 16, 2026

The 0.2.0 standalone app passed a full install check from a copied temporary
Applications folder with a long path and spaces. Its sandbox denied all reads
from the repository, uv's Python installation and Homebrew. The frozen helper
verified its bundled interpreter, speech libraries, phonemizer and CA bundle;
downloaded both real voice files over HTTPS; migrated a prior setup; and removed
that prior setup before native testing. External network access was then blocked.
The native app published its unpacked extension, started its own frozen reader,
requested/decoded 5.61 seconds of Bella audio with 13 model-aligned words, and
stopped its owned service. No new stopped-worker phonemizer caches remained.
All bundle symlinks resolved inside the copied app, and strict/deep code-signing
verification passed. Local evidence: `.data/output/standalone-smoke.json`.

The model-free checks now include three Swift tests and thirteen Python tests;
the two optional older real-reader Swift checks are skipped by default. The
release is an Apple Silicon drag-to-Applications DMG. It is ad hoc signed for
personal installation, without Developer ID notarization. Public distribution
and installation on other macOS versions have not been validated.

Initial 0.1.0 app validation:

The native SwiftUI target builds in debug and release. `make check` now includes
the model-free native build/tests on macOS. Native tests check Unicode-bounded
text chunks, symlink exclusion, partial-download exclusion and nested-folder
deduplication. `SPEECHIFY_REAL_SMOKE=1 make macos-check` passed all four tests,
including real Bella WAV decoding and model word timing/source-offset checks.
An isolated reader on loopback port 18767 started through uv, authenticated, and
stopped through its owned parent process without touching the existing service.

The app was exercised through native UI automation: all four onboarding screens,
Bella playback, a two-section pasted passage, pause, Stop, and the model inventory.
The inventory reported 142.3 MB of model files / 146.8 MB allocated on disk on this
Mac, counting the engine and shared voice pack once. Dark-mode contrast was
adjusted after visual review. Chrome installation remains manual and has not been
performed as part of these source changes. No installed-extension or Comet
connection verification is claimed by these native checks.

## Live local verification

The actual React sidebar ran against the real Python service and Bella model
through the standalone preview. Tested playback, model-backed word highlights on
the original page, pause retaining a word, speed control, saved passages, voice
selection, focus dimming, Stop cleanup and clicking an original-page heading to
seek. Browser console inspection found no errors during these checks. Playback
was muted while testing. A real model worker also handled a terminal interrupt
without a traceback and then exited through its parent’s normal shutdown path.

The managed launcher was exercised with an isolated data directory and the real
model: Start, repeated Start retaining the same PID, authenticated Bella speech,
and Stop releasing the service. A 45-character sentence produced 3.28 seconds of
audio in 1.13 seconds, with ten model-aligned words. The pairing key was absent
from the background log. Evidence: `.data/output/control-smoke.json`.

The updated UI also completed a real muted reading session in the local preview,
jumped from a click on the original page, paused with the word highlight intact,
handled an empty selected-text request, and recovered the previous place when
refreshing. No console warnings/errors were captured. The screenshot is
`.data/screenshots/portable-reader-preview.png`; it is a local UI preview, not
an installed portable extension.

A real-model numeric sentence checked that every returned word interval was
ordered, fell within the WAV duration, and mapped back to its original UTF-16
source range. This included `$80` and `2026.`. Local evidence is under
`.data/output/alignment-smoke.json` and `.data/screenshots/` and is not committed.

The browser preview also reflowed without horizontal overflow when its viewport
narrowed. The preview alone does not establish installed-extension compatibility.
Installed Chrome and Comet results are recorded separately above. Browser restart,
representative X pages, Kindle, PDFs and long-session thermal/battery behavior
remain to be tested.
