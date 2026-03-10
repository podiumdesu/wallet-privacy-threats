import type { BrowserContext, Page } from "playwright-core";
import { getManifestPopup } from "../manifest.js";
import type { Logger } from "../../utility/log_new.js";

export async function openHomeLikePage(
  extId: string,
  ctx: BrowserContext,
  extPath: string,
  log: Logger
): Promise<Page> {
  const base = `chrome-extension://${extId}`;

  // 👉 If some wallets only have a popup, allow falling back to it.
  const ACCEPT_POPUP_FALLBACK = true; // set false if you NEVER want popup
  const POPUP_FALLBACK_AFTER_MS = 2500; // how long to wait before accepting popup

  // --- read popup from manifest (if any) ---
  let defaultPopUp = await getManifestPopup(extPath);
  if (defaultPopUp != null) {
    defaultPopUp = `${base}/${defaultPopUp}`;
    log.success(`Detected default popup: ${defaultPopUp}`);
  }

  // --- candidate URLs to try (popup first; then "real" pages) ---
  const candidates = [
    defaultPopUp || undefined,
    `${base}/popup.html`,
    `${base}/welcome.html`,
    `${base}/index.html`,
    `${base}/home.html#onboarding`,
    `${base}/home.html`,
    `${base}/index.html#onboarding`,
  ].filter(Boolean) as string[];

  // --- tiny helpers ---
  const isExtUrl = (u: string) => u.startsWith(`${base}/`);
  const isPopupRoute = (u: string) =>
    /\/popup(?:-init)?\.html(\?|#|$)/i.test(u);
  // Consider these as "home-like" (index, home, welcome, options, onboarding, dashboard), in any subdir
  const homeLikeRegex =
    /\/(?:ui\/|app\/|dist\/)?(?:index|home|welcome|options|settings|onboarding|dashboard)\.html(?:[?#].*|$)/i;
  const isHomeLike = (u: string) =>
    isExtUrl(u) &&
    !isPopupRoute(u) &&
    (homeLikeRegex.test(u) ||
      /#\/(?:home|welcome|onboarding|dashboard)(?:\/|$)/i.test(u));
  // const isHomeLike = (u: string) => isExtUrl(u) && !isPopupRoute(u); // ✅ what we WANT
  const usable = (p?: Page | null) => !!p && !p.isClosed();

  // --- try to reuse an existing extension tab if any ---
  const existing = ctx.pages().find((p) => isExtUrl(p.url()));
  const auto = await Promise.race<Page | null>([
    ctx
      .waitForEvent("page", {
        predicate: (p) => isExtUrl(p.url()),
        timeout: 3000,
      })
      .catch(() => null),
    Promise.resolve(null),
  ]);

  let page: Page = [existing, auto].find(usable) ?? (await ctx.newPage());

  // --- "page looks alive" check (not just innerText) ---
  async function pageLooksOk(p: Page) {
    return await p.evaluate(() => {
      const b = document.body;
      if (!b) return false;
      if (b.innerText && b.innerText.trim().length > 0) return true;
      for (const el of Array.from(b.querySelectorAll("*"))) {
        const tag = el.tagName.toLowerCase();
        if (tag === "script" || tag === "style") continue;
        const rect = (el as HTMLElement).getBoundingClientRect?.();
        const cs = window.getComputedStyle(el as Element);
        if (
          rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          cs.opacity !== "0"
        ) {
          return true;
        }
      }
      return false;
    });
  }

  // --- try each candidate URL until one works ---
  for (const url of candidates) {
    console.log("trying URL:", url);
    try {
      // BEFORE navigating, listen for a brand-new **home-like** page that may open.
      const nextHomeLike = ctx
        .waitForEvent("page", {
          timeout: 7000,
          predicate: (p) => isHomeLike(p.url()), // ⬅️ only real pages, not popup
        })
        .catch(() => null);

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      await page.waitForTimeout(2000).catch(() => {
        /* small settle */
      });

      const nowUrl = page.url();
      console.log(nowUrl);

      // ✅ If we're already on a **home-like** URL and it looks okay → done.
      if (isHomeLike(nowUrl) && (await pageLooksOk(page).catch(() => false))) {
        log.success(`Opened candidate URL: ${nowUrl}`);
        return page;
      }

      // 🔁 If we're on a **popup**, treat it as transitional.
      if (isPopupRoute(nowUrl)) {
        // 1) See if a new **home-like** page appears.
        const outcome = (await Promise.race([
          nextHomeLike, // a brand new home-like page (different tab/window)
          page
            .waitForEvent("close", { timeout: 3000 })
            .then(() => "closed" as const)
            .catch(() => null),
          page
            .waitForFunction((u) => location.href !== u, nowUrl, {
              timeout: 3000,
            })
            .then(() => "navigated" as const)
            .catch(() => null),
        ])) as Page | "closed" | "navigated" | null;

        // a) New page opened → use it.
        if (
          outcome &&
          outcome !== "closed" &&
          outcome !== "navigated" &&
          usable(outcome)
        ) {
          console.log("[CTX] Switched to new extension page:", outcome.url());
          if (usable(page) && page !== outcome)
            await page.close().catch(() => {});
          return outcome;
        }

        // b) Same tab navigated → if it became home-like and looks ok → use it.
        if (outcome === "navigated") {
          if (
            isHomeLike(page.url()) &&
            (await pageLooksOk(page).catch(() => false))
          ) {
            log.success(`Opened candidate URL: ${page.url()}`);
            return page;
          }
        }

        // c) Popup closed → try to grab any live home-like page.
        if (outcome === "closed") {
          const fallback = ctx
            .pages()
            .reverse()
            .find((p) => usable(p) && isHomeLike(p.url()));
          if (fallback) return fallback;
          // else: continue to next candidate
          continue;
        }

        // d) Popup stayed put. If allowed, accept popup as a fallback after a short wait.
        if (ACCEPT_POPUP_FALLBACK) {
          await page.waitForTimeout(POPUP_FALLBACK_AFTER_MS).catch(() => {});
          if (usable(page) && (await pageLooksOk(page).catch(() => false))) {
            log.success(
              `Using popup as home (no home-like page appeared): ${page.url()}`
            );
            return page;
          }
        }

        // e) Otherwise, try the next candidate.
        continue;
      }

      // Not popup and not home-like (unlikely), or content not ready → try next candidate.
    } catch {
      // navigation failed → try next candidate
      continue;
    }
  }

  throw new Error(
    "Could not open an extension page that looks like the home/onboarding."
  );
}
