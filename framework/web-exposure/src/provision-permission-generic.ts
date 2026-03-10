// src/provision-generic.ts

import { getExtensionId } from "./helpers/cal.js";

// wallet related
import { autoSetupWallet } from "./helpers/wallet/autoSetup.js";
import { derive } from "./helpers/wallet/mnemonic.js";

import { setupBrowser } from "./browser/setup.js";
// log
import { createLogger } from "./utility/log_new.js";

// Reading files
import { getDappList } from "./helpers/manifest.js";
import type { Row } from "./helpers/manifest.js";
import { writeEIP6963Result } from "./helpers/dapp/main.js";
import { writeJsonResult } from "./helpers/file/writeJson.js";

import type { ExtensionInfo } from "./types.js";

const log = createLogger({
  scope: "provision-generic-permission",
  minLevel: "debug",
});
// log.info("Starting session...");

export type ProvisionResult = {
  res: boolean;
  addresses: string[];
  extId: string;
  notes: string[];
};

export async function provisionGenericWalletNew(
  ext: ExtensionInfo,
  seed: string,
  password: string,
): Promise<ProvisionResult> {
  // getDappList() returns [string[], LineInfo[]] | null, so handle both cases
  const dappList = await getDappList();
  let websites: string[] = [];
  let aliveRows: Row[] = [];
  if (dappList) {
    ({ websites, aliveRows } = dappList);
    // websites.unshift("https://app.aave.com/", "https://app.uniswap.org/");
    // websites = ["https://app.aave.com/", "https://app.uniswap.org/"];
    console.log(websites[0]);
  } else {
    websites = ["https://app.aave.com/"];
    console.log("No dapp list found.");
  }

  const { extPath, tempProfileDir: profileDir, pathID, name: extName } = ext;

  log.info(`Provisioning wallet using extension at: ${ext.extPath}`);
  log.info(`Using browser profile directory: ${ext.tempProfileDir}`);
  log.info(`Using seed phrase: ${seed.split(" ").length} words`);
  log.info(`Using password: ${password}`);

  // Declare variables up-front so they exist in the whole scope
  const notes: string[] = [];
  let ctxWallet: any = null;
  let extId = "";
  let addresses: string[] = [];

  // --------- Safe setup block, Calculating: extId, pathId, extName, addresses ----------
  // Set up the browser of the wallet
  try {
    ctxWallet = await setupBrowser(profileDir, extPath);

    // open the page
    extId = await getExtensionId(ctxWallet);
    log.success(`Detected extension id: ${extId}`);

    log.success(`Detected extension name: ${extName}`);
    const deriveResult = derive(seed);
    if (!deriveResult.address) throw new Error("no-address");
    addresses.push(deriveResult.address);
  } catch (err: any) {
    // Make sure any partial resources are cleaned up
    try {
      if (ctxWallet?.close) await ctxWallet.close();
    } catch (closeErr) {
      log.warn("Failed to close browser context after setup error", {
        err: String(closeErr),
      });
    }
    const errMsg = String(err?.message ?? err);
    log.error("Initial wallet setup failed", { error: errMsg });
    notes.push(`setup-error: ${errMsg}`);

    // Return a consistent ProvisionResult — no further work is attempted
    return {
      res: false,
      extId: extId || "", // may be empty
      addresses: [""],
      notes,
    };
  }

  //----------------------------------------------------------------------------------------------------------
  // ╭──────────────────────────────────────────────────────────────╮
  // │  SECTION 0: Automatically set up the wallet                  │
  /**╰──────────────────────────────────────────────────────────────╯**/
  try {
    // TODO: Remove for real automation
    throw new Error("For manaul");
    const walletSetupRes = await autoSetupWallet(
      ctxWallet,
      extId,
      extPath,
      seed,
      password,
      notes,
      log.child("setup"),
    );
    if (!walletSetupRes.res) {
      log.error("Wallet setup failed", { notes: walletSetupRes.notes });
      // notes.push(`setup-wallet-error:${walletSetupRes.notes.join(",")}`);
      throw new Error(`setup-wallet-error:${walletSetupRes.notes.join(",")}`);
    }

    log.success("Wallet setup completed", {
      addresses: walletSetupRes.addresses,
    });

    const walletSettingUpResult = {
      res: true,
      extId: extId,
      addresses: addresses,
      notes: notes,
    };

    console.log(walletSettingUpResult);
    // wait for 10s
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await ctxWallet.close();
    return walletSettingUpResult;
  } catch (error) {
    // await ctxWallet.close();
    // Dont even start on any dApps
    notes.push("setup-wallet-error", String(error));
    return {
      res: false,
      extId: extId,
      addresses: addresses,
      notes: notes,
    };
  }
}
