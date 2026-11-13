const express = require("express");
const http = require("http");
const path = require("path");
const cookie = require("cookie");
const { Server } = require("socket.io");
const { pool, migrate } = require("./src/db");
const auth = require("./src/auth");
const { createSocialRouter } = require("./src/social");
const { createProfileRouter } = require("./src/profile");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 20000 });
const PORT = Number(process.env.PORT) || 3000;
const COOKIE_NAME = "nexora_session";
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

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));
function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400000 };
}
function readToken(req) {
  return req.cookies?.[COOKIE_NAME] || cookie.parse(req.headers.cookie || "")[COOKIE_NAME] || "";
}
app.use((req, _res, next) => {
  req.cookies = cookie.parse(req.headers.cookie || "");
  next();
});
app.post("/api/auth/register", async (req, res, next) => {
  try {
    await auth.register(req, res);
  } catch (error) { next(error); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    await auth.login(req, res);
  } catch (error) { next(error); }
});
app.post("/api/auth/logout", async (req, res, next) => {
  try {
    await auth.logout(readToken(req));
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.get("/api/me", async (req, res, next) => {
  try {
    const account = await auth.authenticateToken(readToken(req));
    if (!account) return res.status(401).json({ error: "Требуется вход." });
    res.json({ ok: true, account: { id: account.id, nickname: account.nickname }, character: {
      avatar: account.avatar || {}, planet: account.planet || "starter", x: Number(account.position_x ?? 0.5)
    }});
  } catch (error) { next(error); }
});
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "nexora-social-mvp", database: "connected", players: players.size });
  } catch (_error) { res.status(503).json({ ok: false, database: "unavailable" }); }
});
app.use("/api/social", createSocialRouter({ pool, auth, io }));
app.use("/api/profile", createProfileRouter({ pool, auth, io }));
app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  if (!res.headersSent) res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, maxLength);
}
function normalizeAvatar(input) {
  const allowed = {
    gender: ["male", "female"], skin: ["#f4c7a1", "#c9875b", "#75452f"],
    hair: ["short", "long", "spiky"], suit: ["#6d7cff", "#ef6c9b", "#35bca5"]
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
    id: player.id, nickname: player.nickname, avatar: player.avatar, planet: player.planet,
    x: player.x, authority: player.authority,
    title: player.authority >= 50 ? "Звезда" : player.authority >= 20 ? "Знакомый" : "Новичок",
    bubble: player.bubble, emotion: player.emotion, friendsCount: player.friendsCount
  };
}
const roomName = (planet) => "planet:" + planet;
async function sendPlanetState(socket, planet) {
  const list = [...players.values()].filter((p) => p.planet === planet).map(publicPlayer);
  const history = await pool.query(
    "SELECT id,account_id AS \"playerId\",nickname,message_text AS text,EXTRACT(EPOCH FROM created_at)*1000 AS time FROM nexora_social_world.messages WHERE planet=$1 ORDER BY created_at DESC LIMIT 50",
    [planet]
  );
  socket.emit("planet:state", { planet, players: list, history: history.rows.reverse().map(m => ({...m, id: String(m.id), time: Number(m.time)})) });
}
function broadcastPlayer(player, event) { io.to(roomName(player.planet)).emit(event, publicPlayer(player)); }

io.use(async (socket, next) => {
  try {
    const parsed = cookie.parse(socket.handshake.headers.cookie || "");
    const account = await auth.authenticateToken(parsed[COOKIE_NAME]);
    if (!account) return next(new Error("AUTH_REQUIRED"));
    socket.data.account = account;
    next();
  } catch (error) { next(error); }
});

