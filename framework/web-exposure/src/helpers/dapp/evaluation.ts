import type { Page } from "playwright";

// async function closePopup(ctx: any, extId: string): Promise<void> {
//   const base = `chrome-extension://${extId}`;
//   console.log("Waiting for wallet approval popup...");
//   const approval =
//     (await ctx
//       .waitForEvent("page", {
//         timeout: 3_000,
//         predicate: (p: Page) => p.url().startsWith(base + "/"),
//       })
//       .catch(() => null)) ||
//     (async () => {
//       for (let i = 0; i < 4; i++) {
//         const p = ctx
//           .pages()
//           .find((pp: Page) => pp.url().startsWith(base + "/"));
//         if (p) return p;
//         await new Promise((r) => setTimeout(r, 250));
//       }
//       return null;
//     })();

//   const approvalPage = await approval;
//   if (approvalPage) {
//     console.log("Detected wallet approval popup");
//     await approvalPage.close().catch(() => {});
//     console.log("Closed approval popup");
//   } else {
//     console.log("Didnt see any popup to close");
//   }
// }

export type PageVisionDetail = {
  frameUrl: string;
  providerIndex: number; // index in ethereum.providers, or -1 for legacy
  providerKind: "eip6963" | "legacy";
  accounts: string[] | null; // null if request errored, [] if no permission
  selectedAddress: string | null; // always string or null, never undefined
  chainId: string | null; // always string or null, never undefined
};

/**
 * Runs in every frame of the dapp, and for every injected provider
 * (EIP-6963 or legacy).  Returns an array of provider-specific records.
 */
