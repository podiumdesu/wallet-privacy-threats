// Paste in console BEFORE clicking "Connect"
(() => {
  const originals = new WeakMap();
  const providers = new Set();

  // Only focus on probing/permissions + account basics
  // Not used yet for now
  const interesting = new Set([
    "eth_accounts",
    "eth_requestAccounts",
    "wallet_getPermissions",
    "wallet_requestPermissions",
    "wallet_revokePermissions",
    "eth_chainId",
  ]);

  // helpers (top-level)
  const seqByLabel = new Map(); // label -> number
  const nextSeq = (label) => {
    const n = (seqByLabel.get(label) || 0) + 1;
    seqByLabel.set(label, n);
    return n;
  };
  const payloadIdOf = (payload) => {
    if (Array.isArray(payload) && payload.length && payload[0]?.id != null)
      return payload[0].id;
    if (payload && typeof payload === "object" && payload.id != null)
      return payload.id;
    return null;
  };
  const emit = (rec) => console.log(`[object-event] ${JSON.stringify(rec)}`);
  // replace your wrapMethod with this version
  const wrapMethod = (obj, name, label) => {
    const fn = obj?.[name];
    if (typeof fn !== "function" || originals.has(fn)) return;

    function wrapped(...args) {
      const isRequest = name === "request";
      let method, params, requestId;

      if (isRequest) {
        method = args?.[0]?.method;
        params = args?.[0]?.params;
        requestId = `${label}:${nextSeq(label)}:${method || "unknown"}`;
      } else if (name === "send" || name === "sendAsync") {
        const p = args[0];
        const pid = payloadIdOf(p);
        if (typeof p === "string") {
          method = p;
          params = args?.[1];
          requestId = `${label}:${nextSeq(label)}:${method || "unknown"}`;
        } else {
          method = Array.isArray(p) ? p[0]?.method ?? "batch" : p?.method;
          params = Array.isArray(p) ? p.map((x) => x.params) : p?.params;
          requestId =
            pid != null
              ? `${label}:rpc:${String(pid)}`
              : `${label}:${nextSeq(label)}:${method || "unknown"}`;
        }
      } else {
        method = args?.[0];
        params = args?.[1];
        requestId = `${label}:${nextSeq(label)}:${method || "unknown"}`;
      }

      if (!method) return fn.apply(this, args);

      // create a FRESH record for THIS call
      const start = Date.now();
      const base = {
        requestId,
        label,
        phase: window.__phase ?? "unknown",
        ts_start: start,
        api: name, // 'request' | 'send' | 'sendAsync' | 'enable'
        method,
      };

      // emit CALL
      emit({
        ...base,
        type: "call",
        params: params === undefined ? null : params,
      });

      // By using the id
      // wrap callback-style completion
      const lastIdx = args.length - 1;
      if (
        (name === "send" || name === "sendAsync") &&
        typeof args[lastIdx] === "function"
      ) {
        const cb = args[lastIdx];
        args[lastIdx] = function (err, res) {
          const end = Date.now();
          if (err) {
            emit({
              ...base,
              ts_end: end,
              type: "error",
              error: err?.message || err,
              durationMs: end - start,
            });
          } else {
            emit({
              ...base,
              ts_end: end,
              type: "response",
              result: res,
              durationMs: end - start,
            });
          }
          return cb.apply(this, arguments);
        };
      }

      // call original method and transparently propagate result/error
      try {
        const out = fn.apply(this, args);

        // Promise-style
        if (out && typeof out.then === "function") {
          return out
            .then((res) => {
              const end = Date.now();
              emit({
                ...base,
                ts_end: end,
                type: "response",
                result: res,
                durationMs: end - start,
              });
              return res; // preserve
            })
            .catch((err) => {
              const end = Date.now();
              emit({
                ...base,
                ts_end: end,
                type: "error",
                error: err?.message || err,
                durationMs: end - start,
              });
              throw err; // preserve
            });
        }

        // Synchronous (rare)
        {
          const end = Date.now();
          emit({
            ...base,
            ts_end: end,
            type: "response",
            result: out,
            durationMs: end - start,
          });
        }
        return out;
      } catch (err) {
        const end = Date.now();
        emit({
          ...base,
          ts_end: end,
          type: "error",
          error: err?.message || err,
          durationMs: end - start,
        });
        throw err;
      }
    }

    originals.set(wrapped, fn);
    obj[name] = wrapped;
  };

  const wrapProvider = (p, label) => {
    wrapMethod(p, "request", label);
    wrapMethod(p, "send", label);
    wrapMethod(p, "sendAsync", label);
    wrapMethod(p, "enable", label);
  };

  if (window.ethereum) wrapProvider(window.ethereum, "window.ethereum");

  // EIP-6963: wrap any announced providers (e.g., Rabby)
  window.addEventListener("eip6963:announceProvider", (e) => {
    const { provider, info } = e.detail || {};
    wrapProvider(provider, `eip6963:${info?.rdns || info?.name || "provider"}`);
    emit({
      ts: Date.now(),
      label: `eip6963:${info?.rdns || info?.name || "provider"}`,
      phase: window.__phase ?? "unknown",
      method: "announceProvider",
      type: "event",
      info: {
        name: info?.name || "unknown",
        uuid: info?.uuid || "unknown",
      },
    });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // Easy restore if you want to revert:
  window.__restoreEthMonitor = () => {
    const restore = (obj, name) => {
      const maybeWrapped = obj?.[name];
      const orig = originals.get(maybeWrapped);
      if (orig) obj[name] = orig;
    };
    if (window.ethereum)
      ["request", "send", "sendAsync", "enable"].forEach((n) =>
        restore(window.ethereum, n)
      );
  };
})();
