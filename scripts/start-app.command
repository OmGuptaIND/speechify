#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
if [[ ! -d .data/standalone/Speechify.app ]]; then
    ./scripts/build-macos.command
fi
exec open .data/standalone/Speechify.app
