/* log.ts — tiny structured logger for Playwright/Node, no deps */

type Level =
  | "debug"
  | "step"
  | "screen"
  | "click"
  | "action"
  | "info"
  | "success"
  | "warn"
  | "error";

type LogMeta = Record<string, unknown> | undefined;

export type LoggerOptions = {
  scope?: string; // e.g., "metamask", "onboarding", "page:welcome"
  useColors?: boolean; // default: true (disabled if NO_COLOR or not TTY)
  useEmoji?: boolean; // default: true
  showTimestamp?: boolean; // default: true
  json?: boolean; // default: from env LOG_JSON
  minLevel?: Level; // default: from env LOG_LEVEL (info)
  include?: string[]; // match against "scope" or "scope:path" or message
  exclude?: string[]; // same as include, takes precedence
};

const DEFAULTS: Required<
  Omit<LoggerOptions, "scope" | "include" | "exclude" | "minLevel">
> = {
  useColors: true,
  useEmoji: true,
  showTimestamp: true,
  json: envFlag("LOG_JSON", false),
};

// Level ordering for filtering
const ORDER: Record<Level, number> = {
  debug: 10,
  step: 20,
  screen: 25,
  click: 27,
  action: 28,
  info: 30,
  success: 40,
  warn: 50,
  error: 60,
};

// Resolve min level from env
function envMinLevel(): Level {
  const v = (process.env.LOG_LEVEL || "").toLowerCase() as Level;
  return v && ORDER[v] ? v : "info";
}

// Env helpers
function envList(name: string): string[] | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function envFlag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

// Basic ANSI colors (no external deps)
const TTY = !!process.stdout.isTTY;
const NO_COLOR = !!process.env.NO_COLOR;
const supportsColor = TTY && !NO_COLOR;

const c = (open: number, close: number) => (s: string) =>
  `\u001b[${open}m${s}\u001b[${close}m`;

const colors = {
  gray: c(90, 39),
  dim: c(2, 22),
  bold: c(1, 22),
  red: c(31, 39),
  green: c(32, 39),
  yellow: c(33, 39),
  blue: c(34, 39),
  magenta: c(35, 39),
  cyan: c(36, 39),
  white: c(97, 39),
  bgRed: c(41, 49),
};

const SYMBOLS: Record<Level, string> = {
  debug: "🔧",
  step: "🧭",
  screen: "🪟",
  click: "🖱️",
  action: "⚙️",
  info: "ℹ️",
  success: "✅",
  warn: "⚠️",
  error: "🛑",
};

const LEVEL_COLOR: Record<Level, (s: string) => string> = {
  debug: colors.gray,
  step: colors.cyan,
  screen: colors.blue,
  click: colors.magenta,
  action: colors.white,
  info: colors.white,
  success: colors.green,
  warn: colors.yellow,
  error: colors.red,
};

export interface Logger {
  // core
  log(level: Level, msg: string, meta?: LogMeta): void;

