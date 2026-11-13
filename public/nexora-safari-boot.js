(() => {
  "use strict";
  if (window.__NEXORA_SAFARI_BOOT_V2__) return;
  window.__NEXORA_SAFARI_BOOT_V2__ = true;

  const $ = (selector) => document.querySelector(selector);

  function reportBootError(error, action) {
    try {
      fetch("/api/client-errors", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "interaction",
          message: "NEXORA boot " + action + ": " + String(error && (error.stack || error.message) || error).slice(0, 420),
          source: "/nexora-safari-boot.js",
          page: location.pathname
        })
      }).catch(() => {});
    } catch (_) {}
  }

  function fallbackAuth(mode) {
    const modal = $("#auth-modal");
    const register = $("#register-wizard");
    const login = $("#login-fields");
    if (!modal || !register || !login) return false;
    const isLogin = mode === "restore" || mode === "login";
    register.classList.toggle("hidden", isLogin);
    login.classList.toggle("hidden", !isLogin);
    modal.classList.add("open");
    return true;
  }

  function showAuth(mode) {
    try {
      if (typeof window.openAuth === "function") {
        window.openAuth(mode);
        return true;
      }
    } catch (error) {
      reportBootError(error, "openAuth");
    }
    return fallbackAuth(mode);
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    const trigger = target && target.closest ? target.closest("[data-open]") : null;
    if (trigger) {
      event.preventDefault();
      showAuth(trigger.dataset.open);
      event.stopImmediatePropagation();
      return;
    }

    const tab = target && target.closest ? target.closest("[data-tab]") : null;
    if (tab && typeof window.switchTab === "function") {
      event.preventDefault();
      try {
        window.switchTab(tab.dataset.tab);
      } catch (error) {
        reportBootError(error, "switchTab");
      }
      event.stopImmediatePropagation();
      return;
    }

    const close = target && target.closest ? target.closest("#close-modal") : null;
    if (close || target === $("#auth-modal")) {
      event.preventDefault();
      $("#auth-modal")?.classList.remove("open");
      document.body.style.overflow = "";
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#auth-modal")?.classList.contains("open")) {
      $("#auth-modal").classList.remove("open");
      document.body.style.overflow = "";
    }
  });

  window.addEventListener("pageshow", () => {
    document.documentElement.classList.add("nx-page-ready");
  });
})();
