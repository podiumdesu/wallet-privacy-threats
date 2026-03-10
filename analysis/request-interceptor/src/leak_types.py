#!/usr/bin/env python3
# Put all the results together, like how many of them 
# Extension id	Extension name	rpc?	analytics?	telemetry?	cdn?	other?
# nkbihfbeogaeaoehlefnkodbefgpgknn		1	0	0	0	1
# bfnaelmomeimhlpmgjnjophhpkkoljpa		0	0	0	0	1

import os, sys, csv, json, argparse, re
from datetime import datetime
from urllib.parse import urlparse
from collections import defaultdict

import LeakDetector  # your existing module

MAX_LAYERS = 2
DEBUG = False

# -------------------- helpers --------------------

def canonical_addr_variants(addr: str):
    if not addr: return []
    addr = addr.strip()
    no0x = addr[2:] if addr.lower().startswith("0x") else addr
    return list(dict.fromkeys([
        addr, no0x, addr.lower(), addr.upper(), no0x.lower(), no0x.upper()
    ]))

def collect_known_terms(run_json):
    terms = []
    wa = (run_json.get("walletAddress") or "").strip()
    for chunk in filter(None, [p.strip() for p in wa.split(";")]):
        if ":" in chunk:
            chunk = chunk.split(":", 1)[1]
        terms.extend(canonical_addr_variants(chunk))
    pw = run_json.get("password")
    if pw:
        terms.append(str(pw))
    return list(dict.fromkeys([t for t in terms if t]))


def dedupe_hits_longest_first(hits):
    """
    hits: list of tuples (surface, matched, stack, blob, ...optional...)
    Returns a filtered list where, per surface, any match that is a substring
    of another kept match is removed. This removes 'base' when '0xbase' is present.
    """
    from collections import defaultdict

    by_surface = defaultdict(list)
    for h in hits:
        by_surface[h[0]].append(h)  # group by surface (URL/POST/Header/Cookie)

    kept = []
    for surface, group in by_surface.items():
        # sort by descending length of matched text
        group_sorted = sorted(group, key=lambda x: len(x[1]), reverse=True)
        kept_texts = []  # texts we've kept for this surface
        for h in group_sorted:
            m = h[1]
            # if this match is a substring of any already kept longer match, skip it
            if any(m in kt for kt in kept_texts):
                continue
            kept_texts.append(m)
            kept.append(h)
    return kept


def etld1(host: str):
    parts = (host or "").split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host or ""

def get_domain(url: str):
    try:
        p = urlparse(url or "")
        host = p.netloc or p.path
        if ":" in host:
            host = host.split(":", 1)[0]
        return etld1(host.lower().rstrip("."))
    except Exception:
        return ""

ANALYTICS = (
    "google-analytics.com","analytics.google.com","googletagmanager.com",
    "segment.com","amplitude.com","mixpanel.com","rudderstack.com",
    "hotjar.com","fullstory.com","logrocket.com","heap.io","posthog.com",
    "braze.com","intercom.io","appsflyer.com","adjust.com","branch.io",
    "sentry.io","datadoghq.com","newrelic.com","rollbar.com","bugsnag.com",
)
TELEMETRY = ("sentry.io","datadoghq.com","newrelic.com","rollbar.com","bugsnag.com")
CDN_HINTS = ("cloudfront.net","fastly.net","akamai","cdn.","cdn-","static.","assets.")

RPC_METHOD_HINT = re.compile(
    r'"\s*jsonrpc"\s*:\s*"[0-9.]+"|"\s*method"\s*:\s*"(eth_|net_|web3_|personal_|sol_|get|icx_|hmy_|near_|sui_|aptos)',
    re.I
)

def classify_destination(domain: str, url: str, headers: dict, body: str):
    d = (domain or "").lower()
    u = (url or "").lower()
    h = {k.lower(): str(v).lower() for k,v in (headers or {}).items()}
    b = (body or "").lower()

    if d.endswith(ANALYTICS) or any(a in d for a in ANALYTICS):
        if d.endswith(TELEMETRY) or any(t in d for t in TELEMETRY):
            return "telemetry"
        return "analytics"

    if any(hint in d for hint in CDN_HINTS) or any(hint in u for hint in CDN_HINTS):
        return "cdn"

    ct = h.get("content-type","")
    if "application/json" in ct or "/json" in ct:
        if RPC_METHOD_HINT.search(body or ""):
            return "rpc"
    if "/rpc" in u or "/jsonrpc" in u or "rpc." in d:
        return "rpc"

    return "other"