export async function evaluatePageVisionDetailed(
  page: Page,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<PageVisionDetail[]> {
  const attempts = opts.attempts ?? 4;
  const delayMs = opts.delayMs ?? 200;

  // --- FAST PATH: mimic your working console call on the TOP FRAME ---
  try {
    const main = page.mainFrame();
    const frameUrl = main.url();
    const fast = await main.evaluate(async () => {
      const w: any = window as any;
      const eth = w.ethereum;
      if (!eth || typeof eth.request !== "function") return null;
      try {
        const accounts = await eth.request({ method: "eth_accounts" }); // no params, like console
        // also try chainId best-effort
        let chainId: string | null = null;
        try {
          chainId = await eth.request({ method: "eth_chainId" });
        } catch {
          chainId = null;
        }
        const selectedAddress = (eth as any)?.selectedAddress ?? null;
        return { accounts, chainId, selectedAddress };
      } catch {
        return null;
      }
    });

    if (fast && Array.isArray(fast.accounts)) {
      // If the fast path found a provider, return immediately as a single-detail record
      return [
        {
          frameUrl,
          providerIndex: -1,
          providerKind: "legacy",
          accounts: fast.accounts,
          selectedAddress: fast.selectedAddress ?? null,
          chainId: fast.chainId ?? null,
        },
      ];
    }
  } catch {
    // ignore and continue to full probe
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const frames = page.frames();

    const resultsPerFrame = await Promise.all(
      frames.map(async (frame) => {
        const frameUrl = frame.url();

        const perFrame = await frame
          .evaluate(async () => {
            type Rec = {
              providerIndex: number;
              providerKind: "eip6963" | "legacy";
              accounts: string[] | null;
              selectedAddress: string | null;
              chainId: string | null;
            };

            const out: Rec[] = [];

            const w: any = window as any;
            const announced: any[] = [];

            console.log("GGGG", w == w.top);
            if (w == w.top) {
              console.log("lets try EIP-6963");
              // 1) EIP-6963 announce/collect
              const onAnnounce = async (e: any) => {
                const detail = e?.detail;
                // console.log("[eip6963] EIP-6963: announceProvider", detail);
                // console.log(
                //   await e.detail.provider.request({
                //     method: "eth_accounts",
                //     params: [],
                //   })
                // );
                if (detail?.provider) announced.push(detail.provider);
              };
              try {
                w.addEventListener("eip6963:announceProvider", onAnnounce);
                // w.dispatchEvent?.(new Event("eip6963:requestProvider"));
                w.dispatchEvent(new w.Event("eip6963:requestProvider"));
                // small wait for wallets to announce
                await new Promise((r) => setTimeout(r, 2500));
              } finally {
                console.log("gggg");
                w.removeEventListener?.("eip6963:announceProvider", onAnnounce);
              }
            }
            if (announced.length === 0) {
              console.log("No 6963 providers announced. Trying legacy…");
              const legacy = w.ethereum;
              const list = legacy?.providers?.length
                ? legacy.providers
                : legacy
                  ? [legacy]
                  : [];
              console.log("Legacy providers:", list.length);
            }
            // 2) Legacy fallback (window.ethereum / .providers)
            const base = w.ethereum;
            const legacyList: any[] =
              base?.providers && Array.isArray(base.providers)
                ? base.providers
                : base
                  ? [base]
                  : [];

            // 3) Merge: prefer announced providers; if none, use legacy
            const provs: any[] = announced.length > 0 ? announced : legacyList;

            if (!Array.isArray(provs) || provs.length === 0) return out;

            for (let i = 0; i < provs.length; i++) {
              const p = provs[i];
              const isLegacy =
                provs.length === 1 &&
                p === base &&
                !Array.isArray((base as any)?.providers);

              const providerIndex = isLegacy ? -1 : i;
              const providerKind: "eip6963" | "legacy" = isLegacy
                ? "legacy"
                : "eip6963";

              let accounts: string[] | null = null;
              let selectedAddress: string | null = null;
              let chainId: string | null = null;

              try {
                if (typeof p?.request === "function") {
                  accounts = await p.request({ method: "eth_accounts" });
                  selectedAddress = (p as any)?.selectedAddress ?? null;
                  try {
                    chainId = await p.request({ method: "eth_chainId" });
                  } catch {
                    chainId = null;
                  }
                } else {
                  accounts = null;
                }
              } catch {
                accounts = null;
              }

              out.push({
                providerIndex,
                providerKind,
                accounts,
                selectedAddress,
                chainId,
              });
            }

            return out;
          })
          .catch(() => [] as Array<Omit<PageVisionDetail, "frameUrl">>);

        return perFrame.map((r) => ({ frameUrl, ...r }));
      }),
    );

    const flat = resultsPerFrame.flat();

    // As soon as we’ve seen at least one provider, return its data.
    if (flat.length > 0) return flat;

    // Otherwise retry (wallet might not have injected yet)
    if (attempt < attempts - 1) await page.waitForTimeout(delayMs);
  }

  // After retries, no providers visible in any frame.
  return [];
}

/**
 * Simplified wrapper matching your old signature:
 * - returns `null` if no injected provider found
 * - returns `[]` if provider exists but exposes no accounts
 * - returns non-empty account list if visible
 */
export async function evaluatePageVision(
  page: Page,
  _extId: string,
  // fullyManual?: boolean,
): Promise<{ accounts: string[] | null; details: PageVisionDetail[] }> {
  // if (fullyManual) {
  //   return { accounts: ["No evaluation"], details: [] };
  // }
  const details = await evaluatePageVisionDetailed(page);

  if (details.length === 0) return { accounts: null, details }; // no provider detected at all

  const hit = details.find(
    (d) => Array.isArray(d.accounts) && d.accounts.length > 0,
  );

  if (hit) return { accounts: hit.accounts!, details }; // address(es) visible to page
  return { accounts: [], details }; // provider present but no accounts exposed
}

// export async function evaluatePageVision(
//   page: Page,
//   extId: string
// ): Promise<string[] | null> {
//   // return null;
//   const accounts = await page
//     .evaluate(async () => {
//       const eth = (window as any).ethereum;
//       if (!eth?.request) {
//         return null;
//       }
//       return await eth.request({ method: "eth_accounts" });
//     })
//     .catch(() => null);

//   return accounts;
// }
