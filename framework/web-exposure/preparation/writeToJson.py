import csv
import json

CSV_FILE = "./cws-10k-85.csv"
PROCESSING_FILE = "./test.txt"
OUTPUT_FILE = "./extensions.json"


def load_processing_ids(path: str):
    """
    Load IDs from extensions.processing.txt
    One ID per line. Lines starting with '#' are allowed.
    Returns a set of normalized IDs (without leading '#').
    """
    ids = set()
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw:
                continue
            # remove leading "#" if present
            if raw.startswith("#"):
                raw = raw[1:]
            ids.add(raw)
    return ids


def load_extensions_from_csv(path: str):
    """
    Load rows from extensions.csv.
    Assumes columns include at least: name, id.
    Returns a list of dicts.
    """
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def main():
    # make a set 
    
    processing_ids = load_processing_ids(PROCESSING_FILE)
    print(f"Loaded {len(processing_ids)} IDs from {PROCESSING_FILE}")

    rows = load_extensions_from_csv(CSV_FILE)
    print(f"Loaded {len(rows)} rows from {CSV_FILE}")

    all_ids = set()
    
    output = []

    for row in rows:
        # normalize id from CSV (remove leading '#', spaces)
        csv_id_raw = (row.get("id") or "").strip()
        if csv_id_raw.startswith("#"):
            norm_id = csv_id_raw[1:]
        else:
            norm_id = csv_id_raw

        # decide res: 'y' if in processing list, 'n' otherwise
        res = ""
        name_in_row = row.get("name", "")
        
        if norm_id not in processing_ids:
             continue
    
        item = {
            "id": f"{norm_id}",           # always with '#' in JSON
            # the first word of the name is the extension name
            "name": name_in_row.split()[0],   # from CSV
            "res": res
        }
        output.append(item)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(output)} records to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