def dict_to_header_text(h):
    if not h: return ""
    try:
        return " ".join([f"{k}: {v}" for k,v in h.items()])
    except Exception:
        return str(h)

def build_detector(search_terms):
    return LeakDetector.LeakDetector(
        search_terms,
        encoding_set=LeakDetector.LIKELY_ENCODINGS,
        hash_set=LeakDetector.LIKELY_HASHES,
        encoding_layers=MAX_LAYERS,
        hash_layers=1,
        debugging=DEBUG
    )

def _scan_with_pool(detector, blob: str):
    """
    Case-insensitive, de-duplicated scanning:
    - For each precomputed needle, normalize to lowercase.
    - Search once using hay_lower.find(canonical_needle).
    - If found, return the *actual* substring from hay.
    - Skip duplicate canonical needles, so UPPER/lower variants don't double count.
    """
    if not blob:
        return []
    try:
        hay = blob if isinstance(blob, str) else str(blob)
    except Exception:
        hay = str(blob)

    hay_lower = hay.lower()
    hits = []
    seen_canonical = set()  # needles we've already searched (lowercased)

    # iterate the pool; order doesn't matter because we de-dupe by canonical needle
    for _, stack_map in detector._precompute_pool_by_layer.items():
        for stack_tuple, transformed_bytes in stack_map.items():
            try:
                needle = transformed_bytes.decode("utf-8", errors="ignore")
            except Exception:
                needle = str(transformed_bytes)
            if not needle:
                continue

            can = needle.lower()
            if can in seen_canonical:
                continue  # skip duplicate needle differing only by case
            seen_canonical.add(can)

            idx = hay_lower.find(can)
            if idx != -1:
                # slice from original hay to preserve original casing in the match
                matched = hay[idx: idx + len(can)]
                hits.append((matched, stack_tuple))

    return hits


def check_surfaces(detector, url: str, post: str, req_headers: dict, resp_headers: dict):
    events = []

    for s, stack in _scan_with_pool(detector, url or ""):
        events.append(("URL", s, stack, url))

    if post:
        for s, stack in _scan_with_pool(detector, post):
            events.append(("POST", s, stack, post))

    if req_headers:
        htxt = dict_to_header_text(req_headers)
        for s, stack in _scan_with_pool(detector, htxt):
            events.append(("Header", s, stack, htxt))

    cookie_val = ""
    if resp_headers:
        for k, v in resp_headers.items():
            if k.lower() == "set-cookie":
                cookie_val += (" " + str(v))
    cookie_val = cookie_val.strip()
    if not cookie_val and resp_headers:
        cookie_val = dict_to_header_text(resp_headers)
    if cookie_val:
        for s, stack in _scan_with_pool(detector, cookie_val):
            events.append(("Cookie", s, stack, cookie_val))

    # de-dup here
    events = dedupe_hits_longest_first(events)
    return events

def load_json_if(path):
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# -------------------- per-channel analysis --------------------

