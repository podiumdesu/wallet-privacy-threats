import type { Page, Frame, Locator } from "playwright";

import { findPattern } from "../detectImport.js";
import { ETH_ADDR_FULL, ETH_ADDR_SHORT } from "../patterns.js";

import { DISCONNECT_PATTERNS } from "../patterns.js";
import { clickFirstMatch } from "../clicks.js";
import type { Logger } from "../../utility/log_new.js";

import { connectCandidates } from "../patterns.js";
import { findSeletors } from "../clicks.js";

const findConnectWalletButton = async (page: Page) => {
  return await findSeletors(page, connectCandidates);
};

// Patterns
// const ADDRESSISH = /\b0x[a-fA-F0-9]{2,8}(?:…|\.\.\.)?[a-fA-F0-9]{2,8}\b/;
// const DISCONNECTISH =
//   /\b(disconnect|log\s*out|sign\s*out|unlink|disconnect\s*wallet)\b/i;

// Most reliable, ordered by confidence/speed
const DIRECT_DISCONNECT_SELECTORS = [
  // button
  "role=button[name=/disconnect|log out|sign out|unlink/i]",
  "text=/disconnect|log out|sign out|unlink/i",
  '[data-testid="wallet-disconnect"]',
  "[data-testid*=disconnect]",
  "role=menuitem[name=/disconnect/i]",
  // "role=button[name=/disconnect|log out|sign out|unlink/i]",
  "[aria-label*=disconnect i], [title*=disconnect i]",
];

// Robust triggers that usually open the wallet panel
// const PANEL_TRIGGERS = [
//   '[data-testid="wallet-disconnect"]',
//   "[data-testid*=wallet][data-testid*=button]",
//   "[data-testid*=account][data-testid*=button]",
//   "[data-test*=wallet][data-test*=button]",
//   "role=button[name=/wallet|account|profile|menu/i]",
//   "role=button[name=" + ADDRESSISH.source + "]",
//   `text=${ADDRESSISH.source}`,
//   // common chips/avatars
//   "[class*=wallet][class*=chip]",
//   "[class*=avatar], [data-testid*=avatar]",
// ];

// const DISCONNECT_SELECTORS = [
//   '[data-testid="wallet-disconnect"]',
//   "role=menuitem[name=/disconnect/i]",
//   "role=button[name=/disconnect|log out|sign out|unlink/i]",
//   // icon-only buttons commonly have aria labels or titles
//   "[aria-label*=disconnect i], [title*=disconnect i]",
//   // generic power icon buttons (fallback)
//   "[data-icon*=power], [class*=power], button:has(svg[aria-label*=power i])",
// ];

// Icon-only fallbacks (power icon etc.)
const ICON_FALLBACKS = [
  "[data-icon*=power]",
  "button:has(svg[aria-label*=power i])",
  "[class*=power][class*=icon], [class*=icon][class*=power]",
];

type ClickOutcome =
  | { ok: true; selector: string }
  | { ok: false; reason: string };

// Small helper: try many selectors until one clicks

export async function tryClickFirstVisible(
  scope: Page,
  selectors: string | string[],
  timeout = 5400
): Promise<ClickOutcome> {
  console.log("Trying to click disconnect....");
  const list = Array.isArray(selectors) ? selectors : [selectors];

  for (const sel of list) {
    const loc = scope.locator(sel).first();
    console.log("Trying ", loc);
    try {
      // const screenConnectButton = await findConnectWalletButton(scope);
      // if (screenConnectButton) {
      //   console.log("I SAW THE CONNECT BUTTON AGAIN");
      //   return {
      //     ok: true,
      //     selector: sel,
      //   };
      // }

      await loc.waitFor({ state: "visible", timeout });
      if (await loc.isDisabled().catch(() => false)) continue;

      await loc.scrollIntoViewIfNeeded().catch(() => {});

      // Check actionability (covered/intercepted) without side effects
      await loc.click({ trial: true, timeout });

      // Real click
      await loc.click().catch((e) => {
        throw e;
      });
      // console.log(loc);
      // console.log(await loc.innerHTML());
      // await scope.waitForTimeout(1000);

      // Optional: assert post-click state
      // await expect(loc).toBeHidden({ timeout: 2000 }).catch(() => {});
      return { ok: true, selector: sel };
    } catch (e) {
      // Uncomment to see *why* it failed:
      // console.log(`[click fail] ${sel}`, e);
      continue;
    }
  }
  return { ok: false, reason: "no_visible_match" };
}

