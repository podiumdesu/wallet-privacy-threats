// Discover the wallet injection.
// Different wallets -> is it different object?

// Can a dApp know what wallets are installed?
// How can I know what requests are sent out from the dApp?
//      e.g. is it asking for the specific wallet address?

// Returns a Promise that resolves to an array of { info, provider } from EIP-6963
export function discoverInjectedProviders({ timeout = 200 } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    let done = false;

    const onAnnounce = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { info, provider } = customEvent.detail || {};
      if (info?.uuid && provider) found.set(info.uuid, { info, provider });
    };

    // 1) Listen *before* requesting
    window.addEventListener("eip6963:announceProvider", onAnnounce);

    // 2) Ask wallets to announce
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // 3) Give a short window for responses, then clean up
    setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(Array.from(found.values()));
    }, timeout);
  });
}
