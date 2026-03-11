import os
import json
import csv
from glob import glob
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULT_FOLDER = os.path.join(BASE_DIR, "data")
OUTPUT_CSV = os.path.join(BASE_DIR, "2)-dApps-behavior-summary.csv")

# Wallet prefixes that may appear in localStorage / cookies
WALLET_PREFIXES = ["033a", "DBLwsdi5"]

# Canonical tracker domains (what you care about as "same tracker")
TRACKER_DOMAINS = [
    "google-analytics.com",
    "googletagmanager.com",
    "analytics.google.com",
    "g.doubleclick.net",
    "stats.g.doubleclick.net",
    "doubleclick.net",
    "googletagservices.com",
    "segment.io",
    "amplitude.com",
    "mixpanel.com",
    "sentry.io",
    "intercom.io",
    "intercomcdn.com",
    "hotjar.com",
    "fullstory.com",
    "datadoghq.com",
    "bugsnag.com",
    "newrelic.com",
    "optimizely.com",
    "clarity.ms",
    "facebook.com",
]

# Subset of tracker domains that count as "Google" for google_all
GOOGLE_TRACKERS = [
    "google-analytics.com",
    "googletagmanager.com",
    "analytics.google.com",
    "g.doubleclick.net",
    "stats.g.doubleclick.net",
    "doubleclick.net",
    "googletagservices.com",
]

# Generic path-based hints that something is an analytics endpoint
GENERIC_PATH_KEYWORDS = [
    "/analytics",
    "/collect",
    "/track",
    "/tracking",
    "/event",
    "/events",
]


def contains_prefix(obj, prefixes):
    """Recursively check if any prefix appears in any string representation inside obj
    (including dict *keys* as well as values)."""
    if obj is None:
        return False

    # Primitive types → string match
    if isinstance(obj, (str, int, float, bool)):
        s = str(obj)
        return any(p in s for p in prefixes)

    # Dict → check both keys and values
    if isinstance(obj, dict):
        return any(
            contains_prefix(k, prefixes) or contains_prefix(v, prefixes)
            for k, v in obj.items()
        )

    # Iterables → recurse on each element
    if isinstance(obj, (list, tuple, set)):
        return any(contains_prefix(item, prefixes) for item in obj)

    # Fallback: string representation
    s = str(obj)
    return any(p in s for p in prefixes)


def get_event_timestamp(evt):
    """Use ts_start if present, otherwise ts, otherwise None."""
    if "ts_start" in evt:
        return evt["ts_start"]
    return evt.get("ts")


def normalize_host(host: str) -> str:
    """Normalize a host: lowercase, strip port, strip leading www."""
    if not host:
        return ""
    host = host.lower().split(":")[0]
    return host[4:] if host.startswith("www.") else host


def same_origin(url1: str, url2: str) -> bool:
    """
    Return True if url1 and url2 share the same scheme + hostname + port.
    If dapp_url is empty or malformed, we conservatively return False.
    """
    try:
        a = urlparse(url1)
        b = urlparse(url2)
        if not (a.scheme and a.hostname and b.scheme and b.hostname):
            return False
        # ports: None means default; treat None==None as same, but don't try to normalize.
        return (a.scheme, a.hostname, a.port) == (b.scheme, b.hostname, b.port)
    except Exception:
        return False


def get_tracker_ids(url: str):
    """
    Return canonical tracker IDs for a URL.

    - For known trackers, return the canonical domain from TRACKER_DOMAINS
      (e.g. any *.ingest.sentry.io -> "sentry.io").
    - For generic path-based analytics (first-party analytics), use the
      normalized host as the tracker ID.
    """
    ids = set()
    if not url or not isinstance(url, str):
        return ids

    parsed = urlparse(url.lower())
    host = normalize_host(parsed.netloc or "")
    path = parsed.path or ""

    if not host:
        return ids

    # Known tracker grouping (3rd party)
    for dom in TRACKER_DOMAINS:
        if host == dom or host.endswith("." + dom):
            ids.add(dom)

    # Generic path-based analytics (often first-party)
    for kw in GENERIC_PATH_KEYWORDS:
        if kw in path:
            ids.add(host)
            break

    return ids


