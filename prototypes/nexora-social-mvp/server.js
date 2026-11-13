const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = Number(process.env.PORT) || 3000;
const PLANETS = {
  starter: { name: "Стартовая", background: "#111b45", surface: "#473a83" },
  club: { name: "Клуб", background: "#351442", surface: "#803d80" },
  beach: { name: "Пляж", background: "#073b59", surface: "#b17b55" }
};
const GIFTS = {
  rose: { name: "Роза", icon: "🌹", authority: 5 },
  cocktail: { name: "Коктейль", icon: "🍹", authority: 7 },
  heart: { name: "Сердце", icon: "💖", authority: 10 }
};
const EMOTIONS = ["wave", "kiss", "dance"];
const players = new Map();
const histories = new Map();
const friendships = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nexora-social-mvp", players: players.size });
});

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, maxLength);
}

function normalizeAvatar(input) {
  const allowed = {
    gender: ["male", "female"],
    skin: ["#f4c7a1", "#c9875b", "#75452f"],
    hair: ["short", "long", "spiky"],
    suit: ["#6d7cff", "#ef6c9b", "#35bca5"]
  };
  return {
    gender: allowed.gender.includes(input?.gender) ? input.gender : "male",
    skin: allowed.skin.includes(input?.skin) ? input.skin : allowed.skin[0],
    hair: allowed.hair.includes(input?.hair) ? input.hair : "short",
    suit: allowed.suit.includes(input?.suit) ? input.suit : allowed.suit[0]
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    avatar: player.avatar,
    planet: player.planet,
    x: player.x,
    authority: player.authority,
    title: player.authority >= 50 ? "Звезда" : player.authority >= 20 ? "Знакомый" : "Новичок",
    bubble: player.bubble,
    emotion: player.emotion,
    friendsCount: player.friendsCount
  };
}

function roomName(planet) {
  return "planet:" + planet;
}

function getHistory(planet) {
  if (!histories.has(planet)) histories.set(planet, []);
  return histories.get(planet);
}

function sendPlanetState(socket, planet) {
  const list = [...players.values()]
    .filter((player) => player.planet === planet)
    .map(publicPlayer);
  socket.emit("planet:state", { planet, players: list, history: getHistory(planet) });
}

function broadcastPlayer(player, event) {
  io.to(roomName(player.planet)).emit(event, publicPlayer(player));
}

