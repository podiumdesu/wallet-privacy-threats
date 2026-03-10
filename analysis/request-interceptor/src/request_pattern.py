#!/usr/bin/env python3
import os
import sys
import json
import argparse
import csv
from urllib.parse import urlparse

# ----------------- helpers -----------------


def load_extension_catalog(path):
    """
    Read extensions.csv with columns:
    name,id,url,users,rating

    Returns: dict[id] = {"name": ..., "url": ..., "users": int, "rating": float}
    """
    catalog = {}
    if not os.path.exists(path):
        return catalog

    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh, delimiter=",")
        for row in reader:
            ext_id = (row.get("ID") or "").strip()
            if not ext_id:
                continue

            downloads = row.get("Downloads", "").replace(",", "").strip()

            catalog[ext_id] = {
                "name": (row.get("Name") or "").strip(),
                "url": (row.get("URL") or "").strip(),
                "users": int(downloads) if downloads.isdigit() else 0,
                "rating": 0.0,   # not present in this CSV
            }
            
    return catalog


def load_json(path):
    """Safely load a JSON file, or return None if missing."""
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def request_leaks_wallet(req, patterns):
    """
    True if any wallet pattern appears in:
    - URL
    - postData
    - requestContext
    - request headers
    - response headers

    patterns should already be lowercase variants (from build_wallet_patterns).
    """
    if not patterns:
        return False

    pieces = []

    url = req.get("url") or ""
    pieces.append(url)

    post = req.get("postData") or ""
    pieces.append(post)

    rc = req.get("requestContext")
    if isinstance(rc, list):
        pieces.extend(rc)
    else:
        pieces.append(str(rc or ""))

    req_headers = req.get("headers") or {}
    pieces.append(" ".join(f"{k}: {v}" for k, v in req_headers.items()))

    resp_headers = req.get("responseHeaders") or {}
    pieces.append(" ".join(f"{k}: {v}" for k, v in resp_headers.items()))

    blob = " ".join(pieces)
    blob_low = blob.lower()
    blob_low_no0x = blob_low.replace("0x", "")

    for p in patterns:
        if not p:
            continue
        if p in blob_low or p in blob_low_no0x:
            return True

    return False


def wallet_patterns_in_request(req, patterns):
    """
    Return a set of wallet patterns that appear in this request.
    Uses the same surfaces and normalization as request_leaks_wallet,
    but does NOT stop at the first match.
    """
    matched = set()
    if not patterns:
        return matched

    pieces = []

    url = req.get("url") or ""
    pieces.append(url)

    post = req.get("postData") or ""
    pieces.append(post)

    rc = req.get("requestContext")
    if isinstance(rc, list):
        pieces.extend(rc)
    else:
        pieces.append(str(rc or ""))

    req_headers = req.get("headers") or {}
    pieces.append(" ".join(f"{k}: {v}" for k, v in req_headers.items()))

    resp_headers = req.get("responseHeaders") or {}
    pieces.append(" ".join(f"{k}: {v}" for k, v in resp_headers.items()))

    blob = " ".join(pieces)
    blob_low = blob.lower()
    blob_low_no0x = blob_low.replace("0x", "")

    for p in patterns:
        if not p:
            continue
        if p in blob_low or p in blob_low_no0x:
            matched.add(p)

    return matched


def extract_metadata(data):
    """
    Extract all fields except 'requests'.
    Wallet JSON + ServiceWorker JSON may both have metadata.
    ServiceWorker metadata overrides wallet metadata if keys overlap.
    """
    if not isinstance(data, dict):
        return {}

    meta = {}
    for k, v in data.items():
        if k != "requests":
            meta[k] = v
    return meta


def extract_wallet_addresses(meta):
    """
    Returns a list of wallet addresses from metadata["walletAddress"].
    Format: "addr1;addr2;addr3"
    """
    raw = meta.get("walletAddress") or ""
    parts = [x.strip() for x in raw.split(";") if x.strip()]
    return parts


def build_wallet_patterns(addresses):
    """
    From a list of wallet addresses, build resilient lowercase patterns:
    - remove common prefixes like 0x, addr1q, bc1q
    - deduplicated
    """
    patterns = set()

    for addr in addresses:
        if not addr:
            continue
        a = addr.strip()
        if not a:
            continue

        a_low = a.lower()

        if a_low.startswith("0x"):
            patterns.add(a_low[2:])
        elif a_low.startswith("addr1q"):
            patterns.add(a_low[6:])
        elif a_low.startswith("bc1q"):
            patterns.add(a_low[4:])
        else:
            patterns.add(a_low)

    return list(patterns)


def request_is_from_extension(req, extension_id):
    """
    True if requestContext starts with chrome-extension://<extension_id>
    requestContext can be a string or a list.

    If extension_id is falsy, we treat ALL requests as 'from extension'
    (to avoid dropping data when metadata is missing).
    """
    if not extension_id:
        return True

    prefix = f"chrome-extension://{extension_id}"
    rc = req.get("requestContext")

    if isinstance(rc, list):
        return any((item or "").startswith(prefix) for item in rc)
    else:
        return str(rc or "").startswith(prefix)


