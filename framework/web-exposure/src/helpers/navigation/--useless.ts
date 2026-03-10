import type { Logger } from "../../utility/log_new.js";
import { getManifestPopup } from "../manifest.js";
import type { BrowserContext, Page } from "playwright-core";

export async function openHomeLikePage(
  extId: string,
  ctx: BrowserContext,
  extPath: string,
  log: Logger
): Promise<Page> {
  // --- get extension id (short + robust) ---

  // --- open a page that looks like the home page ---
  const base = `chrome-extension://${extId}`;
  let defaultPopUp = await getManifestPopup(extPath);
  if (defaultPopUp != null) {
    defaultPopUp = `${base}/${defaultPopUp}`;
    log.success(`Detected default popup: ${defaultPopUp}`);
  }
  const candidates = [
    defaultPopUp || undefined,
    `${base}/popup.html`,
    `${base}/welcome.html`,
    `${base}/index.html`,
    `${base}/home.html#onboarding`,
    `${base}/home.html`,
    `${base}/index.html#onboarding`,
  ].filter(Boolean) as string[];

  // let page = await ctx.newPage();
  const existing = ctx.pages().find((p) => p.url().startsWith(`${base}/`));
  const usable = (p?: Page | null) => p && !p.isClosed();

  const auto = await Promise.race([
    ctx
      .waitForEvent("page", {
        predicate: (p) => p.url().startsWith(base + "/"),
        timeout: 3000,
      })
      .catch(() => null),
    Promise.resolve(null),
  ]);

  let page = [existing, auto].find(usable) ?? (await ctx.newPage());

  console.log("existing?", existing, "auto?", auto);

  for (const url of candidates) {
    console.log("trying URL:", url);
    try {
      // reuse an existing extension tab if already open (not popup)
      // wait until the page is fully loaded
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      await Promise.race([
        page.waitForFunction(
          () => {
            const b = document.body;
            if (!b) return false;
            if (b.innerText && b.innerText.trim().length > 0) return true;

            // Visual presence: any visible non-script/style element with layout
            for (const el of Array.from(b.querySelectorAll("*"))) {
              const tag = el.tagName.toLowerCase();
              if (tag === "script" || tag === "style") continue;
              const r = (el as HTMLElement).getBoundingClientRect?.();
              const cs = window.getComputedStyle(el as Element);
              if (
                r &&
                r.width > 0 &&
                r.height > 0 &&
                cs.display !== "none" &&
                cs.visibility !== "hidden" &&
                cs.opacity !== "0"
              )
                return true;
            }
            return false;
          },
          { timeout: 5000 }
        ),

        // Or the URL changes (SPA/router redirect) but stays within the extension
        page.waitForFunction((b) => location.href.startsWith(b + "/"), base, {
          timeout: 5000,
        }),
      ]).catch(() => {
        /* tolerate timeout; we’ll still inspect final URL */
      });

      const finalUrl = page.url();
      if (finalUrl.startsWith(`${base}/`)) {
        log.success(`Opened candidate URL: ${finalUrl}`);
        return page;
      }

      // // tiny wait to allow SPA redirects (index -> welcome/home)
      // // console.log("...Trying candidate URL:", url);
      // await page.waitForTimeout(3000);

      // // // ignore ephemeral popup pages
      // // if (/\/popup\.html(\?|#|$)/i.test(page.url())) continue;

      // // basic content check
      // const ok = await page.evaluate(
      //   () => !!document.body && document.body.innerText.trim().length > 0
      // );
      // if (ok) {
      //   console.log("✅ Opened candidate URL:", url);
      //   return page;
      // }
    } catch {
      // try next candidate
    }
  }

  log.warn("Falling on last resort");
  // last fallback: any extension tab we can find
  const anyExt = ctx.pages().find((p) => p.url().startsWith(`${base}/`));
  if (anyExt) return anyExt;

  throw new Error("Failed to open a stable extension page");
}
