#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
exec uv run --project backend --locked speechify-read --clipboard --play
