const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");
const { Client } = require("pg");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const COOKIE_NAME = "nexora_session";
const router = express.Router();
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function isValidPosition(x, y) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 2 && x <= 98 && y >= 8 && y <= 92;
}

function isWithinMovementSpeed(fromX, fromY, x, y, elapsedMs) {
  return Math.hypot(x - fromX, y - fromY) <= 2 + Math.max(60, elapsedMs) * 0.035;
}

function cookieValue(header, name) {
  const item = String(header || "").split(";").map(value => value.trim()).find(value => value.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

router.get("/rooms/:roomId/positions", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.roomId)) return res.status(400).json({ error: "Некорректная комната." });
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (p.user_id) p.user_id,u.username,COALESCE(c.name,u.username) AS character_name,
              c.appearance AS character_appearance,c.aura AS character_aura,
              p.x,p.y,p.updated_at
       FROM room_player_positions p
       JOIN room_presence rp ON rp.room_id=p.room_id AND rp.user_id=p.user_id
         AND rp.connected_at>NOW()-INTERVAL '2 minutes'
       JOIN users u ON u.id=p.user_id AND u.status='active'
       JOIN rooms r ON r.id=p.room_id AND r.is_active=TRUE
       JOIN user_locations l ON l.user_id=$2 AND l.planet_id=r.planet_id
       LEFT JOIN characters c ON c.user_id=p.user_id AND c.is_active=TRUE
       WHERE p.room_id=$1
         AND NOT EXISTS(SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$2 AND b.blocked_id=p.user_id)
              OR (b.blocker_id=p.user_id AND b.blocked_id=$2))
       ORDER BY p.user_id,rp.connected_at DESC,p.updated_at DESC`,
      [req.params.roomId, req.user.id]
    );
    res.json({ positions: result.rows });
  } catch (error) { next(error); }
});

function attachMovement(server) {
  const wss = new WebSocketServer({ server, path: "/ws-movement", maxPayload: 2048 });
  const peers = new Map();
  const instanceId = crypto.randomUUID();
  const broadcast = event => {
    for (const peer of peers.get(event.roomId) || []) {
      if (peer.readyState === 1) {
        try { peer.send(JSON.stringify(event)); } catch {}
      }
    }
  };
  let listener;
  let stopped = false;
  let reconnectTimer;
  const connectListener = async () => {
    if (stopped || listener || !process.env.DATABASE_URL) return;
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined
    });
    listener = client;
    client.on("notification", message => {
      try {
        const event = JSON.parse(message.payload);
        if (event.source !== instanceId && (event.type === "player_moved" || event.type === "player_joined")) broadcast(event);
      } catch {}
    });
    client.on("error", () => {
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
      await client.query("LISTEN nexora_movement_events");
      console.log("Movement cross-instance listener connected.");
    } catch (error) {
      if (listener === client) listener = null;
      await client.end().catch(() => {});
      console.error("Movement listener unavailable:", error.message);
      scheduleReconnect();
    }
  };
  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectListener();
    }, 5000);
    if (reconnectTimer.unref) reconnectTimer.unref();
  };
  connectListener();

  wss.on("connection", async (socket, request) => {
    let user;
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) throw new Error("origin");
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
      socket.send(JSON.stringify({ type: "ready" }));
    } catch {
      socket.close(1008, "Authentication required");
      return;
    }

    let joinedRoom = null;
    let lastMoveAt = 0;
    let lastX = 50;
    let lastY = 78;
    let moveTimes = [];
    socket.on("message", async raw => {
      let packet;
      try { packet = JSON.parse(raw.toString()); } catch { return; }
      if (!packet || typeof packet.type !== "string") return;
      const session = await pool.query(
        "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW() AND u.status='active'",
        [user.session_id]
      ).catch(() => ({ rowCount: 0 }));
      if (!session.rowCount) {
        socket.close(1008, "Session expired");
        return;
      }

      if (packet.type === "join_room") {
        if (typeof packet.roomId !== "string" || !/^[0-9a-f-]{36}$/i.test(packet.roomId)) return;
        try {
          const access = await pool.query(
            `SELECT r.id FROM rooms r
             JOIN user_locations l ON l.planet_id=r.planet_id AND l.user_id=$2
             WHERE r.id=$1 AND r.is_active=TRUE
               AND EXISTS(SELECT 1 FROM room_presence rp WHERE rp.room_id=r.id AND rp.user_id=$2
                 AND rp.connected_at>NOW()-INTERVAL '2 minutes')`,
            [packet.roomId, user.id]
          );
          if (!access.rowCount) {
            socket.send(JSON.stringify({ type: "error", message: "Комната недоступна на текущей планете." }));
            return;
          }
          if (joinedRoom && peers.has(joinedRoom)) {
            peers.get(joinedRoom).delete(socket);
            if (!peers.get(joinedRoom).size) peers.delete(joinedRoom);
          }
          joinedRoom = packet.roomId;
          const position = await pool.query(
            `INSERT INTO room_player_positions(room_id,user_id,x,y)
             VALUES($1,$2,50 + random()*36,65 + random()*22)
             ON CONFLICT(room_id,user_id) DO UPDATE SET updated_at=NOW()
             RETURNING x,y`,
            [joinedRoom, user.id]
          );
          lastX = Number(position.rows[0].x);
          lastY = Number(position.rows[0].y);
          lastMoveAt = Date.now();
          if (!peers.has(joinedRoom)) peers.set(joinedRoom, new Set());
          peers.get(joinedRoom).add(socket);
          const current = await pool.query(
            `SELECT DISTINCT ON (p.user_id) p.user_id,u.username,p.x,p.y
             FROM room_player_positions p
             JOIN room_presence rp ON rp.room_id=p.room_id AND rp.user_id=p.user_id
               AND rp.connected_at>NOW()-INTERVAL '2 minutes'
             JOIN users u ON u.id=p.user_id AND u.status='active'
             WHERE p.room_id=$1
             ORDER BY p.user_id,rp.connected_at DESC`,
            [joinedRoom]
          );
          socket.send(JSON.stringify({ type: "joined_room", roomId: joinedRoom, x: lastX, y: lastY }));
          socket.send(JSON.stringify({ type: "position_list", roomId: joinedRoom, positions: current.rows }));
          const joinedEvent = {
            type: "player_joined", roomId: joinedRoom, userId: user.id,
            username: user.username, x: lastX, y: lastY, source: instanceId
          };
          broadcast(joinedEvent);
          await pool.query("SELECT pg_notify('nexora_movement_events',$1)", [JSON.stringify(joinedEvent)]);
        } catch {
          socket.send(JSON.stringify({ type: "error", message: "Не удалось загрузить позиции игроков." }));
        }
        return;
      }

      if (packet.type !== "move" || !joinedRoom) return;
      const now = Date.now();
      moveTimes = moveTimes.filter(time => now - time < 1000);
      if (moveTimes.length >= 12 || now - lastMoveAt < 60) return;
      const x = Number(packet.x);
      const y = Number(packet.y);
      const elapsed = now - lastMoveAt;
      if (!isValidPosition(x, y) || !isWithinMovementSpeed(lastX, lastY, x, y, elapsed)) return;
      moveTimes.push(now);
      lastMoveAt = now;
      lastX = x;
      lastY = y;
      try {
        const saved = await pool.query(
          `UPDATE room_player_positions p SET x=$3,y=$4,updated_at=NOW()
           WHERE p.room_id=$1 AND p.user_id=$2
             AND EXISTS(SELECT 1 FROM rooms r JOIN user_locations l
               ON l.planet_id=r.planet_id AND l.user_id=$2
               WHERE r.id=$1 AND r.is_active=TRUE
                 AND EXISTS(SELECT 1 FROM room_presence rp WHERE rp.room_id=r.id AND rp.user_id=$2
                   AND rp.connected_at>NOW()-INTERVAL '2 minutes'))
           RETURNING p.x,p.y,p.updated_at`,
          [joinedRoom, user.id, x, y]
        );
        if (!saved.rowCount) return;
        const event = {
          type: "player_moved",
          roomId: joinedRoom,
          userId: user.id,
          username: user.username,
          x: saved.rows[0].x,
          y: saved.rows[0].y,
          updatedAt: saved.rows[0].updated_at,
          source: instanceId
        };
        broadcast(event);
        await pool.query("SELECT pg_notify('nexora_movement_events',$1)", [JSON.stringify(event)]);
      } catch (error) {
        socket.send(JSON.stringify({ type: "error", message: "Не удалось сохранить перемещение." }));
        console.error("Movement save failed:", error.message);
      }
    });

    socket.on("close", () => {
      if (joinedRoom && peers.has(joinedRoom)) {
        peers.get(joinedRoom).delete(socket);
        if (!peers.get(joinedRoom).size) peers.delete(joinedRoom);
      }
    });
  });

  server.on("close", () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (listener) {
      const client = listener;
      listener = null;
      client.end().catch(() => {});
    }
  });
  return wss;
}

module.exports = { router, attachMovement, isValidPosition, isWithinMovementSpeed };
