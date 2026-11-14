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
const { createEconomyRouter } = require("./src/economy");
const { normalizeAvatar } = require("./src/avatar");
const { attachGalaxySockets } = require("./src/galaxy-sockets");

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
app.get("/galaxy", (_req, res) => res.redirect(308, "/"));
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
app.use("/api/developer", createDeveloperRouter({ pool, auth, players, planets: PLANETS, io }));
app.use("/api/authority", createAuthorityRouter({ pool, auth, io, players }));
app.use("/api/planets", createPlanetsRouter({ pool, auth, io, players }));
app.use("/api/economy", createEconomyRouter({ pool, auth, io }));
app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  if (!res.headersSent) res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, maxLength);
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
const roomChannel = player => "world:" + player.planet + ":room:" + player.roomId;
async function ensureDefaultRoom(planet) {
  const locationId = "location-" + planet, roomId = "room-" + planet + "-main";
  await pool.query("INSERT INTO nexora_social_world.world_locations(id,planet_key,name,sort_order) VALUES($1,$2,$3,1) ON CONFLICT(id) DO NOTHING",[locationId,planet,"Главная площадь"]);
  await pool.query("INSERT INTO nexora_social_world.world_rooms(id,planet_key,location_id,name,sort_order,is_default) VALUES($1,$2,$3,$4,1,TRUE) ON CONFLICT(id) DO NOTHING",[roomId,planet,locationId,"Главная комната"]);
  return roomId;
}
async function sendPlanetState(socket, player) {
  const list = [...players.values()].filter(p=>p.planet===player.planet&&p.roomId===player.roomId).map(publicPlayer);
  const [historyResult,roomsResult] = await Promise.all([
    pool.query("SELECT id,account_id AS \"playerId\",nickname,message AS text,created_at FROM nexora_social_world.room_messages WHERE room_id=$1 ORDER BY id DESC LIMIT 80",[player.roomId]),
    pool.query("SELECT r.id,r.name,r.location_id AS \"locationId\",l.name AS \"locationName\",r.is_default AS \"isDefault\" FROM nexora_social_world.world_rooms r JOIN nexora_social_world.world_locations l ON l.id=r.location_id WHERE r.planet_key=$1 ORDER BY l.sort_order,r.sort_order,r.name",[player.planet])
  ]);
  const history=historyResult.rows.reverse().map(row=>({id:String(row.id),playerId:String(row.playerId),nickname:row.nickname,text:row.text,time:new Date(row.created_at).getTime()}));
  socket.emit("planet:state",{planet:player.planet,roomId:player.roomId,players:list,history});
  socket.emit("world:rooms:list",{planet:player.planet,currentRoomId:player.roomId,rooms:roomsResult.rows});
}
function broadcastPlayer(player,event){io.to(roomChannel(player)).emit(event,publicPlayer(player));}

io.use(async (socket, next) => {
  try {
    const parsed = cookie.parse(socket.handshake.headers.cookie || "");
    const account = await auth.authenticateToken(parsed[COOKIE_NAME]);
    if (!account) return next(new Error("AUTH_REQUIRED"));
    socket.data.account = account;
    next();
  } catch (error) { next(error); }
});

attachGalaxySockets(io, { pool, auth, planets: PLANETS, normalizeAvatar });

