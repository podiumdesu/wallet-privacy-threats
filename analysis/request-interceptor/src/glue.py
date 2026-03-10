# merge_wallet_info_two_sources.py
import csv
import os

dirName = os.environ.get("RESULT_BASE")
resultDirName = os.path.join(os.environ.get("ANALYSIS_BASE"), "all_leaks")

# with base dir, load wallet info
WALLET_INFO = os.path.join(dirName, "wallet-info.csv")
LEAKS_EXT =  os.path.join(resultDirName, "wallet_extension_leaks-extension.csv")
LEAKS_SW  =  os.path.join(resultDirName, "wallet_extension_leaks-sw.csv")
OUT =  os.path.join(resultDirName, "wallet-info.with-leaks.csv")

# headerless leaks file columns (service_worker is LAST)
LEAK_COLS = [
    "extensionName",
    "extensionID",
    "thirdParty",
    "GET",
    "POST",
    "WebSockets",
    "Cookies",
    "service_worker",
]

def load_first_leak_by_ext_id(path):
    """
    Reads the headerless leaks CSV, forward-fills blank extensionIDs,
    and keeps ONLY the first leak row per extensionID.
    Returns: dict[extensionID] -> leak dict with all columns.
    """
    first_leak = {}
    last_ext_id = None

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            # pad/truncate to expected width
            row = (row + [""] * len(LEAK_COLS))[:len(LEAK_COLS)]
            d = dict(zip(LEAK_COLS, row))

            ext_id = (d["extensionID"] or "").strip()
            if ext_id:
                last_ext_id = ext_id
            else:
                if not last_ext_id:
                    continue
                d["extensionID"] = last_ext_id
                ext_id = last_ext_id

            if ext_id in first_leak:
                continue  # keep only the first row for this ID

            # coerce numeric fields
            for k in ["GET", "POST", "WebSockets", "Cookies"]:
                try:
                    d[k] = int(d[k])
                except Exception:
                    d[k] = 0

            first_leak[ext_id] = d

    return first_leak


def main():
    leaks_ext = load_first_leak_by_ext_id(LEAKS_EXT)   # from *-extension.csv
    leaks_sw  = load_first_leak_by_ext_id(LEAKS_SW)    # from *-sw.csv

    # Read wallet rows once
    with open(WALLET_INFO, newline="", encoding="utf-8") as fin:
        reader = csv.DictReader(fin)
        wallet_rows = list(reader)
        wallet_fields = reader.fieldnames or []

    # Columns we will append (two sets, with suffixes)
    ext_cols = ["extensionName_ext", "thirdParty_ext", "GET_ext", "POST_ext", "WebSockets_ext", "Cookies_ext", "service_worker_ext"]
    sw_cols  = ["extensionName_sw",  "thirdParty_sw",  "GET_sw",  "POST_sw",  "WebSockets_sw",  "Cookies_sw",  "service_worker_sw"]
    flags    = ["hasLeakExt", "hasLeakSW", "hasLeak"]

    out_fields = wallet_fields + [c for c in flags + ext_cols + sw_cols if c not in wallet_fields]

    with open(OUT, "w", newline="", encoding="utf-8") as fout:
        writer = csv.DictWriter(fout, fieldnames=out_fields)
        writer.writeheader()

        for row in wallet_rows:
            ext_id = (row.get("pathID") or "").strip()

            # extension-leaks (UI/extension context)
            leak_ext = leaks_ext.get(ext_id)
            if leak_ext:
                row["hasLeakExt"] = "yes"
                row["extensionName_ext"]  = leak_ext["extensionName"]
                row["thirdParty_ext"]     = leak_ext["thirdParty"]
                row["GET_ext"]            = leak_ext["GET"]
                row["POST_ext"]           = leak_ext["POST"]
                row["WebSockets_ext"]     = leak_ext["WebSockets"]
                row["Cookies_ext"]        = leak_ext["Cookies"]
                row["service_worker_ext"] = leak_ext["service_worker"]
            else:
                row["hasLeakExt"] = "no"
                row.setdefault("extensionName_ext", "")
                row.setdefault("thirdParty_ext", "")
                row.setdefault("GET_ext", 0)
                row.setdefault("POST_ext", 0)
                row.setdefault("WebSockets_ext", 0)
                row.setdefault("Cookies_ext", 0)
                row.setdefault("service_worker_ext", "")

            # service-worker leaks (SW context)
            leak_sw = leaks_sw.get(ext_id)
            if leak_sw:
                row["hasLeakSW"] = "yes"
                row["extensionName_sw"]  = leak_sw["extensionName"]
                row["thirdParty_sw"]     = leak_sw["thirdParty"]
                row["GET_sw"]            = leak_sw["GET"]
                row["POST_sw"]           = leak_sw["POST"]
                row["WebSockets_sw"]     = leak_sw["WebSockets"]
                row["Cookies_sw"]        = leak_sw["Cookies"]
                row["service_worker_sw"] = leak_sw["service_worker"]
            else:
                row["hasLeakSW"] = "no"
                row.setdefault("extensionName_sw", "")
                row.setdefault("thirdParty_sw", "")
                row.setdefault("GET_sw", 0)
                row.setdefault("POST_sw", 0)
                row.setdefault("WebSockets_sw", 0)
                row.setdefault("Cookies_sw", 0)
                row.setdefault("service_worker_sw", "")

            # overall flag
            row["hasLeak"] = "yes" if (row["hasLeakExt"] == "yes" or row["hasLeakSW"] == "yes") else "no"

            writer.writerow(row)

    print(f"✅ Done! Wrote merged file -> {OUT}")


if __name__ == "__main__":
    main()
