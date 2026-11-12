/* NEXORA Galaxy-inspired presentation adapter. Does not own auth, chat transport or game state. */
(() => {
  "use strict";
  const root = document.getElementById("tab-world");
  if (!root) return;
  const world = root.querySelector(".nx-world");
  if (!world) return;

  const header = world.querySelector(".nx-topbar");
  const menu = world.querySelector("#nx-menu-panel");
  const online = world.querySelector("#nx-online");
  const nav = world.querySelector(".nx-bottom-nav");
  const scene = world.querySelector(".nx-scene");
  const chatLog = world.querySelector("#nx-chat-log");
  if (!header || !menu || !online || !nav || !scene || !chatLog) return;

  // Move existing controls; their original IDs and listeners remain intact.
  const onlineWrap = document.createElement("div");
  onlineWrap.className = "nx-online-wrap";
  onlineWrap.append(online);
  header.append(onlineWrap);

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "nx-exit-button";
  exit.setAttribute("aria-label", "Выйти из игры");
  exit.title = "Выйти";
  exit.textContent = "↪";
  exit.addEventListener("click", () => document.getElementById("logout")?.click());
  header.append(exit);

  const planetTools = world.querySelector(".nx-planet-tools");
  const menuHeading = menu.querySelector(".nx-menu-heading");
  if (planetTools && menuHeading) menuHeading.after(planetTools);
  const planetButton = menu.querySelector("#nx-menu-planets");
  planetButton?.addEventListener("click", () => {
    menu.hidden = false;
    planetTools?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    world.querySelector("#nx-planet-search")?.focus();
  }, true);

  // Keep the live count from the existing presence endpoint, without a fake constant.
  const normalizeOnline = () => {
    const match = online.textContent.match(/\d+/);
    const value = match ? match[0] : "0";
    if (online.textContent !== value) online.textContent = value;
  };
  normalizeOnline();
  new MutationObserver(normalizeOnline).observe(online, { childList: true, characterData: true, subtree: true });

  // Turn existing live chat rows into compact messenger bubbles. Text remains textContent.
  function decorateMessage(row) {
    if (row.dataset.galaxyDecorated === "1") return;
    const time = row.querySelector("small");
    const name = row.querySelector("b");
    const body = Array.from(row.children).find(node => node.tagName === "SPAN");
    if (!time || !name || !body) return;
    const label = name.textContent.replace(/:\s*$/, "").trim() || "Игрок";
    const avatar = document.createElement("span");
    avatar.className = "nx-message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = Array.from(label)[0]?.toUpperCase() || "•";
    const bubble = document.createElement("div");
    bubble.className = "nx-message-bubble";
    const meta = document.createElement("div");
    meta.className = "nx-message-meta";
    const text = document.createElement("div");
    text.className = "nx-message-text";
    text.textContent = body.textContent;
    name.textContent = label;
    meta.append(name, time);
    bubble.append(meta, text);
    row.replaceChildren(avatar, bubble);
    row.dataset.galaxyDecorated = "1";
  }
  Array.from(chatLog.children).forEach(decorateMessage);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1 && node.matches(".nx-chat-line")) decorateMessage(node);
  }))).observe(chatLog, { childList: true });

  // Add small rooftop props behind the existing player sprites.
  [["nx-roof-plant", "plant"], ["nx-roof-chair", "chair"]].forEach(([className, kind]) => {
    if (scene.querySelector("." + className)) return;
    const prop = document.createElement("div");
    prop.className = "nx-roof-prop " + className;
    prop.setAttribute("aria-hidden", "true");
    prop.dataset.prop = kind;
    scene.append(prop);
  });

  // Replace the old six-item footer with the requested compact game controls.
  nav.innerHTML = [
    '<button type="button" data-galaxy-actions aria-label="Действия персонажа" title="Действия"><span>✋</span></button>',
    '<button type="button" data-galaxy-character aria-label="Персонаж" title="Персонаж"><span>‹</span></button>',
    '<div class="nx-character-title" data-galaxy-name>Персонаж</div>',
    '<button type="button" data-galaxy-planets aria-label="Планеты" title="Планеты"><span>🚀</span></button>'
  ].join("");

  nav.querySelector("[data-galaxy-actions]").addEventListener("click", () => {
    scene.classList.toggle("nx-actions-open");
  });
  nav.querySelector("[data-galaxy-character]").addEventListener("click", () => {
    if (typeof window.switchTab === "function") window.switchTab("characters");
  });
  nav.querySelector("[data-galaxy-planets]").addEventListener("click", () => {
    menu.hidden = false;
    planetTools?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    world.querySelector("#nx-planet-search")?.focus();
  });

  const updateCharacterName = () => {
    const own = scene.querySelector(".nx-avatar-card.me .nx-avatar-name");
    const target = nav.querySelector("[data-galaxy-name]");
    if (own && target) target.textContent = own.textContent.replace(/^♛\s*/, "").trim() || "Персонаж";
  };
  updateCharacterName();
  new MutationObserver(updateCharacterName).observe(scene, { childList: true, subtree: true, characterData: true });

  // The existing world module continues to own sending, history, presence and reconnects.
  root.classList.add("nx-galaxy-mobile-ui");
})();