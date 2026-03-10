(() => {
  const wrap = (p: any) =>
    p && (typeof p === "object" || typeof p === "function")
      ? new Proxy(p, {
          get(t, k, r) {
            const v = Reflect.get(t, k, r);
            if (typeof v === "function") {
              return (...a: any) => {
                console.log("[ETH CALL]", String(k), a);
                return Reflect.apply(v, t, a);
              };
            }
            return v;
          },
        })
      : p;

  let wrapped: any;
  Object.defineProperty(window, "ethereum", {
    configurable: true,
    get() {
      return wrapped;
    },
    set(v) {
      wrapped = wrap(v);
    }, // wraps when the wallet injects it
  });

  if ((window as any).ethereum)
    (window as any).ethereum = wrap((window as any).ethereum); // wraps if already present
})();
