#!/usr/bin/env python3
import csv

INPUT_CSV = 'wallet-info.csv'
OUTPUT_TXT = 'alive_pathids.txt'

with open(INPUT_CSV, newline='') as csvfile, open(OUTPUT_TXT, 'w') as outfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
        if row['address'].lower() != 'dead':
            outfile.write(row['pathID'] + '\n')

print(f"[INFO] Wrote alive pathIDs to {OUTPUT_TXT}")
