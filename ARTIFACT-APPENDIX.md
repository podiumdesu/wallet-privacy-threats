# Artifact Appendix

Paper title: The Masks We (Think We) Wear: Privacy Threats of Browser-Extension Wallets in the Web3 Ecosystem

Requested Badge(s):

- [x] **Available**
- [x] **Functional**
- [x] **Reproduced**

## Description

**Paper title**: The Masks We (Think We) Wear: Privacy Threats of Browser-Extension Wallets in the Web3 Ecosystem

**Authors**: Weihong Wang (DistriNet, KU Leuven), Yana Dimova (DistriNet, KU Leuven), Victor Vansteenkiste (KU Leuven), Tom Van Goethem (DistriNet, KU Leuven), Tom Van Cutsem (DistriNet, KU Leuven)

**Description**:

This artifact contains analysis scripts, frameworks, and datasets required to reproduce the results presented in our paper.

Specifically, the artifact includes:

- analysis scripts and experimental datasets
- measurement frameworks used to collect the experimental datasets
- wallet extension source-code datasets used by the measurement frameworks (archived on KU Leuven RDR)

The artifact focuses on **reproducing the analysis results** presented in the paper. The experimental datasets are provided, so reviewers can run the analysis scripts directly. The analysis environment is provided through **Docker** to ensure reproducibility.

The two measurement frameworks included in this artifact are:

- _The network request framework_ measures whether wallet extensions or decentralized applications leak wallet addresses through network requests. The framework automatically launches a browser, interacts with wallet extensions, and intercepts outgoing requests.

  The repository includes a simplified automated example using MetaMask that demonstrates how wallet setup and measurement can be automated. Some other wallet extensions may require limited manual configuration.

- _The web exposure framework_ analyzes how wallet extensions implement provider methods and how these wallets behave when interacting with cross-origin iframes.

  This framework requires limited manual interaction when testing different wallets and dApps. A simplified demonstration of the web exposure threats is available at: https://wallet-privacy.distriled.dnetcloud.cs.kuleuven.be/

### Security/Privacy Issues and Ethical Concerns

The artifact does not contain malware, exploits, or intentionally vulnerable software.

Some measurement components use test wallet seed phrases provided with the artifact. These are created specifically for the experiments and are unrelated to the evaluator.

The experimental datasets included in the artifact consist only of network request logs and browser interaction traces collected during controlled experiments. They do not contain personally identifiable information or sensitive user data.

## Basic Requirements

### Hardware Requirements (Required for Functional and Reproduced badges)

The artifact can run on a standard laptop. No special hardware is required.

Minimal requirements:

- 8 GB RAM recommended
- ~10 GB available disk space

The experiments were originally executed on a machine with:

- Chip: Apple M2
- Total Number of Cores: 8
- Memory: 16 GB

However, the artifact is lightweight and should run on most modern systems.

### Software Requirements

1. OS used

   The artifact was developed and tested on macOS. The analysis environment is provided through Docker, and should run on any operating system that supports Docker.

2. OS packages
   - Git (for cloning the repository)

   - Docker (tested with version 29.2.1). Docker installation instructions are available at: https://docs.docker.com/get-docker/

​ All required system packages and dependencies for the analysis are installed automatically when building the Docker image.

​ The measurement frameworks additionally require a Chromium-based browser (e.g., Google Chrome).

3. Artifact packaging

​ The analysis environment is packaged using Docker: version 29.2.1, build a5c7197

4. Programming language compiler
   - Python 3.11 (analysis scripts)

   - Node.js v20.19.0 (measurement frameworks)

5. Dependencies
   - For analysis scripts: The required Python dependencies are listed and version-pinned in the provided `requirements.txt` file. These dependencies are automatically installed when building the Docker image.

   - For measurement frameworks: the Node.js dependencies are listed in package.json and can be installed with `npm install`.

6. No ML model used

7. Datasets:

   All datasets required to reproduce the analysis results are already included in the artifact. These consist of the experimental datasets generated during our measurements.

   For the measurement frameworks:
   - For the network request interception framework, one wallet extension (MetaMask) is already included in the repository for the automated example.
   * For the web exposure framework, evaluators can install any wallet extension directly from the Chrome Web Store and interact with the provided demonstration webpage.

   * The entire wallet extension source code datasets are archived on KU Leuven RDR: https://rdr.kuleuven.be/dataset.xhtml?persistentId=doi:10.48804/FUNFIS

