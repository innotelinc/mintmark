#!/bin/sh
# Guided first-install for Mintmark. Writes .env from .env.example, keeps the
# gateway key out of git, and leaves an existing .env alone unless --force.
# See scripts/setup-wizard.py --help.
set -eu
exec python3 "$(dirname "$0")/scripts/setup-wizard.py" "$@"