def analyze_request_logs(data, dapp_url: str):
    """
    Returns a set of all tracker IDs found in request logs,
    but only for requests that originate from the same origin as dapp_url.
    """
    tracker_ids = set()

    # No dapp_url → can't reliably compare origins; in that case, we skip origin checks
    origin_filter = bool(dapp_url)

    request_lists = []
    for key in ("requestLogs", "pageRequests", "networkRequests", "requests"):
        val = data.get(key)
        if isinstance(val, list):
            request_lists.append(val)

    for req_list in request_lists:
        for entry in req_list:
            if not isinstance(entry, dict):
                continue

            page_url = entry.get("pageUrl") or entry.get("documentUrl") or ""

            if origin_filter:
                # Only keep requests that originate from the dapp's origin
                if not same_origin(page_url, dapp_url):
                    continue

            url = entry.get("requestUrl") or entry.get("url")
            tracker_ids.update(get_tracker_ids(url))

    return tracker_ids


def analyze_file(path):
    """Analyze a single JSON file and return a dict with the requested fields."""
    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except Exception:
            return {
                "file": os.path.basename(path),
                "dappUrl": "",
                "localStorage": False,  # ever stored
                "walletStoredAtEnd": False,
                "nothingStored": True,
                "revokePermission": False,
                "eth_accounts_beforeRequest": False,
                "announceProvider": False,
                # "ethAccountsRightAfterAnnounceProvider": False,
                "trackers": set(),
            }

    # dappUrl (prefer top-level, fallback to baseRes)
    dapp_url = data.get("dappUrl") or data.get("baseRes", {}).get("dappUrl", "")

    # 1: wallet prefix in localStorage or cookies
    wallet_ever = False
    wallet_at_end = False

    cls_entries = data.get("cookieAndLocalStorage", [])
    last_ops = {}  # storage_key -> {"type": ..., "key": ..., "val": ...}

    if isinstance(cls_entries, list):
        for entry in cls_entries:
            if not isinstance(entry, dict):
                continue

            t = entry.get("type", "")
            key = entry.get("key")
            val = entry.get("val")

            # Track last operation per storage key
            storage_key = None
            if t.startswith("localStorage.") and key is not None:
                storage_key = f"ls:{key}"
            elif t == "document.cookie.set" and isinstance(val, str):
                # Parse cookie name from "name=value; attrs..."
                first_part = val.split(";", 1)[0]
                if "=" in first_part:
                    cookie_name = first_part.split("=", 1)[0].strip()
                    storage_key = f"cookie:{cookie_name}"

            if storage_key:
                last_ops[storage_key] = {
                    "type": t,
                    "key": key,
                    "val": val,
                }

            # "Ever stored" check (as before)
            if t in (
                "localStorage.setItem",
                "localStorage.getItem",
                "localStorage.removeItem",
                "document.cookie.set",
            ):
                if "key" in entry and contains_prefix(entry["key"], WALLET_PREFIXES):
                    wallet_ever = True
                if "val" in entry and contains_prefix(entry["val"], WALLET_PREFIXES):
                    wallet_ever = True

        # Final-state check: does any *final* value still contain wallet prefix?
        for op in last_ops.values():
            t = op["type"]
            k = op["key"]
            v = op["val"]

            # removeItem → final state: key is gone
            if t == "localStorage.removeItem":
                continue

            targets = []
            if k is not None:
                targets.append(k)

            if t.startswith("localStorage."):
                # localStorage.setItem final value in v
                targets.append(v)
            elif t == "document.cookie.set" and isinstance(v, str):
                # For cookies, focus on main cookie value (name=value; attrs)
                first_part = v.split(";", 1)[0]
                if "=" in first_part:
                    cookie_val = first_part.split("=", 1)[1]
                    targets.append(cookie_val)
                else:
                    targets.append(v)

            if any(contains_prefix(tgt, WALLET_PREFIXES) for tgt in targets):
                wallet_at_end = True
                break

    # 2: revoke permission + announceProvider + eth_accounts right after announceProvider
    revoke_permission = False
    announce_provider = False
    eth_after_announce = False

    events = data.get("objectEventLogs", [])
    if isinstance(events, list):
        # a) revokePermission + announceProvider flag
        for evt in events:
            if not isinstance(evt, dict):
                continue
            method = evt.get("method")
            if method == "wallet_revokePermissions":
                revoke_permission = True
            if method == "announceProvider":
                announce_provider = True

        # b) check for eth_accounts immediately after announceProvider in list order
        for i, evt in enumerate(events[:-1]):  # up to second-last
            if not isinstance(evt, dict):
                continue
            if evt.get("method") == "announceProvider":
                next_evt = events[i + 1]
                if isinstance(next_evt, dict) and next_evt.get("method") == "eth_accounts":
                    eth_after_announce = True
                    break

    # 3: eth_accounts before eth_requestAccounts (existing logic)
    before_request = False
    if isinstance(events, list):
        acc_ts = []
        req_ts = []
        for evt in events:
            if not isinstance(evt, dict):
                continue
            method = evt.get("method")
            ts = get_event_timestamp(evt)
            if method == "eth_accounts" and ts is not None:
                acc_ts.append(ts)
            if method == "eth_requestAccounts" and ts is not None:
                req_ts.append(ts)
        if acc_ts and req_ts:
            first_req = min(req_ts)
            before_request = any(t < first_req for t in acc_ts)

    # 4: Trackers (only from same-origin requests)
    tracker_ids = analyze_request_logs(data, dapp_url)

    return {
        "file": os.path.basename(path),
        "dappUrl": dapp_url,
        "localStorage": wallet_ever,             # ever stored?
        "walletStoredAtEnd": wallet_at_end,      # still stored at final state?
        "nothingStored": not wallet_at_end,      # convenience flag for "nothing stored?"
        "revokePermission": revoke_permission,
        "eth_accounts_beforeRequest": before_request,
        "announceProvider": announce_provider,
        # "ethAccountsRightAfterAnnounceProvider": eth_after_announce,
        "trackers": tracker_ids,
    }


