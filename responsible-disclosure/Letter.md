> Below is the report we sent to wallet vendors that are affected by the web threat #4.

# Cross-site browser-extension EVM wallet address exposure enabling Web2–Web3 identity linkage

We are researchers affiliated with the University of Leuven (KU Leuven), Belgium. While evaluating the behavior of browser-extension wallets, we identified a severe privacy vulnerability affecting this wallet.

## Bug Description

Your browser extension wallet exposes its provider object inside cross-origin iframes, **allowing a tracker to silently obtain a user’s Web3 wallet address on a non-Web3 website**, which enables persistent tracking and Web2 ↔ Web3 identity linkage without user interaction or consent. This is particularly a problem for users who block or remove third-party cookies, and otherwise wouldn’t be subjected to this privacy problem.

## Impact

This vulnerability enables silent cross-site tracking and user de-anonymization:

- Under specific conditions, third-party embedded content can access a wallet address on websites the user has not explicitly connected to.
- The address may function as a stable identifier across any websites.
- This can facilitate linkage between Web3 identities and Web2-visible information.

This poses a serious privacy risk, especially for users who rely on browser privacy protections and reasonably expect that visiting non-Web3 websites will not expose their wallet identity.

## PoC

We provide a public test webpage that automatically verifies this behavior:

👉 https://wallet-privacy.distriled.dnetcloud.cs.kuleuven.be/

The page:

- Tests whether the wallet injects its provider into cross-origin iframes.
- Demonstrates that a script running inside such an iframe can call: `ethereum.request({ method: "eth_accounts" })`
- Displays any wallet addresses that are leaked via this mechanism.

**Following the instructions on the page reliably reproduces the issue.**

## Solution:

**Do not allow silent account access (`eth_accounts`) in embedded cross-origin contexts.**

Specifically:

- Permissions to access accounts must be scoped to:
  - the dApp origin **and**
  - the top-level site origin.
- `eth_accounts` should return an empty array unless the user has explicitly approved access **in that exact top-level context**.
- Previously granted permissions must not be silently reused when the same origin is embedded under a different top-level site.

or **Do not inject the provider into (cross-origin) iframe contexts.**

One of these changes prevents this de-anonymization threat entirely.

## Attack Scenario (Explanation)

A third-party tracker (tracker.com) is embedded on multiple websites, including Web3 dApps (e.g., dAppX.com) and ordinary Web2 sites (e.g., websiteA.com).

1. When a user connects their wallet to `dAppX.com,` the embedded tracker sees the user’s wallet address (e.g., `0xAddress1`). The wallet stores this permission as: `{ dAppX.com: [0xAddress1] }`.

2. Later, the user visits a non-Web3 site like `websiteA.com`, which also loads the same tracker (`tracker.com`). The tracker on `websiteA.com` cannot access any wallet address, since the user never connected their wallet to that site.

3. However, the tracker on `websiteA.com` can invisibly embed iframes loading `dAppX.com`, `dAppY.com`, `dAppZ.com`, etc. The attack will be successful when the user previously connected their wallet to one of these dApps.

4. Inside the iframe, the tracker (running under the origin `dAppX.com`) runs again. Because your wallet injects its provider into the iframe, the tracker inside the iframe can call: `ethereum.request({ method: "eth_accounts" })` and retrieve `0xAddress1`.

5. The tracker inside the iframe can now send this wallet address to the top frame, where it can be linked with identity information visible on the Web2 site (e.g., Google login email). The tracker does not need to rely on having third-party cookies to achieve this linkage.

This enables silent Web2 ↔ Web3 identity linkage and a persistent tracking identifier that the user cannot clear, regardless of the privacy controls they exert in their browser.

## Next step

Our findings will be published as a scientific paper that was accepted at the [Proceedings on Privacy Enhancing Technologies (PETS 2026)](https://petsymposium.org/). **The paper will be publicly released in April.** Please find a preliminary version of our paper attached.

In addition to the main issue (Web-side Threat #4, page 8 of the paper), we identified several other privacy issues. While some of these are also severe, they are significantly harder to address and may require standard-level changes. We therefore focus on informing you of this threat, which poses an immediate de-anonymization risk and can be mitigated with a relatively simple implementation change. _The remaining issues are detailed in the paper._

If anything is unclear, we are happy to provide further explanation or technical details over email or a quick online meeting.
Please confirm that you have received this message. We will send a reminder in two weeks.

Contact: Weihong Wang (weihong.wang@kuleuven.be)
