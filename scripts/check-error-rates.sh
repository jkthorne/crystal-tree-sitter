#!/bin/sh
#
# Check parse error rates against Crystal stdlib files.
# Fails if any file exceeds its error-rate threshold.
#
# Usage: ./scripts/check-error-rates.sh [--download]
#
# With --download: fetches fresh copies of stdlib files from GitHub.
# Without: uses cached copies in /tmp/crystal_*.cr (must exist).

set -e

CACHE_DIR="/tmp"
BASE_URL="https://raw.githubusercontent.com/crystal-lang/crystal/master/src"

# file:download_path:threshold_percent
FILES="
array:array.cr:1.5
enumerable:enumerable.cr:2.0
hash:hash.cr:2.0
int:int.cr:7.0
string:string.cr:3.5
json_builder:json/builder.cr:2.5
"

download_files() {
  echo "Downloading Crystal stdlib files..."
  for entry in $FILES; do
    key=$(echo "$entry" | cut -d: -f1)
    path=$(echo "$entry" | cut -d: -f2)
    target="${CACHE_DIR}/crystal_${key}.cr"
    curl -sL "${BASE_URL}/${path}" > "${target}"
    echo "  Downloaded ${path} -> ${target}"
  done
}

if [ "${1:-}" = "--download" ]; then
  download_files
fi

echo ""
echo "Parsing Crystal stdlib files..."
echo "================================================"

exit_code=0

for entry in $FILES; do
  key=$(echo "$entry" | cut -d: -f1)
  threshold=$(echo "$entry" | cut -d: -f3)
  file="${CACHE_DIR}/crystal_${key}.cr"

  if [ ! -f "$file" ]; then
    echo "SKIP  ${key}: file not found (run with --download)"
    continue
  fi

  lines=$(wc -l < "$file" | tr -d ' ')
  errors=$(npx tree-sitter parse "$file" 2>&1 | grep -c "ERROR\|MISSING" || true)
  rate=$(echo "scale=1; $errors * 100 / $lines" | bc)

  # Compare using bc (floating point)
  if [ "$(echo "$rate > $threshold" | bc -l)" = "1" ]; then
    echo "FAIL  ${key}: ${errors}/${lines} errors (${rate}% > ${threshold}% threshold)"
    exit_code=1
  else
    echo "PASS  ${key}: ${errors}/${lines} errors (${rate}% <= ${threshold}%)"
  fi
done

echo "================================================"

if [ $exit_code -eq 0 ]; then
  echo "All files within error-rate thresholds."
else
  echo "Some files exceed error-rate thresholds!"
fi

exit $exit_code
