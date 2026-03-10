import type { BrowserContext, Page } from "playwright-core";
import type { Logger } from "../../utility/log_new.js";

import { getManifestPopup } from "../manifest.js";
import { observePage } from "../report/pageError.js";
export async function openExtHomeSimple(
  extId: string,
  ctx: BrowserContext,
  extPath: string,
  log: Logger,
  { acceptPopupFallback = true, waitNewPageMs = 5000 } = {}
): Promise<Page | null> {
  try {
    const base = `chrome-extension://${extId}`;

    // --- read popup from manifest (if any) ---
    let defaultPopUp = await getManifestPopup(extPath);
    if (defaultPopUp != null) {
      defaultPopUp = `${base}/${defaultPopUp}`;
      log.success(`Detected default popup: ${defaultPopUp}`);
    }

    const candidates = [
      defaultPopUp || undefined,
      `${base}/index.html`,
      `${base}/home.html`,
      `${base}/welcome.html`,
      `${base}/index.html#/onboarding`,
      `${base}/home.html#/onboarding`,
      `${base}/popup.html`, // last: may trigger a new tab
    ].filter(Boolean) as string[];

    const isExt = (u: string) => u.startsWith(`${base}/`);
    const isPopup = (u: string) =>
      /\/[^?#]*(popup|panel)\.html$/i.test(new URL(u).pathname);
    const isHomeLike = (u: string) => isExt(u) && !isPopup(u);
    const usable = (p?: Page | null) => !!p && !p.isClosed();

    async function looksAlive(p: Page) {
      // super simple: body has text
      await p.waitForLoadState("domcontentloaded").catch(() => {});
      await p.waitForTimeout(500).catch(() => {});
      return p
        .evaluate(() => !!document.body?.innerText?.trim())
        .catch(() => false);
    }

    async function waitForHomeLikeAppearing(deadlineMs: number) {
      const start = Date.now();
      while (Date.now() - start < deadlineMs) {
        const found = ctx.pages().find((p) => usable(p) && isHomeLike(p.url()));
        if (found) return found;
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    }

    for (const url of candidates) {
      // reuse an already-open "real" tab if present
      const existing = ctx.pages().find((p) => isHomeLike(p.url()));
      let page: Page = existing ?? (await ctx.newPage());
      observePage(page);

      try {
        // page = await robustGoto(ctx, page, url); //
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });

        if (isHomeLike(page.url()) && (await looksAlive(page))) return page;
        console.log("Landed on non-home page:", page.url());
        // landed on a popup? see if it spawns a real tab
        if (isPopup(page.url())) {
          console.log("Landed on popup, waiting for spawn...");
          const spawned = await waitForHomeLikeAppearing(waitNewPageMs);
          if (spawned) {
            console.log("Found spawned tab:", spawned.url());
            if (page != spawned) {
              if (await looksAlive(spawned)) {
                try {
                  await page.close();
                } catch {}
                return spawned;
              }
            }
            if (usable(page) && page !== spawned) {
              console.log("Closing spawned tab:", page.url());
              await page.close().catch(() => {});
            }
            return spawned;
          }
          // as a last resort, accept the popup if allowed
          if (acceptPopupFallback && (await looksAlive(page))) return page;
        }
        console.log("Not the right page:", page.url());

        // else: try the next candidate
      } catch (e: any) {
        // console.log("Error! ");
        // console.error(e);
        // console.log(e.message);
        page.close().catch(() => {});
        // navigation failed: try next
        // throw e;
      }
    }

    throw new Error("Could not find a home/onboarding page.");
  } catch (e) {
    console.log("openExtHomeSimple failed:");
    console.error(e);
    // throw e;
    return null;
  }
}

export async function openWalletHome(
  ctx: BrowserContext,
  extId: string,
  extPath: string,
  log: Logger
): Promise<Page | null> {
  const page = await openExtHomeSimple(extId, ctx, extPath, log, {
    acceptPopupFallback: true,
    waitNewPageMs: 5000,
  });
  if (!page) return null;
  observePage(page, "EXT");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  log.success(`Wallet home page opened: ${page.url()}`);
  return page;
}
