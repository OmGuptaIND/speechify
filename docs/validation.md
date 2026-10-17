# Initial validation

The canonical checkout is `/Users/omg/Desktop/Speechify`.

## Automated checks

`make check` passed: Ruff lint and formatting, 8 Python tests, Prettier, TypeScript,
2 segment-mapping tests and the production extension build. Python tests cover
request authentication, origin restrictions, input limits, busy-worker responses,
UTF-16 word offsets, expanded numbers, cancellation and idle-worker retirement.
The current Starlette test client emits one non-fatal upstream httpx deprecation warning.

The built manifest, its referenced entry points, icon dimensions, shell syntax,
and ignored runtime/build/dependency files were also checked.

## Live local verification

The actual React sidebar ran against the real Python service and Bella model
through the standalone preview. Tested playback, model-backed word highlights on
the original page, pause retaining a word, speed control, saved passages, voice
selection, focus dimming, Stop cleanup and clicking an original-page heading to
seek. Browser console inspection found no errors during these checks. Playback
was muted while testing. A real model worker also handled a terminal interrupt
without a traceback and then exited through its parent’s normal shutdown path.

A real-model numeric sentence checked that every returned word interval was
ordered, fell within the WAV duration, and mapped back to its original UTF-16
source range. This included `$80` and `2026.`. Local evidence is under
`.data/output/alignment-smoke.json` and `.data/screenshots/` and is not committed.

The browser preview also reflowed without horizontal overflow when its viewport
narrowed. This is not a claim of installed Chrome extension validation. Unpacked
installation, Chrome service-worker lifecycle, Comet support, representative X
pages, Kindle, PDFs and long-session thermal/battery behavior remain to be tested.
