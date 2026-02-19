#!/bin/sh
# Ensure the data directory exists and is writable by the mcp user.
# This handles the case where a bind-mount or named volume is owned by root.
set -e

DATA_DIR="$(dirname "${SQLITE_PATH:-/app/data/tokens.db}")"
mkdir -p "$DATA_DIR"

# If we're root (e.g. docker run --user not set), chown then drop privileges.
# If we're already mcp, just exec directly.
if [ "$(id -u)" = "0" ]; then
  chown -R mcp:mcp "$DATA_DIR"
  exec su-exec mcp "$@"
else
  exec "$@"
fi
