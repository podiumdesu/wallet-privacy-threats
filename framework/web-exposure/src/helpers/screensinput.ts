import type { Page } from "playwright";
// import { clickByText } from "./clicks.js";
import { CONTINUE_PATTERNS } from "./patterns.js";

import { clickFirst, clickVisibleButtons } from "./dummy.js";
import { isPasswordEntryScreen } from "./screens.js";

import type { Logger } from "../utility/log_new.js";
import { clickFirstMatch } from "./clicks.js";

async function fillSeed(
  page: Page,
  seed: string,
  round: number,
  seedInputCount: number
): Promise<boolean> {
  // Each round, put the relative number (seedInputCount) of words
  // If seedInputCount is 4, round is 1,
  // Input the 1st, 2nd, 3rd, 4th words
  // if round is 2,
  // input round*seedInputCount, round*seedInputCount+1, round*seedInputCount+2, round*seedInputCount+3
  const words = seed.trim().split(/\s+/);

  const fields = page
    .locator('input:visible[type="text"]')
    .or(page.getByRole("textbox"));
  const field_n = await fields.count();
  console.log("Filling seed phrase... detected input fields:", field_n);
  // await page.waitForTimeout(50000);
  // console.log("Detected input fields:", field_n);
  // console.log("round:", round, "seedInputCount:", seedInputCount);

  if (field_n == 1 || seedInputCount == 0) {
    await fields.first().fill(seed);
    return true;
  }

  if (seedInputCount == 12 && field_n == 12) {
    await page.evaluate((seed) => navigator.clipboard.writeText(seed), seed);
    const input = await fields.first();
    await input.click();
    await page.keyboard.press("Control+V"); // or "Meta+V" on macOS
    await page.keyboard.press("Meta+V"); // or "Meta+V" on macOS

    // Now check if the values get filled in

    const empty: number[] = [];
    for (let i = 0; i < field_n; i++) {
      const locator = fields.nth(i);
      const val = await locator.inputValue().catch(() => "");
      if (!val.trim()) empty.push(i + 1);
    }

    if (empty.length === 0) {
      console.log(`✅ All ${field_n} seed fields filled.`);
      return true;
    } else {
      console.warn(
        `⚠️ Empty fields detected at positions: ${empty.join(", ")}`
      );
      // page.waitForTimeout(50000);
    }
  }

  for (let j = 0; j < field_n; j++) {
    const idx = (round - 1) * field_n + j;
    // Specifically for Ready Wallet where there were 24 input fields
    // Cant filter out with visible text inputs only
    // Since the seed is 12 long, so I fill them in
    console.log(idx, words[idx] ?? "", j);
    await fields.nth(j).fill(words[idx] ?? "");

    if (field_n == 24) {
      await fields.nth(j + 12).fill(words[j] ?? "");
      if (j >= 11) break;
      continue;
    }
  }

  return true;

  // in case only 1 input field (textarea)

  if (field_n != 12) return false;
  if (field_n == 12) {
    for (let i = 0; i < 12; i++) {
      await fields.nth(i).fill(words[i] ?? "");
    }
    return true; // Add this return statement
  }
  return false;
}
// Strategy A: one input per word (labels or known ids)

// Strategy B: single textarea/textbox
// const area = page.locator("textarea").or(page.getByRole("textbox"));
// if ((await area.count()) > 0) {
//   await area.first().fill(seed);
//   return true;
// }
// return false;

async function fillPasswords(page: Page, password: string): Promise<void> {
  const pwdInputs = page.locator('input[type="password"]');
  const count = await pwdInputs.count();
  // console.log("Filling password fields... found:", count);
  if (count == 12) {
    // console.log("12 fields found, skipping fill to avoid errors.");
    return;
  }

  if (count == 14) {
    await pwdInputs.nth(12).fill(password);
    await pwdInputs.nth(13).fill(password);
    return;
  }

  if (count >= 1) {
    await pwdInputs.nth(0).fill(password);
    // console.log("Filled first password field");
  }
  if (count >= 2) {
    await pwdInputs.nth(1).fill(password);
    // console.log("Filled second password field (confirm)");
  }

  const tos = page.locator('input[type="checkbox"]').first();
  // console.log("Checking TOS checkbox if present...");

  if (await tos.isVisible()) {
    try {
      if (!(await tos.isChecked())) {
        await tos.check();
        // console.log("✅ Checked TOS checkbox.");
      }
    } catch (e) {
      console.warn("⚠️ Failed to check TOS:", e);
    }
  }
  // console.log("Done");
}

