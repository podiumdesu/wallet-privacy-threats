import type { BrowserContext } from "playwright-core";
import type { Logger } from "../../utility/log_new.js";

import { openExtHomeSimple, openWalletHome } from "../navigation/wallet.js";
import { observePage } from "../report/pageError.js";
import { clickFirstMatch } from "../clicks.js";

// helpers
import {
  fillUnlockPassword,
  handlePasswordScreen,
  handleSeedScreen,
} from "../screensinput.js";
import { goToSeedOrPasswordScreen } from "../navigation.js";
import type { ProvisionResult } from "../../provision-generic.js";

export async function autoSetupWallet(
  ctx: BrowserContext,
  extId: string,
  extPath: string,
  seed: string,
  password: string,
  notes: string[],
  log: Logger
): Promise<ProvisionResult> {
  const stepRes = await log.runStep(
    "Reaching seed or password screen",
    async () => {
      let page = await openWalletHome(ctx, extId, extPath, log);
      if (!page) {
        return {
          res: false,
          notes: ["no-wallet-home"],
        };
      }
      await page.bringToFront();

      log.info(
        "Detect if it is the password page, which means the wallet has set up"
      );
      const isPasswordLockPage = await fillUnlockPassword(page, password, true);
      if (isPasswordLockPage) {
        notes.push("unlocked:existing");
        log.success("Wallet unlocked, setup not needed");
        await page.waitForTimeout(3000);
        try {
          await page.close();
        } catch {}
        return {
          res: true,
          extId: extId,
          notes: ["unlocked:existing"],
        };
      }
      const done = { seed: false, password: false };
      const t0 = Date.now();
      const seen = new Set<string>();
      const maxWaitMs = 60 * 1000;
      try {
        while (!(done.seed && done.password)) {
          console.log("Looping...", done);
          if (Date.now() - t0 > maxWaitMs)
            throw new Error("onboarding-timeout");
          // await clickFirstMatch(page, [/^\s*import\s*$/im], log, true);
          const whereResult = await goToSeedOrPasswordScreen(page, 24);
          let screenType: string | null = null;
          let inputCount: number = 0;
          if (Array.isArray(whereResult)) {
            [screenType, inputCount] = whereResult;
          }
          log.info("At screen:", {
            screenType: screenType ? screenType : "(unknown)",
            inputCount,
          });
          // [screenType, inputCount] = whereResult || [];
          switch (screenType) {
            case "seed":
              //   console.log("This is seed screen");
              if (done.seed) break;
              log.action(
                `On seed entry screen, inputting number ${inputCount}`
              );
              done.seed = await handleSeedScreen(
                page,
                seed,
                password,
                notes,
                log,
                inputCount
              );
              // wait for a moment
              await page.waitForTimeout(2000);
              break;
            case "password":
              if (done.password) break;
              log.action("On password entry screen");
              done.password = await handlePasswordScreen(
                page,
                password,
                notes,
                log,
                inputCount
              );
              //   console.log("DONE PASSWORD", done.password, done.seed);
              notes.push("filled:password-only");
              await page.waitForTimeout(3000);
              break;
            default:
              log.warn("Not on seed or password entry screen");
              log.warn("Trying again...");
              break;
          }
        }
      } catch (e) {
        log.stepFail(e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        // throw away the call log, if any
        return {
          res: false,
          notes: [errorMsg.split("\n").shift()],
        };
      }
      await page.waitForTimeout(2000);
      try {
        await page.close();
      } catch {}
      return {
        res: true,
        notes: ["Correctly Done"],
      };
    }
  );
  return stepRes as ProvisionResult;
}
