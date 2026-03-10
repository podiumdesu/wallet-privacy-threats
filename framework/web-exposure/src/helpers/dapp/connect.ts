import type { BrowserContext, Page } from "playwright-core";
import type { Logger } from "../../utility/log_new.js";

import { clickAny } from "../clicks.js";
import { observePage } from "../report/pageError.js";

import { connectCandidates } from "../patterns.js";
import { tryClickFirstVisible } from "./disconnect.js";

export type ConnectWalletResult =
  | {
      ok: true;
      clickedConnect: boolean;
      clickedWallet: boolean;
      approvalDetected: boolean;
      approvalClicked: boolean;
      details: { dappUrl: string; extId: string; extName: string };
    }
  | {
      ok: false;
      error: Error;
      partial: {
        clickedConnect: boolean;
        clickedWallet: boolean;
        approvalDetected: boolean;
        approvalClicked: boolean;
      };
    };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function connectWalletOnDapp(
  dapp: Page,
  log: Logger,
  extName: string,
  extId: string,
  ctx: BrowserContext
): Promise<ConnectWalletResult> {
  const state = {
    clickedConnect: false,
    clickedWallet: false,
    approvalDetected: false,
    approvalClicked: false,
  };

  try {
    state.clickedConnect = await clickAny(
      dapp,
      connectCandidates,
      log.child("dapp")
    );
    if (!state.clickedConnect) {
      log.warn("No obvious Connect button clicked; dApp might auto-trigger");
    }
    await dapp.waitForTimeout(500);

    const esc = escapeRegExp(extName.trim());
    const walletCandidates = [
      `text=/^${esc}(?:\\s+(?:wallet|extension|app))?$/i`,
    ];
    // const walletCandidates = [`text=/^(${extName})|${extName} wallet)$/i`];
    state.clickedWallet = await clickAny(
      dapp,
      walletCandidates,
      log.child("dapp")
    );
    if (!state.clickedWallet) {
      log.warn(
        `No obvious wallet button (${extName}) clicked; maybe already connected?`
      );
    }
    await dapp.waitForTimeout(500);

    const base = `chrome-extension://${extId}`;
    const approval =
      (await ctx
        .waitForEvent("page", {
          timeout: 3000,
          predicate: (p) => p.url().startsWith(base + "/"),
        })
        .catch(() => null)) ||
      (async () => {
        const totalPages = ctx.pages();
        console.log(totalPages.length);
        for (let i = 0; i < totalPages.length; i++) {
          const p = ctx.pages().pop();
          if (p?.url().startsWith(base + "/")) return p;
          await new Promise((r) => setTimeout(r, 250));
        }
        return null;
      })();

    const approvalPage = await approval;
    if (!approvalPage) {
      log.warn("No approval popup detected; maybe already connected?");
    } else {
      state.approvalDetected = true;
      log.success("Detected wallet approval popup");
      observePage(approvalPage, "EXT-approval", extId);

      await approvalPage.waitForLoadState("domcontentloaded");
      await approvalPage.waitForTimeout(300);

      const primary = await clickAny(
        approvalPage,
        [
          "role=button[name=/connect|approve|confirm|authorize/i]",
          // "text=/connect|approve|confirm|authorize/i",
          'button:has-text("Connect")',
          'button:has-text("Approve")',
          'button:has-text("Confirm")',
          'button:has-text("Authorize")',
        ],
        log.child("approval")
      );

      if (primary) {
        state.approvalClicked = true;
        console.log("Primary works");
      } else {
        const next = await clickAny(
          approvalPage,
          ["role=button[name=/next|continue/i]", "text=/next|continue/i"],
          log.child("approval")
        );
        if (next) {
          const finalCta = await clickAny(
            approvalPage,
            [
              "role=button[name=/connect|approve|confirm/i]",
              "text=/connect|approve|confirm/i",
            ],
            log.child("approval")
          );
          state.approvalClicked = !!finalCta;
        }
      }

      if (state.approvalClicked) {
        log.success("Wallet connected to dApp (approval clicked)");
      } else {
        log.warn("Cant click on approval of connecting");
      }
    }

    // Define success criteria (tune to your needs)
    if (state.approvalDetected && state.approvalClicked) {
      return {
        ok: true,
        ...state,
        details: { dappUrl: dapp.url(), extId, extName },
      };
    }

    return {
      ok: false,
      error: new Error(
        "Wallet connection did not complete (missing approval or click)."
      ),
      partial: { ...state },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    log.error("Error during wallet connection process:", {
      error: err.message,
    });
    return { ok: false, error: err, partial: { ...state } };
  }
}
