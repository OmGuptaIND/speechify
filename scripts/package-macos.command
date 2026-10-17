#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
uv run --project backend --locked python scripts/package-macos.py
