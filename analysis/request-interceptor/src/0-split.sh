#!/usr/bin/env bash
set -euo pipefail

# Only do it when you copy all the json results here without sorting.

# Usage: ./split_jsons.sh <input_folder>
# Copies all JSON files from <input_folder> into two subfolders:
#   serviceworker/ for *-wallet.json
#   wallet/        for other .json files


INPUT_DIR="${1:-../test/data}"

# Verify input directory exists
if [ ! -d "$INPUT_DIR" ]; then
  echo "Error: '$INPUT_DIR' is not a directory"
  exit 1
fi

# Create output directories inside INPUT_DIR
mkdir -p "$INPUT_DIR/serviceworker" "$INPUT_DIR/wallet"

# Copy *-wallet.json into serviceworker/
shopt -s nullglob
for f in "$INPUT_DIR"/*-wallet.json; do
  mv -- "$f" "$INPUT_DIR/serviceworker/"
done

# Copy all other .json into wallet/
for f in "$INPUT_DIR"/*.json; do
  # skip the ones ending in -wallet.json
  if [[ "$(basename "$f")" == *-wallet.json ]]; then
    continue
  fi
  mv -- "$f" "$INPUT_DIR/wallet/"
done

echo "Copied JSON files from '$INPUT_DIR' into":
echo "  $INPUT_DIR/serviceworker/"
echo "  $INPUT_DIR/wallet/"