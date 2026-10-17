#!/bin/zsh
set -eu
cd -- "${0:A:h}/.."
if [[ ! -f extension/dist/manifest.json ]]; then
  print 'Run Setup Speechify first to build the extension.'
  exit 1
fi
open extension
print 'Choose dist for the browser sidebar, or dist-portable for the floating reader.'
print 'Load that folder using Load unpacked on your browser extension-management page.'
