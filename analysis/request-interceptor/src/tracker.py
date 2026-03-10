#!/usr/bin/env python3
import os
import sys
import json
import argparse
import csv

from urllib.parse import urlparse
import re

from collections import Counter
from collections import defaultdict

ANALYTICS_DOMAINS = (
    "google-analytics.com","analytics.google.com","googletagmanager.com",
    "segment.com","amplitude.com","mixpanel.com","rudderstack.com",
    "hotjar.com","fullstory.com","logrocket.com","heap.io","posthog.com",
    "braze.com","intercom.io","appsflyer.com","adjust.com","branch.io",
)
TELEMETRY_DOMAINS = (
    "sentry.io","datadoghq.com","newrelic.com","rollbar.com","bugsnag.com",
)

RPC_METHOD_HINT = re.compile(
    r'"\s*jsonrpc"\s*:\s*"[0-9.]+"|"\s*method"\s*:\s*"(eth_|net_|web3_|personal_|sol_|get|icx_|hmy_|near_|sui_|aptos)',
    re.I
)



def load_extension_catalog(path):
    """
    Read extension.csv with columns:
    name,id,url,users,rating

    Returns: dict[id] = {"name": ..., "url": ..., "users": int, "rating": float}
    """
    catalog = {}
    if not os.path.exists(path):
        return catalog

    # adjust delimiter if your file is tab-separated
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