io.on("connection", (socket) => {
  socket.join("account:" + socket.data.account.id);
  socket.on("player:join", async (_payload, ack = () => {}) => {
    try {
      const account = socket.data.account;
      const result = await pool.query(
        "SELECT nickname,avatar,planet,position_x,authority FROM nexora_social_world.characters WHERE account_id=$1",
        [account.id]
      );
      const saved = result.rows[0];
      if (!saved) return ack({ ok: false, error: "Персонаж не найден." });
      const planet = Object.hasOwn(PLANETS, saved.planet) ? saved.planet : "starter";
      const friendCount = await pool.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.friends WHERE account_id=$1", [account.id]);
      const player = {
        id: String(account.id), socketId: socket.id, accountId: account.id,
        nickname: saved.nickname, avatar: normalizeAvatar(saved.avatar), planet,
        x: Math.max(0.04, Math.min(0.96, Number(saved.position_x))), authority: saved.authority,
        bubble: null, emotion: null, friendsCount: friendCount.rows[0].count
      };
      players.set(socket.id, player);
      socket.data.player = player;
      socket.join(roomName(planet));
      await sendPlanetState(socket, planet);
      socket.to(roomName(planet)).emit("player:joined", publicPlayer(player));
      ack({ ok: true, player: publicPlayer(player) });
    } catch (error) { console.error("join failed:", error); ack({ ok: false, error: "Не удалось загрузить персонажа." }); }
  });

  socket.on("player:move", async (payload) => {
    const player = players.get(socket.id);
    if (!player) return;
    const x = Number(payload?.x);
    if (!Number.isFinite(x)) return;
    player.x = Math.max(0.04, Math.min(0.96, x));
    socket.to(roomName(player.planet)).emit("player:moved", { id: player.id, x: player.x });
    pool.query("UPDATE nexora_social_world.characters SET position_x=$1,updated_at=NOW() WHERE account_id=$2", [player.x, player.accountId]).catch(console.error);
  });

  socket.on("chat:send", async (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    if (!player) return;
    const messageText = cleanText(payload?.text, 240);
    if (!messageText) return ack({ ok: false, error: "Введите сообщение." });
    try {
      const saved = await pool.query(
        "INSERT INTO nexora_social_world.messages(planet,account_id,nickname,message_text) VALUES($1,$2,$3,$4) RETURNING id,created_at",
        [player.planet, player.accountId, player.nickname, messageText]
      );
      const message = { id: String(saved.rows[0].id), playerId: player.id, nickname: player.nickname, text: messageText, time: Date.now() };
      player.bubble = { text: messageText, until: Date.now() + 5000 };
      io.to(roomName(player.planet)).emit("chat:message", message);
      io.to(roomName(player.planet)).emit("player:bubble", { id: player.id, bubble: player.bubble });
      ack({ ok: true });
    } catch (error) { console.error("chat save failed:", error); ack({ ok: false, error: "Не удалось сохранить сообщение." }); }
  });

  socket.on("emotion:play", (payload) => {
    const player = players.get(socket.id);
    if (!player || !EMOTIONS.includes(payload?.emotion)) return;
    player.emotion = { type: payload.emotion, until: Date.now() + 1800 };
    io.to(roomName(player.planet)).emit("emotion:played", { id: player.id, emotion: payload.emotion });
  });

  socket.on("whisper:send", (payload, ack = () => {}) => {
    const sender = players.get(socket.id);
    const target = [...players.values()].find(p => p.id === String(payload?.targetId || ""));
    const text = cleanText(payload?.text, 180);
    if (!sender || !target || sender.id === target.id || sender.planet !== target.planet || !text) return ack({ ok: false, error: "Не удалось отправить шёпот." });
    const whisper = { from: sender.nickname, fromId: sender.id, text, time: Date.now() };
    io.to(target.socketId).emit("whisper:received", whisper);
    socket.emit("whisper:sent", { to: target.nickname, text, time: whisper.time });
    ack({ ok: true });
  });

  socket.on("gift:send", async (payload, ack = () => {}) => {
    const sender = players.get(socket.id);
    const target = [...players.values()].find(p => p.id === String(payload?.targetId || ""));
    const gift = GIFTS[payload?.gift];
    if (!sender || !target || !gift || sender.id === target.id || sender.planet !== target.planet) return ack({ ok: false, error: "Подарок отправить не удалось." });
    try {
      const client = await pool.connect();
      let updated;
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO nexora_social_world.gifts(from_account_id,to_account_id,gift_type,authority_added) VALUES($1,$2,$3,$4)", [sender.accountId,target.accountId,payload.gift,gift.authority]);
        updated = await client.query("UPDATE nexora_social_world.characters SET authority=authority+$1,updated_at=NOW() WHERE account_id=$2 RETURNING authority", [gift.authority,target.accountId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
      target.authority = updated.rows[0].authority;
      const event = { fromId: sender.id, from: sender.nickname, toId: target.id, to: target.nickname, gift: payload.gift, icon: gift.icon, authorityAdded: gift.authority };
      io.to(roomName(sender.planet)).emit("gift:received", event);
      io.to(target.socketId).emit("profile:updated", publicPlayer(target));
      ack({ ok: true, event });
    } catch (error) { console.error("gift save failed:", error); ack({ ok: false, error: "Не удалось сохранить подарок." }); }
  });

  socket.on("friend:add", (_payload, ack = () => {}) => {
    ack({ ok: false, error: "Используйте отправку заявки в разделе «Друзья»." });
  });

  socket.on("planet:change", async (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    const nextPlanet = payload?.planet;
    if (!player || !Object.hasOwn(PLANETS, nextPlanet)) return ack({ ok: false, error: "Планета не найдена." });
    if (player.planet === nextPlanet) return ack({ ok: true });
    const oldPlanet = player.planet;
    socket.to(roomName(oldPlanet)).emit("player:left", { id: player.id });
    socket.leave(roomName(oldPlanet));
    player.planet = nextPlanet;
    socket.join(roomName(nextPlanet));
    await pool.query("UPDATE nexora_social_world.characters SET planet=$1,updated_at=NOW() WHERE account_id=$2", [nextPlanet,player.accountId]);
    await sendPlanetState(socket, nextPlanet);
    socket.to(roomName(nextPlanet)).emit("player:joined", publicPlayer(player));
    ack({ ok: true, planet: nextPlanet });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (!player) return;
    socket.to(roomName(player.planet)).emit("player:left", { id: player.id });
    players.delete(socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.bubble && player.bubble.until <= now) {
      player.bubble = null;
      io.to(roomName(player.planet)).emit("player:bubble", { id: player.id, bubble: null });
    }
    if (player.emotion && player.emotion.until <= now) player.emotion = null;
  }
}, 500);

migrate().then(() => {
  server.listen(PORT, "0.0.0.0", () => console.log("NEXORA Social World запущен на порту " + PORT));
}).catch(error => {
  console.error("Не удалось подготовить базу NEXORA Social World:", error);
  process.exit(1);
});
