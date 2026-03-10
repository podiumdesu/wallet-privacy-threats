#!/usr/bin/env bash
set -euo pipefail

original="original.txt"
results="existing.txt"
output="filtered.txt"

# 1) Validate that every entry in existing.txt is in original.txt
echo "[INFO] Verifying that all entries in $results exist in $original..."
missing_count=0
while IFS= read -r line; do
  if ! grep -Fxq "$line" "$original"; then
    echo "[WARN] '$line' in $results not found in $original"
    missing_count=$((missing_count+1))
  fi
done < "$results"

if [ "$missing_count" -gt 0 ]; then
  echo "[ERROR] $missing_count missing entrie(s) detected in $results."
  # Optionally exit with failure:
  # exit 1
else
  echo "[INFO] All entries in $results were found in $original."
fi

# 2) Filter out existing.txt entries from original.txt
grep -Fvx -f "$results" "$original" > "$output"
echo "[INFO] Wrote $(wc -l < "$output") leftover names to $output"
