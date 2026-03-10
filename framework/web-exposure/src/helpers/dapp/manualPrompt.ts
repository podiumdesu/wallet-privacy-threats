import type { Logger } from "../../utility/log_new.js";
import type { Page } from "playwright-core";
/**
 * Waits for the user to manually unlock the wallet in manualMode.
 * Returns success flag and timestamp.
 */
export async function waitForManualPrompt(
  log: Logger,
  walletPage: Page | null,
  waitMessage: string
): Promise<{ success: boolean; timestamp: number }> {
  log.warn("Automatic script failed. Manual mode enabled.");
  log.info(waitMessage);
  log.info(
    "Type 'ok' once done successfully, or 'fail' if it didn’t work. Then press ENTER:"
  );

  const start = Date.now();

  const userInput: string = await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(data.toString().trim().toLowerCase());
    });
  });

  if (userInput !== "ok") {
    log.error(`Manual action marked as FAILED by user (input: '${userInput}')`);
    return { success: false, timestamp: Date.now() };
  }

  // Optional: wait a moment to ensure the browser updated
  try {
    // await walletPage.waitForTimeout(1000);
    log.success(
      `Manual step confirmed successfully at ${new Date().toISOString()}`
    );
    return { success: true, timestamp: Date.now() };
  } catch {
    log.error("Failed to verify manual step, but continuing anyway...");
    return { success: false, timestamp: Date.now() };
  }
}
