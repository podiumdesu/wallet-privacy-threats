import type { Page, Frame, Locator } from "playwright";
import type { Logger } from "../utility/log_new.js";
import { hasPattern, findPattern, buildCandidates } from "./detectImport.js";
import { clickWithConsentFallback } from "./dropInHelper.js";

async function bodyTextLen(scope: Page | Frame): Promise<number> {
  return await (scope as Page)
    .evaluate(() => document.body?.innerText.length || 0)
    .catch(() => 0);
}
async function waitForDomDelta(
  scope: Page | Frame,
  timeoutMs = 1500,
  threshold = 5
): Promise<boolean> {
  const before = await bodyTextLen(scope);
  await new Promise((res) => setTimeout(res, timeoutMs));
  const after = await bodyTextLen(scope);
  return Math.abs(after - before) > threshold;
}

async function robustClick(el: Locator): Promise<boolean> {
  try {
    await el.scrollIntoViewIfNeeded();
  } catch {}
  try {
    await el.hover({ force: true, timeout: 500 });
  } catch {}
  try {
    await el.click({ timeout: 1200 });
    return true;
  } catch {}
  // Some apps bind on pointer events
  try {
    await el.dispatchEvent("pointerdown");
    await el.dispatchEvent("pointerup");
  } catch {}
  // Last resort: composed click
  try {
    await el.evaluate((n) => {
      const evt = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      (n as HTMLElement).dispatchEvent(evt);
    });
    return true;
  } catch {}
  return false;
}

export async function clickFirstMatch(
  page: Page | Frame,
  patterns: ReadonlyArray<RegExp>,
  log: Logger,
  noConsent?: boolean
): Promise<{ clicked: boolean; text: string }> {
  const btn = await findPattern(page, patterns, { btnOnly: true });
  if (!btn) return { clicked: false, text: "" };

  // const disabled = await btn.evaluate(
  //   (el) =>
  //     (el as HTMLButtonElement).disabled ||
  //     el.getAttribute("aria-disabled") === "true"
  // );
  // if (disabled)
  //   return { clicked: false, text: await btn.innerText().catch(() => "") };

  const text = btn ? await btn.innerText() : "(unknown)";
  console.log("Button text:", text);
  console.log(btn);
  if (noConsent) {
    console.log("No Consent");
    // await btn.click();
    const clicked = btn ? (await btn.click()) === undefined : false;
    // const clicked = true;

    // await clickVisibleButtons(page);
    console.log("Clicked", clicked);
    return { clicked, text };
  }
  const clicked = btn ? await clickWithConsentFallback(page, btn, log) : false;
  return { clicked, text };
}

export async function clickFirstMatchWithChecks(
  page: Page | Frame,
  patterns: ReadonlyArray<RegExp>,
  log: Logger,
  opts?: {
    multiLineAllowed?: boolean;
    noConsent?: boolean;
  }
) {
  const scopes: Array<Page | Frame> = [
    page,
    ...(typeof (page as Page).frames === "function"
      ? (page as Page).frames()
      : []),
  ];
  // let btn to be an btn element
  let btn: Locator;
  for (const re of patterns) {
    for (const scope of scopes) {
      for (const loc of buildCandidates(scope, re, true)) {
        const n = await loc.count();
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          try {
            const txt = (await el.innerText().catch(() => ""))?.trim() || "";

            if (opts?.multiLineAllowed == false && txt.includes("\n")) continue;
            const single = !/\n/.test(txt);
            const visible = await el.isVisible().catch(() => false);

            // do the click
            const didClick = await robustClick(el);
            if (!didClick) continue;
            const viewChanged = await waitForDomDelta(scope, 500, 5).then(
              (ok) => (ok ? true : null)
            );

            console.log("View changed?", viewChanged);
            if (visible && single && viewChanged) btn = el;
            return { clicked: true, text: txt };
          } catch {
            /* ignore and continue */
          }
        }
      }
    }
  }
  return { clicked: false, text: "" };
}

export async function clickAny(page: Page, selectors: string[], log: Logger) {
  for (const sel of selectors) {
    console.log("Trying to click", sel);
    const el = page.locator(sel).first();
    console.log(await el.isVisible());
    if (await el.isVisible().catch(() => false)) {
      log.click("Clicked", { text: await el.textContent(), selector: sel });
      await el.click().catch(() => {});
      // await page.waitForTimeout(150); // let DOM react
      return true;
    }
  }
  return false;
}

export async function findSeletors(oage: Page, selectors: string[]) {
  for (const sel of selectors) {
    const el = oage.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      console.log("GGGG");
      console.log(await el.innerHTML());
      return true;
    }
  }
  return false;
}