### Estimated Time and Storage Consumption

#### Analysis (to reproduce the paper results)

Reproducing the analysis results requires building the Docker image and running the provided analysis scripts.

- Setup (clone repository + build Docker image):
  - ~5 minutes human time
  - ~5 minutes compute time
- Running the analysis scripts to reproduce the results
  - ~10 minutes compute time

The scripts generate LaTeX tables and CSV files containing the analysis results reported in the paper.

Storage consumption: 10 GB.

#### Measurement Frameworks

Running the measurement frameworks is optional and not required to reproduce the analysis results.

**Network Request Interceptor Framework**

Running the automated example requires:

- ~5 minutes human time (cloning, installing dependencies, and starting the framework)
- ~5 minutes of compute time to capture network requests for one wallet.

Storage consumption: 5 GB.

**Web Exposure Framework**

Testing the web exposure demonstration requires:

- ~5 minutes human time to open the demonstration webpage and install and set up a wallet extension from the Chrome Web Store.
- ~5 minutes of human interaction to perform the demonstration for one wallet.

Storage consumption: 1 GB.

## Environment

### Accessibility

The primary artifact entry point is the GitHub repository:

https://github.com/podiumdesu/wallet-privacy-threats

This repository contains the analysis scripts, experimental datasets, and measurement frameworks used in the paper. Additional resources, such as the wallet extension source-code datasets archived on KU Leuven RDR and the demonstration websites (whose source code is included in the repository), are linked from the. GitHub repository.

The artifact is released under the MIT License (see `LICENSE` file).

### Set up the environment

#### 1. Clone the artifact repository:

```bash
git clone https://github.com/podiumdesu/wallet-privacy-threats.git
cd wallet-privacy-threats
```

After cloning the repository, the directory structure will look as follows:

```
.
├── ARTIFACT-APPENDIX.md
├── LICENSE
├── README.md
├── analysis               # **Analysis scripts and experimental datasets**
├── framework              # **Frameworks**
├── datasets               # Wallet extension source code datasets (The whole is hosted on KU Leuven RDR)
├── seed-phrase.json       # Test wallet seed phrases used in the experiments
├── demo                   # Source code for web-exposure demo
└── responsible-disclosure # Documentation of the responsible disclosure process
```

The `analysis/` directory contains the scripts and experimental datasets required to reproduce the results reported in the paper.

The `framework/` directory contains the measurement frameworks used to collect the experimental datasets.

#### 2. Building the Analysis environment

```
cd analysis
docker build -t analysis .
```

Building the Docker image typically takes less than 5 minutes.

After the build completes successfully, the Docker image `analysis` will be available locally.

You can verify this by running:

```bash
docker images | grep analysis
```

#### 3. Building the Network Interceptor Framework environment

The measurement framework requires Node.js and npm.

```bash
cd framework/request-interceptor/
npm install
```

#### 4. Preparing for the Web Exposure Demo

First, install MetaMask in your browser. E.g., for Chrome/Brave, use https://chromewebstore.google.com/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn

Then, set up MetaMask by creating a wallet address using the seed phrase "eye glide secret fence bread rotate viable anger child leader select razor".

### Testing the Environment

**Analysis**

After building the Docker image, run the following command to verify that the analysis environment is configured correctly.

```bash
cd analysis

docker run --rm -it \
  -v "$(pwd):/work/analysis" \
  analysis \
  -lc "cd request-interceptor && ./run_analysis.sh ./test-example"
```

This command runs the analysis scripts on a small example dataset included in the repository.
The script processes the test dataset and generates analysis outputs.

If the environment is correctly configured, the command will complete successfully and produce output files in:

```bash
./request-interceptor/test-example/analysis_result/
```

**Network request framework**

```bash
cd framework/request-interceptor/
./run-extensions.sh wallet-extensions-test.txt auto
```

**Web exposure framework**
The web exposure behaviors are exercised through Experiments 4 and 5 using the demo workflow described below.

## Artifact Evaluation

### Main Results and Claims

#### Main Result 1: Number of Wallets Leak Address