def main():
    json_files = glob(os.path.join(RESULT_FOLDER, "*.json"))
    rows = []
    all_tracker_ids = set()

    # Analyze all files & collect master tracker list
    for path in json_files:
        result = analyze_file(path)
        rows.append(result)
        all_tracker_ids.update(result["trackers"])

    # CSV column definitions
    base_fields = [
        "file",
        "dappUrl",
        "localStorage",                      # ever stored
        "walletStoredAtEnd",                 # final state
        "nothingStored",                     # inverse of walletStoredAtEnd
        "revokePermission",
        "eth_accounts_beforeRequest",
        "announceProvider",
        # "ethAccountsRightAfterAnnounceProvider",
        "trackers",       # semicolon-separated list of trackers
        "tracker_count",  # number of trackers for this dapp
        "google_all",     # 1 if any Google tracker present
    ]

    tracker_columns = sorted(all_tracker_ids)
    fieldnames = base_fields + tracker_columns

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for row in rows:
            tracker_list = sorted(row["trackers"])
            tracker_str = ";".join(tracker_list)
            tracker_count = len(row["trackers"])
            google_flag = 1 if any(t in GOOGLE_TRACKERS for t in row["trackers"]) else 0

            out = {
                "file": row["file"],
                "dappUrl": row["dappUrl"],
                "localStorage": row["localStorage"],
                "walletStoredAtEnd": row["walletStoredAtEnd"],
                "nothingStored": row["nothingStored"],
                "revokePermission": row["revokePermission"],
                "eth_accounts_beforeRequest": row["eth_accounts_beforeRequest"],
                "announceProvider": row["announceProvider"],
                # "ethAccountsRightAfterAnnounceProvider": row["ethAccountsRightAfterAnnounceProvider"],
                "trackers": tracker_str,
                "tracker_count": tracker_count,
                "google_all": google_flag,
            }

            # Per-tracker 0/1 matrix
            for t in tracker_columns:
                out[t] = 1 if t in row["trackers"] else 0

            writer.writerow(out)

    print(f"Analyzed {len(rows)} files.")
    print(f"Found {len(all_tracker_ids)} unique trackers.")
    print(f"CSV written to: {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
