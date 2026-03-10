import type { Page } from "playwright";

import { createLogger } from "../utility/log_new.js";

const log = createLogger({ scope: "screens", minLevel: "debug" });

export async function isSeedEntryScreenStrong(
  page: Page
): Promise<[boolean, number]> {
  // B) Inputs labeled "Word 1..N" (many wallets)
  let labeled = 0;
  for (let i = 1; i <= 24; i++) {
    const f = page.getByLabel(new RegExp(`(word|phrase)\\s*${i}`, "i"));
    if ((await f.count()) > 0) labeled++;
    else break;
  }
  if (labeled >= 12) {
    log.debug(
      `a) Seed entry screen detected: Detected labeled seed inputs: ${labeled}`
    );
    return [true, labeled];
  }
  if (labeled >= 4) {
    log.debug(
      `a) Seed entry screen detected: Detected labeled seed inputs: ${labeled}`
    );
    return [true, labeled];
  }

  // Check if there is the input
  const allText = page.locator("input");
  // log.debug(`allText, ${await allText.count()}`);
  let count = await allText.count();
  if (count >= 12) {
    log.debug(`b) Seed entry screen detected: Detected input fields: ${count}`);
    return [true, count];
  }
  if (count >= 4) {
    log.debug(`b) Seed entry screen detected: Detected input fields: ${count}`);
    return [true, count];
  }

  // C) Single textarea with SRP text nearby
  const area = page.locator("textarea");
  // const hasSeedHint = await page
  //   .getByText(/(seed phrase|secret recovery phrase)/i)
  //   .count();

  const hasSeedHint = await page
    .getByRole("heading", { name: /seed phrase|secret recovery phrase/i })
    .count();

  count = await area.count();
  if ((await count) > 0 && (await hasSeedHint) > 0) {
    log.debug(
      `c) Seed entry screen detected: Textarea present with seed hint nearby.`
    );
    return [true, 12];
  }

  // e) one textarea + some input fields
  if ((await area.count()) > 0 && (await allText.count()) >= 1) {
    console.log("allText.count(),", await allText.count());
    console.log("area.count(),", await area.count());
    log.debug(
      `d) Seed entry screen detected: Found textarea and input fields.`
    );
    return [true, 0];
  }

  return [false, 0];
}

async function isSeedEntryScreenWeak(page: Page): Promise<[boolean, number]> {
  // D) Headings mention import/seed
  if (
    (await page
      .getByRole("heading", {
        name: /(secret recovery phrase|seed phrase|secret phrase|import wallet|restore wallet)/i,
      })
      .count()) > 0
  ) {
    log.debug(
      `extra a) Seed entry screen detected: Headings mention import/seed.`
    );
    return [true, 0];
  }
  return [false, 0];
}

export async function isPasswordEntryScreen(page: Page): Promise<boolean> {
  // A) Headings like "Set/Create New Password"
  const heading = page.getByRole("heading", {
    name: /(set|create|new|create a|set a)\s+password|password\s+(setup|creation)/i,
  });
  if (await heading.count()) {
    // log.debug(
    //   `a) Password entry screen detected: Found heading for password entry.`
    // );
    return true;
  }

  // B) Labeled fields for "New password" and "Confirm password"
  const newPwd = page
    .getByLabel(/^(new|set|create).*password$/i)
    .or(page.getByLabel(/^password$/i))
    .or(page.locator("#password"))
    .or(page.locator('input[type="password"][name*="new" i]'))
    .or(page.locator('input[type="password"][placeholder*="new" i]'));

  const confirmPwd = page
    .getByLabel(/confirm.*password/i)
    .or(page.locator("#confirm-password"))
    .or(page.locator('input[type="password"][name*="confirm" i]'))
    .or(page.locator('input[type="password"][placeholder*="confirm" i]'));

  if ((await newPwd.count()) && (await confirmPwd.count())) {
    // log.debug(
    //   `b) Password entry screen detected: Found new+confirm password fields.`
    // );
    return true;
  }

  // C) Generic rule: at least 2 password inputs on the screen
  const allPwd = page.locator('input[type="password"]');
  // log.debug(`allPwd.count(), ${await allPwd.count()}`);
  if ((await allPwd.count()) >= 1) {
    log.debug(`c) Password entry screen detected: Found password fields.`);
    return true;
  }

  // D) Password + ToS checkbox + a "Create/Continue/Import" button nearby
  const hasPwd = (await allPwd.count()) > 0;
  if (hasPwd) {
    const tos = page
      .getByRole("checkbox")
      .or(page.locator('input[type="checkbox"]'));
    const action = page.getByRole("button", {
      name: /(create|continue|import|proceed|set password)/i,
    });
    if ((await tos.count()) && (await action.count())) {
      log.debug(
        `d) Password entry screen detected: Found ToS checkbox and action button.`
      );
      return true;
    }
  }
  return false;
}

export async function whichScreen(
  page: Page
): Promise<["seed", number] | "password" | null> {
  const [res, count] = await isSeedEntryScreenStrong(page);
  if (res) return ["seed", count];
  if (await isPasswordEntryScreen(page)) {
    return "password";
  } else {
    // now check the weak seed screen
    const [res2, count2] = await isSeedEntryScreenWeak(page);
    if (res2) return ["seed", count2];
  }
  return null;
}