def get_domain(url: str) -> str:
    """Return full host (no port) from URL, in lowercase."""
    try:
        p = urlparse(url or "")
        host = p.netloc or p.path
        if ":" in host:
            host = host.split(":", 1)[0]
        return host.lower().rstrip(".")
    except Exception:
        return ""


def etld1(domain: str) -> str:
    """
    Return the last two labels of a domain.
    example: api.kraken.com -> kraken.com
    """
    if not domain:
        return ""
    parts = domain.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return domain

# ----------------- main -----------------

def main():
    ap = argparse.ArgumentParser(
        description="Merge wallet + serviceworker traffic per extension and detect wallet-address leaks + patterns."
    )
    ap.add_argument("--ext-list",
                    help="Path to file listing extension IDs (one per line)")
    ap.add_argument("--input-dir",
                    help="Base input dir with wallet/ and serviceworker/")
    ap.add_argument("--out-dir",
                    help="Output dir for JSON files")
    args = ap.parse_args()
    out_dir = args.out_dir
    if not os.path.exists(args.ext_list):
        print(f"[!] ext-list not found: {args.ext_list}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(out_dir, exist_ok=True)

    # read all extension IDs (path IDs)
    extensions = []
    with open(args.ext_list, "r", encoding="utf-8") as fh:
        for line in fh:
            ext = line.strip()
            if not ext or ext.startswith("#"):
                continue
            extensions.append(ext)

    print(f"[*] Found {len(extensions)} extensions in ext-list")
    # load official catalog (name, users, rating)
    base_dir = os.path.dirname(args.input_dir.rstrip("/"))
    catalog = load_extension_catalog(os.path.join(base_dir, "extensions.csv"))
    print("Loaded catalog entries:", len(catalog), os.path.join(base_dir, "extensions.csv"))

    # CSV: per-extension wallet leak summary + domains
    wallet_csv_path = os.path.join(out_dir, "./wallet_leaks_per_extension.csv")
    wallet_csv_fh = open(wallet_csv_path, "w", encoding="utf-8", newline="")
    wallet_writer = csv.writer(wallet_csv_fh, delimiter=";")

    wallet_writer.writerow([
        "extension_path_id",
        "runtime_extensionID",
        "official_name",
        "users",
        "wallet_addresses",
        "wallet_leak_hits",
        "sample_wallet_leak_urls",
        "multi_wallet_leak_hits",
        "multi_wallet_domains",        # NEW
        "multi_window_hits",
        "multi_window_domains",        # NEW
        "sample_multi_wallet_leak_urls",
        "num_third_party_domains",
        "third_party_domains",
    ])




    WINDOW_MS = 10  # time window for cross-request pattern

    for ext in extensions:
        print(f"[*] {ext}")

        wallet_path = os.path.join(args.input_dir, "wallet", f"{ext}.json")
        sw_path     = os.path.join(args.input_dir, "serviceworker", f"{ext}-wallet.json")

        wallet_data = load_json(wallet_path) or {}
        sw_data     = load_json(sw_path) or {}

        wallet_reqs = wallet_data.get("requests", []) or []
        sw_reqs     = sw_data.get("requests", []) or []
        merged_requests = wallet_reqs + sw_reqs

        # merge metadata
        metadata = {}
        metadata.update(extract_metadata(wallet_data))
        metadata.update(extract_metadata(sw_data))

        # runtime extension ID from metadata (fallback to pathID if missing)
        extension_id = metadata.get("extensionID", ext)

        # wallet addresses and patterns
        wallet_addresses = extract_wallet_addresses(metadata)
        wallet_patterns  = build_wallet_patterns(wallet_addresses)

        print("wallet patterns", wallet_patterns)
        wallet_leak_hits = 0
        sample_wallet_leak_urls = []
        leak_domains_this_ext = set()

        # multi-wallet in a single request
        multi_wallet_leak_hits = 0
        sample_multi_wallet_urls = []
        multi_wallet_requests = []   # store the actual suspicious requests

        # for cross-request temporal patterns
        leak_events_for_window = []  # each item: {"ts": int, "patterns": [...], "request": {...}}

        multi_wallet_leak_domains = set()      # NEW
        multi_window_domains = set()          # NEW

        for req in merged_requests:
            # only consider requests coming from the extension itself
            if not request_is_from_extension(req, extension_id):
                continue

            # find which wallet patterns appear in this request
            matched_patterns = wallet_patterns_in_request(req, wallet_patterns)
            if not matched_patterns:
                continue  # no wallet leak here

            # at least 1 wallet address pattern → count as leak
            wallet_leak_hits += 1

            url = req.get("url", "") or ""
            if url and len(sample_wallet_leak_urls) < 5:
                sample_wallet_leak_urls.append(url)

            # if MORE THAN ONE pattern → multi-wallet leak (within one request)
            if len(matched_patterns) > 1:
                multi_wallet_leak_hits += 1
                if url and len(sample_multi_wallet_urls) < 5:
                    sample_multi_wallet_urls.append(url)

                # store this suspicious request, annotated with which patterns matched
                req_copy = dict(req)
                req_copy["_matched_wallet_patterns"] = sorted(matched_patterns)
                multi_wallet_requests.append(req_copy)
                
                # NEW → record domain
                if url:
                    d = etld1(get_domain(url))
                    if d:
                        multi_wallet_leak_domains.add(d)

            # collect third-party domain for this leak
            dom = get_domain(url)
            base_dom = etld1(dom)
            if base_dom:
                leak_domains_this_ext.add(base_dom)

            # collect for window-based analysis (needs timestamp)
            ts_raw = req.get("ts")
            try:
                ts_val = int(ts_raw) if ts_raw is not None else None
            except Exception:
                ts_val = None

            if ts_val is not None:
                leak_events_for_window.append({
                    "ts": ts_val,
                    "patterns": sorted(matched_patterns),
                    "request": dict(req),
                })

        # ---- cross-request temporal analysis: different addresses within 10ms ----
        multi_window_pairs = []
        if leak_events_for_window:
            # sort events by timestamp
            leak_events_for_window.sort(key=lambda e: e["ts"])
            seen_pairs = set()  # avoid duplicates

            n = len(leak_events_for_window)
            for i in range(n):
                e1 = leak_events_for_window[i]
                ts1 = e1["ts"]
                pats1 = set(e1["patterns"])

                # slide forward while within WINDOW_MS
                j = i + 1
                while j < n:
                    e2 = leak_events_for_window[j]
                    ts2 = e2["ts"]
                    if ts2 - ts1 > WINDOW_MS:
                        break

                    pats2 = set(e2["patterns"])
                    union = pats1 | pats2

                    # need at least 2 distinct addresses and sets not equal
                    if len(union) >= 2 and pats1 != pats2:
                        key = (ts1, ts2, tuple(sorted(union)))
                        if key not in seen_pairs:
                            seen_pairs.add(key)
                            multi_window_pairs.append({
                                "ts_first": ts1,
                                "ts_second": ts2,
                                "patterns_first": sorted(pats1),
                                "patterns_second": sorted(pats2),
                                "url_first": e1["request"].get("url", ""),
                                "url_second": e2["request"].get("url", ""),
                                "req_first": e1["request"],
                                "req_second": e2["request"],
                            })
                            # NEW → collect domains for multi-window hits
                            u1 = e1["request"].get("url", "")
                            u2 = e2["request"].get("url", "")
                            d1 = etld1(get_domain(u1))
                            d2 = etld1(get_domain(u2))
                            if d1:
                                multi_window_domains.add(d1)
                            if d2:
                                multi_window_domains.add(d2)

                    j += 1

        # ---- write JSON with ONLY multi-wallet requests + metadata ----
        out_obj = {
            **metadata,
            "pathID": ext,
            "extensionID": extension_id,
            "total_requests": len(merged_requests),
            "walletAddresses": wallet_addresses,
            "multi_wallet_leak_hits": multi_wallet_leak_hits,
            "multi_wallet_domains": sorted(multi_wallet_leak_domains),   # NEW
            "multiAddrReq": multi_wallet_requests,
        }

        merged_dir = os.path.join(args.out_dir, "ana_out")
        os.makedirs(merged_dir, exist_ok=True)

        out_path = os.path.join(merged_dir, f"{ext}_multi.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out_obj, f, indent=2)
        print(f"    [+] wrote {len(multi_wallet_requests)} multi-wallet requests to {out_path}")

        # ---- write JSON for temporal multi-address pattern within 10ms ----
        window_obj = {
            **metadata,
            "pathID": ext,
            "extensionID": extension_id,
            "walletAddresses": wallet_addresses,
            "windowSizeMs": WINDOW_MS,
            "multi_window_hits": len(multi_window_pairs),
            "multi_window_domains": sorted(multi_window_domains),   # NEW
            "multiWindowPairs": multi_window_pairs,
        }

        window_path = os.path.join(merged_dir, f"{ext}_multiwindow.json")
        with open(window_path, "w", encoding="utf-8") as f:
            json.dump(window_obj, f, indent=2)
        print(f"    [+] wrote {len(multi_window_pairs)} cross-request multi-window pairs to {window_path}")


        ext_info = catalog.get(ext, {})
        official_name = ext_info.get("name", "")
        users = ext_info.get("users", 0)
        # write CSV row for this extension (summary)
        wallet_writer.writerow([
            ext,
            extension_id,
            official_name,
            users,
            "|".join(wallet_addresses),
            wallet_leak_hits,
            "|".join(sample_wallet_leak_urls),
            multi_wallet_leak_hits,
            "|".join(sorted(multi_wallet_leak_domains)),    # NEW
            len(multi_window_pairs),
            "|".join(sorted(multi_window_domains)),         # NEW
            "|".join(sample_multi_wallet_urls),
            len(leak_domains_this_ext),
            "|".join(sorted(leak_domains_this_ext)),
        ])




    wallet_csv_fh.close()
    print(f"[✓] wallet leaks CSV written to {wallet_csv_path}")
    print("[✓] Done.")

if __name__ == "__main__":
    main()