def build_wallet_patterns(addresses):
    """
    From a list of wallet addresses, build resilient lowercase patterns:
    - with and without '0x' prefix
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
        # with 0x as-is
        patterns.add(a_low)

        # strip leading 0x if present
        if a_low.startswith("0x"):
            patterns.add(a_low[2:])

    return list(patterns)


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


def get_domain(url: str) -> str:
    try:
        p = urlparse(url or "")
        host = p.netloc or p.path
        if ":" in host:
            host = host.split(":", 1)[0]
        return host.lower().rstrip(".")
    except Exception:
        return ""

def classify_destination(url: str, headers: dict, body: str) -> str:
    """
    Classify a leak as one of: 'analytics', 'telemetry', 'rpc', 'unknown'.
    """
    d = get_domain(url)
    u = (url or "").lower()
    h = {k.lower(): str(v).lower() for k, v in (headers or {}).items()}
    b = (body or "").lower()

    # analytics / telemetry by domain
    if any(a in d for a in ANALYTICS_DOMAINS):
        return "analytics"
    if any(t in d for t in TELEMETRY_DOMAINS):
        return "telemetry"
    # rpc-ish: URL path or JSON-RPC body
    ct = h.get("content-type", "")
    if "application/json" in ct or "/json" in ct:
        if RPC_METHOD_HINT.search(b or ""):
            return "rpc"
    if "/rpc" in u or "/jsonrpc" in u or "rpc." in d:
        return "rpc"

    return "unknown"



def load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def request_is_from_extension(req, extension_id):
    """
    True if requestContext starts with chrome-extension://<extension_id>
    requestContext can be a string or a list.
    """
    prefix = f"chrome-extension://{extension_id}"
    rc = req.get("requestContext")

    if isinstance(rc, list):
        return any((item or "").startswith(prefix) for item in rc)
    else:
        return str(rc or "").startswith(prefix)


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
        if k != "requests":  # keep everything except requests
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

def request_has_analytics(req):
    """
    Return True if 'analytics' appears in:
    - URL
    - requestContext (string or list)
    """
    # URL
    url = (req.get("url") or "").lower()
    if "analytics" in url:
        return True
    
    d = get_domain(url)

    # analytics / telemetry by domain
    if any(a in d for a in ANALYTICS_DOMAINS):
        return True
    
    # postData = (req.get("postData") or "").lower()
    # if "analytics" in postData:
    #     return True

    # headers = req.get("requestHeaders")
    # requestContext (string or list)
    # rc = req.get("requestContext")
    # if isinstance(rc, list):
    #     for item in rc:
    #         if item and "analytics" in item.lower():
    #             return True
    # else:
    #     rc_str = str(rc or "").lower()
    #     if "analytics" in rc_str:
    #         return True

    return False

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
    blob_low_no0x = blob_low.replace("0x", "")  # helps when text omits or adds 0x

    for p in patterns:
        if not p:
            continue
        if p in blob_low or p in blob_low_no0x:
            return True

    return False


def main():
    ap = argparse.ArgumentParser(
        description="Super simple: merge wallet + serviceworker traffic per extension."
    )
    ap.add_argument("--ext-list",
                    help="Path to file listing extension IDs (one per line)")
    ap.add_argument("--input-dir",
                    help="Base input dir with wallet/ and serviceworker/")
    ap.add_argument("--out-dir",
                    help="Output dir")
    args = ap.parse_args()
    out_base = args.out_dir
    if not os.path.exists(args.ext_list):
        print(f"[!] ext-list not found: {args.ext_list}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(out_base, exist_ok=True)

    # read all extension IDs
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
    catalog = load_extension_catalog(os.path.join(base_dir, "./extensions.csv"))
    print("Loaded catalog entries:", len(catalog))
    print("Some catalog keys:", list(catalog.keys())[:5])

    # CSV for third-party domains per extension
    thirdparty_csv_path = os.path.join(out_base, "./third_party_domains_per_extension.csv")
    thirdparty_fh = open(thirdparty_csv_path, "w", encoding="utf-8", newline="")
    thirdparty_writer = csv.writer(thirdparty_fh, delimiter=";")

    thirdparty_writer.writerow([
        "extension_path_id",
        "runtime_extensionID",
        "official_name",
        "users",
        "rating",
        "num_third_party_domains",
        "third_party_domains",       # pipe-separated eTLD+1
    ])



    out_csv_path = os.path.join(out_base, "./analytics_summary.csv")
    csv_fh = open(out_csv_path, "w", encoding="utf-8", newline="")
    writer = csv.writer(csv_fh, delimiter=";")

    # header row
    # Header row
    writer.writerow([
        "extension_path_id",
        "runtime_extensionID",
        "walletName",
        "notes",
        "total_requests",
        "analytics_hits",
        "sample_analytics_urls",
        "wallet_leak_hits",
        "wallet_leak_sample_urls",
        "wallet_addresses",
    ])

    leak_type_csv_path = os.path.join(out_base, "./wallet_leak_types.csv")
    leak_type_fh = open(leak_type_csv_path, "w", encoding="utf-8", newline="")
    leak_type_writer = csv.writer(leak_type_fh, delimiter=";")

    leak_type_writer.writerow([
        "extension_path_id",
        "runtime_extensionID",
        "walletName",
        "wallet_leak_total",
        "wallet_leak_rpc",
        "wallet_leak_analytics",
        "wallet_leak_telemetry",
        "wallet_leak_unknown",
    ])
    
    # domain -> set of extensions that ever hit this analytics domain
    analytics_domain_to_exts = defaultdict(set)
    # domain / url -> set of extensions that leaked a wallet address there
    wallet_leak_domain_to_exts = defaultdict(set)
    wallet_leak_domain_to_walletnames = defaultdict(set)
    wallet_leak_url_to_exts = defaultdict(set)

    for ext in extensions:
        analytics_domains_this_ext = set()
        wallet_leak_domains_this_ext = set()
        wallet_leak_urls_this_ext = set()
        third_party_domains_this_ext = set()


        print(f"[*] {ext}")

        wallet_path = os.path.join(args.input_dir, "wallet", f"{ext}.json")
        sw_path     = os.path.join(args.input_dir, "serviceworker", f"{ext}-wallet.json")

        wallet_data = load_json(wallet_path) or {}
        sw_data     = load_json(sw_path) or {}

        wallet_reqs = wallet_data.get("requests", []) or []
        sw_reqs     = sw_data.get("requests", []) or []
        merged_requests = wallet_reqs + sw_reqs

 

        # --- NEW: merge metadata ---
        metadata = {}
        metadata.update(extract_metadata(wallet_data))
        metadata.update(extract_metadata(sw_data))   # serviceworker overrides wallet if same key

        wallet_addresses = extract_wallet_addresses(metadata)
        wallet_patterns = build_wallet_patterns(wallet_addresses)
        
        wallet_leak_hits = 0
        wallet_leak_urls = []

        wallet_leak_rpc = 0
        wallet_leak_analytics = 0
        wallet_leak_telemetry = 0
        wallet_leak_unknown = 0

        # IMPORTANT: runtime extension id from metadata
        extension_id = metadata.get("extensionID", ext)
        
        # try to see the results
        analytics_hits = 0
        sample_analytics_urls = []

        for req in merged_requests:
            # only if request is from owned extension
            if not request_is_from_extension(req, extension_id):
                continue



            # --- analytics tracking (unique per extension) ---
            if request_has_analytics(req):
                url = req.get("url", "")
                dom = get_domain(url)
                if dom:
                    analytics_domains_this_ext.add(dom)

                analytics_hits += 1
                if len(sample_analytics_urls) < 5:
                    sample_analytics_urls.append(req.get("url", ""))

            if request_leaks_wallet(req, wallet_patterns):
                wallet_leak_hits += 1
                url = req.get("url", "")
                
                if len(wallet_leak_urls) < 5:
                    wallet_leak_urls.append(url)

                # collect domain + full URL for global stats
                dom = get_domain(url)
                base_dom = etld1(dom)
                if base_dom:
                    wallet_leak_domains_this_ext.add(base_dom)
                    third_party_domains_this_ext.add(base_dom)
                if url:
                    wallet_leak_urls_this_ext.add(url)
                    
                    
                post = req.get("postData", "") or ""
                
                req_headers = req.get("headers") or {}

                dest_class = classify_destination(url, req_headers, post)

                if dest_class == "rpc":
                    wallet_leak_rpc += 1
                elif dest_class == "analytics":
                    wallet_leak_analytics += 1
                elif dest_class == "telemetry":
                    wallet_leak_telemetry += 1
                else:
                    wallet_leak_unknown += 1

                if len(wallet_leak_urls) < 5:
                    wallet_leak_urls.append(url)
        print(analytics_domains_this_ext)
        for dom in analytics_domains_this_ext:
            analytics_domain_to_exts[dom].add(extension_id)  # or `ext` if you prefer pathID
        wallet_name = metadata.get("walletName", "")
        for dom in wallet_leak_domains_this_ext:
            wallet_leak_domain_to_exts[dom].add(extension_id)   # or ext if you prefer pathID
            if wallet_name:
                wallet_leak_domain_to_walletnames[dom].add(wallet_name)
        for url in wallet_leak_urls_this_ext:
            wallet_leak_url_to_exts[url].add(extension_id)
            

        # for req in merged_requests:
            # only consider requests actually coming from this extension
            # if not request_is_from_extension(req, extension_id):
            #     continue

                    
        out_obj = {
            **metadata,   # keep all the original metadata fields
            "extensionID": ext,
            "total_requests": len(merged_requests),
            "requests": merged_requests,
        }
        
        merged_dir = os.path.join(args.out_dir, "merged")
        os.makedirs(merged_dir, exist_ok=True)

        out_path = os.path.join(merged_dir, f"{ext}_merged.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out_obj, f, indent=2)

        print(f"    [+] wrote merged traffic to {out_path}")
        
        writer.writerow([
            ext,                                           # path ID
            extension_id,                                  # runtime extensionID
            metadata.get("walletName", ""),                # walletName
            metadata.get("notes", ""),                     # notes

            len(merged_requests),                          # total requests scanned
            analytics_hits,                                # count
            "|".join(sample_analytics_urls),               # sample analytics URLs
            wallet_leak_hits,                              # wallet address leak count
            "|".join(wallet_leak_urls),                     # sample urls leaking wallet address
            "|".join(wallet_addresses),                    # all wallet addresses
        ])
        
        leak_type_writer.writerow([
            ext,
            extension_id,
            metadata.get("walletName", ""),
            wallet_leak_hits,
            wallet_leak_rpc,
            wallet_leak_analytics,
            wallet_leak_telemetry,
            wallet_leak_unknown,
        ])
        
        ext_info = catalog.get(ext, {})
        print(ext_info.get("name", ""))
        official_name = ext_info.get("name", "")
        users = ext_info.get("users", "")
        rating = ext_info.get("rating", "")

        thirdparty_writer.writerow([
            ext,                                # path ID (from ext-list)
            extension_id,                       # runtime extension ID (from metadata)
            official_name,
            users,
            rating,
            len(third_party_domains_this_ext),
            " ,".join(sorted(third_party_domains_this_ext)),
        ])


    csv_fh.close()
    leak_type_fh.close()
    thirdparty_fh.close()
    print(f"[✓] third-party domains CSV written to {thirdparty_csv_path}")

    print(f"[✓] CSV written to {out_csv_path}")
    print(f"[✓] wallet leak type CSV written to {leak_type_csv_path}")
    
    analytics_unique_csv_path = os.path.join(out_base, "./analytics_sites_unique.csv")
    with open(analytics_unique_csv_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["domain", "unique_extensions"])

        # sort by number of unique extensions (descending)
        items = sorted(
            analytics_domain_to_exts.items(),
            key=lambda kv: len(kv[1]),
            reverse=True,
        )
        for domain, ext_set in items:
            writer.writerow([domain, len(ext_set)])

    print(f"[✓] analytics unique-sites CSV written to {analytics_unique_csv_path}")


    wallet_leak_domains_csv = os.path.join(out_base, "./wallet_leak_domains.csv")
    with open(wallet_leak_domains_csv, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow([
            "domain",
            "unique_extensions_with_wallet_leak",
            "wallet_names",                           # NEW
        ])

        items = sorted(
            wallet_leak_domain_to_exts.items(),
            key=lambda kv: len(kv[1]),
            reverse=True,
        )
        for domain, ext_set in items:
            names = sorted(wallet_leak_domain_to_walletnames.get(domain, set()))
            writer.writerow([
                domain,
                len(ext_set),
                "|".join(names),                      # e.g. "metamask|rabby|phantom"
            ])


    wallet_leak_urls_csv = os.path.join(out_base, "./wallet_leak_urls.csv")
    with open(wallet_leak_urls_csv, "w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["url", "unique_extensions_with_wallet_leak"])

        items = sorted(
            wallet_leak_url_to_exts.items(),
            key=lambda kv: len(kv[1]),
            reverse=True,
        )
        for url, ext_set in items:
            writer.writerow([url, len(ext_set)])
    print(f"[✓] wallet leak domains CSV written to {wallet_leak_domains_csv}")
    print(f"[✓] wallet leak URLs CSV written to {wallet_leak_urls_csv}")

    print("[✓] Done.")

if __name__ == "__main__":
    main()
