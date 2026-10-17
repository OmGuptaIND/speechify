#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
export PATH="$HOME/.local/bin:$PATH"
# Finder-launched terminals may not initialize the user's Node version manager.
if ! command -v npm >/dev/null && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent 22 || nvm use --silent default
fi
make setup
