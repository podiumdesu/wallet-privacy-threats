import type { BrowserContext, Page } from "playwright";
import type { ExtensionInfo } from "../../types.js";
import path from "path";
import fs from "fs/promises";
// Navigation
import { openDappPage } from "../navigation/dapp.js";
import { openWalletHome } from "../navigation/wallet.js";

// traffic requests capturing
import { attachPageNetwork } from "../cdp/network.js";
// import { wireContextPages } from "../cdp/network.js";
import type { NetRecord } from "../cdp/network.js";

import {
  attachStorageMonitor,
  makePhaseHelpers,
} from "../detect/setupStorageMonitor.js";

// Connect & Disconnect
import { disconnectWalletFromDapp } from "../dapp/disconnect.js";
import { connectWalletOnDapp } from "../dapp/connect.js";

import { waitForManualPrompt } from "./manualPrompt.js";
import { evaluatePageVision } from "../dapp/evaluation.js";

import { fillUnlockPassword } from "../screensinput.js";
import { detectConnectOrAddress } from "./detect.js";

import type { Logger } from "../../utility/log_new.js";
import type { PageVisionDetail } from "../dapp/evaluation.js";
import { timeStamp } from "console";

// define a type
export type dappVision = {
  preLock: string[] | null;
  preConsent: string[] | null;
  postConsent: string[] | null;
  afterRevoke: string[] | null;
  reconnect?: string[] | null;
};

export type EIP6963baseRes = {
  dappUrl: string;
  extName: string;
  extPath: string;
  dappVision: dappVision | null;
  visionDetails?: PageVisionDetail[];
  notes?: string[];
  addresses?: string[];
};

export type PhaseTiming = {
  preLock: number;
  preConsent: number;
  duringConsent: number;
  postConsent: number;
  afterRevoke: number;
  reconnect?: number;
};

export async function writeEIP6963Result(
  result: EIP6963baseRes | {},
  filePath: string,
) {
  const abs = path.resolve(filePath);
  const data = JSON.stringify(result, null, 2); // pretty-print
  await fs.writeFile(abs, data, "utf8");
  console.log(`Result written to ${abs}`);
}

