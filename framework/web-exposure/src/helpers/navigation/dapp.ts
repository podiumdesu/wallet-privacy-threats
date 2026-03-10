import type { BrowserContext, Page } from "playwright";
import type { Logger } from "../../utility/log_new.js";

import { observePage } from "../report/pageError.js";

export const openDappPage = async (
  ctx: BrowserContext,
  log: Logger,
  dappUrl: string,
  extId: string,
  extName: string
): Promise<Page | null> => {
  const dapp = await ctx.newPage();
  observePage(dapp, "DAPP", extId);
  try {
    await dapp.goto(dappUrl, {
      waitUntil: "domcontentloaded",
      timeout: 8000, // 3s safety timeout
    });
    await dapp.waitForTimeout(2000);
    return dapp;
  } catch (err) {
    log.error(`Failed to open dApp ${dappUrl}`, { error: String(err) });
    await dapp.close().catch(() => {});
    return null; // caller can handle gracefully
  }
};
