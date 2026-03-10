#!/usr/bin/env python3

import os
import sys
import csv
import json
import numpy
import operator
import matplotlib.pyplot as plt
import publicsuffix2
import networkx as nx
import LeakDetector

from urllib.parse import urlparse

dirName = os.environ.get("DATA_DIR")
resultDirName = os.path.join(os.environ.get("ANALYSIS_BASE"), "all_leaks")
# Make sure resultDirName exists
if not os.path.exists(resultDirName):
    os.makedirs(resultDirName)

if not dirName:
    print("ERROR: DATA_DIR environment variable is not set.", file=sys.stderr)
    sys.exit(1)

# Base directory for this run (folder that contains wallet/ or serviceworker/)
# Example: RESULT_DIR="./85/results/wallet"  → base_dir="./85"
base_dir = os.path.dirname(os.path.dirname(dirName.rstrip("/")))

# dirName = './results/wallet'
# dirName = "./results/serviceworker"
# dirName = "./results/test-serviceworker"

MAX_LEAK_DETECTION_LAYERS = 3

DEBUG = False

class colors:
    INFO = '\033[94m'
    OK = '\033[92m'
    FAIL = '\033[91m'
    END = '\033[0m'

def log(msg):
    """Log the given message to stderr."""
    print("[+] " + msg, file=sys.stderr)

def parse_file(file_name):
    """Parse the given JSON file and return its content."""
    with open(file_name, "r") as fd:
            json_data = json.load(fd)
    return json_data

def get_etld1(url):
    """Return the given URL's eTLD+1."""
    fqdn = urlparse(url).netloc
    fqdn = fqdn.split(":")[0]
    return publicsuffix2.get_sld(fqdn)

def has_eth_addr(url, eth_address):
    """Return True if the given URL contains our Ethereum address."""
    url = url.lower()
    return eth_address in url

def is_irrelevant(req, extensionID, isServiceWorker):
    #TODO: Change it back 
    if isServiceWorker:
    # print(req["requestContext"], extensionID)
        if extensionID in req["requestContext"]:
            return False
        return True 
    else: 
    # For wallet
        for context in req["requestContext"]:
            if extensionID in context:
                return False
        return True

def are_unrelated(domain, origin):
    """Return True if the two given domains are likely independent."""
    if domain != None and "." in domain:
        if origin.split('.')[-2] in domain.split('.')[-2]:
            return False
    return domain != origin

def add_leak(domain, type, origin, leaks, leak, encoding):
    if not origin in leaks:
        leaks[origin] = dict()
    if not type in leaks[origin]:
        leaks[origin][type] = dict()
    if not domain in leaks[origin][type]:
        leaks[origin][type][domain] = list()
    leaks[origin][type][domain].append((leak, encoding))

http_leaks = dict()

encoded_leaks = dict()