def analyze_one_file(file_path, channel_tag, extensionID):
    """
    Analyze a single JSON file (wallet OR serviceworker).
    Returns:
      events (list of dict),
      per_domain (counts dict),
      addr_per_domain (dict of sets of detected seed-like addresses)
    """
    data = load_json_if(file_path)
    if not data:
        return [], {}, {}

    if data.get("success") is False:
        return [], {}, {}
    
    extensionID = data.get("extensionID")

    search_terms = collect_known_terms(data)
    if not search_terms:
        return [], {}, {}

    detector = build_detector(search_terms)
    events = []
    per_domain = defaultdict(lambda: {"rpc":0,"analytics":0,"telemetry":0,"cdn":0,"other":0,"total":0})
    addr_per_domain = defaultdict(set)

    for r in data.get("requests", []):
        url = r.get("url","") or ""
        if url.startswith("data:"):
            continue
        request_context = r.get("requestContext")
        if isinstance(request_context, list):
            # If it's a list (non-empty), take the first element
            request_context = request_context[0] if request_context else ""
        elif not isinstance(request_context, str):
            # If it's neither a list nor a string, coerce to string (or blank)
            request_context = str(request_context) if request_context is not None else ""

        # ignore if the request is not from the wallet itself 
        if not request_context.startswith("chrome-extension://" + extensionID):
            continue

        # Skip any request to the extension's own internal resources
        if url.startswith(f"chrome-extension://{extensionID}"):
            continue

        domain = get_domain(url)
        post = r.get("postData","") or ""
        req_headers = r.get("headers") or {}
        resp_headers = r.get("responseHeaders") or {}
        ts = r.get("ts")
        ts_iso = ""
        try:
            if ts is not None:
                from datetime import datetime
                ts_iso = datetime.utcfromtimestamp(int(ts)/1000).isoformat()+"Z"
        except Exception:
            pass

        hits = check_surfaces(detector, url, post, req_headers, resp_headers)
        if not hits:
            continue

        channel = classify_destination(domain, url, req_headers, post)

        for (surface, matched, stack, _blob) in hits:
            per_domain[domain]["total"] += 1
            per_domain[domain][channel] += 1

            # seed hint: which known term is visible in the transformed match
            seed = ""
            for t in search_terms:
                if t.lower() in matched.lower():
                    seed = t
                    break
            if seed:
                addr_per_domain[domain].add(seed)

            events.append({
                "channel": channel_tag,         # "wallet" or "serviceworker"
                "ts": ts_iso,
                "req_id": r.get("id") or "",
                "method": r.get("method") or "",
                "type": r.get("type") or "",
                "domain": domain,
                "url": url,
                "surface": surface,              # URL/POST/Header/Cookie
                "dest_class": channel,           # rpc/analytics/telemetry/cdn/other
                "matched": matched[:200],
                "stack": " > ".join(stack),
                "seed_hint": seed,
                "status": r.get("status") or "",
                "content_type": (r.get("headers") or {}).get("Content-Type",""),
            })

    return events, per_domain, addr_per_domain

# -------------------- batch driver --------------------

