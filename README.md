# Speechify

A personal, local reading companion for Chrome and compatible Chromium browsers.
Bella reads on your Mac while sentence and word highlights follow the original webpage.

## Project layout

```text
Speechify/
├── backend/           Python speech service and clipboard reader, managed with uv
│   ├── src/speechify_backend/
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock
├── extension/         React + TypeScript Manifest V3 extension
│   ├── src/           Sidebar, playback, original-page extraction and highlighting
│   ├── public/        Manifest, HTML entry points and icons
│   ├── scripts/       Build, test and local preview tooling
│   └── package-lock.json
├── docs/              Architecture, UX decisions and development guide
├── scripts/           Double-click setup, backend and clipboard launchers
├── .github/workflows/ CI without voice-model downloads
└── .data/             Local models, audio and connection key; ignored by Git
```

The canonical checkout is `~/Desktop/Speechify`. The previous chat path redirects
here through a symlink so this chat keeps using the same checkout; there is one physical project.

## Start reading

Prerequisites: [uv](https://docs.astral.sh/uv/), Node 22 LTS (see `.nvmrc`), and a current Chrome-based browser.

1. Run `make setup` once, or double-click `scripts/setup.command`.
2. Double-click `scripts/start-backend.command`. Keep its Terminal window open.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`.
4. Open an article and click the extension icon. Paste the backend's connection key once, then press **Play**.

The built extension is already in `extension/dist` on this Mac. Reload it on the
extensions page after rebuilding. In Comet, use its extension-management page;
its support for Chrome's Side Panel API needs to be tested in that browser.

To read copied text without the extension, double-click `scripts/read-clipboard.command`.
Control-C stops either launcher. No service is installed at login.

## Development

```sh
make backend       # Local API on 127.0.0.1:8767
make extension     # Build the unpacked extension
make check         # Python lint/format/tests + TypeScript/tests/build
```

For the standalone UI preview, run the backend with `--preview`, then `make preview`:

```sh
uv run --project backend speechify-backend --preview
# In another terminal:
make preview
```

Open `http://127.0.0.1:8768`. This uses the same React sidebar and real speech API;
the sample article replaces Chrome's tab connection for local development.

## Resource budget and data

- Quantized Kokoro v1.0 and Bella (`af_bella`) by default.
- One model worker, two CPU inference threads, sequential execution, no GPU.
- At most 240 characters per API request and one following section prefetched by the UI.
- A six-section in-memory browser cache; no article-wide audio generation.
- The model worker exits after three idle minutes. The small HTTP process stays available.
- The backend listens on loopback only and requires a locally generated connection key.
- Speech, bookmarks and reading position stay local. The extension does not send text to a hosted API.
- Models, `.venv`, `node_modules`, generated audio, build output and keys are excluded from Git.

Word highlights use model phoneme durations mapped to original UTF-16 DOM offsets,
including number expansion. Words are phonemized individually to preserve that mapping;
this can alter pronunciation compared with whole-sentence phonemization. See
[architecture](docs/architecture.md) for limits and testing details.

## Current scope

The first version supports normal HTML articles, selected text, page highlights,
click-to-jump during reading, paragraph navigation, three local voices, voice previews,
playback speed, focus dimming and local bookmarks. PDF viewers, Kindle's rendered or
protected book surfaces, cross-origin frames and every X page are not verified.
The extension does not promise access to text a website does not expose.

See [development](docs/development.md), [product direction](docs/product.md), and
[initial resource measurements](docs/initial-benchmark.md).

Kokoro weights are Apache-2.0; kokoro-onnx is MIT. This repository does not include
model weights or third-party voice recordings, and no project redistribution license
has been selected yet.
