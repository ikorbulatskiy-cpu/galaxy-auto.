(() => {
  "use strict";
  if (window.__NEXORA_SAFARI_BOOT__) return;
  window.__NEXORA_SAFARI_BOOT__ = true;

  const $ = (selector) => document.querySelector(selector);

  function showAuth(mode) {
    if (typeof window.openAuth === "function") {
      window.openAuth(mode);
      return;
    }
    const modal = $("#auth-modal");
    const register = $("#register-wizard");
    const login = $("#login-fields");
    if (!modal || !register || !login) return;
    const isLogin = mode === "restore" || mode === "login";
    register.classList.toggle("hidden", isLogin);
    login.classList.toggle("hidden", !isLogin);
    modal.classList.add("open");
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