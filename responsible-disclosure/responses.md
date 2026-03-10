# Meaningful Responses from Wallet Vendors

We contacted all the wallets that are affected by web threat #4. And we got responses from most of them. Here are some responses from them, we pasted here.

## Metamask

Thank you for your detailed report and the research you've conducted on wallet privacy vulnerabilities. We appreciate the time and effort you've put into documenting this issue, including the comprehensive technical analysis and proof-of-concept.

This vulnerability is a known risk that was actually one of the main motivations behind our development of an alternative wallet API that doesn't rely on provider injection. The cross-origin iframe exposure you've identified is something our team has been aware of and has been factoring into our long-term architectural decisions.

Currently, we don't have immediate plans to stop injecting the provider, as this would create significant breaking changes for the dApp ecosystem. However, we have discussed hypothetical future plans where we might allow users to opt-out of the injected provider (and potentially transition to an opt-in model over time). The challenge is that such changes would break compatibility with many existing dApps, and we need to better understand the full scope of impact before proceeding.

Given that this is a known issue that we're already tracking internally, we'll be closing this report as a duplicate. While we won't be issuing a bounty for this submission, we want to acknowledge the quality of your research and documentation.

We understand you plan to publish your findings in April 2026. If you have any questions about our response or timeline, please don't hesitate to reach out.

Thank you again for your contribution to wallet security research.

Best regards,
MetaMask Security Team

## Rabby

The vulnerability requires two websites to be simultaneously injected with malicious scripts for it to be exploitable, which is virtually impossible; therefore, the vulnerability does not exist.

## OKX

Thank you for your detailed submission and the thorough academic research from KU Leuven. Your report clearly demonstrates how the OKX Wallet Chrome Extension injects the wallet provider into cross-origin iframes, allowing silent collection of wallet addresses on non-Web3 websites without user interaction.

After careful review, this report is being closed as Informative based on internal policy. While the technical findings are accurate and the privacy implications are understood, the issue does not meet the program's threshold for acceptance as it lacks demonstrable functional or financial harm beyond information disclosure. The program's security priorities focus on vulnerabilities with direct impact to wallet functionality or user assets.

Your contribution to Web3 privacy research is valued, and the detailed analysis with reproduction steps and demo website demonstrates excellent security research practices. The findings may be useful for the broader security community's understanding of wallet extension behavior.

## ByBit

Our security team has reviewed and tested your report, however, our team has determined that this is not a vulnerability rewardable under our bug bounty program as the risk is extremely low. Should you discover any security vulnerabilities on our site in the future, please feel free to reach out to us again.

With this, your vulnerability report can be ignored due to its tolerable range. We would like to thank you for your time and interest in improving the Bybit platform.

Please feel free to reach back to us anytime should you have any reports to share with our team.

## Backpack

Hello,

Thank you for submitting your report! We appreciate your efforts in identifying this issue.

Your submission has been jointly analyzed by our triage specialists and the BackPack security team.

Unfortunately, theoretical issues fall outside the scope of our bug bounty program.

As a result, we will be closing this report as 'Out of Scope' and ending our investigation of this case. Please note that this closure will not impact your reputation score.

Wishing you the best of luck with your future findings!

Best regards,
HackenProof Triage Team

## Core

Hi, Immunefi has reviewed this vulnerability report and decided to close since being out of scope for Ava Labs Avalanche bug bounty program.

- claimed impact by the whitehat **`is not in scope`** for the bug bounty program
- claimed asset by the whitehat **`is not in scope`** for the bug bounty program
- claimed severity **`is not in scope`** for the bug bounty program

The project will now be automatically subscribed and receive a report of the closed submission and can evaluate if they are interested in re-opening it. However, note that they are not under any obligation to do so.