def main():
    ap = argparse.ArgumentParser(description="Split wallet vs serviceworker leak detection, with separate JSON outputs and two CSV summaries.")
    ap.add_argument("--ext-list", required=True, help="Path to file listing extension IDs (one per line)")
    ap.add_argument("--input-dir", default="./data", help="Base input dir with wallet/ and serviceworker/")
    ap.add_argument("--out-dir", default="./out", help="Base output dir")
    ap.add_argument("--timestamped", action="store_true", help="Nest outputs under a timestamped subfolder")
    ap.add_argument("--extensions-csv", default="./extensions.csv",
                    help="CSV with columns: extension_id, extension_name (header row required)")
    
    args = ap.parse_args()

    out_base = args.out_dir
    if args.timestamped:
        out_base = os.path.join(out_base, datetime.now().strftime("%Y%m%d%H%M%S"))
    os.makedirs(out_base, exist_ok=True)

    # load id->name map (optional)
    id_to_name = {}
    if os.path.exists(args.extensions_csv):
        with open(args.extensions_csv, newline="", encoding="utf-8") as fh:
            r = csv.reader(fh)
            header = next(r, None)
            for row in r:
                if not row: continue
                ext_id = row[0].strip()
                ext_name = (row[1].strip() if len(row) > 1 else "")
                if ext_id:
                    id_to_name[ext_id] = ext_name

    # prepare CSVs
    separate_csv = os.path.join(out_base, "summary_separate.csv")
    merged_csv   = os.path.join(out_base, "summary_merged.csv")
    ulti_csv     = os.path.join(out_base, "ulti-merge.csv")

    with open(separate_csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([
            "Extension id","Extension name","Channel",  # Channel = wallet | serviceworker
            "Third party domain","total","rpc","analytics","telemetry","cdn","other",
            "detected addresses"
        ])

    with open(merged_csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([
            "Extension id","Extension name","Third party domain",
            "rpc?","analytics?","telemetry?","cdn?","other?",
            "detected addresses"
        ])

    # NEW: ulti-merge: one line per extension, no domains
    with open(ulti_csv, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow([
            "Extension id","Extension name",
            "rpc?","analytics?","telemetry?","cdn?","other?"
        ])

    # load ext-list
    jobs = {}
    if not os.path.exists(args.ext_list):
        print(f"[!] ext-list not found: {args.ext_list}", file=sys.stderr)
        sys.exit(1)
    with open(args.ext_list, "r", encoding="utf-8") as fh:
        for line in fh:
            ext = line.strip()
            if not ext or ext.startswith("#"):
                continue
            jobs[ext] = {
                "wallet": os.path.join(args.input_dir, "wallet", f"{ext}.json"),
                "sw":     os.path.join(args.input_dir, "serviceworker", f"{ext}-wallet.json"),
                "out":    os.path.join(out_base, ext)
            }

    print(f"[*] Analyzing {len(jobs)} extensions")

    for ext, paths in jobs.items():
        print(f"[*] {ext}")
        ext_name = id_to_name.get(ext, "")
        out_dir = paths["out"]
        os.makedirs(out_dir, exist_ok=True)

        # analyze wallet.json
        wallet_events, wallet_counts, wallet_addr_sets = analyze_one_file(paths["wallet"], "wallet", ext)
        # analyze serviceworker.json
        sw_events, sw_counts, sw_addr_sets = analyze_one_file(paths["sw"], "serviceworker", ext)

        # write leaks JSONs (separate)
        w_json = os.path.join(out_dir, "leaks_wallet.json")
        s_json = os.path.join(out_dir, "leaks_serviceworker.json")
        with open(w_json, "w", encoding="utf-8") as f:
            json.dump(wallet_events, f, indent=2)
        with open(s_json, "w", encoding="utf-8") as f:
            json.dump(sw_events, f, indent=2)

        # ---- build SEPARATE rows
        with open(separate_csv, "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            # wallet side
            for dom, c in sorted(wallet_counts.items(), key=lambda kv: kv[0]):
                addrs = ";".join(sorted(wallet_addr_sets.get(dom, set())))
                w.writerow([ext, ext_name, "wallet", dom, c["total"], c["rpc"], c["analytics"], c["telemetry"], c["cdn"], c["other"], addrs])
            # service worker side
            for dom, c in sorted(sw_counts.items(), key=lambda kv: kv[0]):
                addrs = ";".join(sorted(sw_addr_sets.get(dom, set())))
                w.writerow([ext, ext_name, "serviceworker", dom, c["total"], c["rpc"], c["analytics"], c["telemetry"], c["cdn"], c["other"], addrs])

        # ---- build MERGED rows (union of domains, booleans per class, union addr set)
        all_domains = set(wallet_counts.keys()) | set(sw_counts.keys())
        with open(merged_csv, "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            for dom in sorted(all_domains):
                wc = wallet_counts.get(dom, {})
                sc = sw_counts.get(dom, {})
                merged_addr = set()
                merged_addr |= wallet_addr_sets.get(dom, set())
                merged_addr |= sw_addr_sets.get(dom, set())
                # boolean flags: any count > 0 across channels for this domain
                def any_count(key):
                    return int(((wc.get(key, 0) or 0) + (sc.get(key, 0) or 0)) > 0)
                w.writerow([
                    ext, ext_name, dom,
                    any_count("rpc"),
                    any_count("analytics"),
                    any_count("telemetry"),
                    any_count("cdn"),
                    any_count("other"),
                    ";".join(sorted(merged_addr))
                ])

        # ---- NEW: build ULTI-MERGED row (per extension, ignore domains completely)
        def any_for_ext(key):
            # any domain (wallet or serviceworker) that has count > 0 for this key
            return int(any((c.get(key, 0) or 0) > 0
                           for c in list(wallet_counts.values()) + list(sw_counts.values())))

        with open(ulti_csv, "a", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow([
                ext, ext_name,
                any_for_ext("rpc"),
                any_for_ext("analytics"),
                any_for_ext("telemetry"),
                any_for_ext("cdn"),
                any_for_ext("other"),
            ])

        print(f"    [+] wrote {w_json} and {s_json}")

    print(f"[✓] summary_separate.csv → {separate_csv}")
    print(f"[✓] summary_merged.csv   → {merged_csv}")
    print(f"[✓] ulti-merge.csv       → {ulti_csv}")

if __name__ == "__main__":
    main()
