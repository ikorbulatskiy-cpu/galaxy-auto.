const express = require("express");
const http = require("http");
const path = require("path");
const cookie = require("cookie");
const { Server } = require("socket.io");
const { pool, migrate } = require("./src/db");
const auth = require("./src/auth");
const { createSocialRouter } = require("./src/social");
const { createProfileRouter } = require("./src/profile");
const { createDeveloperRouter } = require("./src/developer");
const { createAuthorityRouter } = require("./src/authority");
const { createPlanetsRouter } = require("./src/planets");

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
const EMOTIONS = ["wave","kiss","dance","smile","sad","laugh","surprise","love","angry","blush","sleep","music"];
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
      avatar: account.avatar || {}, planet: account.planet || "starter", x: Number(account.position_x ?? 0.5), y: Number(account.position_y ?? 0.82)
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
app.use("/api/developer", createDeveloperRouter({ pool, auth, players, planets: PLANETS }));
app.use("/api/authority", createAuthorityRouter({ pool, auth, io, players }));
app.use("/api/planets", createPlanetsRouter({ pool, auth, io, players }));
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
    hair: ["short", "long", "spiky"], suit: ["#6d7cff", "#ef6c9b", "#35bca5"],
    hairColor: ["#30233d", "#6b432c", "#e5c07b", "#e9eef8", "#bd5de5"],
    shoes: ["sneakers", "boots", "heels"], accessory: ["none", "glasses", "headphones", "crown"]
  };
  return {
    gender: allowed.gender.includes(input?.gender) ? input.gender : "male",
    skin: allowed.skin.includes(input?.skin) ? input.skin : allowed.skin[0],
    hair: allowed.hair.includes(input?.hair) ? input.hair : "short",
    suit: allowed.suit.includes(input?.suit) ? input.suit : allowed.suit[0],
    hairColor: allowed.hairColor.includes(input?.hairColor) ? input.hairColor : allowed.hairColor[0],
    shoes: allowed.shoes.includes(input?.shoes) ? input.shoes : "sneakers",
    accessory: allowed.accessory.includes(input?.accessory) ? input.accessory : "none"
  };
}
function publicPlayer(player) {
  return {
    id: player.id, nickname: player.nickname, avatar: player.avatar, planet: player.planet,
    x: player.x, y: player.y ?? .82, authority: player.authority,
    title: ({ NOVICE: "Новичок", BEDA: "Беда", PAPA: "Папа", ANGEL: "Ангел", CREATOR: "Создатель" })[player.authorityTitle] || "Новичок",
    authorityTitle: player.authorityTitle || "NOVICE",
    auraType: ({ NOVICE: "NONE", BEDA: "GOLD_SOFT", PAPA: "GOLD_PREMIUM", ANGEL: "GREEN", CREATOR: "FIRE_RED" })[player.authorityTitle] || "NONE",
    auraEnabled: Boolean(player.auraEnabled),
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
        "SELECT nickname,avatar,planet,position_x,position_y,authority,authority_title,aura_enabled FROM nexora_social_world.characters WHERE account_id=$1",
        [account.id]
      );
      const saved = result.rows[0];
      if (!saved) return ack({ ok: false, error: "Персонаж не найден." });
      const customId = /^custom-(\\d+)$/.exec(String(saved.planet || ""));
      let planet = Object.hasOwn(PLANETS, saved.planet) ? saved.planet : customId ? saved.planet : "starter";
      if (customId) {
        const custom = await pool.query(
          `SELECT p.id,p.status,p.access_mode,p.owner_account_id,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$2) AS staff,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_bans b WHERE b.planet_id=p.id AND b.account_id=$2 AND (b.expires_at IS NULL OR b.expires_at>NOW())) AS banned,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_invites i WHERE i.planet_id=p.id AND i.invited_account_id=$2 AND i.expires_at>NOW()) AS invited,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$2) AS member
           FROM nexora_social_world.custom_planets p WHERE p.id=$1`, [customId[1],account.id]
        );
        const p = custom.rows[0];
        if (!p || p.status !== "active" || p.banned ||
          (p.access_mode === "private" && String(p.owner_account_id) !== String(account.id) && !p.staff) ||
          (p.access_mode === "invite" && String(p.owner_account_id) !== String(account.id) && !p.staff && !p.invited && !p.member)) planet = "starter";
      }
      const friendCount = await pool.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.friends WHERE account_id=$1", [account.id]);
      const player = {
        id: String(account.id), socketId: socket.id, accountId: account.id,
        nickname: saved.nickname, avatar: normalizeAvatar(saved.avatar), planet,
        x: Math.max(0.04, Math.min(0.96, Number(saved.position_x))),
        y: Math.max(0.60, Math.min(0.86, Number(saved.position_y ?? .82))), authority: saved.authority,
        authorityTitle: saved.authority_title || "NOVICE", auraEnabled: Boolean(saved.aura_enabled),
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

  socket.on("player:move",async(payload,ack=()=>{})=>{
    const player=players.get(socket.id);
    if(!player)return ack({ok:false,error:"Персонаж не подключён."});
    const now=Date.now();
    if(now-(player.lastMoveAt||0)<85)return ack({ok:false,error:"Слишком быстро. Попробуй ещё раз."});
    const requestedX=Number(payload?.x),requestedY=Number(payload?.y);
    if(!Number.isFinite(requestedX)||!Number.isFinite(requestedY))return ack({ok:false,error:"Некорректная точка перемещения."});
    let x=Math.max(.04,Math.min(.96,requestedX)),y=Math.max(.60,Math.min(.86,requestedY));
    // Keep a small personal space between avatars at their destination.
    for(const other of players.values()){
      if(other.id===player.id||other.planet!==player.planet)continue;
      const dx=x-other.x,dy=y-(other.y??.82),distance=Math.hypot(dx,dy);
      if(distance<.045){
        const angle=distance>.0001?Math.atan2(dy,dx):(Number(player.id)%2?0:Math.PI);
        x=Math.max(.04,Math.min(.96,other.x+Math.cos(angle)*.047));
        y=Math.max(.60,Math.min(.86,(other.y??.82)+Math.sin(angle)*.047));
      }
    }
    player.x=x;player.y=y;player.lastMoveAt=now;
    io.to(roomName(player.planet)).emit("player:moved",{id:player.id,x,y,serverTime:now});
    pool.query("UPDATE nexora_social_world.characters SET position_x=$1,position_y=$2,updated_at=NOW() WHERE account_id=$3",[x,y,player.accountId]).catch(console.error);
    ack({ok:true,x,y});
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
    const now = Date.now();
    if (now - (player.lastEmotionAt || 0) < 350) return;
    player.lastEmotionAt = now;
    player.emotion = { type: payload.emotion, until: now + 1800 };
    io.to(roomName(player.planet)).emit("emotion:played", { id: player.id, emotion: payload.emotion });
  });

  socket.on("player:action",(payload,ack=()=>{})=>{
    const sender=players.get(socket.id),target=[...players.values()].find(p=>p.id===String(payload?.targetId||"")),action=String(payload?.action||"");
    const labels={wave:"поприветствовал(а)",smile:"улыбнулся(ась)",hug:"обнял(а)",kiss:"отправил(а) воздушный поцелуй",dance:"пригласил(а) танцевать",flower:"подарил(а) цветок"};
    if(!sender||!target||sender.id===target.id||sender.planet!==target.planet||!Object.hasOwn(labels,action))return ack({ok:false,error:"Это действие сейчас недоступно."});
    const now=Date.now();if(now-(sender.lastActionAt||0)<1200)return ack({ok:false,error:"Подождите перед следующим действием."});sender.lastActionAt=now;
    const event={fromId:sender.id,toId:target.id,from:sender.nickname,to:target.nickname,action,label:labels[action],time:now};
    io.to(roomName(sender.planet)).emit("player:action:played",event);
    io.to(roomName(sender.planet)).emit("chat:message",{id:"action-"+now+"-"+sender.id,playerId:sender.id,nickname:"NEXORA",text:sender.nickname+" "+labels[action]+" "+target.nickname+".",time:now,system:true});
    ack({ok:true});
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
      io.to(roomName(target.planet)).emit("profile:updated", publicPlayer(target));
      ack({ ok: true, event });
    } catch (error) { console.error("gift save failed:", error); ack({ ok: false, error: "Не удалось сохранить подарок." }); }
  });

  socket.on("friend:add", (_payload, ack = () => {}) => {
    ack({ ok: false, error: "Используйте отправку заявки в разделе «Друзья»." });
  });

  socket.on("planet:change", async (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    const nextPlanet = String(payload?.planet || "");
    if (!player) return ack({ ok: false, error: "Персонаж не подключён." });
    let valid = Object.hasOwn(PLANETS, nextPlanet);
    if (!valid) {
      const match = /^custom-(\\d+)$/.exec(nextPlanet);
      if (match) {
        const check = await pool.query(
          `SELECT p.id,p.capacity,p.access_mode,p.owner_account_id,p.status,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_bans b WHERE b.planet_id=p.id AND b.account_id=$2 AND (b.expires_at IS NULL OR b.expires_at>NOW())) AS banned,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$2) AS staff,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_invites i WHERE i.planet_id=p.id AND i.invited_account_id=$2 AND i.expires_at>NOW()) AS invited,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$2) AS member
           FROM nexora_social_world.custom_planets p WHERE p.id=$1`, [match[1],player.accountId]
        );
        const p = check.rows[0];
        if (p && p.status === "active" && !p.banned &&
          (p.access_mode === "public" || String(p.owner_account_id) === String(player.accountId) || p.staff || p.invited)) {
          const online = [...players.values()].filter(x => x.planet === nextPlanet && x.id !== player.id).length;
          valid = online < Number(p.capacity);
        }
      }
    }
    if (!valid) return ack({ ok: false, error: "Планета недоступна: проверьте приглашение, блокировку и свободные места." });
    if (player.planet === nextPlanet) return ack({ ok: true });
    const oldPlanet = player.planet;
    socket.to(roomName(oldPlanet)).emit("player:left", { id: player.id });
    socket.leave(roomName(oldPlanet));
    player.planet = nextPlanet;
    socket.join(roomName(nextPlanet));
    await pool.query("UPDATE nexora_social_world.characters SET planet=$1,updated_at=NOW() WHERE account_id=$2", [nextPlanet,player.accountId]);
    if (nextPlanet.startsWith("custom-")) {
      const id = nextPlanet.slice(7);
      await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id,player.accountId]);
      await pool.query("UPDATE nexora_social_world.planet_invites SET used_at=NOW() WHERE planet_id=$1 AND invited_account_id=$2 AND used_at IS NULL AND expires_at>NOW()", [id,player.accountId]);
    }
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