def analyse_data(json_data, dirName):
    serviceWorker = False
    if "service" in dirName:
        serviceWorker = True
    reqs = json_data["requests"]
    script_domains = set()
    leaks = dict()

    log("Analyzing requests for origin: "+colors.INFO+json_data["extensionID"]+colors.END)
    
    # if json_data["success"] == False:
    #     log(colors.FAIL+"Extension is dead, skipping..."+colors.END)
    #     return leaks, script_domains
    
    search_terms = []
    # Check if json_data has the required fields
    
    allAddr = (json_data.get("walletAddress") or "").strip()
    addr = allAddr.split(";")[0]
    if ":" in addr:
        addr = addr.split(":")[1]
    print("addr: "+addr)
    if addr:
    #     # normalized no-0x, lower
    #     no0x_lower = addr.lower().replace("0x", "")
    #     # normalized with 0x, lower
    #     with0x_lower = "0x" + no0x_lower

    #     # add common variants
    #     search_terms.extend([
    #         no0x_lower,
    #         no0x_lower.upper(),
    #         with0x_lower,
    #         with0x_lower.upper(),
    #     ])

    #     # OPTIONAL: add the exact string as provided (could be checksummed already)
    #     search_terms.append(addr)
    #     # And its no-0x variant exactly as provided
    #     search_terms.append(addr.replace("0x", ""))
    
    # if json_data["password"]:
    #     search_terms.append(json_data["password"])
    # else:
    #     print("!!!!!!")
    #     print("password: '"+json_data["password"]+"'")
    #     print("!!!!!!")
    
    # if json_data["walletAddress"]:

        search_terms.append(addr.replace("0x", ""))
        search_terms.append(addr.replace("0x", "").lower())
        search_terms.append(addr.replace("0x", "").upper())
        search_terms.append(addr)

    if json_data["password"]:
        search_terms.append(json_data["password"])
    else:
        print("!!!!!!")
        print("password: '"+json_data["password"]+"'")
        print("!!!!!!")
    
    if len(search_terms) == 0:
        return leaks, script_domains

    detector = LeakDetector.LeakDetector(
        search_terms,
        encoding_set=LeakDetector.LIKELY_ENCODINGS,
        hash_set=LeakDetector.LIKELY_HASHES,
        encoding_layers=MAX_LEAK_DETECTION_LAYERS,
        hash_layers=MAX_LEAK_DETECTION_LAYERS,
        debugging=DEBUG
    )

    for req in reqs:
        if is_irrelevant(req, json_data["extensionID"], serviceWorker):
            continue
        if json_data["extensionID"] in req["url"]:
            continue
        if req["url"].startswith("data:"):
            continue

        url = req["url"]
        domain = get_etld1(url)
        script_domains.add(domain)

        # Get
        url_leaks_detected = detector.check_url(req["url"], encoding_layers=MAX_LEAK_DETECTION_LAYERS)
        
        if len(url_leaks_detected) > 0:
            encoding = ""
            for url_leak in url_leaks_detected:
                if url_leak[0].lower() != addr.replace("0x", "").lower():
                    encoding = url_leak[0]
                if url_leak[0] != json_data["password"]:
                    encoding = url_leak[0]
            if DEBUG:
                log(colors.OK+"Found leak (GET): "+req["url"]+" "+encoding+colors.END)
            add_leak(domain, "GET", json_data["arguments"]["walletPath"].split("/")[-1], leaks, req["url"], encoding)

        # Post & WebSockets
        if "postData" in req:
            post_leaks_detected = detector.check_post_data(req["postData"], encoding_layers=MAX_LEAK_DETECTION_LAYERS)
            if len(post_leaks_detected) > 0:
                type = req["type"] if req["type"] == "WebSocket" else "POST"
                encoding = ""
                for post_leak in post_leaks_detected:
                    if post_leak[0].lower() != addr.replace("0x", "").lower():
                        encoding = post_leak[0]
                    if post_leak[0] != json_data["password"]:
                        encoding = post_leak[0]
                if DEBUG:
                    log(colors.OK+"Found leak ("+type+"): "+req["url"]+colors.END)
                add_leak(domain, type, json_data["arguments"]["walletPath"].split("/")[-1], leaks, req["postData"], encoding)

        # Cookies
        if "responseHeaders" in req and req["responseHeaders"] and "set-cookie" in req["responseHeaders"] and req["responseHeaders"]["set-cookie"]:
            cookie_leaks_detected = detector.check_cookie_str(req["responseHeaders"]["set-cookie"], encoding_layers=MAX_LEAK_DETECTION_LAYERS)
            if len(cookie_leaks_detected) > 0:
                encoding = ""
                for cookie_leak in cookie_leaks_detected:
                    if cookie_leak[0].lower() != addr.replace("0x", "").lower():
                        encoding = cookie_leak[0]
                    if cookie_leak[0] != json_data["password"]:
                        encoding = cookie_leak[0]
                add_leak(domain, "Cookies", json_data["arguments"]["walletPath"].split("/")[-1], leaks, req["responseHeaders"]["set-cookie"], encoding)

    if "cookies" in json_data:
        for cookie in json_data["cookies"]:
            # origin = 
            # print("todelete", "cookie before checking:", cookie)
            if are_unrelated(cookie["domain"], origin):
                # print("todelete", "cookie:", cookie)
                cookie_leaks_detected = detector.check_cookie_str(cookie["value"], encoding_layers=MAX_LEAK_DETECTION_LAYERS)
                if len(cookie_leaks_detected) > 0:
                    encoding = ""
                    for cookie_leak in cookie_leaks_detected:
                        if cookie_leak[0].lower() != addr.replace("0x", "").lower():
                            encoding = cookie_leak[0]
                        if cookie_leak[0] != json_data["password"]:
                            encoding = cookie_leak[0]
                    add_leak(cookie["domain"], "Cookies", json_data["arguments"]["walletPath"].split("/")[-1], leaks, cookie["value"], encoding)
                cookie_leaks_detected = detector.check_cookie_str(cookie["name"], encoding_layers=MAX_LEAK_DETECTION_LAYERS)
                if len(cookie_leaks_detected) > 0:
                    encoding = ""
                    for cookie_leak in cookie_leaks_detected:
                        if cookie_leak[0].lower() != addr.replace("0x", "").lower():
                            encoding = cookie_leak[0]
                        if cookie_leak[0] != json_data["password"]:
                            encoding = cookie_leak[0]
                    add_leak(cookie["domain"], "Cookies", json_data["arguments"]["walletPath"].split("/")[-1], leaks, cookie["name"], encoding)

    if DEBUG:
        log("Third-parties: "+str(list(script_domains)))
    log("Found "+colors.INFO+str(len(script_domains))+colors.END+" third-party script(s).")

    return leaks, script_domains

