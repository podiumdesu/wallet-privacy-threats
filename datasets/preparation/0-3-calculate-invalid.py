#!/usr/bin/env python3
"""
Script to check each extension download for non-zero size and record validity in a CSV.

Usage:
    python check_download_validity.py wallet-extensions.txt crx_downloads/ validity_report.csv

Arguments:
    1. Path to the text file listing extension IDs (one per line)
    2. Path to the download directory (containing <ID>.zip or <ID>.crx files)
    3. Output CSV file path

Output CSV columns:
    extensionID,validity
    validity = true if file exists and size>0, else false
"""
import sys
import os
import csv

def main(ids_file, download_dir, output_csv):
    # Read extension IDs, skip blanks/comments
    with open(ids_file, 'r') as f:
        ids = [line.strip() for line in f if line.strip() and not line.strip().startswith('#')]

    # Prepare output CSV
    with open(output_csv, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['extensionID', 'validity'])

        # Check each ID
        for ext_id in ids:
            valid = False
            # Check for .zip or .crx
            for ext in ('.zip', '.crx'):
                path = os.path.join(download_dir, ext_id + ext)
                if os.path.isfile(path) and os.path.getsize(path) > 0:
                    valid = True
                    break
            # Write row
            writer.writerow([ext_id, 'true' if valid else 'false'])

    print(f"Wrote validity report to {output_csv}")

if __name__ == '__main__':
    # if len(sys.argv) != 4:
    #     print("Usage: python check_download_validity.py <ids_file> <download_dir> <output_csv>")
    #     sys.exit(1)

    # ids_file   = sys.argv[1]
    # download_dir = sys.argv[2]
    # output_csv = sys.argv[3]

    main("wallet-extensions.txt", "crx_downloads/", "validity_report.csv")
