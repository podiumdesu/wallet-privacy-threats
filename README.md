# The Masks We (Think We) Wear: Privacy Threats of Browser-Extension Wallets in the Web3 Ecosystem

**Authors**: Weihong Wang (DistriNet, KU Leuven), Yana Dimova (DistriNet, KU Leuven), Victor Vansteenkiste (KU Leuven), Tom Van Goethem, Tom Van Cutsem (DistriNet, KU Leuven)

The paper will be published at [Proceedings on Privacy Enhancing Technologies Symposium](https://petsymposium.org/) 2026.

## Artifact Instructions

This artifact contains analysis scripts, frameworks, and datasets required to reproduce the results presented in our paper.

Specifically, the artifact includes:

- analysis scripts and experimental datasets
- measurement frameworks used to collect the experimental datasets
- wallet extension source-code datasets used by the measurement frameworks (archived on KU Leuven RDR)

The artifact focuses on **reproducing the analysis results** presented in the paper. The experimental datasets are provided, so reviewers can run the analysis scripts directly. The analysis environment is provided through **Docker** to ensure reproducibility.

Please refer to [`ARTIFACT-APPENDIX.md`](https://github.com/podiumdesu/wallet-privacy-threats/blob/main/ARTIFACT-APPENDIX.md) for detailed instructions on how to use the artifact.

## Relevant Links

The wallet extension source-code datasets are archived on KU Leuven RDR:

https://rdr.kuleuven.be/dataset.xhtml?persistentId=doi:10.48804/FUNFIS

Demo can be accessed at: https://wallet-privacy.distriled.dnetcloud.cs.kuleuven.be/

## Abstract

Cryptocurrency wallets are the primary interface for managing blockchain addresses, viewing balances, and interacting with Web3 applications. Although users typically assume that their addresses remain independent unless intentionally revealed, modern wallets routinely communicate with both blockchain infrastructure and dApps, generating network-side and web-side signals that undermine this assumption. These signals leak sensitive information about wallet addresses, allow external parties to infer multi-address ownership, and enable persistent user tracking across sessions and
sites.

In this paper, we identify and formalize five privacy threats that arise directly from wallet behavior across both layers. Using large-scale dynamic measurements of 85 most popular browser-extension wallets (representing 35.16 million users), we observe that routine RPC operations leak structural links between a user’s addresses; that the majority of EVM-compatible wallets implement permission revocation inconsistently and continue to expose previously granted addresses across sessions; and that many wallets inject their provider interfaces into cross-origin iframes, enabling passive cross-site tracking and even real-world identity deanonymization without user interaction. Taken together, these behaviors affect the large majority of active Web3 wallet users.

We propose practical mitigations and show that all five threats can be substantially reduced or eliminated with stricter revocation semantics and origin-bound storage design. Our results highlight the need for standardized, privacy-preserving wallet designs and provide actionable guidance for strengthening user privacy in the emerging Web3 ecosystem.

## License

This artifact is released under the MIT License.

See the `LICENSE` file for details.

## ⚠️ Warning: Public Seed Phrase

> This seed phrase is publicly disclosed in `seed-phrase.json` and should **never be used to store real funds**.
>
> The corresponding wallet address is `0x033a5379bc3d5edd92b9b1da762688e97cef154c`.  
> Please **do not transfer any cryptocurrency** to this address.
>
> During our experiments, we transferred $1 to this wallet address on 16 June 2025 for testing:
> https://etherscan.io/tx/0x2e39689bb4018f604370db359c056f561df2543aca92292f5d4db4d55da2acaf
>
> The funds were withdrawn by an unknown party on 11 March 2026.
> https://etherscan.io/tx/0x616ba6ac4f782210fff88abe587d6a3e9c0088bbe8918a9a4deb48a1923f6fe6
>
> This happened **16 hours after we open-sourced the seed phrase in this repository**, suggesting that publicly **exposed wallets are actively monitored and quickly drained** by automated bots or opportunistic actors.
