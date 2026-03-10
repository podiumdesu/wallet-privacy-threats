#!/bin/bash
#
# This script takes as input a file containing a list of wallet extensions. For each wallet extension,
# it creates a separate user profile, installs the extension, interacts with the extension,
# and stores its output to EXTENSION_ID.json.

set -euo pipefail

# --- CONFIG (defaults) -------------------------------------------------

# Default base path where results (crawl, profiles, logs) will be stored
DEFAULT_RESULT_PATH="./test-results"

# Default base folder where wallet extensions are located
DEFAULT_WALLET_FOLDER="../../datasets/torres-2023-100"

# Optional config file (same directory as script)
script_dir="$(cd "$(dirname "$0")" && pwd)"
config_file="${script_dir}/crawl.conf"

# If config file exists, source it to override defaults
if [ -f "$config_file" ]; then
  # shellcheck disable=SC1090
  . "$config_file"
fi

# --- ARGUMENT PARSING --------------------------------------------------

usage() {
  cat >&2 <<EOF
Usage: $0 EXTENSION_LIST_FILE [--result-path PATH] [--wallet-folder PATH] [auto]

  EXTENSION_LIST_FILE   File with one wallet extension path per line (relative to wallet folder).

Options:
  --result-path PATH    Override base result path (default: "$DEFAULT_RESULT_PATH")
  --wallet-folder PATH  Override base wallet folder (default: "$DEFAULT_WALLET_FOLDER")
  auto                  Use auto-crawl.js in run.js
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

file_name="$1"
shift

# Start with defaults (possibly overridden by config file)
RESULT_PATH="${DEFAULT_RESULT_PATH}"
WALLET_FOLDER="${DEFAULT_WALLET_FOLDER}"
AUTO_MODE=0

# Parse optional flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --result-path)
      [ $# -lt 2 ] && usage
      RESULT_PATH="$2"
      shift 2
      ;;
    --wallet-folder)
      [ $# -lt 2 ] && usage
      WALLET_FOLDER="$2"
      shift 2
      ;;
    auto)
      AUTO_MODE=1
      shift
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      echo "Unexpected extra argument: $1" >&2
      usage
      ;;
  esac
done

# --- PATHS DERIVED FROM CONFIG ----------------------------------------

start=$(date +%s)
timestamp=$(date +"%Y-%m-%dT%H-%M-%S")
crawler="${script_dir}/run.js"

destination="${RESULT_PATH}/crawl_new/${timestamp}"
profiles="${RESULT_PATH}/profiles_new"
logs="${RESULT_PATH}/logs_new"

mkdir -p "$destination" "$profiles" "$logs"

lines=$(wc -l < "$file_name" | tr -d '[:space:]')

echo "[INFO] Script directory: $script_dir"
echo "[INFO] Crawler script: $crawler"
echo "[INFO] Result base path: $RESULT_PATH"
echo "[INFO] Wallet base folder: $WALLET_FOLDER"
echo "[INFO] Destination: $destination"
echo "[INFO] Profiles dir: $profiles"
echo "[INFO] Logs dir: $logs"
echo "[INFO] Processing file: $file_name"
echo "[INFO] Total extensions to process: $lines"
echo "[INFO] Auto mode: $AUTO_MODE"
echo ""

counter=1

while read -r wallet_relative; do
  [ -z "$wallet_relative" ] && continue  # skip empty lines

  echo "----------------------------"
  wallet_path="${WALLET_FOLDER}/${wallet_relative}"
  echo "[INFO] (${counter}/${lines}) Processing: $wallet_path"

  if [ ! -d "$wallet_path" ] && [ ! -f "$wallet_path" ]; then
    echo "[ERROR] Wallet path does not exist: $wallet_path"
    counter=$((counter + 1))
    continue
  fi

  echo "Setting up ${wallet_path} (${counter}/${lines})."
  id="${wallet_path##*/}"

  echo "[INFO] Extension ID: $id"

  profile_path="${profiles}/${id}"
  log_file="${logs}/${id}.log"

  echo "[INFO] Profile path: $profile_path"
  echo "[INFO] Log file: $log_file"
  echo "[INFO] Running crawler..."

  extra_args=()
  if [ "$AUTO_MODE" -eq 1 ]; then
    extra_args+=(auto)
  fi

  node "$crawler" \
    --interactive \
    --debug verbose \
    --wallet "$wallet_path" \
    --profile "$profile_path" \
    --ancestors \
    --destination "$destination" \
    -l 10 \
    "${extra_args[@]}" < /dev/tty

  counter=$((counter + 1))
done < "$file_name"

end=$(date +%s)
runtime=$((end - start))
echo "Total execution time: ${runtime}s."