#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
MAX_LINES=800

if [[ ! -d "$SRC_DIR" ]]; then
  echo "Error: src directory not found at $SRC_DIR" >&2
  exit 1
fi

find "$SRC_DIR" -type f | while IFS= read -r file; do
  line_count=$(wc -l < "$file")
  if (( line_count > MAX_LINES )); then
    printf '%s: %d lines\n' "$file" "$line_count"
  fi
done | sort -t: -k2,2nr