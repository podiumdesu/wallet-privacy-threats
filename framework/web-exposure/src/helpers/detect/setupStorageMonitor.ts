// storageMonitor.ts
import type { Page } from "playwright";

/** Your original in-page monitor, as raw JS text (IIFE). */
export const STORAGE_MONITOR_IIFE = `(function (initialPhase) {
  const timeOrigin = performance.timeOrigin || (Date.now() - performance.now());
  const now = () => { const hr = performance.now(); return { hr, epoch: timeOrigin + hr }; };

  // globals
  window.__phase = window.__phase || initialPhase;
  window.__storageLog = window.__storageLog || [];
  if (window.__storageWired) return; // avoid duplicate wiring
  window.__storageWired = true;

  const record = (entry) => {
    const t = now();
    const rec = { ...entry, phase: window.__phase, ts: t.epoch, hr: t.hr };
    window.__storageLog.push(rec);
    window.dispatchEvent(new CustomEvent("playwright-storage", { detail: rec }));
    console.log("[storage-event] " + JSON.stringify(rec));
  };

  // localStorage hooks
  const S = Storage.prototype;
  const origSet = S.setItem, origRemove = S.removeItem, origClear = S.clear;
  S.setItem = function (k, v) { record({ type: "localStorage.setItem", key: k, val: v }); return origSet.apply(this, arguments); };
  S.removeItem = function (k) { record({ type: "localStorage.removeItem", key: k }); return origRemove.apply(this, arguments); };
  S.clear = function () { record({ type: "localStorage.clear" }); return origClear.apply(this, arguments); };

  // document.cookie hook (JS-set)
  const desc =
    Object.getOwnPropertyDescriptor(Document.prototype, "cookie") ||
    Object.getOwnPropertyDescriptor(HTMLDocument.prototype || {}, "cookie") ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(document), "cookie");
  if (desc && desc.configurable) {
    Object.defineProperty(document, "cookie", {
      configurable: true, enumerable: true,
      get() { return desc.get ? desc.get.call(this) : ""; },
      set(val) { record({ type: "document.cookie.set", val }); if (desc.set) return desc.set.call(this, val); }
    });
  } else {
    // fallback polling if we can't intercept setter
    let last = document.cookie;
    setInterval(() => {
      const cur = document.cookie;
      if (cur !== last) { record({ type: "document.cookie.changed", prev: last, cur }); last = cur; }
    }, 200);
  }

  // phase helper
  window.__setPhase = (name) => {
    if (window.__phase !== name) {           // Only run if phase changes
      window.__phase = name;
      record({ type: "phase.set", name });
    }
  };
})`;

let currentPhase = "preLock";
let storageLogBackup: any[] = []; // node-side copy of logs

/** Inject for future navigations + run once on the current document. */
export async function attachStorageMonitor(
  page: Page,
  initialPhase: string
): Promise<void> {
  const script = `(${STORAGE_MONITOR_IIFE})(${JSON.stringify(initialPhase)});`;
  // const currentScript = `(${STORAGE_MONITOR_IIFE})(${JSON.stringify(
  //   currentPhase
  // )});`;

  // await page.addInitScript({
  //   content: `
  //     console.log("page init", window.__phase);
  //     window.__phase = window.__phase || ${JSON.stringify(currentPhase)};
  //     window.__storageLog = window.__storageLog || [];
  //   `,
  // });

  // await page.addInitScript(script);
  await page.addInitScript({
    content: script,
  });
  await page.evaluate(script);
}

export function makePhaseHelpers(page: Page) {
  // --- Set and remember the phase ---
  const setPhase = async (phase: string) => {
    if (currentPhase === phase) return;
    currentPhase = phase;

    await page.addInitScript({
      content: `window.__phase = ${JSON.stringify(phase)};`,
    });

    await page.waitForTimeout(1000);
    // wait until the page-side helper exists
    await page
      .waitForFunction(() => typeof (window as any).__setPhase === "function", {
        timeout: 10000,
      })
      .catch(() => {});

    // call it and return a small diagnostic
    const result = await page.evaluate((p) => {
      const fn = (window as any).__setPhase;
      if (typeof fn === "function") {
        fn(p); // this should trigger console.log("FROM SCRIPT:", ...)
        return { called: true, phase: (window as any).__phase };
      }
      return { called: false, phase: (window as any).__phase ?? "unknown" };
    }, phase);
  };
  // --- Collect logs into Node (always append to backup) ---
  const backupLog = async () => {
    try {
      const logs = await page.evaluate(
        () => (window as any).__storageLog ?? []
      );

      if (Array.isArray(logs) && logs.length > 0) {
        storageLogBackup.push(...logs);
        // Optional: deduplicate
        // storageLogBackup = storageLogBackup.slice(-5000); // keep last 5k entries
      }

      await page.evaluate(() => {
        (window as any).__storageLog = [];
      });
    } catch {
      /* ignore cross-origin or unloaded */
    }
  };

  // --- Handle main navigations (new document) ---
  page.on("framenavigated", async (frame) => {
    await backupLog(); // before phase reapply
    await setPhase(currentPhase);
    // await page
    //   .evaluate((p) => (window as any).__setPhase?.(p), currentPhase)
    //   .catch(() => {});
  });

  // --- Handle same-origin iframes (rebuilds) ---
  // page.on("frameattached", async (frame) => {
  //   console.log("frame attached:");
  //   await backupLog(); // before phase reapply
  //   await setPhase(currentPhase);
  //   // await page
  //   //   .evaluate((p) => (window as any).__setPhase?.(p), currentPhase)
  //   //   .catch(() => {});
  // });

  // --- Optional: handle soft reloads / JS-driven navigations ---
  // page.on("domcontentloaded", async () => {
  //   await backupLog();
  //   await setPhase(currentPhase);
  // });

  return {
    setPhase,
    getPhase: async () =>
      page
        .evaluate(() => (window as any).__phase ?? "unknown")
        .catch(() => "unknown"),
    getLogs: async () => {
      await backupLog();
      return storageLogBackup;
    },
  };
}
