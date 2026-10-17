#!/bin/zsh
set -eu
exec "${0:A:h}/control.command" stop
