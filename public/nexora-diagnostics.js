/* Collect browser runtime failures so they are visible in Render application logs. */
(() => {
  "use strict";
  let sent = 0;
  const limit = 10;
  const cleanSource = value => {
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin ? url.pathname : "external-resource";
    } catch { return ""; }
  };
  function report(kind, message, source, line, column) {
    if (sent >= limit || String(source || "").includes("/api/client-errors")) return;
    sent += 1;
    const payload = {
      kind: String(kind || "error").slice(0, 32),
      message: String(message || "Unknown client error").slice(0, 500),
      source: cleanSource(source),
      line: Number.isSafeInteger(line) ? line : null,
      column: Number.isSafeInteger(column) ? column : null,
      page: location.pathname
    };
    try {
      fetch("/api/client-errors", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (_) {}
  }
  window.addEventListener("error", event => {
    if (event.target && event.target !== window) {
      const target = event.target;
      report("resource", "Не удалось загрузить ресурс: " + (target.src || target.href || target.tagName), target.src || target.href, 0, 0);
      return;
    }
    report("javascript", event.message, event.filename, event.lineno, event.colno);
  }, true);
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    report("unhandledrejection", reason && (reason.stack || reason.message) || String(reason || "Unhandled promise rejection"), "", 0, 0);
  });
})();
