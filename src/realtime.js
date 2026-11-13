const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Client } = require("pg");
const { pool } = require("./db");

const COOKIE_NAME = "nexora_session";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function cookieValue(header, name) {
  const entry = String(header || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function attachRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  const rooms = new Map();
  const instanceId = crypto.randomUUID();
  const removeLocalPresence = event => {
    const peers = rooms.get(event.roomId);
    if (!peers || event.type !== "presence" || event.action !== "left") return;
    for (const peer of peers) {
      const matches = event.connectionId
        ? peer.connectionId === event.connectionId
        : peer.userId === event.userId;
      if (matches) {
        peers.delete(peer);
        peer.joinedRoom = null;
      }
    }
    if (!peers.size) rooms.delete(event.roomId);
  };
  const broadcastLocal = event => {
    for (const peer of rooms.get(event.roomId) || []) {
      if (peer.readyState === 1) {
        try { peer.send(JSON.stringify(event)); } catch {}
      }
    }
  };
  let listener = null;
  let listenerStopping = false;
  let reconnectTimer = null;
  const handleNotification = notification => {
    let event;
    try { event = JSON.parse(notification.payload); } catch { return; }
    if (!event || typeof event.roomId !== "string" || event.source === instanceId) return;
    removeLocalPresence(event);
    broadcastLocal(event);
  };
  const scheduleReconnect = () => {
    if (listenerStopping || reconnectTimer || !process.env.DATABASE_URL) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectListener();
    }, 5000);
    if (typeof reconnectTimer.unref === "function") reconnectTimer.unref();
  };
  const connectListener = async () => {
    if (listenerStopping || listener || !process.env.DATABASE_URL) return;
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined
    });
    listener = client;
    client.on("notification", handleNotification);
    client.on("error", error => {
      console.error("Realtime listener error:", error.message);
      if (listener === client) listener = null;
      scheduleReconnect();
    });
    client.on("end", () => {
      if (listener === client) {
        listener = null;
        scheduleReconnect();
      }
    });
    try {
      await client.connect();
      await client.query("LISTEN nexora_room_events");
      console.log("Realtime cross-instance listener connected.");
    } catch (error) {
      if (listener === client) listener = null;
      await client.end().catch(() => {});
      console.error("Realtime cross-instance listener unavailable:", error.message);
      scheduleReconnect();
    }
  };
  const publish = payload => {
    const event = { ...payload, source: instanceId };
    removeLocalPresence(event);
    broadcastLocal(event);
    return pool.query("SELECT pg_notify('nexora_room_events',$1)", [JSON.stringify(event)]).catch(error => {
      console.error("Realtime event publish failed:", error.message);
    });
  };
  connectListener();
  const cleanup = setInterval(async () => {
    try {
      const stale = await pool.query("DELETE FROM room_presence WHERE connected_at < NOW() - INTERVAL '2 minutes' RETURNING room_id,user_id,connection_id");
      for (const row of stale.rows) publish({ type: "presence", action: "left", roomId: row.room_id, userId: row.user_id, connectionId: row.connection_id });
    } catch (error) {
      console.error("Presence cleanup failed:", error.message);
    }
  }, 30000);
  if (typeof cleanup.unref === "function") cleanup.unref();
  server.on("close", () => {
    clearInterval(cleanup);
    listenerStopping = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (listener) { const client = listener; listener = null; client.end().catch(() => {}); }
  });

  wss.on("connection", async (socket, request) => {
    let user;
    let connectionId;
    try {
      const origin = request.headers.origin;
      const host = request.headers.host;
      if (origin && new URL(origin).host !== host) throw new Error("origin");
      const token = cookieValue(request.headers.cookie, COOKIE_NAME);
      if (!token) throw new Error("auth");
      const auth = await pool.query(
        `SELECT u.id,u.username,s.id AS session_id FROM sessions s
         JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
        [hash(token)]
      );
      if (!auth.rowCount) throw new Error("auth");
      user = auth.rows[0];
      socket.userId = user.id;
      connectionId = crypto.randomUUID();
      socket.connectionId = connectionId;
      console.info("Realtime socket authenticated:", { connectionId, userId: user.id });
    } catch (error) {
      console.warn("Realtime socket authentication rejected:", error.message);
      socket.close(1008, "Authentication required");
      return;
    }

    let messageTimes = [];
    socket.isAlive = true;
    const heartbeat = setInterval(() => {
      if (socket.readyState !== 1) return;
      if (socket.isAlive === false) {
        console.warn("Realtime socket heartbeat timeout:", connectionId);
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      try { socket.ping(); } catch { socket.terminate(); }
    }, 25000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();
    socket.on("pong", () => {
      socket.isAlive = true;
      if (socket.joinedRoom) {
        pool.query("UPDATE room_presence SET connected_at=NOW() WHERE connection_id=$1", [connectionId]).catch(error => {
          console.error("Realtime presence heartbeat failed:", error.message);
        });
      }
    });
    socket.on("message", async raw => {
      const now = Date.now();
      messageTimes = messageTimes.filter(time => now - time < 5000);
      if (messageTimes.length >= 5) {
        socket.send(JSON.stringify({type:"error",message:"Слишком часто. Подожди несколько секунд."}));
        return;
      }
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; }
      if (!packet || typeof packet.type !== "string") return;
      const stillAuthenticated = await pool.query("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW() AND u.status='active'", [user.session_id]).catch(() => ({ rowCount: 0 }));
      if (!stillAuthenticated.rowCount) {
        socket.close(1008, "Session expired");
        return;
      }
      if (packet.type === "join_room") {
        if (typeof packet.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(packet.roomId)) return;
        try {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["nexora-room:" + packet.roomId]);
            const stale = await client.query(
              "DELETE FROM room_presence WHERE connected_at < NOW() - INTERVAL '2 minutes' RETURNING room_id,user_id,connection_id"
            );
            const room = await client.query(
              "SELECT r.id,r.capacity FROM rooms r JOIN user_locations l ON l.planet_id=r.planet_id WHERE r.id=$1 AND r.is_active=TRUE AND l.user_id=$2 FOR UPDATE OF l",
              [packet.roomId,user.id]
            );
            if (!room.rowCount) { await client.query("ROLLBACK"); socket.send(JSON.stringify({type:"error",message:"Комната недоступна на текущей планете."})); return; }
            const character = await client.query(
              "SELECT id FROM characters WHERE user_id=$1 AND is_active=TRUE LIMIT 1",
              [user.id]
            );
            await client.query("DELETE FROM room_presence WHERE connection_id=$1", [connectionId]);
            const count = await client.query(
              "SELECT COUNT(DISTINCT user_id)::int AS count FROM room_presence WHERE room_id=$1",
              [packet.roomId]
            );
            if (count.rows[0].count >= room.rows[0].capacity) { await client.query("ROLLBACK"); socket.send(JSON.stringify({type:"error",message:"Комната заполнена."})); return; }
            await client.query(
              "INSERT INTO room_presence (connection_id,room_id,user_id,character_id) VALUES ($1,$2,$3,$4)",
              [connectionId,packet.roomId,user.id,character.rows[0]?.id || null]
            );
            await client.query("COMMIT");
            for (const row of stale.rows) {
              publish({ type: "presence", action: "left", roomId: row.room_id, userId: row.user_id, connectionId: row.connection_id });
            }
          } finally { client.release(); }
          const previousRoom = socket.joinedRoom;
          if (previousRoom && rooms.has(previousRoom)) {
            rooms.get(previousRoom).delete(socket);
            if (!rooms.get(previousRoom).size) rooms.delete(previousRoom);
            publish({ type: "presence", action: "left", roomId: previousRoom, userId: user.id, connectionId });
          }
          socket.joinedRoom = packet.roomId;
          if (!rooms.has(socket.joinedRoom)) rooms.set(socket.joinedRoom,new Set());
          rooms.get(socket.joinedRoom).add(socket);
          publish({ type: "presence", action: "joined", roomId: socket.joinedRoom, userId: user.id, username: user.username });
          socket.send(JSON.stringify({type:"joined_room",roomId:socket.joinedRoom}));
          pool.query("SELECT p.name,p.settings FROM rooms r JOIN planets p ON p.id=r.planet_id WHERE r.id=$1",[socket.joinedRoom]).then(result=>{
            if(!result.rowCount||socket.readyState!==1)return;
            const settings=result.rows[0].settings||{};
            const modules=Array.isArray(settings.modules)?settings.modules:["magic","games","defender","love"];
            socket.send(JSON.stringify({type:"planet_modules",planetName:result.rows[0].name,modules}));
          }).catch(error=>console.error("Planet module lookup failed:",error.message));
        } catch { socket.send(JSON.stringify({type:"error",message:"Не удалось войти в комнату."})); }
      }
      if (packet.type === "room_message" && socket.joinedRoom && typeof packet.body === "string") {
        const body = packet.body.trim();
        if (!body || body.length > 1000) return;
        messageTimes.push(now);
        try {
          const muted = await pool.query(
            "SELECT 1 FROM punishments WHERE user_id=$1 AND kind='mute' AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>NOW()) LIMIT 1",
            [user.id]
          );
          if (muted.rowCount) { socket.send(JSON.stringify({type:"error",message:"Отправка сообщений ограничена."})); return; }
          const member = await pool.query("SELECT 1 FROM room_presence WHERE connection_id=$1 AND user_id=$2 AND room_id=$3",[connectionId,user.id,socket.joinedRoom]);
          if (!member.rowCount) return;
          const command=body.split(/\s+/,1)[0].toLocaleLowerCase("ru-RU");
          const botCommands={
            "/гороскоп":{module:"magic",name:"Магия",reply:"Сегодня звёзды советуют не торопиться с выводами. Случайная встреча может стать началом хорошего дня."},
            "/сон":{module:"magic",name:"Магия",reply:"Твой сон: впереди перемены. Запомни детали и не принимай сон за предсказание."},
            "/любовь":{module:"love",name:"Магия",reply:"Любовь начинается с уважения, честности и взаимного интереса."},
            "/ответ":{module:"magic",name:"Магия",reply:["Да, но не спеши.","Скорее да. Дай ситуации время.","Пока нет. Попробуй позже.","Ответ уже ближе, чем кажется."][Math.floor(Math.random()*4)]},
            "/5букв":{module:"games",name:"Игры планеты",reply:"Игра «5 букв»: загадай слово из пяти букв и предложи друзьям угадать его."},
            "/викторина":{module:"games",name:"Игры планеты",reply:"Викторина: какая планета Солнечной системы известна своими кольцами? Ответь одним словом."},
            "/анаграмма":{module:"games",name:"Игры планеты",reply:"Анаграмма: переставь буквы и угадай слово «РОЗА»."},
            "/рейтинг":{module:"defender",name:"Смотритель",reply:"Рейтинг активности формируется по участию в жизни планеты. Будь активен и соблюдай правила комнаты."}
          };
          const bot=botCommands[command];
          if(bot){
            const config=await pool.query("SELECT p.settings FROM rooms r JOIN planets p ON p.id=r.planet_id WHERE r.id=$1",[socket.joinedRoom]);
            const modules=Array.isArray(config.rows[0]?.settings?.modules)?config.rows[0].settings.modules:["magic","games","defender","love"];
            if(!modules.includes(bot.module)){socket.send(JSON.stringify({type:"error",message:"На этой планете не установлен нужный модуль бота."}));return;}
            const reply={id:"bot-"+crypto.randomUUID(),body:bot.reply,created_at:new Date().toISOString(),character_name:bot.name,username:"nexora-system",system:true};
            publish({type:"room_message",roomId:socket.joinedRoom,message:reply});
            return;
          }
          const inserted = await pool.query(
            "INSERT INTO room_messages (room_id,user_id,character_id,body) SELECT $1,$2,id,$3 FROM characters WHERE user_id=$2 AND is_active=TRUE RETURNING id,room_id,body,created_at,character_id",
            [socket.joinedRoom,user.id,body]
          );
          if (!inserted.rowCount) {
            const fallback = await pool.query(
              "INSERT INTO room_messages (room_id,user_id,body) VALUES ($1,$2,$3) RETURNING id,room_id,body,created_at,character_id",
              [socket.joinedRoom,user.id,body]
            );
            inserted.rows = fallback.rows;
          }
          publish({ type: "room_message", roomId: socket.joinedRoom, message: { ...inserted.rows[0], user_id: user.id, username: user.username } });
        } catch { socket.send(JSON.stringify({type:"error",message:"Сообщение не сохранено."})); }
      }
    });

    socket.on("close", async (code, reason) => {
      clearInterval(heartbeat);
      console.info("Realtime socket closed:", { connectionId, code, reason: reason.toString().slice(0, 120) });
      if (socket.joinedRoom && rooms.has(socket.joinedRoom)) {
        rooms.get(socket.joinedRoom).delete(socket);
        if (!rooms.get(socket.joinedRoom).size) rooms.delete(socket.joinedRoom);
      }
      if (connectionId) {
        try {
          const removed = await pool.query("DELETE FROM room_presence WHERE connection_id=$1 RETURNING room_id,user_id,connection_id",[connectionId]);
          if (removed.rowCount) publish({ type: "presence", action: "left", roomId: removed.rows[0].room_id, userId: removed.rows[0].user_id, connectionId: removed.rows[0].connection_id });
        } catch {}
      }
    });
    socket.send(JSON.stringify({ type: "ready", userId: user.id }));
  });

  return wss;
}

module.exports = { attachRealtime };
