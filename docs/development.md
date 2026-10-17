# Development

Use Python 3.12 with uv. Use Node 22 LTS and npm for the extension. Work from the
repository root. There is no root Python environment and no global pip install.

## Setup and commands

`make setup` installs the isolated backend environment, verifies/downloads models,
installs locked npm dependencies and builds `extension/dist`. `make check` runs
the appropriate lint, type, unit and build checks. CI runs these checks without
downloading models or exposing secrets.

Backend code is editable through uv. After changing Python, restart the backend.
After changing extension code, run `make extension` and reload the unpacked
extension in the browser's extension-management page. `npm run dev --prefix extension`
can rebuild on source changes; browser extension reloads are still manual.

## Browser validation

Load `extension/dist` unpacked in Chrome and pin its icon. Start the backend,
connect once, then exercise an ordinary article and a selection spanning inline
links. Check Play/Pause, both paragraph buttons, click-to-jump on the original
page, speed changes while speaking, voice preview, save/return, and Stop clearing
the highlights. Test switching tabs and restricted browser URLs.

The standalone preview at `127.0.0.1:8768` uses the same sidebar, content mapping
and real backend. It does not validate Chrome permissions, service-worker
lifecycle or Comet's implementation of the Side Panel API. Installing an unpacked
extension remains a user action. Do not describe preview checks as installed-
extension testing.

## Model smoke test

With models installed:

```sh
uv run --project backend python -c 'from speechify_backend.worker import synthesize; from speechify_backend.config import Settings; r=synthesize("We reached 80 million dollars in 2026.","af_bella",str(Settings().models_dir),2); print({k:v for k,v in r.items() if k!="audio"})'
```

Check that timing intervals are ordered, within audio duration and match original
word offsets. Include punctuation, inline-formatting boundaries, emoji, numbers
and long sentences in changes that affect mapping. Record real resource results;
do not infer a hard RAM cap from one successful short run.

## Git

Keep backend and extension in one repository. Use `codex/` branches for changes,
small commits describing behavior, and the CI checks before sharing. Models,
keys, audio, dependencies, screenshots and generated bundles are untracked.
The initial repository is local; creating a GitHub remote or publishing requires
a separate user request.