Our paper claims that many browser-extension wallets expose wallet addresses in outbound network requests to external endpoints. This claim is reproduced by [Experiment 1](#experiment-1-cross-dataset-comparison-of-address-exposure-and-third-party-connectivity), which analyzes three experimental datasets and reproduces the results reported in **"Number of Wallets Leak Addresses"** in **Table 1** of our paper.

#### Main Result 2: Third-party domains receiving addresses

Our paper claims that wallet-specific backend domains dominate the set of third-party domains receiving wallet addresses, resulting in a highly fragmented ecosystem. This claim is reproduced by [Experiment 1](#experiment-1-cross-dataset-comparison-of-address-exposure-and-third-party-connectivity) and corresponds to the domain-level results reported in **Table 1**.

#### Main Result 3: Analytics presence in wallets

Our paper claims that analytics services are increasingly embedded in wallet extensions. This claim is reproduced by [Experiment 1](#experiment-1-cross-dataset-comparison-of-address-exposure-and-third-party-connectivity) and corresponds to the **"Analytics Presence in Wallets"** in **Table 1**.

#### Main Result 4: Network traffic patterns reveal wallet addresses' linkability

Our paper claims that network traffic patterns can reveal linkability between multiple addresses managed by the same wallet. This claim is reproduced by [Experiment 2](#experiment-2-network-traffic-patterns-revealing-wallet-address-linkability), which analyzes address co-occurrence and timing-correlation signals, and corresponds to **Table 2**.

#### Main Result 5: dApp behaviors

Our paper claims that many popular Ethereum dApps probe wallet APIs, store wallet addresses in browser storage, and contact third-party trackers. This claim is reproduced by [Experiment 3](#experiment-3-dapp-behaviors) and corresponds to **Table 4**.

#### Main Result 6: Wallet fingerprinting and stale address exposure

Our paper claims that EVM-compatible wallets can be discovered through EIP-6963 discovery events and that wallets lacking a `wallet_revokePermissions` implementation may continue to expose previously authorized addresses. This claim is reproduced qualitatively by [Experiment 4](#experiment-4-wallet-fingerprinting-and-stale-address-exposure) and corresponds to **Table 3**.

#### Main Result 7: Wallet provider injection in cross-origin contexts

Our paper claims that wallets injecting their provider into cross-origin iframes may expose wallet addresses to embedded dApps under certain conditions, enabling the attack described as **Web Threat #4** in the paper. This claim is reproduced qualitatively by [Experiment 5](#experiment-5-wallet-address-exposure-in-cross-origin-contexts) and corresponds to **Table 5**.

### Experiments

#### Experiment 1: Cross-dataset comparison of address exposure and third-party connectivity

- **Time:** ~2 human-minutes + ~5 compute-minutes

- **Storage:** ~10GB

This experiment reproduces [Main Results 1](#main-result-1-number-of-wallets-leak-address), [2](#main-result-2-third-party-domains-receiving-addresses), and [3](#main-result-3-analytics-presence-in-wallets). It runs the network request analysis on three wallet experimental datasets and generates **Table 1** of the paper.

**From the `analysis/` directory**, run:

```bash
docker run --rm -it \
  -v "$(pwd):/work/analysis" \
  analysis \
  -lc "cd request-interceptor && ./run_experiment1.sh"
```

After execution, the analysis results for each dataset will be written into the corresponding dataset folders:

```bash
./request-interceptor/torres-2023-100/analysis_result/
./request-interceptor/torres-2025-100/analysis_result/
./request-interceptor/cws-10k-85/analysis_result/
```

It also generates a LaTeX table that reproduces **Table 1** of the paper:

`./request-interceptor/reproduced_tables/table1_reproduced.tex`

#### Experiment 2: Network traffic patterns revealing wallet address linkability

- **Time:** ~3 human-minutes + ~2 compute-minutes
- **Storage:** ~10GB

This example experiment reproduces [Main result 4](#main-result-4-network-traffic-patterns-reveal-wallet-addresses-linkability). It analyzes the network traffic of wallets in `cws-10k-85` and generates **CSV files** for the results in **Table 2**.

**From the `analysis/` directory**, run:

```bash
docker run --rm -it \
  -v "$(pwd):/work/analysis" \
  analysis \
  -lc "cd request-interceptor && ./run_analysis.sh ./cws-10k-85"
```

After execution, the analysis results will be written to:

```bash
./request-interceptor/cws-10k-85/analysis_result/
```

The following output file reproduces the results in Table 2:

```bash
./analysis_result/request_pattern/wallet_leaks_per_extension.csv
```

Check the CSV file for:

1.  Co-occurrence signal ("multi_wallet_leak_hits" > 0)
2.  Co-occurrence domains ("multi_wallet_domains")
3.  Timing correlation signal ("multi_window_hits" > 0)
4.  Timing correlation domains ("multi_window_domains")

#### Experiment 3: dApp behaviors

- **Time:** ~3 human-minutes + ~2 compute-minutes
- **Storage:** ~10GB

This example experiment reproduces [Main result 5](#main-result-5-dapp-behaviors). It analyzes the behavior of 30 popular Ethereum dApps and generates **Table 4** of the paper.

**From the `analysis/` directory**, run:

```bash
docker run --rm -it \
  -v "$(pwd):/work/analysis" \
  analysis \
  -lc "cd web-exposure-analysis/2\)-30-dApps-behavior && python3 dapps-analysis.py && python3 generate_table4.py"

```

After execution, it generates a LaTeX table reproducing **Table 4** of the paper:

```bash
./web-exposure-analysis/reproduced_tables/table4_reproduced.tex
```

#### Experiment 4: Wallet fingerprinting and stale address exposure

- **Time:** ~5 human-minutes
- **Storage:** not applicable

This experiment reproduces [Main result 6](#main-result-6-wallet-fingerprinting-and-stale-address-exposure) using the demo website.

1. Open the demo dApp in a browser with a wallet extension installed:
   https://dappx.weihongw.com/

2. Click "Scan" to detect installed wallets.

3. Click "1. Connect wallet" to connect the wallet to the website.

4. Click "Disconnect wallet and test."

The result will be shown on the website.

If the wallet is revocation-unsafe, as shown on the website, then it corresponds to the entries marked red in the "revoke?" column of Table 3.

#### Experiment 5: Wallet address exposure in cross-origin contexts

- **Time:** ~5 human-minutes
- **Storage**: not applicable

This experiment reproduces [Main Result 7](#main-result-7-wallet-provider-injection-in-cross-origin-contexts) using the demo website.

1. Open the demo website in a browser with a wallet extension installed:
   https://wallet-privacy.distriled.dnetcloud.cs.kuleuven.be/

2. Step 0 lists wallets that could be vulnerable, highlighted in red

3. Click "Open demo dApp" in Step 1.

4. In the newly opened dApp (https://dappx.weihongw.com/), connect one of the wallets highlighted in red in step 0.

5. Close the dApp, and return to the demo page.

If the wallet is vulnerable to the attack, Step 2 will display a leaked wallet address retrieved from the iframe context. These behaviors correspond to entries marked red in the "Iframe Exposure" column reported in Table 5.

## Limitations

Running the full measurement crawl on all wallet extensions requires manual interaction (e.g., wallet setup using seed phrases and clicking through onboarding interfaces). Because wallet extensions implement different user interfaces, the setup process in our frameworks is only partially automated. Repeating the full crawl would therefore require significant manual effort.

Furthermore, the behavior of wallet extensions and dApps evolves over time. Although the artifact includes the source code for the analyzed wallet extensions, this work is a measurement study that relies on external network services and live dApp frontends. Re-running the measurement pipeline today may therefore produce results that differ from those reported in the paper, as RPC endpoints or dApp implementations may change.

For these reasons, the artifact provides the datasets collected during our experiments together with the analysis scripts used to generate the results reported in the paper. The results in **Tables 1, 2, and 4** can be reproduced directly from the provided datasets without repeating the full measurement crawl.

**Tables 3 and 5** were obtained manually by interacting with wallet extensions and are therefore not fully automated in the artifact. These behaviors can be reproduced in the demo environment provided in the artifact, allowing evaluators to observe the behaviors reported in Tables 3 and 5, such as wallet fingerprinting via EIP-6963 and wallet provider injection in cross-origin contexts.

## Notes on Reusability

This artifact can be reused and extended in several ways for future research on browser-extension wallets and Web3 privacy.

First, the artifact includes three curated source-code datasets of wallet extensions (`Torres-2023/100`, `Torres-2025/100`, and `CWS-10K/85`). Researchers can reuse these datasets to study wallet behavior, privacy risks, or security vulnerabilities, including longitudinal studies of how wallet implementations evolve over time.

Second, the artifact provides the experimental datasets collected during our measurements, including network request logs across the three datasets. These datasets allow researchers to perform additional analyses on wallet network behavior without repeating the measurement crawl.

Third, the artifact includes behavioral measurements of 30 popular Ethereum dApps used in our web-exposure analysis. These data can be reused to study wallet-dApp interactions or compare future measurements against our results.

Finally, the measurement frameworks included in the artifact can be extended to analyze additional wallets and additional APIs.
