/* Independent auth-button fallback: works even if the main app bundle aborts during startup. */
(() => {
  "use strict";
  const modal = document.getElementById("auth-modal");
  const register = document.getElementById("register-wizard");
  const login = document.getElementById("login-fields");
  if (!modal || !register || !login) return;
  const show = (mode) => {
    const isLogin = mode === "restore" || mode === "login";
    register.classList.toggle("hidden", isLogin);
    login.classList.toggle("hidden", !isLogin);
    modal.classList.add("open");
  };
  document.querySelectorAll('[data-open="register"]').forEach(button =>
    button.addEventListener("click", () => show("register"))
  );
  document.querySelectorAll('[data-open="restore"]').forEach(button =>
    button.addEventListener("click", () => show("restore"))
  );
})();
