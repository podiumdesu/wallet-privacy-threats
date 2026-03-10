import type { Page } from "playwright";

export function observePage(p: Page, tag = "EXT", extId?: string) {
  const base = extId ? `chrome-extension://${extId}/` : "";
  const seen = new Map<string, number>();
  const dedupeMs = 2000;

  const dedupe = (key: string) => {
    const now = Date.now();
    const prev = seen.get(key) ?? 0;
    if (now - prev < dedupeMs) return true;
    seen.set(key, now);
    return false;
  };

  p.on("console", (m) => {
    const type = m.type(); // 'error' | 'warning' | ...
    if (type !== "error" && type !== "warning") return;

    const txt = m.text();

    // Drop noisy network lines entirely
    if (/^Failed to load resource:/i.test(txt)) return;

    // Keep only messages that originate from the extension source file
    const loc = m.location(); // { url, lineNumber, columnNumber }
    const url = loc?.url || "";
    if (extId && !url.startsWith(base)) return;

    const key = `${type}|${txt}|${url}`;
    if (dedupe(key)) return;

    const at = url
      ? ` @ ${url}${loc?.lineNumber != null ? ":" + loc.lineNumber : ""}`
      : "";
    // console.log(`[${tag}][console] ${type}: ${txt}${at}`);find
  });

  p.on("pageerror", (e) => {
    console.log(`[${tag}][pageerror]: ${e.message}`);
    // print out the error messagge
    // console.log(e.message);
  });
  p.on("crash", () => console.log(`[${tag}] CRASH`));
  p.on("close", () => console.log(`[${tag}] CLOSED url=${p.url()}`));
  p.on("framenavigated", (f) => {
    if (f === p.mainFrame()) console.log(`[${tag}] NAV ->`, f.url());
  });
}
