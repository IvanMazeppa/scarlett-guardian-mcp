#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_DIR="$(cd -- "$PROJECT_DIR/.." && pwd)"
BACKUP_DIR="$WORKSPACE_DIR/rag-memory-mcp-offline-backups"

mkdir -p "$BACKUP_DIR"

next_number() {
  local highest=0
  local base
  shopt -s nullglob
  for path in "$BACKUP_DIR"/rag-memory-mcp-backup-*.tar.gz; do
    base="$(basename "$path")"
    if [[ "$base" =~ rag-memory-mcp-backup-([0-9]{3})- ]]; then
      local number="${BASH_REMATCH[1]}"
      if ((10#$number > highest)); then
        highest=$((10#$number))
      fi
    fi
  done
  printf "%03d" "$((highest + 1))"
}

NUMBER="$(next_number)"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/rag-memory-mcp-backup-$NUMBER-$STAMP.tar.gz"

tar \
  --exclude='rag-memory-mcp/node_modules' \
  --exclude='rag-memory-mcp/dist' \
  --exclude='rag-memory-mcp/.env' \
  --exclude='rag-memory-mcp/.rag-memory-mcp/upload' \
  --exclude='rag-memory-mcp/.rag-memory-mcp/*.tmp' \
  --exclude='rag-memory-mcp/.DS_Store' \
  -czf "$ARCHIVE" \
  -C "$WORKSPACE_DIR" \
  rag-memory-mcp

printf 'Created backup: %s\n' "$ARCHIVE"
