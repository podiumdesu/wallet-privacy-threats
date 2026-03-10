// src/click-with-consent.ts
import type { Page, Locator, Frame } from "playwright";

import type { Logger } from "../utility/log_new.js";

/** Labels that usually gate Import/Restore screens */
const CONSENT_LABELS: ReadonlyArray<RegExp> = [
  /agree/i,
  /accept/i,
  /consent/i,
  /understand/i,
  /acknowledge/i,
  /eula/i,
];

/**
 * Click the target button. If it's disabled, try to satisfy consent by checking a nearby checkbox/switch,
 * then retry. Returns true if the button was clicked.
 */
export async function clickWithConsentFallback(
  page: Page | Frame,
  target: Locator,
  log: Logger
): Promise<boolean> {
  // quick sanity
  console.log("clickWithConsentFallback");
  try {
    // pre-check: trying to satisfy consent already
    for (const re of CONSENT_LABELS) {
      const btn = page.getByRole("button", { name: re }).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click().catch(() => {});
      }
    }

    if ((await target.count()) === 0 || !(await target.first().isVisible())) {
      return false;
    }

    // try immediate click if enabled
    if (await target.first().isEnabled()) {
      await target.first().click();
      return true;
    }
  } catch (e) {
    log.warn(
      "clickWithConsentFallback: target disabled, trying to satisfy consent"
    );

    console.error(e);
  }

  log.warn(
    "clickWithConsentFallback: target disabled, trying to satisfy consent"
  );

  // Try to find gating controls *near* the target first (same form/section/div)
  const container = page
    .locator("form, section, div")
    .filter({ has: target })
    .first();

  // helper to tick any visible, unchecked checkbox/switch matching our labels within a scope
  const trySatisfyConsentIn = async (scope: Locator | Page | Frame) => {
    // 1) labeled checkboxes
    for (const re of CONSENT_LABELS) {
      const cb =
        (scope as any).getByRole?.("checkbox", { name: re }) ??
        page.getByRole("checkbox", { name: re });
      if ((await cb.count()) > 0) {
        const n = await cb.count();
        for (let i = 0; i < n; i++) {
          const el = cb.nth(i);
          if (await el.isVisible()) {
            const checked = await el.isChecked().catch(() => false);
            if (!checked) {
              await el.check().catch(() => {});
              await page.waitForTimeout(2000);
            }
          }
        }
      }
    }
    // 2) generic checkboxes without clear labels (last resort in this scope)
    const generic =
      (scope as any).getByRole?.("checkbox") ?? page.getByRole("checkbox");
    const m = Math.min(await generic.count(), 3); // don’t spam
    for (let i = 0; i < m; i++) {
      const el = generic.nth(i);
      if (await el.isVisible()) {
        const checked = await el.isChecked().catch(() => false);
        if (!checked) {
          await el.check().catch(() => {});
        }
      }
    }
    // 3) switches (some UIs use role="switch")
    for (const re of CONSENT_LABELS) {
      const sw =
        (scope as any).getByRole?.("switch", { name: re }) ??
        page.getByRole("switch", { name: re });
      if ((await sw.count()) > 0) {
        const n = await sw.count();
        for (let i = 0; i < n; i++) {
          const el = sw.nth(i);
          if (await el.isVisible()) {
            const pressed = await el.getAttribute("aria-checked");
            if (pressed !== "true") {
              log.click("Clicked", {
                text: await el.textContent(),
                // selector: ,
              });
              await el.click().catch(() => {});
            }
          }
        }
      }
    }
  };

  // Step A: try within the same container
  await trySatisfyConsentIn(container);
  if (await target.first().isEnabled()) {
    await target.first().click();
    return true;
  }

  // // Step B: try at page level (global banners/modals)
  // await trySatisfyConsentIn(page);
  // if (await target.first().isEnabled()) {
  //   await target.first().click();
  //   return true;
  // }

  // Step C: as a last resort, click explicit “I agree / Accept” buttons if present
  for (const re of CONSENT_LABELS) {
    const btn = page.getByRole("button", { name: re }).first();
    if ((await btn.count()) > 0 && (await btn.isVisible())) {
      await btn.click().catch(() => {});
    }
  }

  // Retry once more
  if (await target.first().isEnabled()) {
    await target.first().click();
    return true;
  }

  return false;
}
