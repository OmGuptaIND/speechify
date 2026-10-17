# Install and read

This is a Mac-local reader. One Python companion serves extensions in multiple
desktop Chromium browsers on the same Mac, without a hosted speech API.

## One-time setup on this Mac

The models, Python environment and browser builds are already present in
`~/Desktop/Speechify`. Open **Start Speechify.command** in that folder. It copies
the pairing key and starts the companion without a permanent login service.
Repeated Start reuses the same process. After shutdown or reboot, use Start again.

In a fresh checkout, install [uv](https://docs.astral.sh/uv/) and Node 22 first,
then run **Setup Speechify.command**. The setup downloads about 142 MB of voice
assets plus the isolated Python and npm dependencies. The launchers do not install
browser extensions or change browser settings for you.

## Choose one browser build

| Build folder | Reader surface | Use it when |
| --- | --- | --- |
| `extension/dist` | In-page popover; sidebar/window fallback if blocked | Your browser implements Chrome's Side Panel API |
| `extension/dist-portable` | In-page popover; separate window fallback if blocked | Comet or another Chromium browser rejects sidebar permissions or behaves differently |

Chrome documents the [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
and Microsoft documents [the same API in Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar).
Comet's [quick-start guide](https://www.perplexity.ai/comet/resources/articles/comet-quick-start-guide)
lists Chrome extension importing, but that does not verify every extension API.
The portable build uses the standard [extension windows API](https://developer.chrome.com/docs/extensions/reference/api/windows).
Use current desktop browsers; a browser that disables unpacked extensions or
Manifest V3 cannot run this build. Chrome 116 is the manifest minimum; current
versions are recommended for the CSS and highlight features.

Both manifests request only active-tab reading, script injection, storage,
selection context menus and access to `127.0.0.1:8767`. The sidebar variant adds
`sidePanel`. Neither grants permanent access to all websites. Each profile keeps
its own key, preferences, bookmarks and reading position.

## Load the unpacked extension

1. Open the browser's Extensions management page (for Chrome: `chrome://extensions`).
2. Turn on Developer mode and choose **Load unpacked**.
3. Select `dist` or `dist-portable` inside the project's `extension` folder. Install one variant per profile.
4. Pin Speechify's icon. Open an ordinary webpage and click it.
5. Paste the copied connection key into **Connect to this Mac**, and choose **Connect reader**.
6. Press Play. Bella speaks locally; the original page and current passage show the word being spoken.

**Open Extension Folder.command** reveals the folders in Finder. A ZIP cannot be
loaded directly: extract it and select the folder containing `manifest.json`.
The release ZIPs contain the browser UI only; the companion must be running on
this Mac. `make package` regenerates both ZIPs under `.data/releases`.

## Everyday use

- Click the extension on the page you want to read. A slim control rail appears at
  the right edge without resizing the page. Open the **gear** for the full controls.
- On X or Substack, click the small play button beside a post, Note, comment or
  article. Click the same button to pause/resume, or another one to read that item.
  New loaded posts receive buttons while the reader is open.
- Access starts with your toolbar click on each page; buttons are not installed
  automatically across all websites. Closing the reader removes its buttons and
  highlights. After a full navigation, click the toolbar icon again.
- Each embedded player stays attached to its own tab. If a site blocks embedding,
  the sidebar or reusable window is the fallback.
- Select text first and use **Read selected text instead**, or right-click the
  selection and choose **Read selection with Bella**.
- Pause keeps your place. Stop clears the highlights. Change speed without
  regenerating speech. Use the paragraph buttons or click the original page
  during reading to jump.
- Use **Stop Speechify.command** to stop the companion. The model also unloads
  after three idle minutes while the small HTTP process remains available.

## When a page cannot be read

Browser settings pages, extension-store pages, built-in PDF viewers, protected
Kindle surfaces, canvas text and cross-origin frames can block text access.
This version captures loaded HTML; it does not perform OCR, bypass restrictions,
scroll through an entire feed or turn Kindle pages. For text you can legitimately
copy, the existing **Read with Bella.command** clipboard reader is a fallback.

After a site navigates or replaces its content, click the toolbar icon again to
grant access and refresh the capture. If the original tab closes, choose another
page. If the reader says offline, use Start; if pairing fails, use Start to copy
the current key again. After rebuilding, reload the unpacked extension on its
management page.

## Updating the copy supplied by the Mac app

Chrome's extension details show the **Loaded from** folder. If it is
`~/Library/Application Support/Speechify/BrowserExtension`, Chrome uses the copy
published by the installed Mac app. Rebuilding `extension/dist` updates only the
project build and local preview; reloading Chrome still reads the app's old copy.

For that installation, run `make installer` to include the latest extension in a
new Mac app. Quit Speechify, replace the app in Applications with the new build,
and reopen it. Launch refreshes the stable extension folder from the app bundle
when its build fingerprint changes. Then click **Reload** on Speechify's Chrome
extension details and refresh the source website. Keep the same unpacked path so
the browser identity, pairing and saved passages remain intact. Do not manually
copy a newer extension over this folder while leaving the old app installed:
the app can restore its bundled copy on a later launch.

## Validation status

Automated tests cover native-panel opening, missing/rejected sidebar APIs,
portable manifests, floating-window reuse/recreation, fast repeated clicks,
source-tab retention, selection routing and restricted-page errors. Actual
unpacked sidebar/floating installs were tested in Chrome and Comet on 2026-10-16:
Bella playback, original-page highlights, pause retaining a word, paragraph
navigation, click-to-jump, speed changes and article switching passed. Chrome's
Stop cleanup and Comet's close/reopen flow were also checked. Later in-page UI
changes still need an installed-browser retest. See
[installed-browser acceptance](browser-acceptance.md) for the evidence,
connection-indicator limits and remaining scope. Brave and Edge remain untested.

## Compact-player update

Both unpacked builds include the in-page popover and per-item controls. Reload the
existing extension on its management page after rebuilding; then refresh the
source website and click **Read with Bella** again. This prevents an older injected
content script from remaining in that page. No extension was installed or published
as part of this source update. Live X/Substack acceptance is still required; the
automated site fixtures and local visual preview are separate evidence.
