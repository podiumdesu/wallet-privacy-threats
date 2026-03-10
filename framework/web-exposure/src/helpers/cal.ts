import type { BrowserContext } from "playwright-core";

export async function getExtensionId(
  ctx: BrowserContext,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // 1) Any extension page already open?
    const extPage = ctx
      .pages()
      .find((p) => p.url().startsWith("chrome-extension://"));
    if (extPage) return new URL(extPage.url()).host;

    // 2) Any MV3 service worker already attached?
    const sw = ctx
      .serviceWorkers()
      .find((s) => s.url().startsWith("chrome-extension://"));
    if (sw) return new URL(sw.url()).host;

    // 3) Wait briefly for any of: new page, service worker, or MV2 background page
    const waiters: Promise<any>[] = [
      ctx.waitForEvent("page", { timeout: 1000 }).catch(() => null),
      ctx.waitForEvent("serviceworker", { timeout: 1000 }).catch(() => null),
    ];
    // Older Playwrights expose 'backgroundpage' on MV2:
    // @ts-ignore
    waiters.push(
      ctx.waitForEvent?.("backgroundpage", { timeout: 1000 }).catch(() => null)
    );

    await Promise.race(waiters);

    // Re-loop: we’ll re-check pages/service workers after the event
  }

  throw new Error(
    "Extension not detected after waiting. Check that: " +
      "1) extPath points to the folder with manifest.json, " +
      "2) the extension is MV2/MV3 and not failing to load, " +
      "3) you launched with --load-extension and --disable-extensions-except."
  );
}