export async function handleSeedScreen(
  page: Page,
  seed: string,
  password: string,
  notes: string[],
  log: Logger,
  seedInputCount: number
): Promise<boolean> {
  console.log("🌱 Filling seed phrase..., number", seedInputCount);

  // await page.waitForSelector('input[type="text"]');

  // round = round up?

  // For these that has only one textarea
  let check_n: number = 0;
  if (seedInputCount == 0) {
    // The page wasnt able to detect how many input fields there are
    const check = page.getByRole("textbox");
    check_n = await check.count();
    console.log("Detected textarea fields:", check_n);
  }

  let round = seedInputCount >= 12 ? 1 : Math.ceil(12 / seedInputCount);
  if (check_n == 1) {
    round = 1;
  }
  for (let i = 1; i <= round; i++) {
    // console.log("I need to input", round);
    const fillRes = await fillSeed(page, seed, i, seedInputCount);
    if (!fillRes) {
      console.log("Failed to fill seed phrase");
      return false;
    }
    // some wallets immediately ask for password on the same screen
    await fillPasswords(page, password);
    await page.waitForTimeout(1000);
    const res = await clickFirstMatch(page, CONTINUE_PATTERNS, log);
    // const res = await clickByText(page, CONTINUE_PATTERNS, { timeout: 100 });
    if (res) {
      // console.log(`Clicked ${res.text} button.`);
      continue;
    } else {
      console.log("No continue/confirm button found to click.");
      return false;
    }
  }
  return true;
}

export async function handlePasswordScreen(
  page: Page,
  password: string,
  notes: string[],
  log: Logger,
  inputCount: number
): Promise<boolean> {
  // The case when I have to input password two times but on different page
  if (inputCount == 1) {
    let flag = await isPasswordEntryScreen(page);
    // console.log("Is password entry screen?", flag);
    while (flag) {
      flag = await isPasswordEntryScreen(page);
      console.log("Is password entry screen?", flag);
      if (!flag) return true;
      console.log("Still on password entry screen", flag);
      await fillPasswords(page, password);
      await page.waitForTimeout(1000);
      const res = await clickFirstMatch(page, CONTINUE_PATTERNS, log);

      if (res) {
        // console.log(`Clicked ${res.text} button.`);
        continue;
      } else {
        console.log("No continue/confirm button found to click.");
        return false;
      }
    }
    console.log("Done");
    return true;
  }
  if (inputCount == 0) return false;

  await fillPasswords(page, password);
  notes.push("filled:password");
  // click continue/confirm
  const { clicked, text } = await clickFirstMatch(page, CONTINUE_PATTERNS, log);
  if (clicked) {
    // console.log(`Clicked ${text} button.`);
    return true;
  } else {
    console.log("No continue/confirm button found to click.");
    // It might be because of another button to be clicked first
    await clickVisibleButtons(page);
  }
  return false;
}

export async function fillUnlockPassword(
  page: Page,
  password: string,
  clicked?: boolean
): Promise<boolean> {
  const passwordInput = await page.locator('input[type="password"]');
  const totalCount = await passwordInput.count();
  // await page.waitForTimeout(100000);
  if ((await passwordInput.count()) === 0) {
    return false;
  } else {
    if (clicked) return true;
    for (let i = 0; i < totalCount; i++) {
      await passwordInput.nth(i).fill(password);
    }
    const buttons = page.locator('button, [role="button"]').filter({
      hasText: /(unlock|log[\s-]?in|sign[\s-]?in|submit|continue)/i,
    });

    const btnCount = await buttons.count();
    if (btnCount) {
      for (let i = 0; i < btnCount; i++) {
        const b = buttons.nth(i);
        // only click actionable ones
        if ((await b.isVisible()) && (await b.isEnabled())) {
          await b.click({ force: true });
          break; // stop after first real click
        }
      }
      console.log("Done");
      return true;
    } else {
      return false;
    }
  }
}
