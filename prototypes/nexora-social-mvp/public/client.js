(() => {
  const socket = io({ autoConnect: false });
  const $ = (selector) => document.querySelector(selector);
  const loginScreen = $("#login-screen");
  const gameScreen = $("#game-screen");
  const previewCanvas = $("#preview-canvas");
  const previewCtx = previewCanvas.getContext("2d");
  const canvas = $("#world-canvas");
  const ctx = canvas.getContext("2d");
  const nicknameInput = $("#nickname");
  const loginError = $("#login-error");

  const PLANETS = {
    starter: { name: "Стартовая", sky: ["#10183d", "#24245c"], ground: "#493b83", glow: "#8e82ff" },
    club: { name: "Клуб", sky: ["#241039", "#64285d"], ground: "#713a79", glow: "#ff7bc7" },
    beach: { name: "Пляж", sky: ["#06344e", "#167b91"], ground: "#b47a54", glow: "#74e5df" }
  };
  const skins = ["#f4c7a1", "#c9875b", "#75452f"];
  const suits = ["#6d7cff", "#ef6c9b", "#35bca5"];
  const state = {
    me: null, players: new Map(), planet: "starter", selected: null,
    stars: [], chat: [], width: 0, height: 0, dpr: 1, toastTimer: null
  };

  function avatarSettings() {
    return {
      gender: $("#gender").value,
      skin: $("#skin").value,
      hair: $("#hair").value,
      suit: $("#suit").value
    };
  }

  function drawAvatar(target, x, y, scale, avatar, facing = 1, emotion = null) {
    target.save();
    target.translate(x, y);
    target.scale(scale * facing, scale);
    const skin = avatar?.skin || skins[0];
    const suit = avatar?.suit || suits[0];
    const female = avatar?.gender === "female";
    const hair = avatar?.hair || "short";

    target.fillStyle = "#080b20";
    target.beginPath(); target.ellipse(0, 39, 18, 5, 0, 0, Math.PI * 2); target.fill();

    target.fillStyle = "#202a54";
    target.fillRect(-10, 21, 7, 17);
    target.fillRect(3, 21, 7, 17);
    target.fillStyle = "#e7eaff";
    target.fillRect(-11, 36, 9, 4);
    target.fillRect(3, 36, 9, 4);

    target.fillStyle = suit;
    target.beginPath();
    if (female) {
      target.moveTo(-12, -1); target.lineTo(12, -1); target.lineTo(17, 22); target.lineTo(-17, 22);
    } else {
      target.roundRect(-14, -2, 28, 25, 6);
    }
    target.closePath(); target.fill();

    target.strokeStyle = skin; target.lineWidth = 6; target.lineCap = "round";
    target.beginPath(); target.moveTo(-12, 2); target.lineTo(-18, 17); target.moveTo(12, 2); target.lineTo(18, 16); target.stroke();

    target.fillStyle = skin;
    target.beginPath(); target.arc(0, -14, 13, 0, Math.PI * 2); target.fill();

    target.fillStyle = "#39233a";
    if (hair === "long") {
      target.beginPath(); target.arc(0, -17, 14, Math.PI, Math.PI * 2); target.lineTo(14, 10); target.lineTo(9, 5); target.lineTo(9, -9); target.lineTo(-9, -9); target.lineTo(-9, 7); target.lineTo(-14, 10); target.closePath(); target.fill();
    } else if (hair === "spiky") {
      target.beginPath(); target.moveTo(-13,-16); target.lineTo(-14,-27); target.lineTo(-5,-22); target.lineTo(0,-31); target.lineTo(5,-22); target.lineTo(14,-27); target.lineTo(13,-12); target.closePath(); target.fill();
    } else {
      target.beginPath(); target.arc(0, -17, 14, Math.PI, Math.PI * 2); target.lineTo(13, -11); target.lineTo(-13, -11); target.closePath(); target.fill();
    }
    target.fillStyle = "#25203b";
    target.beginPath(); target.arc(-4, -14, 1.3, 0, Math.PI * 2); target.arc(4, -14, 1.3, 0, Math.PI * 2); target.fill();
    target.strokeStyle = "#8b4d50"; target.lineWidth = 1.2;
    target.beginPath(); target.arc(0, -10, 3, .2, Math.PI - .2); target.stroke();

    if (emotion === "wave") {
      target.strokeStyle = skin; target.lineWidth = 5; target.beginPath(); target.moveTo(14, 0); target.lineTo(19, -15); target.stroke();
    }
    if (emotion === "kiss") {
      target.fillStyle = "#ff8bb9"; target.font = "18px sans-serif"; target.fillText("♥", 14, -25);
    }
    if (emotion === "dance") {
      target.strokeStyle = "#f9d77b"; target.lineWidth = 3; target.beginPath(); target.moveTo(-17, 3); target.lineTo(-24, -9); target.moveTo(15, 3); target.lineTo(23, -8); target.stroke();
    }
    target.restore();
  }

  function preview() {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawAvatar(previewCtx, 90, 130, 2.5, avatarSettings(), 1, null);
  }
  ["gender", "skin", "hair", "suit"].forEach((id) => $("#" + id).addEventListener("change", preview));
  preview();

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  function addHistory(message, whisper = false) {
    state.chat.push({ ...message, whisper });
    if (state.chat.length > 50) state.chat.shift();
    renderHistory();
  }

  function renderHistory() {
    const container = $("#chat-history");
    container.replaceChildren();
    state.chat.forEach((message) => {
      const row = document.createElement("div");
      row.className = "history-message";
      const name = document.createElement("strong");
      name.textContent = message.whisper ? "Шёпот" : message.nickname;
      const text = document.createElement("span");
      text.textContent = message.text;
      const time = document.createElement("time");
      time.textContent = new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      row.append(name, text, time);
      container.append(row);
    });
    container.scrollTop = container.scrollHeight;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.stars = Array.from({ length: Math.max(45, Math.floor(rect.width * rect.height / 6500)) }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height * .72,
      r: Math.random() * 1.5 + .3,
      a: Math.random() * .65 + .2
    }));
  }
  window.addEventListener("resize", resize);

  function surfaceY(x) {
    const w = state.width;
    const h = state.height;
    const normalized = (x / w - .5) * 2;
    return h * .82 - (1 - normalized * normalized) * h * .16;
  }

  function drawScene() {
    if (gameScreen.classList.contains("hidden")) return;
    const w = state.width, h = state.height;
    const palette = PLANETS[state.planet];
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, palette.sky[0]);
    gradient.addColorStop(1, palette.sky[1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);

    state.stars.forEach((star, index) => {
      ctx.globalAlpha = star.a * (.75 + Math.sin(Date.now() / 900 + index) * .2);
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;

    const glow = ctx.createRadialGradient(w / 2, h * .8, 8, w / 2, h * .8, w * .7);
    glow.addColorStop(0, palette.glow + "44");
    glow.addColorStop(1, palette.glow + "00");
    ctx.fillStyle = glow; ctx.fillRect(0, h * .45, w, h * .55);

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) ctx.lineTo(x, surfaceY(x));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = palette.ground; ctx.fill();
    ctx.strokeStyle = palette.glow; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      if (x === 0) ctx.moveTo(x, surfaceY(x)); else ctx.lineTo(x, surfaceY(x));
    }
    ctx.stroke();

    const ordered = [...state.players.values()].sort((a, b) => a.x - b.x);
    ordered.forEach((player) => {
      const x = player.x * w;
      const baseY = surfaceY(x);
      const isMe = player.id === state.me?.id;
      const render = player.renderX ?? player.x;
      player.renderX = render + (player.x - render) * .18;
      const drawX = player.renderX * w;
      const y = surfaceY(drawX) - 5;
      const moveOffset = player.moving ? Math.sin(Date.now() / 80) * 2 : 0;
      const emotion = player.emotion?.until > Date.now() ? player.emotion.type : null;

      if (player.bubble?.until > Date.now()) {
        const bubbleText = player.bubble.text;
        ctx.font = "11px sans-serif";
        const bubbleWidth = Math.min(w - 24, Math.max(70, ctx.measureText(bubbleText).width + 20));
        const bubbleX = Math.max(8, Math.min(w - bubbleWidth - 8, drawX - bubbleWidth / 2));
        const bubbleY = y - 93;
        ctx.fillStyle = "rgba(255,255,255,.94)";
        roundRect(ctx, bubbleX, bubbleY, bubbleWidth, 27, 10); ctx.fill();
        ctx.fillStyle = "#1a2146"; ctx.textAlign = "center";
        ctx.fillText(bubbleText, bubbleX + bubbleWidth / 2, bubbleY + 17, bubbleWidth - 12);
        ctx.textAlign = "start";
      }

      drawAvatar(ctx, drawX, y + moveOffset, .95, player.avatar, player.facing || 1, emotion);
      ctx.textAlign = "center";
      ctx.font = isMe ? "bold 11px sans-serif" : "10px sans-serif";
      ctx.fillStyle = isMe ? "#fff1a8" : "#ffffff";
      ctx.shadowColor = "#080b20"; ctx.shadowBlur = 5;
      ctx.fillText(player.nickname, drawX, baseY + 13);
      ctx.shadowBlur = 0;
      ctx.font = "9px sans-serif"; ctx.fillStyle = "#d4d8ff";
      ctx.fillText(player.title || "Новичок", drawX, baseY + 25);
      ctx.textAlign = "start";
    });
    requestAnimationFrame(drawScene);
  }

  function roundRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  async function enterWorld() {
    loginError.textContent = "";
    const meResponse = await fetch("/api/me");
    if (!meResponse.ok) {
      loginError.textContent = "Сначала создай аккаунт или войди по коду восстановления.";
      return;
    }
    socket.connect();
    socket.once("connect", () => {
      socket.emit("player:join", {}, (result) => {
        if (!result?.ok) {
          loginError.textContent = result?.error || "Не удалось загрузить персонажа.";
          return;
        }
        state.me = result.player;
        state.planet = result.player.planet;
        loginScreen.classList.add("hidden");
        gameScreen.classList.remove("hidden");
        $("#planet-title").textContent = PLANETS[state.planet].name;
        resize();
        requestAnimationFrame(drawScene);
        refreshSocial();
        refreshDeveloperAccess();
      });
    });
    socket.once("connect_error", () => {
      loginError.textContent = "Не удалось подключиться. Проверь авторизацию и сервер.";
    });
  }

  async function submitAuth(endpoint) {
    loginError.textContent = "";
    $("#recovery-result").classList.add("hidden");
    const registering = endpoint.endsWith("/register");
    const payload = registering
      ? { nickname: nicknameInput.value.trim(), avatar: avatarSettings() }
      : { recoveryCode: $("#recovery-code").value.trim() };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка авторизации.");
      if (data.recoveryCode) {
        const box = $("#recovery-result");
        box.textContent = "АККАУНТ СОЗДАН. ТВОЙ КОД: " + data.recoveryCode + ". Сохрани его, затем введи этот код в поле выше и нажми «Войти». В комнату ты попадёшь только после проверки кода.";
        box.classList.remove("hidden");
        $("#recovery-code").value = "";
        $("#register-mode").classList.add("hidden");
        $("#login-mode").classList.remove("hidden");
        $("#recovery-code").focus();
        return;
      }
      await enterWorld();
    } catch (error) {
      loginError.textContent = error.message || "Не удалось выполнить запрос.";
    }
  }
  $("#register-button").addEventListener("click", () => submitAuth("/api/auth/register"));
  $("#login-button").addEventListener("click", () => submitAuth("/api/auth/login"));
  $("#show-register").addEventListener("click", () => {
    $("#login-mode").classList.add("hidden");
    $("#register-mode").classList.remove("hidden");
    $("#recovery-result").classList.add("hidden");
    loginError.textContent = "";
    nicknameInput.focus();
  });
  $("#show-login").addEventListener("click", () => {
    $("#register-mode").classList.add("hidden");
    $("#login-mode").classList.remove("hidden");
    loginError.textContent = "";
    $("#recovery-code").focus();
  });

  socket.on("planet:state", (data) => {
    state.planet = data.planet;
    state.players.clear();
    data.players.forEach((player) => state.players.set(player.id, { ...player, renderX: player.x }));
    state.chat = data.history || [];
    renderHistory();
    $("#planet-title").textContent = PLANETS[state.planet].name;
    updateOnline();
  });
  socket.on("player:joined", (player) => {
    state.players.set(player.id, { ...player, renderX: player.x });
    updateOnline();
  });
  socket.on("player:left", ({ id }) => {
    state.players.delete(id);
    updateOnline();
    if (state.selected === id) closeProfile();
  });
  socket.on("player:moved", ({ id, x }) => {
    const player = state.players.get(id);
    if (!player) return;
    player.facing = x >= player.x ? 1 : -1;
    player.x = x;
    player.moving = true;
    clearTimeout(player.moveTimer);
    player.moveTimer = setTimeout(() => { player.moving = false; }, 400);
  });
  socket.on("player:bubble", ({ id, bubble }) => {
    const player = state.players.get(id);
    if (player) player.bubble = bubble;
  });
  socket.on("chat:message", (message) => addHistory(message));
  socket.on("emotion:played", ({ id, emotion }) => {
    const player = state.players.get(id);
    if (player) {
      player.emotion = { type: emotion, until: Date.now() + 1800 };
      player.moving = true;
      setTimeout(() => { if (player) player.moving = false; }, 900);
    }
  });
  socket.on("whisper:received", (message) => {
    addHistory({ nickname: "От " + message.from, text: message.text, time: message.time }, true);
    showToast("💌 Шёпот от " + message.from + ": " + message.text);
  });
  socket.on("whisper:sent", ({ to }) => showToast("Шёпот отправлен игроку " + to));
  socket.on("gift:received", (event) => {
    const el = document.createElement("span");
    el.className = "gift-fly";
    el.textContent = event.icon;
    el.style.setProperty("--dx", (Math.random() * 100 - 50) + "px");
    $("#gift-layer").append(el);
    setTimeout(() => el.remove(), 1300);
    if (event.toId === state.me?.id) {
      const me = state.players.get(state.me?.id);
      if (me) me.authority += event.authorityAdded;
      showToast(event.icon + " " + event.from + " подарил вам подарок! +" + event.authorityAdded + " авторитета");
    } else {
      showToast(event.from + " подарил " + event.icon + " игроку " + event.to);
    }
  });
  socket.on("profile:updated", (player) => {
    const previous = state.players.get(player.id);
    state.players.set(player.id, { ...previous, ...player, renderX: previous?.renderX ?? player.x });
    if (String(player.id) === String(state.me?.id)) state.me = { ...state.me, ...player };
  });
  socket.on("friend:result", ({ nickname, already }) => showToast(already ? nickname + " уже в друзьях" : nickname + " добавлен в друзья"));
  socket.on("friend:notice", ({ nickname }) => showToast(nickname + " добавил вас в друзья"));

  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null, nearestDistance = Infinity;
    for (const player of state.players.values()) {
      if (player.id === state.me?.id) continue;
      const px = player.x * state.width;
      const py = surfaceY(px) - 24;
      const distance = Math.hypot(px - x, py - y);
      if (distance < 34 && distance < nearestDistance) {
        nearest = player; nearestDistance = distance;
      }
    }
    if (nearest) {
      openProfile(nearest);
      return;
    }
    if (y > state.height * .48) {
      const targetX = Math.max(.04, Math.min(.96, x / state.width));
      const me = state.players.get(state.me?.id);
      if (me) {
        me.facing = targetX >= me.x ? 1 : -1;
        me.x = targetX;
        me.moving = true;
        clearTimeout(me.moveTimer);
        me.moveTimer = setTimeout(() => { me.moving = false; }, 450);
      }
      socket.emit("player:move", { x: targetX });
    } else {
      closeProfile();
    }
  });

  function updateOnline() { $("#online-count").textContent = String(state.players.size); }

  function openProfile(player) {
    state.selected = player.id;
    $("#profile-name").textContent = player.nickname;
    $("#profile-rank").textContent = (player.title || "Новичок") + " · Авторитет " + player.authority;
    $("#profile-menu").classList.remove("hidden");
    $("#gift-options").classList.add("hidden");
  }
  function closeProfile() {
    state.selected = null;
    $("#profile-menu").classList.add("hidden");
  }
  $("#close-profile").addEventListener("click", closeProfile);
  $("#gift-button").addEventListener("click", () => $("#gift-options").classList.toggle("hidden"));
  $("#dm-open-button").addEventListener("click", async () => {
    const peerId = state.selected;
    if (!peerId) return;
    try {
      const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId }) });
      closeProfile();
      openSocialTab("messages");
      await loadConversations();
      await openConversation(result.conversationId);
    } catch (error) { showToast(error.message); }
  });
  $("#whisper-button").addEventListener("click", () => {
    const text = prompt("Текст приватного сообщения:");
    if (text?.trim()) socket.emit("whisper:send", { targetId: state.selected, text }, (result) => {
      if (!result?.ok) showToast(result?.error || "Не удалось отправить.");
    });
    closeProfile();
  });
  $("#friend-button").addEventListener("click", async () => {
    if (!state.selected) return closeProfile();
    try {
      const result = await socialApi("/requests", { method: "POST", body: JSON.stringify({ targetId: state.selected }) });
      showToast("Заявка отправлена игроку " + result.nickname);
    } catch (error) { showToast(error.message); }
    closeProfile();
  });
  document.querySelectorAll("[data-gift]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.selected) socket.emit("gift:send", { targetId: state.selected, gift: button.dataset.gift }, (result) => {
        if (!result?.ok) showToast(result?.error || "Не удалось отправить подарок.");
        else showToast("Подарок отправлен!");
      });
      closeProfile();
    });
  });

  document.querySelectorAll("[data-emotion]").forEach((button) => {
    button.addEventListener("click", () => socket.emit("emotion:play", { emotion: button.dataset.emotion }));
  });
  $("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    socket.emit("chat:send", { text }, (result) => {
      if (!result?.ok) showToast(result?.error || "Сообщение не отправлено.");
    });
    input.value = "";
  });

  $("#exit-room").addEventListener("click", async () => {
    const button = $("#exit-room");
    button.disabled = true;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      socket.disconnect();
      state.me = null;
      state.players.clear();
      state.selected = null;
      state.chat = [];
      $("#planet-picker").classList.add("hidden");
      $("#chat-drawer").classList.add("hidden");
      $("#profile-menu").classList.add("hidden");
      $("#gift-options").classList.add("hidden");
      $("#recovery-result").classList.add("hidden");
      loginError.textContent = "";
      gameScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      button.disabled = false;
    }
  });

  $("#planets-button").addEventListener("click", () => $("#planet-picker").classList.toggle("hidden"));
  $("#planet-picker").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      socket.emit("planet:change", { planet: button.dataset.planet }, (result) => {
        if (!result?.ok) showToast(result?.error || "Не удалось сменить планету.");
        else $("#planet-picker").classList.add("hidden");
      });
    });
  });
  $("#history-button").addEventListener("click", () => $("#chat-drawer").classList.toggle("hidden"));
  $("#close-history").addEventListener("click", () => $("#chat-drawer").classList.add("hidden"));

  socket.on("connect_error", () => {
    if (!gameScreen.classList.contains("hidden")) showToast("Потеряно соединение с сервером.");
  });
  socket.on("disconnect", () => {
    if (!gameScreen.classList.contains("hidden")) showToast("Соединение прервано. Перезагрузите страницу для входа снова.");
  });



  const profileCanvas = $("#profile-preview");
  const profileCtx = profileCanvas.getContext("2d");
  function editorAvatarSettings() {
    return {
      gender: $("#edit-gender").value,
      skin: $("#edit-skin").value,
      hair: $("#edit-hair").value,
      suit: $("#edit-suit").value
    };
  }
  function drawProfilePreview() {
    profileCtx.clearRect(0, 0, profileCanvas.width, profileCanvas.height);
    drawAvatar(profileCtx, 90, 96, 1.8, editorAvatarSettings(), 1, null);
  }
  ["edit-gender", "edit-skin", "edit-hair", "edit-suit"].forEach(id => $("#" + id).addEventListener("change", drawProfilePreview));

  async function openMyProfile() {
    const panel = $("#profile-editor");
    const save = $("#profile-save");
    const errorBox = $("#profile-editor-error");
    errorBox.textContent = "";
    panel.classList.remove("hidden");
    save.disabled = true;
    try {
      const response = await fetch("/api/profile", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить профиль.");
      const p = data.profile;
      $("#profile-editor-nickname").textContent = p.nickname;
      $("#profile-editor-meta").textContent = "Уровень " + p.level + " · " + p.experience + " XP";
      $("#profile-editor-created").textContent = "В NEXORA с " + new Date(p.createdAt).toLocaleDateString("ru-RU");
      $("#profile-friends-count").textContent = p.friendsCount;
      $("#profile-gifts-count").textContent = p.giftsReceived;
      $("#profile-authority").textContent = p.authority;
      $("#profile-koins").textContent = p.koins;
      $("#profile-nickname-display").textContent = p.nickname;
      $("#profile-status").value = p.status || "";
      $("#profile-bio").value = p.bio || "";
      const avatar = p.avatar || {};
      $("#edit-gender").value = avatar.gender || "male";
      $("#edit-skin").value = avatar.skin || skins[0];
      $("#edit-hair").value = avatar.hair || "short";
      $("#edit-suit").value = avatar.suit || suits[0];
      drawProfilePreview();
      save.disabled = false;
    } catch (error) {
      errorBox.textContent = error.message;
      save.disabled = true;
    }
  }
  $("#my-profile").addEventListener("click", openMyProfile);
  $("#profile-editor-close").addEventListener("click", () => $("#profile-editor").classList.add("hidden"));
  $("#profile-save").addEventListener("click", async () => {
    const button = $("#profile-save");
    const errorBox = $("#profile-editor-error");
    button.disabled = true;
    errorBox.textContent = "";
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: $("#profile-status").value,
          bio: $("#profile-bio").value,
          avatar: editorAvatarSettings()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить профиль.");
      $("#profile-editor-nickname").textContent = data.profile.nickname;
      showToast("Профиль сохранён.");
      $("#profile-editor").classList.add("hidden");
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });


  let developerTab = "overview";
  let developerPermissions = [];
  async function developerRequest(path) {
    const response = await fetch("/api/developer" + path, { credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Нет доступа к панели.");
    return data;
  }
  async function refreshDeveloperAccess() {
    try {
      const data = await developerRequest("/access");
      developerPermissions = data.permissions || [];
      $("#developer-open").classList.toggle("hidden", !data.allowed);
      $("#developer-roles-tab").classList.toggle("hidden", !developerPermissions.includes("roles.manage"));
    } catch (_error) { $("#developer-open").classList.add("hidden"); }
  }
  function developerRender(title, rows) {
    const content = $("#developer-content");
    content.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    content.append(heading);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "developer-muted";
      empty.textContent = "Пока нет данных.";
      content.append(empty);
      return;
    }
    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "developer-row";
      const label = document.createElement("strong");
      label.textContent = String(row.title || "Событие");
      const detail = document.createElement("span");
      detail.textContent = String(row.detail || "");
      item.append(label, detail);
      content.append(item);
    });
  }
  async function loadDeveloperTab(tab = developerTab) {
    developerTab = tab;
    document.querySelectorAll("[data-developer-tab]").forEach((button) => button.classList.toggle("active", button.dataset.developerTab === tab));
    const content = $("#developer-content");
    content.textContent = "Загрузка…";
    try {
      if (tab === "overview") {
        const d = await developerRequest("/overview");
        developerRender("Состояние NEXORA", [
          { title: "Статус сервера", detail: d.server }, { title: "Игроки онлайн", detail: d.onlinePlayers },
          { title: "Аккаунты", detail: d.accounts }, { title: "Персонажи", detail: d.characters },
          { title: "Активные комнаты", detail: d.activeRooms }, { title: "База данных", detail: d.database }
        ]);
      } else if (tab === "players") {
        const d = await developerRequest("/players");
        content.replaceChildren();
        const heading = document.createElement("h3"); heading.textContent = "Управление игроками"; content.append(heading);
        const search = document.createElement("input"); search.type = "search"; search.maxLength = 18; search.placeholder = "Поиск по ID или никнейму"; content.append(search);
        const list = document.createElement("div"); content.append(list);
        const renderPlayers = rows => {
          list.replaceChildren();
          rows.forEach(p => {
            const row = document.createElement("div"); row.className = "developer-row";
            const label = document.createElement("strong"); label.textContent = p.nickname + " · ID " + p.id + (p.banned ? " · ЗАБЛОКИРОВАН" : "");
            const detail = document.createElement("span"); detail.textContent = (p.online ? "В сети" : "Не в сети") + " · " + p.planet + " · Koins: " + p.balance;
            row.append(label, detail);
            const warn = document.createElement("button"); warn.type = "button"; warn.textContent = "Предупредить";
            warn.addEventListener("click", async () => { const reason = prompt("Причина предупреждения"); if (!reason) return; try { await developerRequest("/players/"+p.id+"/warn",{method:"POST",body:JSON.stringify({reason})}); showToast("Предупреждение выдано."); } catch(error){showToast(error.message);} });
            row.append(warn);
            const ban = document.createElement("button"); ban.type = "button"; ban.textContent = p.banned ? "Разблокировать" : "Заблокировать";
            ban.addEventListener("click", async () => {
              const reason = prompt(p.banned ? "Причина разблокировки" : "Причина блокировки"); if (!reason) return;
              try {
                if (p.banned) await developerRequest("/players/"+p.id+"/ban",{method:"DELETE",body:JSON.stringify({reason})});
                else { const duration = prompt("Срок в часах. Оставь пустым для постоянной блокировки.","24"); if (duration===null) return; await developerRequest("/players/"+p.id+"/ban",{method:"POST",body:JSON.stringify({reason,hours:duration===""?null:Number(duration)})}); }
                showToast("Действие модерации выполнено."); loadDeveloperTab("players");
              } catch(error){showToast(error.message);}
            });
            row.append(ban); list.append(row);
          });
        };
        renderPlayers(d.players);
        let searchTimer;
        search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer=setTimeout(async()=>{try{const result=await developerRequest("/players?q="+encodeURIComponent(search.value));renderPlayers(result.players);}catch(error){showToast(error.message);}},250);});
      } else if (tab === "moderation") {
        const d = await developerRequest("/moderation");
        developerRender("История модерации", d.entries.map(e => ({title: e.action_type + " · " + e.target_nickname + " · ID " + e.target_account_id, detail: e.reason + " · " + e.actor_nickname + " · " + new Date(e.created_at).toLocaleString("ru-RU") + (e.expires_at ? " · до " + new Date(e.expires_at).toLocaleString("ru-RU") : "") + (e.revoked_at ? " · отменено" : "")})));
      } else if (tab === "world") {
        const d = await developerRequest("/world");
        developerRender("Планеты и комнаты", d.world.map(p => ({ title: p.title, detail: p.online + " онлайн · " + p.rooms + " комнат" })));
      } else if (tab === "roles") {
        if (!developerPermissions.includes("roles.manage")) throw new Error("Недостаточно прав.");
        const d = await developerRequest("/roles");
        content.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = "Управление ролями";
        content.append(heading);
        const form = document.createElement("form");
        form.className = "developer-role-form";
        const account = document.createElement("input");
        account.type = "number"; account.min = "1"; account.required = true; account.placeholder = "ID аккаунта";
        const role = document.createElement("select");
        ["DEVELOPER","ADMIN","MODERATOR","HELPER","USER"].forEach(value => {
          const option = document.createElement("option"); option.value = value; option.textContent = value; role.append(option);
        });
        const reason = document.createElement("input");
        reason.maxLength = 500; reason.placeholder = "Причина назначения";
        const permissionWrap = document.createElement("div");
        permissionWrap.className = "developer-permission-grid";
        const available = ["players.view","players.ban","players.unban","players.warn","moderation.view","world.view","world.manage","economy.view","economy.manage","items.view","items.manage","system.view","logs.view"];
        available.forEach(value => {
          const label = document.createElement("label");
          const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = value;
          label.append(checkbox, document.createTextNode(value)); permissionWrap.append(label);
        });
        const submit = document.createElement("button");
        submit.type = "submit"; submit.textContent = "Сохранить роль";
        form.append(account, role, reason, permissionWrap, submit);
        form.addEventListener("submit", async event => {
          event.preventDefault(); submit.disabled = true;
          try {
            const permissions = [...permissionWrap.querySelectorAll("input:checked")].map(input => input.value);
            const response = await fetch("/api/developer/roles", {
              method: "POST", credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountId: account.value, role: role.value, reason: reason.value, permissions })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || "Не удалось изменить роль.");
            showToast("Роль игрока обновлена.");
            loadDeveloperTab("roles");
          } catch (error) { showToast(error.message); }
          finally { submit.disabled = false; }
        });
        content.append(form);
        const listTitle = document.createElement("h3"); listTitle.textContent = "Назначенные роли"; content.append(listTitle);
        d.assignments.forEach(assignment => {
          const row = document.createElement("div"); row.className = "developer-row";
          const name = document.createElement("strong"); name.textContent = assignment.nickname + " · ID " + assignment.id;
          const detail = document.createElement("span"); detail.textContent = assignment.role + " · " + (assignment.permissions || []).join(", ");
          row.append(name, detail); content.append(row);
        });
      } else if (tab === "audit") {
        const d = await developerRequest("/audit");
        developerRender("Последние действия", d.entries.map(e => ({ title: e.action, detail: e.actorNickname + " · " + e.createdAt + (e.reason ? " · " + e.reason : "") })));
      }
    } catch (error) { content.textContent = error.message; }
  }
  $("#developer-open").addEventListener("click", () => {
    $("#developer-panel").classList.remove("hidden");
    $("#profile-editor").classList.add("hidden");
    loadDeveloperTab("overview");
  });
  $("#developer-close").addEventListener("click", () => $("#developer-panel").classList.add("hidden"));
  document.querySelectorAll("[data-developer-tab]").forEach(button => button.addEventListener("click", () => loadDeveloperTab(button.dataset.developerTab)));

  let activeConversationId = null;
  let socialUnread = 0;

  async function socialApi(path, options = {}) {
    const response = await fetch("/api/social" + path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Ошибка социального раздела.");
    return data;
  }
  function makeSocialRow(title, subtitle, actions = []) {
    const row = document.createElement("div");
    row.className = "social-row";
    const label = document.createElement("div");
    label.className = "social-name";
    label.textContent = title;
    if (subtitle) {
      const small = document.createElement("small");
      small.textContent = subtitle;
      label.append(small);
    }
    row.append(label);
    actions.forEach(({ text, run }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.addEventListener("click", run);
      row.append(button);
    });
    return row;
  }
  function emptySocial(container, text) {
    const p = document.createElement("p");
    p.className = "social-empty";
    p.textContent = text;
    container.replaceChildren(p);
  }
  async function refreshSocial() {
    try {
      await Promise.all([loadFriends(), loadNotifications()]);
      await loadConversations();
    } catch (error) { console.warn("Social refresh:", error.message); }
  }
  async function loadFriends() {
    const [friends, requests] = await Promise.all([
      socialApi("/friends"), socialApi("/requests")
    ]);
    const friendsBox = $("#social-friends");
    friendsBox.replaceChildren();
    if (!friends.friends.length) emptySocial(friendsBox, "Пока нет друзей.");
    friends.friends.forEach(friend => {
      friendsBox.append(makeSocialRow(friend.nickname, (friend.online ? "В сети" : "Не в сети") + (friend.planet ? " · " + friend.planet : "") + (friend.profile_status ? " · " + friend.profile_status : ""), [
        { text: "Написать", run: async () => {
          try {
            const result = await socialApi("/conversations", { method: "POST", body: JSON.stringify({ peerId: friend.id }) });
            openSocialTab("messages"); await loadConversations(); await openConversation(result.conversationId);
          } catch (error) { showToast(error.message); }
        }},
        { text: "Удалить", run: async () => {
          try { await socialApi("/friends/" + friend.id, { method: "DELETE" }); await loadFriends(); showToast("Друг удалён."); }
          catch (error) { showToast(error.message); }
        }}
      ]));
    });
    const outgoingBox = $("#social-outgoing");
    outgoingBox.replaceChildren();
    if (!requests.outgoing.length) emptySocial(outgoingBox, "Нет отправленных заявок.");
    requests.outgoing.forEach(request => outgoingBox.append(makeSocialRow(request.nickname, "Ожидает ответа", [
      { text: "Отменить", run: async () => {
        try { await socialApi("/requests/" + request.id, { method: "DELETE" }); await loadFriends(); }
        catch (error) { showToast(error.message); }
      }}
    ])));
    const requestBox = $("#social-requests");
    requestBox.replaceChildren();
    if (!requests.incoming.length) emptySocial(requestBox, "Новых заявок нет.");
    requests.incoming.forEach(request => {
      requestBox.append(makeSocialRow(request.nickname, "Хочет добавить вас в друзья", [
        { text: "Принять", run: async () => {
          try { await socialApi("/requests/" + request.id + "/accept", { method: "POST" }); await loadFriends(); showToast("Теперь вы друзья."); }
          catch (error) { showToast(error.message); }
        }},
        { text: "Отклонить", run: async () => {
          try { await socialApi("/requests/" + request.id + "/decline", { method: "POST" }); await loadFriends(); }
          catch (error) { showToast(error.message); }
        }}
      ]));
    });
  }
  async function searchSocialUsers(query) {
    const box = $("#social-search-results");
    if (query.trim().length < 2) { box.replaceChildren(); return; }
    try {
      const result = await socialApi("/users?q=" + encodeURIComponent(query.trim()));
      box.replaceChildren();
      if (!result.users.length) return emptySocial(box, "Игроки не найдены.");
      result.users.forEach(user => box.append(makeSocialRow(user.nickname, "Игрок NEXORA", [
        { text: "Добавить", run: async () => {
          try {
            await socialApi("/requests", { method: "POST", body: JSON.stringify({ targetId: user.id }) });
            showToast("Заявка отправлена: " + user.nickname);
            await loadFriends();
          } catch (error) { showToast(error.message); }
        }}
      ])));
    } catch (error) { showToast(error.message); }
  }
  async function loadConversations() {
    const result = await socialApi("/conversations");
    const box = $("#social-conversations");
    box.replaceChildren();
    if (!result.conversations.length) emptySocial(box, "Личных переписок пока нет. Добавьте друга.");
    result.conversations.forEach(item => {
      const subtitle = (item.last_message || "Начните общение") + (Number(item.unread_count) ? " · Новых: " + item.unread_count : "");
      box.append(makeSocialRow(item.nickname, subtitle, [
        { text: "Открыть", run: () => openConversation(item.id) }
      ]));
    });
  }
  async function openConversation(id) {
    activeConversationId = String(id);
    const result = await socialApi("/conversations/" + encodeURIComponent(id) + "/messages");
    const thread = $("#social-thread");
    thread.replaceChildren();
    if (!result.messages.length) emptySocial(thread, "Напишите первое сообщение.");
    result.messages.forEach(message => {
      const row = document.createElement("div");
      row.className = "social-message";
      const author = document.createElement("strong");
      author.textContent = message.nickname + ":";
      const body = document.createElement("span");
      body.textContent = message.body;
      const time = document.createElement("time");
      time.textContent = new Date(message.created_at).toLocaleString();
      row.append(author, body, time);
      thread.append(row);
    });
    thread.scrollTop = thread.scrollHeight;
    await loadConversations();
  }
  async function loadNotifications() {
    const result = await socialApi("/notifications");
    const box = $("#social-notifications");
    box.replaceChildren();
    const unread = result.notifications.filter(item => !item.read_at).length;
    $("#notification-count").textContent = unread ? String(unread) : "";
    if (!result.notifications.length) emptySocial(box, "Уведомлений пока нет.");
    result.notifications.forEach(item => {
      const title = item.type === "friend_request" ? "Новая заявка в друзья" :
        item.type === "friend_accepted" ? "Заявка принята" :
        item.type === "direct_message" ? "Новое личное сообщение" : "Уведомление";
      const actor = item.actor_nickname ? "От: " + item.actor_nickname : "";
      box.append(makeSocialRow(title, actor + (item.read_at ? "" : " · Новое")));
    });
  }
  function openSocialTab(tab) {
    $("#social-panel").classList.remove("hidden");
    const labels = { friends: "Друзья", messages: "Сообщения", notifications: "Уведомления" };
    $("#social-title").textContent = labels[tab] || "Социальное";
    document.querySelectorAll("[data-social-tab]").forEach(button => button.classList.toggle("active", button.dataset.socialTab === tab));
    $("#social-friends-view").classList.toggle("hidden", tab !== "friends");
    $("#social-messages-view").classList.toggle("hidden", tab !== "messages");
    $("#social-notifications-view").classList.toggle("hidden", tab !== "notifications");
    if (tab === "friends") loadFriends().catch(error => showToast(error.message));
    if (tab === "messages") loadConversations().catch(error => showToast(error.message));
    if (tab === "notifications") {
      loadNotifications().then(() => socialApi("/notifications/read", { method: "POST" })).then(loadNotifications).catch(error => showToast(error.message));
    }
  }
  $("#social-open").addEventListener("click", () => openSocialTab("friends"));
  $("#social-close").addEventListener("click", () => $("#social-panel").classList.add("hidden"));
  document.querySelectorAll("[data-social-tab]").forEach(button => button.addEventListener("click", () => openSocialTab(button.dataset.socialTab)));
  $("#social-search").addEventListener("input", event => searchSocialUsers(event.target.value));
  $("#social-message-form").addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("#social-message-input");
    const body = input.value.trim();
    if (!body || !activeConversationId) return;
    try {
      await socialApi("/conversations/" + encodeURIComponent(activeConversationId) + "/messages", { method: "POST", body: JSON.stringify({ body }) });
      input.value = "";
      await openConversation(activeConversationId);
    } catch (error) { showToast(error.message); }
  });
  socket.on("dm:message", message => {
    if (String(message.conversationId) === activeConversationId) openConversation(activeConversationId).catch(() => {});
    else showToast("💬 Новое сообщение от " + message.nickname);
    loadConversations().catch(() => {});
  });
  socket.on("social:notification", () => {
    socialUnread += 1;
    $("#notification-count").textContent = String(socialUnread);
    showToast("🔔 Новое уведомление");
    if (!$("#social-panel").classList.contains("hidden")) loadNotifications().catch(() => {});
  });

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
})();