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
  const listener = process.env.DATABASE_URL ? new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined
  }) : null;
  const publish = payload => pool.query("SELECT pg_notify('nexora_room_events',$1)", [JSON.stringify(payload)]).catch(error => {
    console.error("Realtime event publish failed:", error.message);
  });
  if (listener) {
    listener.connect().then(() => listener.query("LISTEN nexora_room_events")).catch(error => {
      console.error("Realtime cross-instance listener unavailable:", error.message);
    });
    listener.on("notification", notification => {
      let event;
      try { event = JSON.parse(notification.payload); } catch { return; }
      if (!event || typeof event.roomId !== "string") return;
      for (const peer of rooms.get(event.roomId) || []) {
        if (peer.readyState === 1) {
          try { peer.send(JSON.stringify(event)); } catch {}
        }
      }
    });
    listener.on("error", error => console.error("Realtime listener error:", error.message));
  }
  const cleanup = setInterval(async () => {
    try {
      const stale = await pool.query("DELETE FROM room_presence WHERE connected_at < NOW() - INTERVAL '2 minutes' RETURNING room_id,user_id");
      for (const row of stale.rows) publish({ type: "presence", action: "left", roomId: row.room_id, userId: row.user_id });
    } catch (error) {
      console.error("Presence cleanup failed:", error.message);
    }
  }, 30000);
  if (typeof cleanup.unref === "function") cleanup.unref();
  server.on("close", () => {
    clearInterval(cleanup);
    if (listener) listener.end().catch(() => {});
  });

  wss.on("connection", async (socket, request) => {
    let user;
    let connectionId;
    let joinedRoom = null;
    try {
      const origin = request.headers.origin;
      const host = request.headers.host;
      if (origin && new URL(origin).host !== host) throw new Error("origin");
      const token = cookieValue(request.headers.cookie, COOKIE_NAME);
      if (!token) throw new Error("auth");
      const auth = await pool.query(
        `SELECT u.id,u.username,s.id AS session_id FROM sessions s
         JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active' AND u.email_verified_at IS NOT NULL`,
        [hash(token)]
      );
      if (!auth.rowCount) throw new Error("auth");
      user = auth.rows[0];
      socket.userId = user.id;
      connectionId = crypto.randomUUID();
      socket.send(JSON.stringify({ type: "ready", userId: user.id }));
    } catch {
      socket.close(1008, "Authentication required");
      return;
    }

    let messageTimes = [];
    const heartbeat = setInterval(() => {
      if (joinedRoom && socket.readyState === 1) {
        pool.query("UPDATE room_presence SET connected_at=NOW() WHERE connection_id=$1", [connectionId]).catch(() => {});
      }
    }, 30000);
    if (typeof heartbeat.unref === "function") heartbeat.unref();
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
      const stillAuthenticated = await pool.query("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW() AND u.status='active' AND u.email_verified_at IS NOT NULL", [user.session_id]).catch(() => ({ rowCount: 0 }));
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
            await client.query("DELETE FROM room_presence WHERE connected_at < NOW() - INTERVAL '2 minutes'");
            const room = await client.query(
              "SELECT r.id,r.capacity FROM rooms r JOIN user_locations l ON l.planet_id=r.planet_id WHERE r.id=$1 AND r.is_active=TRUE AND l.user_id=$2",
              [packet.roomId,user.id]
            );
            if (!room.rowCount) { await client.query("ROLLBACK"); return; }
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
          } finally { client.release(); }
          const previousRoom = joinedRoom;
          if (previousRoom && rooms.has(previousRoom)) {
            rooms.get(previousRoom).delete(socket);
            if (!rooms.get(previousRoom).size) rooms.delete(previousRoom);
            publish({ type: "presence", action: "left", roomId: previousRoom, userId: user.id });
          }
          joinedRoom = packet.roomId;
          if (!rooms.has(joinedRoom)) rooms.set(joinedRoom,new Set());
          rooms.get(joinedRoom).add(socket);
          publish({ type: "presence", action: "joined", roomId: joinedRoom, userId: user.id, username: user.username });
          socket.send(JSON.stringify({type:"joined_room",roomId:joinedRoom}));
        } catch { socket.send(JSON.stringify({type:"error",message:"Не удалось войти в комнату."})); }
      }
      if (packet.type === "room_message" && joinedRoom && typeof packet.body === "string") {
        const body = packet.body.trim();
        if (!body || body.length > 1000) return;
        messageTimes.push(now);
        try {
          const muted = await pool.query(
            "SELECT 1 FROM punishments WHERE user_id=$1 AND kind='mute' AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>NOW()) LIMIT 1",
            [user.id]
          );
          if (muted.rowCount) { socket.send(JSON.stringify({type:"error",message:"Отправка сообщений ограничена."})); return; }
          const member = await pool.query("SELECT 1 FROM room_presence WHERE connection_id=$1 AND user_id=$2 AND room_id=$3",[connectionId,user.id,joinedRoom]);
          if (!member.rowCount) return;
          const inserted = await pool.query(
            "INSERT INTO room_messages (room_id,user_id,character_id,body) SELECT $1,$2,id,$3 FROM characters WHERE user_id=$2 AND is_active=TRUE RETURNING id,room_id,body,created_at,character_id",
            [joinedRoom,user.id,body]
          );
          if (!inserted.rowCount) {
            const fallback = await pool.query(
              "INSERT INTO room_messages (room_id,user_id,body) VALUES ($1,$2,$3) RETURNING id,room_id,body,created_at,character_id",
              [joinedRoom,user.id,body]
            );
            inserted.rows = fallback.rows;
          }
          publish({ type: "room_message", roomId: joinedRoom, message: { ...inserted.rows[0], username: user.username } });
        } catch { socket.send(JSON.stringify({type:"error",message:"Сообщение не сохранено."})); }
      }
    });

    socket.on("close", async () => {
      clearInterval(heartbeat);
      if (joinedRoom && rooms.has(joinedRoom)) {
        rooms.get(joinedRoom).delete(socket);
        if (!rooms.get(joinedRoom).size) rooms.delete(joinedRoom);
      }
      if (connectionId) {
        try {
          const removed = await pool.query("DELETE FROM room_presence WHERE connection_id=$1 RETURNING room_id,user_id",[connectionId]);
          if (removed.rowCount) publish({ type: "presence", action: "left", roomId: removed.rows[0].room_id, userId: removed.rows[0].user_id });
        } catch {}
      }
    });
  });

  return wss;
}

module.exports = { attachRealtime };
