// --- install once per context: logs window.close() + (optional) temporary block ---
import type { BrowserContext } from "playwright-core";

export async function installCloseShim(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    const origClose = window.close.bind(window);
    // Flip this from your test code if you ever need to *block* closes:
    (window as any).__allowClose = true;

    window.close = function () {
      console.log("[DBG] window.close() CALLED on", location.href);
      if ((window as any).__allowClose === false) {
        console.log("[DBG] window.close() BLOCKED on", location.href);
        return; // swallow
      }
      return origClose();
    };

    // Useful extra breadcrumbs:
    const a = location.assign.bind(location);
    location.assign = (u: string) => (
      console.log("[DBG] location.assign ->", u), a(u)
    );
    const r = location.replace.bind(location);
    location.replace = (u: string) => (
      console.log("[DBG] location.replace ->", u), r(u)
    );
  });
}
