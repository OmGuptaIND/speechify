#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null; then
  print 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/'
  exit 1
fi
action="${1:-start}"
if [[ "$action" == start ]]; then
  exec uv run --project backend --locked speechify-control start --copy-key
else
  exec uv run --project backend --locked speechify-control "$action"
fi