io.on("connection", (socket) => {
  socket.on("player:join", (payload, ack = () => {}) => {
    const nickname = cleanText(payload?.nickname, 18);
    if (nickname.length < 2) {
      ack({ ok: false, error: "Ник должен содержать минимум 2 символа." });
      return;
    }

    const planet = Object.hasOwn(PLANETS, payload?.planet) ? payload.planet : "starter";
    const player = {
      id: socket.id,
      nickname,
      avatar: normalizeAvatar(payload?.avatar),
      planet,
      x: Math.random() * 0.72 + 0.14,
      authority: 0,
      bubble: null,
      emotion: null,
      friendsCount: 0
    };

    players.set(socket.id, player);
    socket.join(roomName(planet));
    sendPlanetState(socket, planet);
    socket.to(roomName(planet)).emit("player:joined", publicPlayer(player));
    ack({ ok: true, player: publicPlayer(player) });
  });

  socket.on("player:move", (payload) => {
    const player = players.get(socket.id);
    if (!player) return;
    const x = Number(payload?.x);
    if (!Number.isFinite(x)) return;
    player.x = Math.max(0.04, Math.min(0.96, x));
    socket.to(roomName(player.planet)).emit("player:moved", {
      id: player.id,
      x: player.x
    });
  });

  socket.on("chat:send", (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    if (!player) return;
    const text = cleanText(payload?.text, 240);
    if (!text) {
      ack({ ok: false, error: "Введите сообщение." });
      return;
    }
    const message = {
      id: socket.id + ":" + Date.now(),
      playerId: player.id,
      nickname: player.nickname,
      text,
      time: Date.now()
    };
    player.bubble = { text, until: Date.now() + 5000 };
    const history = getHistory(player.planet);
    history.push(message);
    if (history.length > 50) history.splice(0, history.length - 50);
    io.to(roomName(player.planet)).emit("chat:message", message);
    io.to(roomName(player.planet)).emit("player:bubble", {
      id: player.id,
      bubble: player.bubble
    });
    ack({ ok: true });
  });

  socket.on("emotion:play", (payload) => {
    const player = players.get(socket.id);
    const emotion = payload?.emotion;
    if (!player || !EMOTIONS.includes(emotion)) return;
    player.emotion = { type: emotion, until: Date.now() + 1800 };
    io.to(roomName(player.planet)).emit("emotion:played", {
      id: player.id,
      emotion
    });
  });

  socket.on("whisper:send", (payload, ack = () => {}) => {
    const sender = players.get(socket.id);
    const target = players.get(String(payload?.targetId || ""));
    const text = cleanText(payload?.text, 180);
    if (!sender || !target || sender.id === target.id || sender.planet !== target.planet || !text) {
      ack({ ok: false, error: "Не удалось отправить шёпот." });
      return;
    }
    const whisper = {
      from: sender.nickname,
      fromId: sender.id,
      text,
      time: Date.now()
    };
    io.to(target.id).emit("whisper:received", whisper);
    socket.emit("whisper:sent", { to: target.nickname, text, time: whisper.time });
    ack({ ok: true });
  });

  socket.on("gift:send", (payload, ack = () => {}) => {
    const sender = players.get(socket.id);
    const target = players.get(String(payload?.targetId || ""));
    const gift = GIFTS[payload?.gift];
    if (!sender || !target || !gift || sender.id === target.id || sender.planet !== target.planet) {
      ack({ ok: false, error: "Подарок отправить не удалось." });
      return;
    }
    target.authority += gift.authority;
    const event = {
      fromId: sender.id,
      from: sender.nickname,
      toId: target.id,
      to: target.nickname,
      gift: payload.gift,
      icon: gift.icon,
      authorityAdded: gift.authority
    };
    io.to(roomName(sender.planet)).emit("gift:received", event);
    io.to(target.id).emit("profile:updated", publicPlayer(target));
    ack({ ok: true, event });
  });

  socket.on("friend:add", (payload, ack = () => {}) => {
    const sender = players.get(socket.id);
    const target = players.get(String(payload?.targetId || ""));
    if (!sender || !target || sender.id === target.id) {
      ack({ ok: false, error: "Игрок не найден." });
      return;
    }
    if (!friendships.has(sender.id)) friendships.set(sender.id, new Set());
    if (!friendships.has(target.id)) friendships.set(target.id, new Set());
    const already = friendships.get(sender.id).has(target.id);
    friendships.get(sender.id).add(target.id);
    friendships.get(target.id).add(sender.id);
    sender.friendsCount = friendships.get(sender.id).size;
    target.friendsCount = friendships.get(target.id).size;
    socket.emit("friend:result", { ok: true, nickname: target.nickname, already });
    io.to(target.id).emit("friend:notice", { nickname: sender.nickname });
  });

  socket.on("planet:change", (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    const nextPlanet = payload?.planet;
    if (!player || !Object.hasOwn(PLANETS, nextPlanet)) {
      ack({ ok: false, error: "Планета не найдена." });
      return;
    }
    if (player.planet === nextPlanet) {
      ack({ ok: true });
      return;
    }
    const oldPlanet = player.planet;
    socket.to(roomName(oldPlanet)).emit("player:left", { id: player.id });
    socket.leave(roomName(oldPlanet));
    player.planet = nextPlanet;
    player.x = Math.random() * 0.72 + 0.14;
    socket.join(roomName(nextPlanet));
    sendPlanetState(socket, nextPlanet);
    socket.to(roomName(nextPlanet)).emit("player:joined", publicPlayer(player));
    ack({ ok: true, planet: nextPlanet });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (!player) return;
    socket.to(roomName(player.planet)).emit("player:left", { id: player.id });
    players.delete(socket.id);
    friendships.delete(socket.id);
    for (const friends of friendships.values()) friends.delete(socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.bubble && player.bubble.until <= now) {
      player.bubble = null;
      io.to(roomName(player.planet)).emit("player:bubble", {
        id: player.id,
        bubble: null
      });
    }
    if (player.emotion && player.emotion.until <= now) player.emotion = null;
  }
}, 500);

server.listen(PORT, "0.0.0.0", () => {
  console.log("NEXORA Social World запущен на порту " + PORT);
});