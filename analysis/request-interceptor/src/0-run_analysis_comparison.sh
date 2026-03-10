#!/usr/bin/env bash
set -euo pipefail

# To compare the results using the same as Torres's analysis

RESULTS_BASE="${1:-./data}"

ANALYSIS_BASE="${RESULTS_BASE}/analysis_result_comparison"

# 1) Run for wallet
echo "[INFO] Running wallet analysis..."
DATA_DIR="${RESULTS_BASE}/data/wallet" ANALYSIS_BASE="$ANALYSIS_BASE" python3 analyze.py

# 2) Run for serviceworker
echo "[INFO] Running serviceworker analysis..."
DATA_DIR="${RESULTS_BASE}/data/serviceworker" ANALYSIS_BASE="$ANALYSIS_BASE" python3 analyze.py

echo "[INFO] Merging wallet info and leak results..."
RESULT_BASE="$RESULTS_BASE" ANALYSIS_BASE="$ANALYSIS_BASE" python3 glue.py

