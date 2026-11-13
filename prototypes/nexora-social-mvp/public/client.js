(() => {
  const socket = io();
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
      name.textContent = whisper ? "Шёпот" : message.nickname;
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
      const isMe = player.id === socket.id;
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

  function joinGame() {
    const nickname = nicknameInput.value.trim();
    loginError.textContent = "";
    socket.emit("player:join", { nickname, avatar: avatarSettings(), planet: "starter" }, (result) => {
      if (!result?.ok) {
        loginError.textContent = result?.error || "Не удалось войти.";
        return;
      }
      state.me = result.player;
      state.planet = result.player.planet;
      loginScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
      $("#planet-title").textContent = PLANETS[state.planet].name;
      resize();
      requestAnimationFrame(drawScene);
    });
  }
  $("#enter-button").addEventListener("click", joinGame);
  nicknameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinGame(); });

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
    if (event.toId === socket.id) {
      const me = state.players.get(socket.id);
      if (me) me.authority += event.authorityAdded;
      showToast(event.icon + " " + event.from + " подарил вам подарок! +" + event.authorityAdded + " авторитета");
    } else {
      showToast(event.from + " подарил " + event.icon + " игроку " + event.to);
    }
  });
  socket.on("profile:updated", (player) => state.players.set(player.id, { ...player, renderX: player.x }));
  socket.on("friend:result", ({ nickname, already }) => showToast(already ? nickname + " уже в друзьях" : nickname + " добавлен в друзья"));
  socket.on("friend:notice", ({ nickname }) => showToast(nickname + " добавил вас в друзья"));

  canvas.addEventListener("pointerdown", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null, nearestDistance = Infinity;
    for (const player of state.players.values()) {
      if (player.id === socket.id) continue;
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
      const me = state.players.get(socket.id);
      if (me) {
        me.facing = targetX >= me.x ? 1 : -1;
        me.x = targetX;
        me.moving = true;
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
  $("#whisper-button").addEventListener("click", () => {
    const text = prompt("Текст приватного сообщения:");
    if (text?.trim()) socket.emit("whisper:send", { targetId: state.selected, text }, (result) => {
      if (!result?.ok) showToast(result?.error || "Не удалось отправить.");
    });
    closeProfile();
  });
  $("#friend-button").addEventListener("click", () => {
    if (state.selected) socket.emit("friend:add", { targetId: state.selected });
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

  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  }
})();