  // convenience methods
  debug(msg: string, meta?: LogMeta): void;
  step(msg: string, meta?: LogMeta): void;
  screen(msg: string, meta?: LogMeta): void;
  click(msg: string, meta?: LogMeta): void;
  action(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  success(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;

  // timed steps
  // step lifecycle (stack-based)
  stepStart(msg: string, meta?: LogMeta): void;
  stepEnd(meta?: LogMeta): void;
  stepFail(err?: unknown, meta?: LogMeta): void;

  // scoping
  child(scope: string, opts?: Partial<LoggerOptions>): Logger;

  // runtime controls
  isEnabled(level: Level, msg?: string): boolean;
  setMinLevel(level: Level): void;
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const config = normalizeOptions(opts);

  // track nested steps (LIFO). each entry: { msg, t0 }
  const stepStack: Array<{ msg: string; t0: number }> = [];

  function stepStart(msg: string, meta?: LogMeta) {
    stepStack.push({ msg, t0: Date.now() });
    log("step", msg, meta);
  }

  function stepEnd(additional?: LogMeta) {
    const s = stepStack.pop();
    if (!s) {
      log("warn", "stepEnd() called without a matching stepStart()");
      return;
    }
    const ms = Date.now() - s.t0;
    log("success", `${s.msg} (done in ${ms}ms)`, additional);
  }

  function stepFail(err?: unknown, additional?: LogMeta) {
    const s = stepStack.pop();
    if (!s) {
      log("warn", "stepFail() called without a matching stepStart()", {
        error: serializeError(err),
      });
      return;
    }
    const ms = Date.now() - s.t0;
    const metaErr: Record<string, unknown> = {
      ...additional,
      error: serializeError(err),
      durationMs: ms,
    };
    log("error", `${s.msg} (failed in ${ms}ms)`, metaErr);
  }

  function fmt(level: Level, msg: string, meta?: LogMeta) {
    const ts = config.showTimestamp ? new Date().toISOString() : undefined;
    const scope = config.scope;
    const emoji = config.useEmoji ? SYMBOLS[level] : undefined;
    const levelLabel = level.toUpperCase();

    if (config.json) {
      const payload: any = { time: ts, level, msg };
      if (scope) payload.scope = scope;
      if (meta && Object.keys(meta).length) payload.meta = meta;
      return JSON.stringify(payload);
    }

    const colorize =
      config.useColors && supportsColor ? LEVEL_COLOR[level] : (s: string) => s;
    const parts = [
      config.showTimestamp ? colors.dim(`[${ts}]`) : undefined,
      scope ? colors.bold(`[${scope}]`) : undefined,
      colorize(emoji ? `${emoji} ${levelLabel}` : levelLabel),
      "-",
      msg,
    ].filter(Boolean);

    let line = parts.join(" ");
    if (meta && Object.keys(meta).length) {
      const tail = stringifyMeta(meta);
      line +=
        " " + (config.useColors && supportsColor ? colors.dim(tail) : tail);
    }
    return line;
  }

  function matchesFilters(level: Level, msg?: string): boolean {
    // level filter
    if (ORDER[level] < ORDER[config.minLevel]) return false;

    // include/exclude filters
    const keyspace = [config.scope, msg].filter(Boolean).join(" ");
    if (config.exclude?.some((p) => keyspace.includes(p))) return false;
    if (config.include && config.include.length > 0) {
      return config.include.some((p) => keyspace.includes(p));
    }
    return true;
  }

  function out(level: Level, line: string) {
    const stream =
      level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(line + "\n");
  }

  function log(level: Level, msg: string, meta?: LogMeta) {
    if (!matchesFilters(level, msg)) return;
    out(level, fmt(level, msg, meta));
  }

  //   function stepStart(msg: string, meta?: LogMeta) {
  //     const t0 = Date.now();
  //     log("step", msg, meta);

  //     let ended = false;

  //     function end(additional?: LogMeta) {
  //       if (ended) return;
  //       ended = true;
  //       const ms = Date.now() - t0;
  //       log("success", `${msg} (done in ${ms}ms)`, additional);
  //     }

  //     function fail(err?: unknown, additional?: LogMeta) {
  //       if (ended) return;
  //       ended = true;
  //       const ms = Date.now() - t0;
  //       const metaErr: Record<string, unknown> = {
  //         ...additional,
  //         error: serializeError(err),
  //         durationMs: ms,
  //       };
  //       log("error", `${msg} (failed in ${ms}ms)`, metaErr);
  //     }

  //     return { end, fail };
  //   }

  /**
   * run a step as an async function, auto-logging success/failure
   */

  function child(scope: string, more?: Partial<LoggerOptions>): Logger {
    return createLogger({
      ...config,
      ...more,
      scope: config.scope ? `${config.scope}:${scope}` : scope,
    });
  }

  function isEnabled(level: Level, msg?: string) {
    return matchesFilters(level, msg);
  }

  function setMinLevel(level: Level) {
    (config as any).minLevel = level;
  }

  const api: Logger = {
    log,
    debug: (m, meta) => log("debug", m, meta),
    step: (m, meta) => log("step", m, meta), // unchanged: plain step line
    screen: (m, meta) => log("screen", m, meta),
    click: (m, meta) => log("click", m, meta),
    action: (m, meta) => log("action", m, meta),
    info: (m, meta) => log("info", m, meta),
    success: (m, meta) => log("success", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),

    // NEW lifecycle methods
    stepStart,
    stepEnd,
    stepFail,

    child,
    isEnabled,
    setMinLevel,
  };

  return api;
}

/* ---------- helpers ---------- */

function normalizeOptions(opts: LoggerOptions) {
  const base: any = {
    ...DEFAULTS,
    scope: opts.scope,
    useColors: opts.useColors ?? DEFAULTS.useColors,
    useEmoji: opts.useEmoji ?? DEFAULTS.useEmoji,
    showTimestamp: opts.showTimestamp ?? DEFAULTS.showTimestamp,
    json: typeof opts.json === "boolean" ? opts.json : DEFAULTS.json,
    minLevel: opts.minLevel ?? envMinLevel(),
    include: opts.include ?? envList("LOG_INCLUDE"),
    exclude: opts.exclude ?? envList("LOG_EXCLUDE"),
  };

  // auto-disable colors if not supported
  if (!supportsColor) base.useColors = false;
  return base as Required<LoggerOptions>;
}

function stringifyMeta(meta: LogMeta): string {
  try {
    return JSON.stringify(meta);
  } catch {
    return "[meta:unserializable]";
  }
}

function serializeError(err: unknown) {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}
