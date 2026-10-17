# Speechify project conventions

- The canonical repository is `/Users/omg/Desktop/Speechify`. The old chat folder is a compatibility symlink, not a second checkout.
- Use `uv` for Python dependencies, commands, and lockfiles. The installable backend package uses `backend/src/speechify_backend/`.
- Use npm and TypeScript for `extension/`. Commit `uv.lock` and `package-lock.json` together with dependency changes.
- Keep models, audio, keys, caches, dependencies and build artifacts untracked. Local runtime data belongs in `.data/`.
- Keep Bella as the default voice and follow the product principles in `docs/product.md`.
- Maintain the resource budget: one inference worker, two inference threads, small text chunks, bounded browser caching and prefetch, and idle worker unloading.
- Highlight original DOM ranges using model timings. Do not estimate word timings while presenting them as synchronized speech.
- Preserve the original page DOM. Prefer CSS Custom Highlights to wrapping or replacing website text.
- Keep speech on loopback, authenticate speech requests, and request active-tab access rather than persistent access to all websites.
- Run `make check` for cross-layer changes. Use a real model smoke test when changing alignment or the inference path; CI tests must work without model downloads.
- Do not install or publish the browser extension as part of source changes. Give the user the unpacked build and installation instructions.