export type DisconnectWalletResult =
  | {
      ok: true;
      strategy: string;
    }
  | {
      ok: false;
      error: Error;
      attempts: Array<{ strategy: string; detail: string }>;
    };

export const disconnectWalletFromDapp = async (
  dapp: Page,
  log: Logger
): Promise<DisconnectWalletResult> => {
  log.info("Attempting to disconnect wallet from dApp");
  // ╭──────────────────────────────────────────────────────────────╮
  // │  SECTION 1: Locate wallet address element                    │
  /**╰──────────────────────────────────────────────────────────────╯**/

  const addrLoc = await findPattern(dapp, [ETH_ADDR_FULL, ETH_ADDR_SHORT], {
    btnOnly: false,
    includeIframes: true,
    timeoutMs: 2000,
  });
  if (!addrLoc) {
    log.warn("No address element found on dApp; maybe not connected?");
    return {
      ok: false,
      attempts: [],
      error: new Error("No address element found on dApp"),
    };
  }
  console.log(addrLoc);
  log.success("Found address element on dApp");
  // Try to click, if not, capture error
  await addrLoc.click().catch(() => {});
  console.log("Wait");
  await dapp.waitForTimeout(2000);
  console.log("WAIT");
  // ╭──────────────────────────────────────────────────────────────╮
  // │  SECTION 2: Try to locate and then click a disconnect button │
  /**╰──────────────────────────────────────────────────────────────╯**/
  const res = await clickDisconnectButton(dapp, log);
  if (res.ok) {
    log.success("Clicked disconnect button");
    return { ok: true, strategy: res.strategy };
  } else {
    log.warn("Failed to click disconnect button");
    return { ok: false, error: res.error, attempts: res.attempts };
  }
};

