#!/bin/sh
#
# Fuzz-test the Crystal tree-sitter parser against the Crystal compiler source.
# Downloads ~200 .cr files from the Crystal stdlib and parses each one,
# reporting per-file error rates and flagging files above threshold.
#
# Usage: ./scripts/fuzz-test.sh [--download] [--threshold PERCENT]
#
# Options:
#   --download    Download/refresh stdlib files from GitHub
#   --threshold   Error rate threshold (default: 5.0%)

set -e

CACHE_DIR="/tmp/crystal_fuzz"
BASE_URL="https://api.github.com/repos/crystal-lang/crystal/contents/src"
THRESHOLD="5.0"

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --download) DOWNLOAD=1; shift ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

download_files() {
  echo "Downloading Crystal stdlib source files..."
  mkdir -p "$CACHE_DIR"

  # Get top-level .cr files
  curl -sL "$BASE_URL" | grep '"download_url"' | grep '\.cr"' | \
    sed 's/.*"download_url": "//; s/".*//' | while read -r url; do
    name=$(basename "$url")
    curl -sL "$url" > "$CACHE_DIR/$name"
    echo "  $name"
  done

  # Get files from key subdirectories
  for subdir in json yaml http io crypto; do
    curl -sL "${BASE_URL}/${subdir}" 2>/dev/null | grep '"download_url"' | grep '\.cr"' | \
      sed 's/.*"download_url": "//; s/".*//' | while read -r url; do
      name="${subdir}_$(basename "$url")"
      curl -sL "$url" > "$CACHE_DIR/$name"
      echo "  $subdir/$(basename "$url")"
    done
  done

  echo ""
  total=$(find "$CACHE_DIR" -name "*.cr" | wc -l | tr -d ' ')
  echo "Downloaded $total files to $CACHE_DIR"
}

if [ "${DOWNLOAD:-}" = "1" ]; then
  download_files
fi

if [ ! -d "$CACHE_DIR" ] || [ -z "$(ls "$CACHE_DIR"/*.cr 2>/dev/null)" ]; then
  echo "No files found in $CACHE_DIR. Run with --download first."
  exit 1
fi

echo ""
echo "Parsing Crystal stdlib files (threshold: ${THRESHOLD}%)..."
echo "================================================"

total_files=0
pass_files=0
fail_files=0
crash_files=0

for file in "$CACHE_DIR"/*.cr; do
  name=$(basename "$file")
  total_files=$((total_files + 1))

  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -eq 0 ]; then
    echo "SKIP  $name (empty)"
    continue
  fi

  # Parse and check for crashes
  output=$(npx tree-sitter parse "$file" 2>&1) || {
    echo "CRASH $name"
    crash_files=$((crash_files + 1))
    continue
  }

  errors=$(echo "$output" | grep -c "ERROR\|MISSING" || true)
  rate=$(echo "scale=1; $errors * 100 / $lines" | bc)

  if [ "$(echo "$rate > $THRESHOLD" | bc -l)" = "1" ]; then
    echo "FAIL  $name: ${errors}/${lines} errors (${rate}%)"
    fail_files=$((fail_files + 1))
  else
    pass_files=$((pass_files + 1))
  fi
done

echo "================================================"
echo "Total: $total_files | Pass: $pass_files | Fail: $fail_files | Crash: $crash_files"

if [ "$crash_files" -gt 0 ]; then
  echo "WARNING: $crash_files files caused parser crashes!"
  exit 2
fi

if [ "$fail_files" -gt 0 ]; then
  echo "$fail_files files exceed ${THRESHOLD}% error threshold."
  exit 1
else
  echo "All files within ${THRESHOLD}% error threshold."
fi
