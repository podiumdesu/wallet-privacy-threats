import type { Locator, Page } from "playwright";
import { findPattern } from "../detectImport.js";

import { CONNECTISH, ETH_ADDR_FULL, ETH_ADDR_SHORT } from "../patterns.js";

export async function detectConnectOrAddress(page: Page): Promise<{
  hasConnectCTA: boolean;
  connectEl?: Locator;
  hasAddr: boolean;
  addrEl?: Locator;
}> {
  // Prefer clickable CTAs
  const connectEl = await findPattern(page, [CONNECTISH], {
    btnOnly: true,
    includeIframes: true,
    timeoutMs: 2000,
  });
  if (connectEl) return { hasConnectCTA: true, connectEl, hasAddr: false };

  // Fall back to any visible element containing an address-ish string
  const addrLoc = await findPattern(page, [ETH_ADDR_FULL, ETH_ADDR_SHORT], {
    btnOnly: false,
    includeIframes: true,
    timeoutMs: 2000,
  });

  if (addrLoc) {
    const raw = await addrLoc.innerText().catch(() => "");
    const match = raw.match(ETH_ADDR_FULL) || raw.match(ETH_ADDR_SHORT);
    return { hasConnectCTA: false, hasAddr: true, addrEl: addrLoc };
  }

  return { hasConnectCTA: false, hasAddr: false };
}
