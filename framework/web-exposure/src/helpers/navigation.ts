import type { Page, Locator } from "playwright";

import { clickFirstMatch, clickFirstMatchWithChecks } from "./clicks.js";

import {
  CONTINUE_PATTERNS,
  IMPORT_ACCOUNT_PATTERNS,
  IMPORT_SEED_PATTERNS,
} from "./patterns.js";
import { whichScreen } from "./screens.js";

import { clickDisabledThenCheck, clickVisibleButtons } from "./dummy.js";

import { createLogger } from "../utility/log_new.js";
import type { Logger } from "../utility/log_new.js";
const naviLog = createLogger({ scope: "navigation", minLevel: "debug" });

// function textLocators(page: Page, patterns: ReadonlyArray<RegExp>): Locator[] {
//   return patterns.flatMap((re) => [
//     page.getByRole("button", { name: re }),
//     page.getByText(re).filter({ has: page.locator("button") }),
//     page.getByText(re),
//   ]);
// }
// async function clickFirst(locs: ReadonlyArray<Locator>, timeout = 700) {
//   for (const l of locs) {
//     try {
//       if ((await l.count()) > 0) {
//         await l.first().click({ timeout });
//         console.log("Clicked:", await l.first().textContent());
//         return true;
//       }
//     } catch {}
//   }
//   return false;
// }

const GATE_LABELS = [
  /get started/i,
  // /agree/i,
  /accept/i,
  /^\s*ok\s*$/im,
  /no thanks/i,
  /maybe later/i,
  /skip/i,
  /next/i,
  /confirm/i,
  /continue/i,
  /^\s*add wallets\s*$/im,
  // NOTE: intentionally do NOT include /continue|next/ here to avoid overshooting
];

export async function goToSeedOrPasswordScreen(
  page: Page,
  maxSteps = 20
  // also return which one (seed or password)?
): Promise<null | ["seed", number] | ["password", number]> {
  // await clickVisibleButtons(page);

  let accountBtnClicked = false;

  console.log("GotoSeedOrpasswordScreen");

  // page.waitForTimeout(5000);
  // return await naviLog.runStep("Go to seed or password screen", async () => {
  for (let step = 0; step < maxSteps; step++) {
    naviLog.info(
      `Trying to get to seed/password page. Navigation step ${
        step + 1
      }/${maxSteps}`
    );

    const screenResult = await whichScreen(page);
    let screenType: string | null = null;
    let seedInputCount: number | undefined = undefined;
    if (Array.isArray(screenResult)) {
      [screenType, seedInputCount] = screenResult;
    } else if (typeof screenResult === "string") {
      screenType = screenResult;
    }
    // naviLog.info("Screen type:", {
    //   screenType: screenType ? screenType : "(unknown)",
    //   seedInputCount: seedInputCount,
    // });

    if (screenType == "seed") {
      // I dont have to log any success here.
      return [screenType, seedInputCount!];
    } else if (screenType == "password") {
      const inputFields = await page.locator("input").count();
      return [screenType, inputFields];
    }

    const seedBtn = await clickFirstMatchWithChecks(
      page,
      IMPORT_SEED_PATTERNS,
      naviLog
    );
    if (seedBtn.clicked) {
      naviLog.click("clicked button to import seed", {
        text: seedBtn.text,
      });
    } else {
    }

    if (!accountBtnClicked) {
      const accBtn = await clickFirstMatch(
        page,
        IMPORT_ACCOUNT_PATTERNS,
        naviLog
      );
      if (accBtn.clicked) {
        naviLog.click("clicked button to import account", {
          text: accBtn.text,
        });
        accountBtnClicked = true;
      } else {
        // naviLog.info("No 'Import account' control visible yet.");
      }

      await page.waitForTimeout(5000);

      // For Backpack
      const ethereumBtn = await clickFirstMatch(page, [/^ethereum$/i], naviLog);
      if (ethereumBtn.clicked) {
        naviLog.click("clicked ethereum button", { text: ethereumBtn.text });
      } else {
        // naviLog.info("No gate button found to click.");
      }
    }

    console.log("Try to click gate button");
    const gateBtn = await clickFirstMatchWithChecks(
      page,
      GATE_LABELS,
      naviLog,
      { multiLineAllowed: false }
    );
    if (gateBtn.clicked) {
      naviLog.click("clicked gate button", { text: gateBtn.text });
    } else {
      // naviLog.info("No gate button found to click.");
    }
    console.log("last try: click continue/confirm button");
    await clickDisabledThenCheck(page, /(confirm|continue|import|next)/i);
    await page.waitForTimeout(500);
  }
  return null;
}
