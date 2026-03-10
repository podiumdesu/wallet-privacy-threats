#!/bin/bash

wallet_base="original-wallets"
output_file="./wallet-extensions.txt"

# Clear or create the output file
> "$output_file"

# Loop over all sub-directories of $wallet_base
for dir in "$wallet_base"/*/; do
  # Strip the base path and trailing slash
  name="${dir#"$wallet_base"/}"
  name="${name%/}"
  echo "$name" >> "$output_file"
done

echo "[INFO] Wrote wallet list to $output_file"
