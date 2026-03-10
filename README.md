# The Masks We (Think We) Wear: Privacy Threats of Browser-Extension Wallets in the Web3 Ecosystem

**Authors**: Weihong Wang (DistriNet, KU Leuven), Yana Dimova (DistriNet, KU Leuven), Victor Vansteenkiste (KU Leuven), Tom Van Goethem, Tom Van Cutsem (DistriNet, KU Leuven)

The paper will be published at [Proceedings on Privacy Enhancing Technologies Symposium](https://petsymposium.org/) 2026.

## Artifact Instructions

Please refer to `ARTIFACT-APPENDIX.md` for detailed instructions on how to use the artifact.

## Abstract

Cryptocurrency wallets are the primary interface for managing blockchain addresses, viewing balances, and interacting with Web3 applications. Although users typically assume that their addresses remain independent unless intentionally revealed, modern wallets routinely communicate with both blockchain infrastructure and dApps, generating network-side and web-side signals that undermine this assumption. These signals leak sensitive information about wallet addresses, allow external parties to infer multi-address ownership, and enable persistent user tracking across sessions and
sites.

In this paper, we identify and formalize five privacy threats that arise directly from wallet behavior across both layers. Using large-scale dynamic measurements of 85 most popular browser-extension wallets (representing 35.16 million users), we observe that routine RPC operations leak structural links between a user’s addresses; that the majority of EVM-compatible wallets implement permission revocation inconsistently and continue to expose previously granted addresses across sessions; and that many wallets inject their provider interfaces into cross-origin iframes, enabling passive cross-site tracking and even real-world identity deanonymization without user interaction. Taken together, these behaviors affect the large majority of active Web3 wallet users.

We propose practical mitigations and show that all five threats can be substantially reduced or eliminated with stricter revocation semantics and origin-bound storage design. Our results highlight the need for standardized, privacy-preserving wallet designs and provide actionable guidance for strengthening user privacy in the emerging Web3 ecosystem.

## License

This artifact is released under the MIT License.

See the `LICENSE` file for details.
