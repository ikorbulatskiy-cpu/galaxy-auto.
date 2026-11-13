/* NEXORA resilient Safari boot and auth fallback. */
(() => {
  "use strict";
  if (window.__NEXORA_SAFARI_BOOT_V3__) return;
  window.__NEXORA_SAFARI_BOOT_V3__ = true;
  const $ = (selector) => document.querySelector(selector);
  const report = (message, context) => {
    try {
      fetch("/api/client-errors", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "interaction", message: String(message).slice(0, 500), source: "/nexora-safari-boot.js", context, page: location.pathname })
      }).catch(() => {});
    } catch (_) {}
  };
  function fallbackAuth(mode) {
    const modal = $("#auth-modal"), register = $("#register-wizard"), login = $("#login-fields");
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
    } catch (error) { report(error.stack || error, "openAuth"); }
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
      try { window.switchTab(tab.dataset.tab); }
      catch (error) { report(error.stack || error, "switchTab"); }
      event.stopImmediatePropagation();
      return;
    }
    if (target && target.closest && target.closest("#close-modal")) {
      event.preventDefault();
      $("#auth-modal")?.classList.remove("open");
      event.stopImmediatePropagation();
    } else if (target === $("#auth-modal")) {
      $("#auth-modal").classList.remove("open");
    }
  }, true);

  // If the main inline application script failed before binding its submit
  // listener, preserve the same character-code auth flow as a recovery path.
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form || form.id !== "auth-form" || event.defaultPrevented) return;
    event.preventDefault();
    const registerMode = !$("#register-wizard")?.classList.contains("hidden");
    const submit = registerMode ? $("#auth-submit") : $("#auth-login-submit");
    if (submit) submit.disabled = true;
    try {
      let payload, endpoint;
      if (registerMode) {
        const username = $("#nx-register-username")?.value.trim() || "";
        const gender = document.querySelector("[data-gender-choice].active")?.dataset.genderChoice || "female";
        const bodyLabel = $("#nx-body-label")?.textContent || "Классическое";
        const body = bodyLabel === "Стройное" ? "slim" : bodyLabel === "Спортивное" ? "athletic" : "regular";
        const adultConfirmed = Boolean(form.elements.adultConfirmed?.checked);
        if (!username) throw new Error("Укажи ник персонажа.");
        if (!adultConfirmed) throw new Error("Подтверди возраст 18+ и согласие.");
        payload = { username, gender, body, adultConfirmed };
        endpoint = "/api/auth/register";
      } else {
        const characterCode = form.elements.characterCode?.value.trim() || "";
        if (!characterCode) throw new Error("Введите код персонажа.");
        payload = { characterCode };
        endpoint = "/api/auth/login";
      }
      const result = await window.NexoraAPI.request(endpoint, { method: "POST", body: JSON.stringify(payload) });
      $("#auth-modal")?.classList.remove("open");
      if (result.characterCode) window.alert("Персонаж создан! Сохрани код для следующих входов:\n\n" + result.characterCode);
      localStorage.setItem("nexora-session-active", "1");
      if (typeof window.loadApp === "function") {
        await window.loadApp();
      } else {
        $("#landing")?.classList.add("hidden");
        $("#dashboard")?.classList.remove("hidden");
        $("#top-actions")?.classList.add("hidden");
        if (typeof window.nexoraWorldRefresh === "function") await window.nexoraWorldRefresh();
      }
    } catch (error) {
      report(error.stack || error, "fallback-auth-submit");
      const toast = $("#toast");
      if (toast) { toast.textContent = error.message || "Не удалось выполнить вход."; toast.classList.add("show"); }
      else window.alert(error.message || "Не удалось выполнить вход.");
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#auth-modal")?.classList.contains("open")) {
      $("#auth-modal").classList.remove("open");
    }
  });
  window.addEventListener("pageshow", () => document.documentElement.classList.add("nx-page-ready"));
  window.addEventListener("error", event => report(event.message || "Script error", "window-error"));
  window.addEventListener("unhandledrejection", event => report(event.reason?.stack || event.reason || "Unhandled rejection", "unhandled-rejection"));
  report("NEXORA interaction boot loaded", "boot-ready");
})();
