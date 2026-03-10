# Dataset Prep Scripts

To download the extensions source code from Chrome Web Store.

## `0-1-generate-wallet-list.sh`

Scans the `original-wallets/` directory and writes all subfolder names (wallet IDs) into: `wallet-extensions.txt`

Run:

```
chmod +x ./0-1-generate-wallet-list.sh
./0-1-generate-wallet-list.sh
```

## `0-2-download-ext.sh`

Reads a list of Chrome extension IDs from `wallet-extensions.txt`, then:

- downloads each extension CRX
- extracts it
- stores raw files in `wallets_downloads/`
- stores extracted folders in `unzipped_extensions/`
- logs results to `extension_report.csv`

Run:

```
./0-2-download-ext.sh
```

Output file example:

```
ID,Name,Valid
acmacodkjbdgmoleebolmdjonilkdbch,"__MSG_appName__",yes
aeachknmefphepccionboohckonoeemg,"Coin98 Wallet Extension: Crypto & Defi",yes
afbcbjpbpfadlkmhmclhkeeodmamcflc,"MathWallet",yes
```

## `0-3-calculate-invalid.py`

Checks whether each downloaded Chrome extension file is valid.

Given:

- a list of extension IDs
- a directory containing downloaded .zip/.crx files

It outputs a CSV marking each ID as:

- true → file exists and size > 0
- false → missing or empty file

Run:

```
python 0-3-calculate-invalid.py wallet-extensions.txt wallets_downloads/ validity_report.csv
```

Output file example:

```
extensionID,validity
acmacodkjbdgmoleebolmdjonilkdbch,true
aeachknmefphepccionboohckonoeemg,true
afbcbjpbpfadlkmhmclhkeeodmamcflc,true
```
