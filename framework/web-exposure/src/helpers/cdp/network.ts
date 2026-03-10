// src/helpers/cdp/network.ts
import type { BrowserContext, Page } from "playwright";
export type NetRecord = {
  source: string;
  targetType: "page" | "service_worker" | "background_page";

  requestId: string;
  requestUrl: string;
  pageUrl?: string | undefined;

  method?: string | undefined;
  status?: number | undefined;
  type: "http" | "ws";

  queryParams?: Record<string, string> | undefined;
  requestBody?: string | undefined; // ← allow undefined
  headers?: Record<string, string> | undefined;

  tsStart: number;
  tsEnd?: number | undefined;
  durationMs?: number | undefined;

  wsDirection?: "sent" | "recv" | undefined;
  wsPayload?: string | undefined;
};

export type NetSink = (rec: NetRecord) => void;

const omitUndef = <T extends object>(obj: T): T =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;

const TRUNC = (s: string, n = 2000) =>
  typeof s === "string" && s.length > n ? s.slice(0, n) + "…[truncated]" : s;

function makeTimeMapper() {
  let offsetMs: number | null = null; // CDP seconds -> wall ms
  return (cdpSeconds: number) => {
    const wall = Date.now();
    if (offsetMs === null) offsetMs = wall - cdpSeconds * 1000;
    return Math.round(cdpSeconds * 1000 + offsetMs);
  };
}
const parseQuery = (urlStr: string): Record<string, string> => {
  const out: Record<string, string> = {};
  try {
    const u = new URL(urlStr);
    u.searchParams.forEach((v, k) => (out[k] = v));
  } catch {}
  return out;
};
export async function attachPageNetwork(
  context: BrowserContext,
  page: Page,
  sink: NetSink,
  sourceLabel = "page"
) {
  const cdp = await context.newCDPSession(page);
  const mapTime = makeTimeMapper();

  const reqStart = new Map<string, number>();
  const reqUrl = new Map<string, string>();
  const reqPageUrl = new Map<string, string>();
  const reqHeaders = new Map<string, Record<string, string>>();
  const reqBody = new Map<string, string>();
  const wsUrl = new Map<string, string>();

  await cdp.send("Network.enable", { maxTotalBufferSize: 100_000_000 });

  cdp.on("Network.requestWillBeSent", (ev: any) => {
    const ts = mapTime(ev.timestamp);
    const url = ev.request?.url || "";
    const method = ev.request?.method;
    const pageUrl = ev.documentURL || ev.initiator?.url || page.url(); // best-effort page/iframe URL

    reqStart.set(ev.requestId, ts);
    reqUrl.set(ev.requestId, url);
    reqPageUrl.set(ev.requestId, pageUrl);
    if (ev.request?.headers) reqHeaders.set(ev.requestId, ev.request.headers);
    if (typeof ev.request?.postData === "string")
      reqBody.set(ev.requestId, TRUNC(ev.request.postData, 20000));

    sink({
      source: sourceLabel,
      targetType: "page",
      requestId: ev.requestId,
      requestUrl: url,
      pageUrl,
      method,
      type: url.startsWith("ws") ? "ws" : "http",
      queryParams: parseQuery(url),
      requestBody: reqBody.get(ev.requestId),
      headers: reqHeaders.get(ev.requestId),
      tsStart: ts,
    });
  });

  cdp.on("Network.responseReceived", (ev: any) => {
    const ts = mapTime(ev.timestamp);
    const start = reqStart.get(ev.requestId) ?? ts;
    const url = reqUrl.get(ev.requestId) || ev.response?.url || "";
    const pageUrl = reqPageUrl.get(ev.requestId);

    sink({
      source: sourceLabel,
      targetType: "page",
      requestId: ev.requestId,
      requestUrl: url,
      pageUrl,
      status: ev.response?.status,
      type: url.startsWith("ws") ? "ws" : "http",
      queryParams: parseQuery(url),
      headers: reqHeaders.get(ev.requestId),
      requestBody: reqBody.get(ev.requestId),
      tsStart: start,
      tsEnd: ts,
      durationMs: ts - start,
    });
  });

  cdp.on("Network.loadingFinished", (ev: any) => {
    const ts = mapTime(ev.timestamp);
    const start = reqStart.get(ev.requestId);
    if (!start) return;
    const url = reqUrl.get(ev.requestId) || "";
    const pageUrl = reqPageUrl.get(ev.requestId);

    sink({
      source: sourceLabel,
      targetType: "page",
      requestId: ev.requestId,
      requestUrl: url,
      pageUrl,
      type: url.startsWith("ws") ? "ws" : "http",
      queryParams: parseQuery(url),
      headers: reqHeaders.get(ev.requestId),
      requestBody: reqBody.get(ev.requestId),
      tsStart: start,
      tsEnd: ts,
      durationMs: ts - start,
    });
  });

  // WebSockets
  cdp.on("Network.webSocketCreated", (ev: any) => {
    wsUrl.set(ev.requestId, ev.url || "");
  });

  cdp.on("Network.webSocketFrameSent", (ev: any) => {
    const ts = mapTime(ev.timestamp);
    const url = wsUrl.get(ev.requestId) || "";
    sink({
      source: sourceLabel,
      targetType: "page",
      requestId: ev.requestId,
      requestUrl: url,
      pageUrl: page.url(),
      type: "ws",
      tsStart: ts,
      wsDirection: "sent",
      wsPayload: TRUNC(ev.response?.payloadData),
    });
  });

  cdp.on("Network.webSocketFrameReceived", (ev: any) => {
    const ts = mapTime(ev.timestamp);
    const url = wsUrl.get(ev.requestId) || "";
    sink({
      source: sourceLabel,
      targetType: "page",
      requestId: ev.requestId,
      requestUrl: url,
      pageUrl: page.url(),
      type: "ws",
      tsStart: ts,
      wsDirection: "recv",
      wsPayload: TRUNC(ev.response?.payloadData),
    });
  });

  return cdp;
}
