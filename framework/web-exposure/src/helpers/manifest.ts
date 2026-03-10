import { promises as fs } from "node:fs";
import path from "node:path";

type Manifest = {
  manifest_version: 2 | 3;
  action?: { default_popup?: string };
  browser_action?: { default_popup?: string };
  page_action?: { default_popup?: string };
  options_ui?: { page?: string };
  chrome_url_overrides?: { newtab?: string };
  web_accessible_resources?: any; // v2: string[], v3: [{resources:string[]}]
};

async function readManifest(extPath: string): Promise<Manifest | null> {
  try {
    const raw = await fs.readFile(path.join(extPath, "manifest.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getManifestPopup(
  extPath: string
): Promise<string | null> {
  const m = await readManifest(extPath);
  if (!m) return null;

  const popup =
    m.action?.default_popup ||
    m.browser_action?.default_popup ||
    m.page_action?.default_popup;

  return popup ? popup : null;
}

export type Row = {
  name?: string;
  rank?: string;
  website?: string;
  alive?: boolean;
  status?: number | string | null;
  [k: string]: any;
};

function tryParseLine(raw: string): Row | null {
  const s = raw.trim();
  if (!s) return null;

  // If the line already looks like JSON object, try parse directly
  let candidate = s;

  // If it’s missing a leading "{", try to wrap it
  if (!/^\s*\{/.test(candidate) && /"\w+"\s*:/.test(candidate)) {
    candidate = `{${candidate.replace(/,*\s*$/, "")}}`;
  }

  try {
    return JSON.parse(candidate) as Row;
  } catch {
    // Fallback: try to coerce single-quoted style into JSON (best-effort)
    try {
      const coerced = candidate
        // quote keys if single-quoted: 'name': -> "name":
        .replace(/'([\w-]+)'\s*:/g, `"$1":`)
        // single-quoted values -> double-quoted
        .replace(/:\s*'([^']*)'/g, `: "$1"`)
        // ensure it’s wrapped
        .replace(/^\s*([^[{].*)$/, `{$1}`)
        .replace(/,?\s*$/, "}");
      return JSON.parse(coerced) as Row;
    } catch {
      return null; // skip truly broken/truncated lines (e.g., your last one)
    }
  }
}

export async function getDappList(): Promise<{
  websites: string[];
  aliveRows: Row[];
} | null> {
  try {
    const raw = await fs.readFile(
      path.resolve("./dapp-clean/sites.updated-incomplete.txt"),
      "utf8"
    );

    const rows: Row[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const obj = tryParseLine(line);
      if (obj && (obj.website || obj.name)) rows.push(obj);
    }

    // Alive lines (alive === true and status 2xx/3xx if present)
    const aliveRows = rows.filter((r) => {
      if (r.alive === false) return false;
      if (typeof r.status === "number")
        return r.status >= 200 && r.status < 400;
      return r.alive === true; // if only alive flag present
    });

    // Website list (present)
    const websites = aliveRows
      .map((r) => r.website)
      .filter((u): u is string => Boolean(u));

    return { websites, aliveRows };
  } catch (e) {
    console.log(e);
    return null;
  }
}