async function clickDisconnectButton(
  dapp: Page,
  log: Logger,
  timeout = 10000
): Promise<DisconnectWalletResult> {
  const attempts: Array<{ strategy: string; detail: string }> = [];

  // ╭──────────────────────────────────────────────────────────────╮
  // │  Strategy 1: Direct selectors anywhere                       │
  /**╰──────────────────────────────────────────────────────────────╯**/
  //   for (const scope of allScopes(dapp)) {
  //     const res = await tryClickFirstVisible(scope, DIRECT_DISCONNECT_SELECTORS);
  //     if (res.ok) {
  //       log.success(`Clicked disconnect via direct selector: ${res.selector}`);
  //       return { ok: true, strategy: `direct:${res.selector}` };
  //     }
  //     attempts.push({ strategy: "direct", detail: "no direct selector visible" });
  //   }
  // let severalClicksFlag = false;
  // let severalClickText = "";
  // let severalClicks;

  // try until either it meets the situation or exceeds timeout
  const start = Date.now();
  // await dapp.waitForTimeout(200000);
  while (Date.now() - start < timeout) {
    // Hover the parent container first
    // await dapp.locator('div[aria-expanded="false"]').hover();
    const menuBtn = await dapp.locator('div[aria-expanded="false"]');
    console.log("found menubtn", menuBtn.count());
    try {
      await tryClickFirstVisible(dapp, DIRECT_DISCONNECT_SELECTORS, 4000);
    } catch {
      await dapp.waitForTimeout(200);
    }

    const screenConnectButton = await findConnectWalletButton(dapp);
    if (screenConnectButton) {
      console.log("I SAW THE CONNECT BUTTON AGAIN");
      return {
        ok: true,
        strategy: "direct:connect-button",
      };
    }

    await dapp.waitForTimeout(200);
  }

  return {
    ok: false,
    error: new Error("disconnect_button_not_found"),
    attempts,
  };

  // for (let i = 0; i < 2; i++) {
  //   console.log("Trying to click disconnect ");
  //   // severalClicks = await clickFirstMatch(
  //   //   dapp,
  //   //   DISCONNECT_PATTERNS,
  //   //   log.child("dapp")
  //   // );
  //   // const disconnect =
  //   //   // .getByRole("menuitem", { name: /^disconnect$/i })
  //   //   dapp
  //   //     .getByRole("button", { name: /^disconnect$/i })
  //   //     .or(dapp.getByText(/^disconnect$/i))
  //   //     .first();
  //   let flag = 0;
  //   // for (const scope of allScopes(dapp)) {
  //   // flag += 1;
  //   // console.log(scope);
  //   await tryClickFirstVisible(dapp, DIRECT_DISCONNECT_SELECTORS, 4000);
  //   // }
  //   // console.log("flag:", flag);

  //   // severalClicks = await tryClickFirstVisible(
  //   //   dapp,
  //   //   DIRECT_DISCONNECT_SELECTORS
  //   // );
  //   // if (severalClicks.ok) {
  //   //   severalClicksFlag = true;
  //   //   // severalClickText = severalClicks.;
  //   // }
  //   // if (severalClicksFlag) break;
  //   await dapp.waitForTimeout(1000);
  //   // console.log(several)
  // }
  // if (severalClicksFlag) console.log("severalClicksFlag:", severalClicksFlag);

  // if (screenConnectButton) {
  //   console.log("I SAW THE CONNECT BUTTON AGAIN");
  //   return {
  //     ok: true,
  //     strategy: `clicked disconnect via direct text selector: ${severalClickText}`,
  //   };
  // }
  // console.log("No direct text selector clicked");

  // attempts.push({ strategy: "direct", detail: "no direct selector visible" });

  // console.log("try another strategy");
  // // ╭──────────────────────────────────────────────────────────────╮
  // // │  Strategy 2: Try to click on a wallet panel                  │
  // /**╰──────────────────────────────────────────────────────────────╯**/
  // // 1) Make sure the panel is open (or can be opened)
  // const openedPanel = await ensureWalletPanelOpen(dapp, log);
  // if (!openedPanel) {
  //   attempts.push({
  //     strategy: "2-1 open panel",
  //     detail: "could not open wallet panel",
  //   });
  //   return { ok: false, error: new Error("wallet_panel_not_opened"), attempts };
  // }
  // console.log("Found it ");
  // await dapp.waitForTimeout(1000); // allow popover mount
  // console.log("Now click");

  // // 2) Click disconnect within the panel
  // for (const scope of allScopes(dapp)) {
  //   const res = await tryClickFirstVisible(scope, DIRECT_DISCONNECT_SELECTORS);
  //   if (res.ok) {
  //     log.success(`Clicked disconnect via direct selector: ${res.selector}`);
  //     return { ok: true, strategy: `direct:${res.selector}` };
  //   }
  //   attempts.push({ strategy: "direct", detail: "no direct selector visible" });
  // }

  //   const order = [
  //     '[data-testid="wallet-disconnect"]',
  //     ...DIRECT_DISCONNECT_SELECTORS.slice(1),
  //   ];

  //   for (const sel of order) {
  //     const loc = dapp.locator(sel).first();
  //     try {
  //       await loc.waitFor({ state: "visible", timeout: 2500 });
  //       // Sometimes the disconnect item is within a menu/portal container; ensure it's in viewport
  //       await loc.scrollIntoViewIfNeeded().catch(() => {});
  //       await loc.click({ force: true });
  //       log.success(`Clicked disconnect via: ${sel}`);
  //       return { ok: true, strategy: `panel:${sel}` };
  //     } catch {
  //       // keep trying
  //     }
  // //   }
  // attempts.push({
  //   strategy: "2-2",
  //   detail: "after panel, no disconnect button found",
  // });
}

// async function clickDisconnectButton(
//   // Try to locate and click a disconnect button
//   dapp: Page,
//   log: Logger
// ): Promise<boolean> {
//   const res = await clickFirstMatch(
//     dapp,
//     DISCONNECT_PATTERNS,
//     log.child("dapp")
//   );
//   if (res.clicked) {
//     return true;
//   }
//   return false;
// }
