import { chromium } from "playwright";
import { installCloseShim } from "../helpers/report/ctxError.js";
import path from "path";

export const setupBrowser = async (
  profileDir: string,
  extPath: string,
  wrapped?: boolean,
) => {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      "--lang=en-US",
    ],
  });
  // For debugging
  await ctx.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  await installCloseShim(ctx);

  if (wrapped) {
    // Add wrapping ethereum objects
    await ctx.addInitScript({
      path: path.resolve("./src/helpers/detect/ethereumWrap.js"),
    });
  }

  return ctx;
};
