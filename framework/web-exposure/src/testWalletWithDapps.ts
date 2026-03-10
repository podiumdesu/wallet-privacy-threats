import { setupBrowser } from "./browser/setup.js";
import { testDapp, type EIP6963baseRes } from "./helpers/dapp/main.js";

import { createLogger } from "./utility/log_new.js";
const log = createLogger({ scope: "testWalletWithDapps", minLevel: "debug" });

import { writeEIP6963Result } from "./helpers/dapp/main.js";
import type { ExtensionInfo } from "./types.js";
import { getExtensionId } from "./helpers/cal.js";
import { errorCheck } from "./browser/profilePreparation.js";

import type { NetRecord } from "./helpers/cdp/network.js";
import type { PhaseTiming } from "./helpers/dapp/main.js";

export async function testWalletWithDapps(
  ext: ExtensionInfo,
  dappUrl: string,
): Promise<{
  err: Error | null;
  baseRes: EIP6963baseRes;
  notes: string[];
  addresses: string[];
  prefix: string;
  phaseTiming: PhaseTiming | null;
  cookieAndLocalStorage: string[] | null;
  objectEventLogs: string[] | null;
  pageRequests: NetRecord[] | null;
}> {
  const { name: extName, pathID, tempProfileDir, password, extPath } = ext;
  const notes: string[] = [];

  //----------------------------------------------------------------------------------------------------------
  // ╭──────────────────────────────────────────────────────────────╮
  // │  SECTION 1: Test the dapp with the wallet                    │
  /**╰──────────────────────────────────────────────────────────────╯**/
  //   let index = 0;
  //   const totalDappNum = websites.length;

  //   websites = ["https://app.uniswap.org/"];

  // For the current wallet name, create a folder under resultFolder with the extName

  // copy notes elements
  const notePerRound = notes.slice();
  const ctx = await setupBrowser(tempProfileDir, extPath, true);
  // open the page
  const extId = await getExtensionId(ctx);
  console.log("Runtime extension ID: ", extId);

  const manualModeOn = true;
  const fullyManualModeOn = true; // "true" to test dapps and a wallet
  // Return the results of if the dApp can see the address of the wallet
  const {
    page,
    baseRes,
    cookieAndLocalStorage,
    objectEventLogs,
    pageRequests,
    phaseTiming,
    error,
    sysErr,
    prefix,
  } = await testDapp(
    ctx,
    log,
    dappUrl,
    extId,
    extName,
    pathID,
    password,
    manualModeOn,
    fullyManualModeOn,
  );
  // console.log(baseRes?.dappVision);

  let resultValue: Error | null = null;

  if (sysErr) {
    // there is error within the framework
    log.error(
      "THERE IS ERROR WITHIN THE FRAMEWORK. EVERYTHING STOPS. FIX THE FRAMEWORK FIRST",
    );
    console.log(String(error));
    resultValue = errorCheck(error);
    notePerRound.push(String(error));
  } else if (error) {
    log.error(`Failed to do the interaction ${dappUrl}`, {
      error: String(error),
    });
    resultValue = errorCheck(error);
    notePerRound.push(String(error));
  }
  // shut down the browser
  await ctx.close();
  return {
    err: resultValue,
    baseRes,
    notes: notePerRound,
    prefix: prefix ?? "undefined",
    addresses: baseRes?.addresses ?? [],
    phaseTiming,
    cookieAndLocalStorage,
    objectEventLogs,
    pageRequests,
  };
}