export async function testDapp(
  ctx: BrowserContext,
  log: Logger,
  dappUrl: string,
  extId: string,
  extName: string,
  extPath: string,
  password: string,
  manualMode: boolean,
  fullyManual: boolean,
  ext?: ExtensionInfo,
): Promise<{
  page: Page | null;
  baseRes: EIP6963baseRes;
  cookieAndLocalStorage: string[] | null;
  objectEventLogs: string[] | null;
  phaseTiming: PhaseTiming | null;
  pageRequests: NetRecord[] | null;
  error: Error | null;
  sysErr: boolean;
  prefix?: string;
}> {
  const dappVisionRes: dappVision = {
    preLock: null,
    preConsent: null,
    postConsent: null,
    afterRevoke: null,
    reconnect: null,
  };
  const phaseTimings: PhaseTiming = {
    preLock: 0,
    preConsent: 0,
    duringConsent: 0,
    postConsent: 0,
    afterRevoke: 0,
  };

  let vision: PageVisionDetail[] = [];

  let sysErr = false;
  let prefix: string = "";
  let cookieAndLocalStorageLogsFromConsole: string[] = [];
  let objectEventLogs: string[] = [];

  try {
    // ╭──────────────────────────────────────────────────────────────╮
    // │  SECTION 1: Open dApp                                        │
    /**╰──────────────────────────────────────────────────────────────╯**/
    // Note: you can change this to any dApp you want to test with
    // Step 1: Navigate to a dApp page
    // await openDappPage(ctx, log, "https://app.uniswap.org/", extId, extName);
    const dapp = await openDappPage(ctx, log, dappUrl, extId, extName);
    if (!dapp) {
      sysErr = false;
      prefix = "1-access-refused";
      throw new Error("Dapp access refused.");
    }

    const pageNetworkLogs: NetRecord[] = [];
    await attachPageNetwork(
      ctx,
      dapp,
      (rec) => {
        pageNetworkLogs.push(rec);
      },
      "page",
    );

    // Capture the localStorage and Cookie access from the logs
    dapp.on("console", (msg: { text: () => any; type: () => any }) => {
      const text = msg.text();
      // console.log("[PAGEEEEEEEE]", msg.type(), text);

      if (text.startsWith("[object-event")) {
        const m = text.match(/^\[object-event\]\s+(.*)$/s);
        if (!m || !m[1]) return;
        try {
          const rec = JSON.parse(m[1]);
          if (typeof rec.val === "string") {
            try {
              rec.val = JSON.parse(rec.val);
            } catch {}
          }
          objectEventLogs.push(rec);
        } catch (e) {
          console.warn(
            "Failed to parse object-event JSON:",
            (e as Error).message,
          );
        }
      } else if (!text.startsWith("[storage-event]")) {
        // console.log("[PAGE-TODOTODO]", msg.type(), text);
      }
      if (text.startsWith("[eip6963]")) {
        console.log("[PAGEEEEE-eip6963]", text);
      }
      // Deal with the logs from localStorage
      if (!text.startsWith("[storage-event]")) return;

      const m = text.match(/^\[storage-event\]\s+(.*)$/s);
      if (!m || !m[1]) return;

      try {
        const rec = JSON.parse(m[1]);
        if (typeof rec.val === "string") {
          try {
            rec.val = JSON.parse(rec.val);
          } catch {}
        }
        cookieAndLocalStorageLogsFromConsole.push(rec);
      } catch (e) {
        console.warn(
          "Failed to parse storage-event JSON:",
          (e as Error).message,
        );
      }
    });

    await dapp.reload(); // Todo: for the bug
    //----------------------------------Bind Scripts-------------------------------------
    const { setPhase } = makePhaseHelpers(dapp);

    // To bind the scripts
    await attachStorageMonitor(dapp, "Setup");
    // set phases (run in the page, not Node)
    // *********************************END: BIND SCRIPTS*******************************
    phaseTimings.preLock = Date.now();
    await setPhase("preLock"); // sets now and will auto re-apply after any reloads

    // Step 2: Test if the dApp can be connected by a wallet by checking the existance of a connect button
    // TODO: Change back
    let hasConnectCTA;
    let hasAddr = false;
    let addrEl = null;
    // let { hasConnectCTA, hasAddr, connectEl, addrEl } =
    //   await detectConnectOrAddress(dapp);

    // if (!(hasConnectCTA || hasAddr)) {
    //   // if none of the buttons shows up
    //   sysErr = false;
    //   prefix = "0-dapp-invalid";
    //   throw new Error("Not a valid connectable website.");
    // }

    // if (hasAddr) {
    //   sysErr = false;
    //   prefix = "2-already-connected";
    //   throw new Error("Page has connected before testing.");
    // }

    // Step 3 [Evaluation]: Evaluate what the dApp can see before even locking the wallet
    const { accounts: seeingAddrLocked } = await evaluatePageVision(
      dapp,
      extId,
      fullyManual,
    );
    console.log("Seeing before lock", seeingAddrLocked);
    dappVisionRes.preConsent = seeingAddrLocked;
    log.info(
      `DApp can see ${
        seeingAddrLocked?.length
      } wallet-related items before consent: ${seeingAddrLocked?.join(", ")}`,
    );

    // ╭──────────────────────────────────────────────────────────────╮
    // │  SECTION 2: Open wallet home + unlock                        │
    /**╰──────────────────────────────────────────────────────────────╯**/
    let newWalletpage = null;
    // let newWalletpage = await openWalletHome(ctx, extId, extPath, log);
    // if (!newWalletpage) {
    //   if (manualMode) {
    //     log.warn("Automatic wallet home open failed.");
    //     log.info(
    //       "You can manually provide the wallet home URL if you know it."
    //     );
    //     log.info("Example: chrome-extension://<ext-id>/home.html");
    //     log.info(
    //       "Or press ENTER to skip and try manual unlock confirmation instead."
    //     );

    //     // Ask user for the URL
    //     const userUrl: string = await new Promise((resolve) => {
    //       process.stdin.resume();
    //       process.stdin.once("data", (data) => {
    //         process.stdin.pause();
    //         resolve(data.toString().trim());
    //       });
    //     });

    //     // let manualPage = null;
    //     if (userUrl && userUrl.startsWith("chrome-extension://")) {
    //       try {
    //         newWalletpage = await ctx.newPage();
    //         await newWalletpage.goto(userUrl, {
    //           waitUntil: "domcontentloaded",
    //         });
    //         log.success(`Opened user-provided wallet home: ${userUrl}`);
    //       } catch (err) {
    //         log.error(`Failed to open provided URL: ${userUrl}`);
    //       }
    //     }

    //     if (!newWalletpage) {
    //       const { success } = await waitForManualPrompt(
    //         log,
    //         newWalletpage ?? ({} as Page),
    //         "Unlocking the wallet manually (no URL provided)..."
    //       );
    //       if (!success) {
    //         prefix = "3-no-wallet-home";
    //         throw new Error("Wallet access refused.");
    //       }
    //     }

    //     // continue with manualPage if opened
    //     if (newWalletpage) {
    //       // use this as your new wallet page
    //       // e.g. newWalletpage = manualPage;
    //       log.info("Manual wallet home loaded successfully.");
    //       // Optionally assign it:
    //       // newWalletpage = manualPage;
    //       // You may want to return it to continue later steps
    //     } else {
    //       sysErr = true;
    //       prefix = "3-no-wallet-home";
    //       throw new Error("Wallet home not opened manually.");
    //     }
    //   } else {
    //     sysErr = true;
    //     prefix = "3-no-wallet-home";
    //     throw new Error("Wallet access refused.");
    //   }
    // }

    // await newWalletpage.bringToFront();

    // // Find the input field for password

    // const filled = await fillUnlockPassword(newWalletpage, password);
    // if (filled) {
    //   log.success("Password filled in unlock screen.");
    // } else {
    //   // sysErr = true;
    //   if (manualMode) {
    //     // I will wait here until the user has unlocked the wallet
    //     // then let the user give a signal that it is done by asking for an enter input
    //     const { success } = await waitForManualPrompt(
    //       log,
    //       newWalletpage,
    //       "Unlocking the wallet..."
    //     );
    //     if (!success) {
    //       prefix = "4-cannot-unlock";
    //       throw new Error("Cannot unlock wallet manually.");
    //     }
    //   } else {
    //     prefix = "4-cannot-unlock";
    //     throw new Error("Cannot unlock wallet.");
    //   }
    // }
    // await newWalletpage.waitForTimeout(1000);
    // newWalletpage.close().catch(() => {});

    // ╭──────────────────────────────────────────────────────────────╮
    // │  SECTION 3: Connect or disconnect wallet on dApp             │
    /**╰──────────────────────────────────────────────────────────────╯**/
    // Step 1: Detect if there's a "Connect Wallet" button or an address shown
    await dapp.bringToFront();
    await dapp.reload();
    // ({ hasConnectCTA, hasAddr, connectEl, addrEl } =
    //   await detectConnectOrAddress(dapp));
    // todo: change
    ({ success: hasConnectCTA } = await waitForManualPrompt(
      log,
      newWalletpage,
      "Valid dapp?",
    ));

    // Step 2, Option 1: If there's a Connect Wallet button, click it and go through the flow
    if (hasConnectCTA) {
      log.info("DApp has a Connect Wallet CTA");
      // Step 2-0 [Evaluation]: Evaluate what the dApp can see before consent

      const { accounts: seeingAddrPre } = await evaluatePageVision(
        dapp,
        extId,
        fullyManual,
      );
      phaseTimings.preConsent = Date.now();
      await setPhase("preConsent");
      console.log("Seeing pre", seeingAddrPre);

      dappVisionRes.preConsent = seeingAddrPre;
      log.info(
        `DApp can see ${
          seeingAddrPre?.length
        } wallet-related items before consent: ${seeingAddrPre?.join(", ")}`,
      );
      phaseTimings.duringConsent = Date.now();

      await setPhase("DuringConsent");
      // Step 2-1 [Connect]: Try to connect the wallet
      // TODO: Change back
      let res;
      if (fullyManual) {
        res = { ok: false, error: new Error("Fully manual mode") };
      } else {
        res = await connectWalletOnDapp(dapp, log, extName, extId, ctx);
      }
      if (!res.ok) {
        log.error("Connect wallet to dApp failed", {
          error: res.error.message,
          partial: res.partial,
        });

        if (manualMode) {
          // I will wait here until the user has unlocked the wallet
          // then let the user give a signal that it is done by asking for an enter input
          const { success } = await waitForManualPrompt(
            log,
            newWalletpage,
            "Connecting the wallet to the dApp...",
          );
          if (!success) {
            sysErr = false;
            prefix = "5-connect-failed";
            throw new Error("Connect wallet to dApp failed.");
          }
          phaseTimings.postConsent = Date.now();
          await setPhase("postConsent");
        } else {
          sysErr = false;
          prefix = "5-connect-failed";
          throw new Error(
            `Connect wallet to dApp failed: ${res.error.message}`,
          );
        }
      } else {
        phaseTimings.postConsent = Date.now();

        await setPhase("postConsent");
        console.log(
          "phase now:",
          await dapp.evaluate(() => (window as any).__phase),
        );
        log.success("Connect succeeded", res.details);
      }

      // Reload and see if it is connected
      await dapp.reload();
      await dapp.waitForTimeout(2000);

      console.log(
        "after reload, phase now:",
        await dapp.evaluate(() => (window as any).__phase),
      );

      // // Step 2-2 [Evaluation]: Evaluate what the dApp can see after consent
      // newDapp = await openDappPage(ctx, log, dappUrl, extId, extName);
      // if (!newDapp) {
      //   sysErr = false;
      //   prefix = "6-reopen-dapp-failed";
      //   throw new Error("Second time open dapp failed");
      // }

      const { accounts: seeingAddrPost, details: vision } =
        await evaluatePageVision(dapp, extId, fullyManual);
      dappVisionRes.postConsent = seeingAddrPost;
      log.info(
        `DApp can see ${
          seeingAddrPost?.length
        } wallet-related items after consent: ${seeingAddrPost?.join(", ")}`,
      );
      console.log(vision);

      // Step 2-3 [Disconnect]: Try to disconnect the wallet
      let disconnectRes;
      if (fullyManual) {
        disconnectRes = { ok: false, error: new Error("Fully manual mode") };
      } else {
        disconnectRes = await disconnectWalletFromDapp(dapp, log);
      }

      if (!disconnectRes.ok) {
        log.error("Disconnect wallet from dApp failed", {
          error: disconnectRes.error.message,
        });
        if (manualMode) {
          const { success } = await waitForManualPrompt(
            log,
            newWalletpage,
            "Disconnecting the wallet from the dApp...",
          );
          if (!success) {
            sysErr = false;
            prefix = "7-disconnect-failed";
            throw new Error("Disconnect wallet from dApp failed.");
          }
        } else {
          sysErr = false;
          prefix = "7-disconnect-failed";
          throw new Error(
            `Disconnect wallet from dApp failed: ${disconnectRes.error.message}`,
          );
        }
      } else {
        log.success("Disconnect wallet from dApp succeeded");
      }
      phaseTimings.afterRevoke = Date.now();
      await setPhase("afterRevoke");

      // Step 2-4 [Evaluation]: Evaluate what the dApp can see after disconnect
      // refresh the dApp page to see if the disconnect is effective
      await dapp.reload();
      await dapp.waitForTimeout(2000);

      const { accounts: afterDisconnect } = await evaluatePageVision(
        dapp,
        extId,
        fullyManual,
      );
      dappVisionRes.afterRevoke = afterDisconnect;
      log.info(
        `DApp can see ${
          afterDisconnect?.length
        } wallet-related items after disconnect: ${afterDisconnect?.join(", ")}`,
      );

      // all done

      // let the whole browser stay open for 10 minutes for manual inspection
      await dapp.waitForTimeout(3000);

      console.log(
        "Cookie * and Local Storage log:",
        cookieAndLocalStorageLogsFromConsole?.length,
      );

      await dapp.close();

      const newDapp = await openDappPage(ctx, log, dappUrl, extId, extName);
      if (!newDapp) {
        sysErr = false;
        prefix = "end-reconnect-access-refused";
        throw new Error("Dapp access refused.");
      }
      const { accounts: reconnect } = await evaluatePageVision(
        newDapp,
        extId,
        fullyManual,
      );
      phaseTimings.reconnect = Date.now();
      dappVisionRes.reconnect = reconnect;
      await newDapp.waitForTimeout(5000);
    } else if (hasAddr && addrEl) {
      // log.success(
      //   `DApp shows wallet address before connecting: ${addrEl
      //     ?.innerText()
      //     .catch(() => "")}`
      // );
      sysErr = false;
      prefix = "2-already-connected";
      throw new Error(
        `BIG ERROR: Wallet ${extName} has already connected with ${dappUrl} before.`,
      );
    } else {
      log.error(
        "DApp does not have a Connect Wallet CTA nor an address button",
      );
      sysErr = false;
      prefix = "8-no-cta-no-addr";
      throw new Error(
        "DApp does not have a Connect Wallet CTA nor an address button",
      );
    }

    console.log("vision: ", vision);
    return {
      page: dapp,
      baseRes: {
        dappUrl,
        extName,
        extPath,
        dappVision: dappVisionRes,
        visionDetails: vision,
      },
      objectEventLogs: objectEventLogs,
      cookieAndLocalStorage: cookieAndLocalStorageLogsFromConsole,
      pageRequests: pageNetworkLogs,
      phaseTiming: phaseTimings,
      error: null,
      sysErr,
      prefix,
    };
  } catch (error: unknown) {
    console.log("There is error ");
    if (error instanceof Error) {
      log.error(error.message);
    } else {
      log.error(String(error));
    }
    return {
      page: null,
      baseRes: {
        dappUrl,
        extName,
        extPath,
        dappVision: dappVisionRes,
      },
      objectEventLogs: null,
      cookieAndLocalStorage: null,
      pageRequests: null,
      phaseTiming: null,
      prefix,
      error: error instanceof Error ? error : new Error(String(error)),
      sysErr,
    };
  }
}
