const crypto = require("crypto");
const { WebSocketServer } = require("ws");
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
      socket.send(JSON.stringify({ type: "ready", userId: user.id }));
    } catch {
      socket.close(1008, "Authentication required");
      return;
    }

    socket.on("message", async raw => {
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; }
      if (!packet || typeof packet.type !== "string") return;
      if (packet.type === "join_room") {
        if (typeof packet.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(packet.roomId)) return;
        try {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const room = await client.query(
              "SELECT r.id,r.capacity FROM rooms r WHERE r.id=$1 AND r.is_active=TRUE",
              [packet.roomId]
            );
            if (!room.rowCount) { await client.query("ROLLBACK"); return; }
            const character = await client.query(
              "SELECT id FROM characters WHERE user_id=$1 AND is_active=TRUE LIMIT 1",
              [user.id]
            );
            const count = await client.query(
              "SELECT COUNT(DISTINCT user_id)::int AS count FROM room_presence WHERE room_id=$1",
              [packet.roomId]
            );
            if (count.rows[0].count >= room.rows[0].capacity) { await client.query("ROLLBACK"); socket.send(JSON.stringify({type:"error",message:"Комната заполнена."})); return; }
            connectionId = crypto.randomUUID();
            await client.query(
              "INSERT INTO room_presence (connection_id,room_id,user_id,character_id) VALUES ($1,$2,$3,$4)",
              [connectionId,packet.roomId,user.id,character.rows[0]?.id || null]
            );
            await client.query("COMMIT");
          } finally { client.release(); }
          if (joinedRoom && rooms.has(joinedRoom)) rooms.get(joinedRoom).delete(socket);
          joinedRoom = packet.roomId;
          if (!rooms.has(joinedRoom)) rooms.set(joinedRoom,new Set());
          rooms.get(joinedRoom).add(socket);
          socket.send(JSON.stringify({type:"joined_room",roomId:joinedRoom}));
        } catch { socket.send(JSON.stringify({type:"error",message:"Не удалось войти в комнату."})); }
      }
      if (packet.type === "room_message" && joinedRoom && typeof packet.body === "string") {
        const body = packet.body.trim();
        if (!body || body.length > 1000) return;
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
          const event = JSON.stringify({type:"room_message",message:{...inserted.rows[0],username:user.username}});
          for (const peer of rooms.get(joinedRoom) || []) if (peer.readyState === 1) peer.send(event);
        } catch { socket.send(JSON.stringify({type:"error",message:"Сообщение не сохранено."})); }
      }
    });

    socket.on("close", async () => {
      if (joinedRoom && rooms.has(joinedRoom)) {
        rooms.get(joinedRoom).delete(socket);
        if (!rooms.get(joinedRoom).size) rooms.delete(joinedRoom);
      }
      if (connectionId) {
        try { await pool.query("DELETE FROM room_presence WHERE connection_id=$1",[connectionId]); } catch {}
      }
    });
  });

  return wss;
}

module.exports = { attachRealtime };
