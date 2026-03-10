import type { BrowserContext, Page } from "playwright";

function isStaleOrClosedError(e: unknown) {
  const msg = String(e);
  return (
    /guid .* was not bound/i.test(msg) ||
    /Target page, context or browser has been closed/i.test(msg) ||
    /Navigation failed because page was closed/i.test(msg)
  );
}

/**
 * Navigates to a URL safely, retrying with a fresh page if the old one closed.
 * Always returns a live Page handle.
 */
export async function robustGoto(
  ctx: BrowserContext,
  page: Page | null,
  url: string,
  opts: {
    waitUntil?: "domcontentloaded" | "load" | "networkidle";
    timeout?: number;
    attempts?: number;
  } = {}
): Promise<Page> {
  const attempts = opts.attempts ?? 2;
  const gotoOpts = {
    waitUntil: opts.waitUntil ?? "domcontentloaded",
    timeout: opts.timeout ?? 10000,
  };

  let p = page;
  for (let i = 0; i < attempts; i++) {
    if (!p || p.isClosed()) {
      p = await ctx.newPage();
    }
    try {
      await p.goto(url, gotoOpts);
      return p; // ✅ success
    } catch (e) {
      console.log(e);
      console.log("erere");
      if (isStaleOrClosedError(e)) {
        // page died → close & retry with a new one
        try {
          if (p && !p.isClosed()) await p.close();
        } catch {}
        p = null;
        continue;
      }
      throw e; // real navigation error, let it bubble
    }
  }
  throw new Error(`robustGoto: failed after ${attempts} attempts for ${url}`);
}