def parse_directory(directory):
    """Iterate over the given directory and parse its JSON files."""
    log("")
    log("Parsing "+colors.INFO+directory+colors.END+" directory...")

    all_leaks = dict()
    all_third_parties_detected = set()
    idx = 0
    for file_name in os.listdir(directory):
        file_name = os.path.join(directory, file_name)
        if not os.path.isfile(file_name) or not file_name.endswith(".json"):
            if DEBUG:
                log("")
                log("Skipping {}; not a JSON file.".format(file_name))
            continue

        log("")
        idx = idx + 1
        log("Parsing " + str(idx) + " file: "+colors.INFO+file_name+colors.END)
        try:
            json_data = parse_file(file_name)
        except:
            print(colors.FAIL+"Error: Could not parse", file_name+colors.END)
            continue

        log("Extracted "+colors.INFO+str(len(json_data["requests"]))+colors.END+" requests from file: "+colors.INFO+file_name+colors.END)

        detected_leaks, detected_third_parties = analyse_data(json_data, dirName)
        all_leaks.update(detected_leaks)
        all_third_parties_detected.update(detected_third_parties)

    return all_leaks, all_third_parties_detected

if __name__ == "__main__":
    results = dict()

    extension_names = dict()
    extension_ids = dict()
    extensions_csv_path = os.path.join(base_dir, "extensions.csv")
    with open(extensions_csv_path, newline='') as csvfile:
    # with open('./extensions.csv', newline='') as csvfile:
        reader = csv.reader(csvfile, delimiter=',', quotechar='"')
        next(reader)
        for row in reader:
            # print(row[0])
            extension_names[row[1]] = row[0]
            extension_ids[row[1]] = row[1]


    isNew = ""
    OUTPUT_FILE = os.path.join(resultDirName, "wallet_extension_leaks-extension.csv")
    if "serviceworker" in dirName:
        isNew = "serviceworker"
        OUTPUT_FILE = os.path.join(resultDirName, "wallet_extension_leaks-sw.csv")
        
    # leaks, third_parties_detected = parse_directory("./results/serviceworker")
    leaks, third_parties_detected = parse_directory(dirName)
    # print(third_parties_detected)
    # print(leaks)

    # valid_third_parties = ['mewapi.io', 'suiet.app','thebifrost.io', 'quarkchain.io', 'near.org', 'okex.org', 'iota.org', 'iotaichi.com', 'coinbase.com', 'phantom.app', 'keplr.app', 'coin98.com', 'timebird.network', 'martianwallet.xyz', 'gbrick.net', 'gamestop.com', "nu.fi", 'aptoslabs.com', 'petra-wallet.workers.dev', 'icon.foundation', 'pontem.network', 'sui.io']
    # valid_third_parties = ['mewapi.io', 'suiet.app','thebifrost.io', 'quarkchain.io', 'near.org', 'okex.org', 'iota.org', 'iotaichi.com', 'coinbase.com', 'phantom.app', 'keplr.app', 'coin98.com', 'timebird.network', 'martianwallet.xyz', 'gbrick.net', 'gamestop.com', "nu.fi", 'aptoslabs.com', 'petra-wallet.workers.dev', 'icon.foundation', 'pontem.network', 'sui.io']
    valid_third_parties = []    
    for valid_third_party in valid_third_parties:
        third_parties_detected.discard(valid_third_party)
    # print()
    # print("Third-parties detected:", len(third_parties_detected))
    # print()

    with open(OUTPUT_FILE, "w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile)
        print("\\toprule")
        print("\\textbf{Wallet Extension} & \\textbf{Third-Party} & \\textbf{GET} & \\textbf{POST} & \\textbf{WebSockets} & \\textbf{Cookies} \\\\")
        print("\\midrule")
        total_third_parties = set()
        total_get_leaks = 0
        total_post_leaks = 0
        total_websocket_leaks = 0
        total_cookie_leaks = 0
        # print(leaks)
        
        for extension in leaks:
            # if extension_names[extension] == "Binance Wallet": # Skip Binance as it's only leaking to itself
            #     continue
            third_parties = set()
            get_leaks = dict()
            post_leaks = dict()
            websocket_leaks = dict()
            cookie_leaks = dict()
            if "GET" in leaks[extension]:
                for third_party in leaks[extension]["GET"]:
                    if not third_party in valid_third_parties:
                        third_parties.add(third_party)
                        if not third_party in get_leaks:
                            get_leaks[third_party] = 0
                        get_leaks[third_party] += len(leaks[extension]["GET"][third_party])
            if "POST" in leaks[extension]:
                for third_party in leaks[extension]["POST"]:
                    if not third_party in valid_third_parties:
                        third_parties.add(third_party)
                        if not third_party in post_leaks:
                            post_leaks[third_party] = 0
                        post_leaks[third_party] += len(leaks[extension]["POST"][third_party])
            if "WebSocket" in leaks[extension]:
                for third_party in leaks[extension]["WebSocket"]:
                    if not third_party in valid_third_parties:
                        third_parties.add(third_party)
                        if not third_party in websocket_leaks:
                            websocket_leaks[third_party] = 0
                        websocket_leaks[third_party] += len(leaks[extension]["WebSocket"][third_party])
            if "Cookies" in leaks[extension]:
                for third_party in leaks[extension]["Cookies"]:
                    if not third_party in valid_third_parties:
                        third_parties.add(third_party)
                        if not third_party in cookie_leaks:
                            cookie_leaks[third_party] = 0
                        cookie_leaks[third_party] += len(leaks[extension]["Cookies"][third_party])
            if third_parties:
                extension_name_output = False
                for third_party in third_parties:
                    total_third_parties.add(third_party)
                    if not third_party in get_leaks:
                        get_leaks[third_party] = 0
                    if not third_party in post_leaks:
                        post_leaks[third_party] = 0
                    if not third_party in websocket_leaks:
                        websocket_leaks[third_party] = 0
                    if not third_party in cookie_leaks:
                        cookie_leaks[third_party] = 0
                    if not extension_name_output:
                        writer.writerow([extension_names[extension], extension_ids[extension], third_party, get_leaks[third_party], post_leaks[third_party], websocket_leaks[third_party], cookie_leaks[third_party], isNew])
                        print(extension_names[extension].replace("&", "\\&"), " & ", "\\textbf{"+str(third_party)+"}", " & ", get_leaks[third_party], " & ", post_leaks[third_party], " & ", websocket_leaks[third_party], " & ", cookie_leaks[third_party], "\\\\")
                    else:
                        writer.writerow([extension_names[extension], "", third_party, get_leaks[third_party], post_leaks[third_party], websocket_leaks[third_party], cookie_leaks[third_party], isNew])
                        print(" & ", "\\textbf{"+str(third_party)+"}", " & ", get_leaks[third_party], " & ", post_leaks[third_party], " & ", websocket_leaks[third_party], " & ", cookie_leaks[third_party], "\\\\")
                    total_get_leaks += get_leaks[third_party]
                    total_post_leaks += post_leaks[third_party]
                    total_websocket_leaks += websocket_leaks[third_party]
                    total_cookie_leaks += cookie_leaks[third_party]
                    extension_name_output = True
        print("\\midrule")
        print("\\textbf{Total} & ", len(total_third_parties), " & ", total_get_leaks, " & ", total_post_leaks, " & ", total_websocket_leaks, " & ", total_cookie_leaks, "\\\\")
        print("\\bottomrule")
