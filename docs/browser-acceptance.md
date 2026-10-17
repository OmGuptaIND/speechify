# Installed-browser acceptance — 2026-10-16

The local extension was loaded, enabled, pinned and paired in the existing Chrome
and Comet profiles on this Mac. The initial checks used actual unpacked sidebar
and floating-window builds and the real local Bella model, rather than the
standalone preview. Later source changes are distinguished below.

| Browser | Build | Extension ID |
| --- | --- | --- |
| Chrome | `extension/dist`, native sidebar, version 0.1.0 | `hhciknnlkpdfcfodbefpfcgkanhcengk` |
| Comet | `extension/dist-portable`, floating reader, version 0.1.0 | `elabkpdahnjdialioacglaocfognedlm` |

Comet already had the separate commercial **Speechify — Text to Speech** extension.
The project extension is **Speechify · Local Reader (Floating)**; its pinned purple
waveform toolbar button is titled **Read with Bella**. The commercial extension
was left unchanged.

## Reading checks

Both installed builds passed these checks on a local HTML acceptance article:

- Pair using this Mac's connection key; Bella selected by default.
- Play real speech; advance through successive sections automatically.
- Show a soft sentence highlight and a stronger word highlight on the original
  page, matching the current-passage view in the reader.
- Highlight text across bold formatting and an inline link, including `$80` and
  `2026`, without replacing article nodes or changing its markup (apart from
  the reader's temporary paragraph attributes).
- Pause with the current word retained.
- Move with Previous paragraph and Next paragraph.
- Click the original page to jump to that passage.
- Change playback speed while reading, then restore Bella at 1×.
- Capture a different article after clicking the toolbar icon there.

Chrome's Stop control cleared the original-page highlights. Comet additionally
cleared highlights when its reader closed, retained pairing and the last section after closing/reopening
the floating reader, reused that window when switching source tabs, and returned
to the correct source tab through **Return to this webpage**. Reopening restores
the saved section. Pause retained the current word; resuming from the exact audio
position was not separately observed in these installed-browser checks.

The fixture compared its article markup before and during highlighting, and logged
word changes from both browser engines. All observed article-markup comparisons
passed. Local evidence is under `.data/browser-acceptance/`, including
`highlights.jsonl` and `bella-alignment.json`; it contains no connection key and is
ignored by Git. The separate real Bella request checked that model word intervals
fit within the decoded WAV and map back to the original UTF-16 text ranges.

`make check` passed before installation: 11 Python tests, 8 extension tests,
lint/format/type checks, both extension builds and the Swift tests (the opt-in
Swift real-model test was skipped). Browser playback and the separate API request
provided the real-model checks for this session. Playback/highlight behavior was
observed; this does not constitute a subjective listening-quality assessment.

## What the Mac app knows

The authenticated `/v1/companion` handshake was verified from the installed reader.
The Mac app showed **Reader paired and open** and **Connection verified with the
open extension**. This proves that a paired reader has recently contacted the
companion, rather than merely finding a build folder on disk.

The signal is shared across browser profiles and does not identify Chrome versus
Comet. A visible paired reader sends its version every 30 seconds, and the signal
expires after 75 seconds without a heartbeat. Closing or hiding a reader can
therefore clear the indicator even though the extension remains installed. It is
not a persistent extension-installation inventory.

## Everyday flow and remaining scope

Start the companion through the Mac app or **Start Speechify.command**. Open an
article, click **Read with Bella**, and press Play. Pairing is saved independently
in each browser profile and is already complete in the tested profiles. After
navigating to a different webpage, click the icon again to capture it. In Comet,
the floating reader remains connected to its explicitly selected source tab.

These checks do not establish support for every website. Exact-word resume,
Comet's explicit Stop button, Brave, Edge, X, Kindle,
PDF viewers, protected/canvas content, cross-origin frames, browser restart and
extended thermal/battery behavior still need separate acceptance testing.

## Later edits during this session

Other work in the shared checkout added an in-page reader rail while the initial
installed-browser checks were in progress. These changes alter the default
opening behavior and are not covered by the sidebar/floating acceptance above.
Chrome was reloaded with that newer build, but its first toolbar click did not
produce a visible in-page reader. Comet's native automation connection then
timed out. A subsequent request to open Chrome's extension-management page was
blocked by the browser tool's URL policy, which permits only HTTP/HTTPS; no
alternate route was used after that rejection. The newest default UI therefore
still requires an installed-browser retest.

This session also changed the reader's health check to run once even if its view
mounts hidden, and to refresh immediately on becoming visible. This addresses a
paired reader initially showing offline until a visible periodic check. That
change passed the final `make check` (11 Python tests, 9 extension tests, both
builds and Swift checks; two opt-in Swift tests skipped), but its installed-browser
reopening check remains incomplete for the reasons above. No inference or
alignment code was changed in this session.

## Compact popover and per-item controls — later source update

The new source uses a compact in-page popover, with play buttons for X post text
and Substack Note/comment/article bodies. Model timing and audio generation are
unchanged. `make check` passed with 13 Python tests, 17 extension tests, both builds
and three native tests; the two opt-in native tests were skipped. The test harness
requires no model downloads or network-loaded iframe.

New fixture checks cover per-post isolation; article/Note/comment extraction;
original-node highlighting across formatting and links; exact selected text;
dynamic insertion, removal and recycling; the 40-button viewport bound; close
cleanup; iframe readiness and origin checks; latest-request routing; and separation
between embedded readers in different tabs and fallback windows.

The actual browser preview at `/preview-feed.html` was checked for inline target
selection, the compact layout, Details expansion/collapse and Stop. The screenshot
is `.data/screenshots/compact-post-player.png`. The preview reported the local
speech service unavailable, so these checks do not claim new audible playback or
live X/Substack compatibility. No extension was installed, reloaded or published
as part of this source update. Reload the unpacked build, refresh the website and
click the extension before performing those live checks.

### Presentation correction

The always-open branded player card was rejected by the user. Both builds now
restore the slim right-edge rail. Details open beside it only on request; the
page title and branded header are absent from the collapsed controls. Play/Pause
has fixed, nonshrinking dimensions. Per-item reading and highlighting are retained.
The local browser preview confirmed collapsed controls and Details expansion;
`make check` passed (13 Python, 17 extension and three native tests; two opt-in
native tests skipped). The screenshot is `.data/screenshots/slim-reader-restored.png`.

### Smaller controls and hover navigation

The collapsed rail now has small Play, speed and Controls actions. Voice, paragraph
navigation and Stop stay in the expanded controls. Visible copy was shortened and
decorative headings/taglines removed; inline Play uses a 12 px glyph without an
enlarging animation, and the rail glyph is 14 px.

`make check` passed with 13 Python tests, 21 extension tests, both builds and three
native tests (two opt-in native tests skipped). Hover tests cover independent
preview versus spoken-word ranges, initial/paused navigation, long sentences,
cross-post routing, unchanged inline nodes, links, selection, drag, modified clicks
and cleanup. A separate local browser fixture passed actual caret/range geometry
checks and the corresponding sentence-routing checks; evidence is in the ignored
`.data/hover-browser/` folder.

The React preview also verified that clicking the later paragraph of a different
post selects that paragraph (Section 3 of 3), and that the smaller controls expand
and collapse. The preview service remained unavailable, so this does not claim
new audible or live-site playback verification. No model/inference changes or
extension installation were made. The updated screenshot is
`.data/screenshots/minimal-reader.png`.

### Transparent player background

The embedded iframe now uses the same `light dark` color-scheme as the panel
document. Its previous `normal` scheme caused Chromium to paint an opaque dark
canvas even though both CSS backgrounds were transparent. A browser fixture using
the built panel reproduced the black rectangle with the previous setting and
confirmed the page background remains visible with the corrected setting.
Screenshot: `.data/screenshots/transparent-reader.png`. `npm run check` passed
(formatting, typecheck, 21 tests and both extension builds). Reload the unpacked
extension and refresh existing source pages to replace their injected frames.
