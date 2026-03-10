#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Running request-interceptor analysis for all datasets..."

./run_analysis.sh ./torres-2023-100
./run_analysis.sh ./torres-2025-100
./run_analysis.sh ./cws-10k-85

echo "Generating reproduced Table 1..."
python3 ./src/generate_table1.py

echo "Done."
echo "Reproduced table:"
echo "./reproduced_tables/table1_reproduced.tex"