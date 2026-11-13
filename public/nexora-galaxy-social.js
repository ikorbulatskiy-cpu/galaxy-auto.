/* NEXORA Galaxy social controls. Reuses the authenticated social API and session. */
(() => {
  "use strict";
  const api = window.NexoraAPI?.request;
  if (!api) return;
  const $ = (s, root=document) => root.querySelector(s);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let panel, settings = null;
  const defaults = { chat_bubbles:true, sound_enabled:true, friends_only_messages:true, invisible:false, system_messages:true };
  const request = (url, options) => api(url, options);
  function toast(message) {
    const node = document.createElement("div");
    node.className = "nx-galaxy-social-toast";
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 2600);
  }
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "nx-galaxy-social-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Социальное меню Galaxy");
    panel.innerHTML = `
      <div class="nx-gsp-card">
        <header><div><small>NEXORA GALAXY</small><h2>Социальный центр</h2></div><button type="button" data-gsp-close aria-label="Закрыть">×</button></header>
        <nav class="nx-gsp-tabs"><button type="button" data-gsp-tab="friends" class="active">Друзья</button><button type="button" data-gsp-tab="discover">Найти людей</button><button type="button" data-gsp-tab="blocks">Чёрный список</button><button type="button" data-gsp-tab="settings">Настройки</button></nav>
        <div class="nx-gsp-content" id="nx-gsp-content"><p>Загрузка…</p></div>
      </div>`;
    document.body.append(panel);
    panel.addEventListener("click", event => {
      if (event.target === panel || event.target.closest("[data-gsp-close]")) closePanel();
      const tab = event.target.closest("[data-gsp-tab]");
      if (tab) showTab(tab.dataset.gspTab);
      const action = event.target.closest("[data-gsp-action]");
      if (action) handleAction(action);
      const toggle = event.target.closest("[data-gsp-setting]");
      if (toggle) updateSetting(toggle.dataset.gspSetting, toggle.checked);
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) closePanel(); });
    return panel;
  }
  function closePanel() { if (panel) panel.hidden = true; document.body.classList.remove("nx-gsp-open"); }
  async function openPanel(tab="friends") {
    ensurePanel();
    panel.hidden = false;
    document.body.classList.add("nx-gsp-open");
    await showTab(tab);
  }
  async function showTab(tab) {
    panel.querySelectorAll("[data-gsp-tab]").forEach(button => button.classList.toggle("active", button.dataset.gspTab === tab));
    const content = $("#nx-gsp-content", panel);
    content.innerHTML = "<p>Загрузка…</p>";
    try {
      if (tab === "discover") {
        content.innerHTML = '<form class="nx-gsp-search" id="nx-gsp-search"><input name="q" maxlength="40" placeholder="Ник, имя или город"><button type="submit">Найти</button></form><div id="nx-gsp-results"><p class="nx-gsp-empty">Введи запрос для поиска людей.</p></div>';
        $("#nx-gsp-search", content).addEventListener("submit", async event => {
          event.preventDefault();
          const results = $("#nx-gsp-results", content); results.textContent = "Поиск…";
          try {
            const query = new URLSearchParams({ q: event.currentTarget.elements.q.value.trim() });
            const data = await request("/api/social/discover?" + query.toString());
            results.replaceChildren();
            (data.users || []).forEach(user => {
              const row = document.createElement("article"); row.className = "nx-gsp-row";
              const info = document.createElement("div"); const title = document.createElement("b"); title.textContent = user.display_name || user.username;
              const sub = document.createElement("small"); sub.textContent = "@" + user.username + (user.city ? " · " + user.city : ""); info.append(title, sub); row.append(info);
              const actions = document.createElement("div"); actions.className = "nx-gsp-actions";
              if (!user.has_relation) { const add = document.createElement("button"); add.textContent = "В друзья"; add.dataset.gspAction = "add-friend"; add.dataset.user = user.user_id; actions.append(add); }
              const block = document.createElement("button"); block.textContent = "Заблокировать"; block.dataset.gspAction = "block"; block.dataset.user = user.user_id; actions.append(block);
              row.append(actions); results.append(row);
            });
            if (!results.children.length) results.innerHTML = '<p class="nx-gsp-empty">Никого не найдено.</p>';
          } catch (error) { results.textContent = error.message || "Поиск не выполнен."; }
        });
      } else if (tab === "friends") {
        const data = await request("/api/social/friends");
        const friends = data.friends || [];
        content.innerHTML = friends.length ? friends.map(friend => {
          const id = friend.user_id, label = friend.display_name || friend.username || "Пользователь";
          const pending = friend.status === "pending";
          return `<article class="nx-gsp-row"><div><b>${esc(label)}</b><small>@${esc(friend.username)} · ${pending ? (friend.direction === "incoming" ? "Входящая заявка" : "Ожидает ответа") : "Друг"}</small></div><div class="nx-gsp-actions">${pending && friend.direction === "incoming" ? `<button data-gsp-action="accept" data-user="${esc(id)}">Принять</button>` : ""}${!pending ? `<button data-gsp-action="message" data-user="${esc(id)}">Написать</button><button data-gsp-action="remove-friend" data-user="${esc(id)}">Удалить</button>` : ""}</div></article>`;
        }).join("") : '<p class="nx-gsp-empty">Пока нет друзей или заявок. Найди людей через раздел «Поиск».</p>';
      } else if (tab === "blocks") {
        const data = await request("/api/social/blocks");
        const blocks = data.blocks || [];
        content.innerHTML = blocks.length ? blocks.map(user => `<article class="nx-gsp-row"><div><b>${esc(user.display_name || user.username)}</b><small>@${esc(user.username)}</small></div><button data-gsp-action="unblock" data-user="${esc(user.user_id)}">Разблокировать</button></article>`).join("") : '<p class="nx-gsp-empty">Чёрный список пуст.</p>';
      } else {
        const data = await request("/api/social/preferences");
        settings = { ...defaults, ...(data.preferences || {}) };
        const labels = [
          ["chat_bubbles","Облачка сообщений","Показывать текст над персонажами."],
          ["sound_enabled","Звуковые эффекты","Разрешить звуки интерфейса."],
          ["friends_only_messages","Сообщения только от друзей","Ограничивать личное общение знакомыми."],
          ["system_messages","Системные сообщения","Показывать события входа и выхода."],
          ["invisible","Режим невидимки","Скрывать присутствие там, где это поддерживается сервером."]
        ];
        content.innerHTML = '<div class="nx-gsp-settings">' + labels.map(([key,title,desc]) => `<label class="nx-gsp-setting"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" data-gsp-setting="${key}" ${settings[key] ? "checked" : ""}></label>`).join("") + '</div><p class="nx-gsp-note">Настройки сохраняются в аккаунте и доступны на других устройствах.</p>';
      }
    } catch (error) {
      content.innerHTML = '<p class="nx-gsp-empty">' + esc(error.message || "Не удалось загрузить раздел.") + '</p>';
    }
  }
  async function handleAction(button) {
    const id = button.dataset.user, action = button.dataset.gspAction;
    try {
      if (action === "message") {
        const result = await request("/api/social/conversations/" + encodeURIComponent(id), { method:"POST", body:"{}" });
        closePanel();
        window.switchTab?.("messages");
        window.dispatchEvent(new CustomEvent("nexora:open-conversation", { detail:{ conversationId:result.conversation?.id || result.conversationId, userId:id } }));
        toast("Диалог открыт.");
      } else if (action === "add-friend") {
        await request("/api/social/friends/" + encodeURIComponent(id), { method:"POST", body:"{}" });
        await showTab("discover"); toast("Заявка в друзья отправлена.");
      } else if (action === "block") {
        if (!confirm("Заблокировать пользователя? Он исчезнет из поиска и списка друзей.")) return;
        await request("/api/social/blocks/" + encodeURIComponent(id), { method:"POST", body:"{}" });
        await showTab("discover"); toast("Пользователь заблокирован.");
      } else if (action === "unblock") {
        await request("/api/social/blocks/" + encodeURIComponent(id), { method:"DELETE" });
        await showTab("blocks"); toast("Пользователь разблокирован.");
      } else if (action === "remove-friend") {
        if (!confirm("Удалить пользователя из друзей?")) return;
        await request("/api/social/friends/" + encodeURIComponent(id), { method:"DELETE" });
        await showTab("friends"); toast("Пользователь удалён из друзей.");
      } else if (action === "accept") {
        await request("/api/social/friends/" + encodeURIComponent(id), { method:"PATCH", body:JSON.stringify({decision:"accept"}) });
        await showTab("friends"); toast("Заявка принята.");
      }
    } catch (error) { toast(error.message || "Операция не выполнена."); }
  }
  async function updateSetting(key, value) {
    try {
      const data = await request("/api/social/preferences", { method:"PATCH", body:JSON.stringify({[key]:Boolean(value)}) });
      settings = { ...defaults, ...(data.preferences || {}) };
      toast("Настройка сохранена.");
      window.dispatchEvent(new CustomEvent("nexora:galaxy-preferences", { detail:settings }));
    } catch (error) {
      toast(error.message || "Не удалось сохранить настройку.");
      await showTab("settings");
    }
  }
  function addLauncher() {
    const world = $("#tab-world");
    if (!world || world.querySelector(".nx-galaxy-social-launcher")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nx-galaxy-social-launcher";
    button.textContent = "♙ Социальное меню";
    button.addEventListener("click", () => openPanel("friends"));
    world.append(button);
  }
  addLauncher();
  new MutationObserver(addLauncher).observe(document.body, { childList:true, subtree:true });
  window.NexoraGalaxySocial = Object.freeze({ open:openPanel, close:closePanel });
})();
