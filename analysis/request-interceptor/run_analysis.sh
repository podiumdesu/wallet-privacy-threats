#!/usr/bin/env bash
set -euo pipefail

RESULTS_BASE="${1:-./data}"
DATA_DIR="${RESULTS_BASE}/data"
SPLIT_SCRIPT="./src/0-split.sh"
ANALYSIS_BASE="${RESULTS_BASE}/analysis_result"

mkdir -p "$DATA_DIR" "$ANALYSIS_BASE"

if compgen -G "$RESULTS_BASE/*.json" > /dev/null; then
  echo "Moving JSON files into $DATA_DIR ..."
  mv "$RESULTS_BASE"/*.json "$DATA_DIR"/
fi

if [ ! -d "$DATA_DIR/serviceworker" ] || [ ! -d "$DATA_DIR/wallet" ]; then
  echo "Running split script..."
  bash "$SPLIT_SCRIPT" "$DATA_DIR"
else
  echo "Split already done. Skipping."
fi

python3 ./src/leak_types.py \
  --ext-list "$RESULTS_BASE/extensions.txt" \
  --input-dir "$DATA_DIR" \
  --out-dir "$ANALYSIS_BASE/leaks_type"

python3 ./src/tracker.py \
  --ext-list "$RESULTS_BASE/extensions.txt" \
  --input-dir "$DATA_DIR" \
  --out-dir "$ANALYSIS_BASE/tracker_presence"

python3 ./src/request_pattern.py \
  --ext-list "$RESULTS_BASE/extensions.txt" \
  --input-dir "$DATA_DIR" \
  --out-dir "$ANALYSIS_BASE/request_pattern"