io.on("connection", (socket) => {
  socket.join("account:" + socket.data.account.id);
  socket.on("player:join", async (_payload, ack = () => {}) => {
    try {
      const account = socket.data.account;
      const result = await pool.query(
        "SELECT nickname,avatar,planet,room_id,position_x,position_y,authority,authority_title,aura_enabled FROM nexora_social_world.characters WHERE account_id=$1",
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
      let roomId=saved.room_id;
      if(customId||!roomId)roomId=await ensureDefaultRoom(planet);
      const validRoom=await pool.query("SELECT id FROM nexora_social_world.world_rooms WHERE id=$1 AND planet_key=$2",[roomId,planet]);
      if(!validRoom.rowCount)roomId=await ensureDefaultRoom(planet);
      const friendCount = await pool.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.friends WHERE account_id=$1", [account.id]);
      const player = {
        id: String(account.id), socketId: socket.id, accountId: account.id,
        nickname: saved.nickname, avatar: normalizeAvatar(saved.avatar), planet, roomId,
        x: Math.max(0.04, Math.min(0.96, Number(saved.position_x))),
        y: Math.max(0.60, Math.min(0.86, Number(saved.position_y ?? .82))), authority: saved.authority,
        authorityTitle: saved.authority_title || "NOVICE", auraEnabled: Boolean(saved.aura_enabled),
        bubble: null, emotion: null, friendsCount: friendCount.rows[0].count
      };
      players.set(socket.id, player);
      socket.data.player = player;
      socket.join(roomChannel(player));
      await pool.query("UPDATE nexora_social_world.characters SET room_id=$1,planet=$2 WHERE account_id=$3",[roomId,planet,account.id]);
      await sendPlanetState(socket,player);
      socket.to(roomChannel(player)).emit("player:joined",publicPlayer(player));
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
    io.to(roomChannel(player)).emit("player:moved",{id:player.id,x,y,serverTime:now});
    pool.query("UPDATE nexora_social_world.characters SET position_x=$1,position_y=$2,updated_at=NOW() WHERE account_id=$3",[x,y,player.accountId]).catch(console.error);
    ack({ok:true,x,y});
  });

  socket.on("world:room:change",async(payload,ack=()=>{})=>{
    const player=players.get(socket.id),nextRoomId=String(payload?.roomId||"");
    if(!player)return ack({ok:false,error:"Персонаж не подключён."});
    try{
      const found=await pool.query("SELECT id,capacity FROM nexora_social_world.world_rooms WHERE id=$1 AND planet_key=$2",[nextRoomId,player.planet]);
      if(!found.rowCount)return ack({ok:false,error:"Комната недоступна."});
      const occupants=[...players.values()].filter(item=>item.planet===player.planet&&item.roomId===nextRoomId&&item.id!==player.id).length;
      if(occupants>=Number(found.rows[0].capacity))return ack({ok:false,error:"В комнате нет свободных мест."});
      if(nextRoomId===player.roomId)return ack({ok:true});
      const oldChannel=roomChannel(player);
      socket.to(oldChannel).emit("player:left",{id:player.id});socket.leave(oldChannel);
      player.roomId=nextRoomId;socket.join(roomChannel(player));
      await pool.query("UPDATE nexora_social_world.characters SET room_id=$1,updated_at=NOW() WHERE account_id=$2",[nextRoomId,player.accountId]);
      await sendPlanetState(socket,player);
      socket.to(roomChannel(player)).emit("player:joined",publicPlayer(player));
      ack({ok:true,roomId:player.roomId});
    }catch(error){console.error("Room switch failed:",error);ack({ok:false,error:"Не удалось перейти в комнату."});}
  });

  socket.on("player:typing", (payload) => {
    const player = players.get(socket.id);
    if (!player) return;
    const typing = Boolean(payload?.typing);
    if (player.typing === typing) {
      if (typing) player.typingUntil = Date.now() + 2200;
      return;
    }
    player.typing = typing;
    player.typingUntil = typing ? Date.now() + 2200 : 0;
    io.to(roomChannel(player)).emit("player:typing", { id: player.id, typing });
  });

  socket.on("chat:send", (payload, ack = () => {}) => {
    const player = players.get(socket.id);
    if (!player) return ack({ ok: false, error: "Персонаж не подключён." });
    const messageText = cleanText(payload?.text, 240);
    if (!messageText) return ack({ ok: false, error: "Введите сообщение." });
    if (player.typing) {
      player.typing = false;
      player.typingUntil = 0;
      io.to(roomChannel(player)).emit("player:typing", { id: player.id, typing: false });
    }
    try {
      const saved=await pool.query("INSERT INTO nexora_social_world.room_messages(room_id,account_id,nickname,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[player.roomId,player.accountId,player.nickname,messageText]);
      const row=saved.rows[0],message={id:String(row.id),playerId:player.id,nickname:player.nickname,text:messageText,time:new Date(row.created_at).getTime()};
      player.bubble={text:messageText,until:Date.now()+5000};
      io.to(roomChannel(player)).emit("chat:message",message);
      io.to(roomChannel(player)).emit("player:bubble",{id:player.id,bubble:player.bubble});
      ack({ok:true,id:message.id});
    } catch(error) {
      console.error("Room message save failed:",error);
      ack({ok:false,error:"Не удалось сохранить сообщение. Попробуйте ещё раз."});
    }
  });

  socket.on("emotion:play", (payload) => {
    const player = players.get(socket.id);
    if (!player || !EMOTIONS.includes(payload?.emotion)) return;
    const now = Date.now();
    if (now - (player.lastEmotionAt || 0) < 350) return;
    player.lastEmotionAt = now;
    player.emotion = { type: payload.emotion, until: now + 1800 };
    io.to(roomChannel(player)).emit("emotion:played", { id: player.id, emotion: payload.emotion });
  });

  socket.on("player:action",(payload,ack=()=>{})=>{
    const sender=players.get(socket.id),target=[...players.values()].find(p=>p.id===String(payload?.targetId||"")),action=String(payload?.action||"");
    const labels={wave:"поприветствовал(а)",smile:"улыбнулся(ась)",hug:"обнял(а)",kiss:"отправил(а) воздушный поцелуй",dance:"пригласил(а) танцевать",flower:"подарил(а) цветок"};
    if(!sender||!target||sender.id===target.id||sender.planet!==target.planet||!Object.hasOwn(labels,action))return ack({ok:false,error:"Это действие сейчас недоступно."});
    const now=Date.now();if(now-(sender.lastActionAt||0)<1200)return ack({ok:false,error:"Подождите перед следующим действием."});sender.lastActionAt=now;
    const event={fromId:sender.id,toId:target.id,from:sender.nickname,to:target.nickname,action,label:labels[action],time:now};
    io.to(roomChannel(sender)).emit("player:action:played",event);
    io.to(roomChannel(sender)).emit("chat:message",{id:"action-"+now+"-"+sender.id,playerId:sender.id,nickname:"NEXORA",text:sender.nickname+" "+labels[action]+" "+target.nickname+".",time:now,system:true});
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
      io.to(roomChannel(sender)).emit("gift:received", event);
      io.to(roomChannel(target)).emit("profile:updated", publicPlayer(target));
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
    const oldChannel = roomChannel(player);
    socket.to(oldChannel).emit("player:left", { id: player.id });
    socket.leave(oldChannel);
    player.planet = nextPlanet;
    player.roomId = await ensureDefaultRoom(nextPlanet);
    socket.join(roomChannel(player));
    await pool.query("UPDATE nexora_social_world.characters SET planet=$1,room_id=$2,updated_at=NOW() WHERE account_id=$3", [nextPlanet,player.roomId,player.accountId]);
    if (nextPlanet.startsWith("custom-")) {
      const id = nextPlanet.slice(7);
      await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [id,player.accountId]);
      await pool.query("UPDATE nexora_social_world.planet_invites SET used_at=NOW() WHERE planet_id=$1 AND invited_account_id=$2 AND used_at IS NULL AND expires_at>NOW()", [id,player.accountId]);
    }
    await sendPlanetState(socket, player);
    socket.to(roomChannel(player)).emit("player:joined", publicPlayer(player));
    ack({ ok: true, planet: nextPlanet });
  });

  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.typing) socket.to(roomChannel(player)).emit("player:typing", { id: player.id, typing: false });
    socket.to(roomChannel(player)).emit("player:left", { id: player.id });
    players.delete(socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const player of players.values()) {
    if (player.bubble && player.bubble.until <= now) {
      player.bubble = null;
      io.to(roomChannel(player)).emit("player:bubble", { id: player.id, bubble: null });
    }
    if (player.emotion && player.emotion.until <= now) player.emotion = null;
    if (player.typing && player.typingUntil <= now) {
      player.typing = false;
      io.to(roomChannel(player)).emit("player:typing", { id: player.id, typing: false });
    }
  }
}, 500);

migrate().then(() => {
  server.listen(PORT, "0.0.0.0", () => console.log("NEXORA Social World запущен на порту " + PORT));
}).catch(error => {
  console.error("Не удалось подготовить базу NEXORA Social World:", error);
  process.exit(1);
});
