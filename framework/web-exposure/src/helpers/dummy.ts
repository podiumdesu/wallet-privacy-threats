import type { Page, Locator, Frame } from "playwright";

export async function clickDisabledThenCheck(
  page: Page,
  buttonPattern: RegExp,
  password?: string
): Promise<boolean> {
  const btn = page.getByRole("button", { name: buttonPattern }).first();

  if ((await btn.count()) === 0) return false;

  // Some UIs use aria-disabled or disabled attr
  const disabled =
    (await btn.getAttribute("disabled")) !== null ||
    (await btn.getAttribute("aria-disabled")) === "true";

  if (disabled) {
    console.log(
      `🔒 '${buttonPattern}' button disabled. Checking for checkboxes...`
    );

    const checkboxes = page.locator('input[type="checkbox"]');
    const n = await checkboxes.count();
    for (let i = 0; i < n; i++) {
      const el = checkboxes.nth(i);
      if (await el.isVisible()) {
        try {
          await el.check({ force: true });
          // console.log("☑️ clicked checkbox");
        } catch {
          // fallback in case .check() fails
          await el.click({ force: true });
        }
      }
    }
  }

  // Try the button again
  try {
    await btn.click({ timeout: 1000 });
    console.log("✅ Clicked button after clearing checkboxes");
    return true;
  } catch {
    console.log("⚠️ Still couldn't click button");
    return false;
  }
}

export async function clickFirst(
  locators: Locator[],
  opts: { timeout?: number } = {}
): Promise<boolean> {
  const timeout = opts.timeout ?? 600;
  for (const loc of locators) {
    try {
      if ((await loc.count()) > 0) {
        await loc.first().click({ timeout });
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function clickVisibleButtons(
  page: Page | Frame,
  opts: { timeout?: number } = {}
): Promise<boolean> {
  const timeout = opts.timeout ?? 600;
  const locs = [
    page.getByRole("button"),
    page.locator("button"),
    page.locator('input[type="button"]'),
    page.locator('input[type="submit"]'),
  ];
  console.log("Locs number:", locs.length);

  // filtering only clickable/visible ones
  for (const loc of locs) {
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      const el = loc.nth(i);
      try {
        if ((await el.isVisible({ timeout })) && (await el.isEnabled())) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click({ timeout });
          console.log("Clicked button:", await el.textContent());
          return true;
        }
      } catch {
        // ignore and try next
      }
    }
  }
  return false;
}
