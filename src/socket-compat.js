const crypto = require("crypto");
const { Server } = require("socket.io");
const { pool } = require("./db");

const COOKIE_NAME = "nexora_session";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function readCookie(header, name) {
  const entry = String(header || "").split(";").map(value => value.trim()).find(value => value.startsWith(name + "="));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
}

function attachSocketCompat(server) {
  const io = new Server(server, {
    serveClient: true,
    cors: { origin: false },
    maxHttpBufferSize: 16 * 1024
  });
  const activeSockets = new Map();

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.request.headers.cookie, COOKIE_NAME);
      if (!token) return next(new Error("Требуется авторизация."));
      const result = await pool.query(
        `SELECT u.id,u.username,u.role,s.id AS session_id
         FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.status='active'`,
        [hash(token)]
      );
      if (!result.rowCount) return next(new Error("Сессия истекла."));
      socket.data.user = result.rows[0];
      next();
    } catch (error) {
      next(new Error("Не удалось проверить сессию."));
    }
  });

  async function getRoomForUser(userId, planetSlug) {
    const result = await pool.query(
      `SELECT r.id,p.slug,p.name
       FROM rooms r JOIN planets p ON p.id=r.planet_id
       WHERE p.slug=$1 AND p.is_active=TRUE AND r.is_active=TRUE
       ORDER BY r.created_at ASC LIMIT 1`,
      [planetSlug]
    );
    if (result.rowCount) return result.rows[0];
    const fallback = await pool.query(
      `SELECT r.id,p.slug,p.name
       FROM rooms r JOIN planets p ON p.id=r.planet_id
       WHERE p.is_active=TRUE AND r.is_active=TRUE
       ORDER BY p.created_at ASC,r.created_at ASC LIMIT 1`
    );
    return fallback.rows[0] || null;
  }

  async function joinWorld(socket, requestedSlug) {
    const user = socket.data.user;
    const characterResult = await pool.query(
      "SELECT id,name,gender,appearance,authority,aura,is_active FROM characters WHERE user_id=$1 AND is_active=TRUE LIMIT 1",
      [user.id]
    );
    let character = characterResult.rows[0];
    if (!character) {
      const created = await pool.query(
        "INSERT INTO characters (user_id,name,is_active) VALUES ($1,$2,TRUE) RETURNING id,name,gender,appearance,authority,aura,is_active",
        [user.id,user.username]
      );
      character = created.rows[0];
    }

    let location = await pool.query(
      `SELECT p.id,p.slug,p.name FROM user_locations l
       JOIN planets p ON p.id=l.planet_id
       WHERE l.user_id=$1 AND p.is_active=TRUE`,
      [user.id]
    );
    let planet = location.rows[0] || null;
    if (requestedSlug && requestedSlug !== "current") {
      const requested = await pool.query(
        "SELECT id,slug,name FROM planets WHERE slug=$1 AND is_active=TRUE LIMIT 1",
        [requestedSlug]
      );
      if (requested.rowCount) planet = requested.rows[0];
    }
    if (!planet) {
      const fallback = await pool.query("SELECT id,slug,name FROM planets WHERE is_active=TRUE ORDER BY created_at ASC LIMIT 1");
      planet = fallback.rows[0] || null;
    }
    if (!planet) throw new Error("В мире пока нет доступных планет.");

    const room = await getRoomForUser(user.id, planet.slug);
    if (!room) throw new Error("На планете пока нет доступных комнат.");

    await pool.query(
      `INSERT INTO user_locations(user_id,planet_id,arrived_at) VALUES($1,$2,NOW())
       ON CONFLICT(user_id) DO UPDATE SET planet_id=EXCLUDED.planet_id,arrived_at=NOW()`,
      [user.id,planet.id]
    );
    await pool.query("DELETE FROM room_presence WHERE user_id=$1", [user.id]);
    const presenceId = crypto.randomUUID();
    await pool.query(
      "INSERT INTO room_presence(connection_id,room_id,user_id,character_id) VALUES($1,$2,$3,$4)",
      [presenceId,room.id,user.id,character.id]
    );
    socket.data.presenceId = presenceId;
    const position = await pool.query(
      `INSERT INTO room_player_positions(room_id,user_id,x,y) VALUES($1,$2,50+random()*20,78)
       ON CONFLICT(room_id,user_id) DO UPDATE SET updated_at=NOW()
       RETURNING x,y`,
      [room.id,user.id]
    );
    const wallet = await pool.query("SELECT coins,diamonds FROM wallet_balances WHERE user_id=$1",[user.id]);
    const player = {
      id:user.id,nickname:character.name||user.username,username:user.username,
      planet:planet.slug,roomId:room.id,x:Number(position.rows[0]?.x||50)/100,
      y:Number(position.rows[0]?.y||78)/100,authority:Number(character.authority||0),
      appearance:character.appearance||{},gender:character.gender||"unspecified",
      coins:Number(wallet.rows[0]?.coins||0),diamonds:Number(wallet.rows[0]?.diamonds||0),
      title:"Новичок",auraEnabled:Boolean(character.aura)
    };
    socket.data.player = player;
    socket.data.roomId = room.id;
    socket.join(room.id);

    const players = await pool.query(
      `SELECT rp.user_id AS id,COALESCE(c.name,u.username) AS nickname,u.username,
              COALESCE(pos.x,50)/100.0 AS x,COALESCE(pos.y,78)/100.0 AS y,
              COALESCE(c.appearance,'{}'::jsonb) AS appearance,c.gender,
              COALESCE(c.authority,0) AS authority
       FROM room_presence rp JOIN users u ON u.id=rp.user_id
       LEFT JOIN characters c ON c.id=rp.character_id
       LEFT JOIN room_player_positions pos ON pos.room_id=rp.room_id AND pos.user_id=rp.user_id
       WHERE rp.room_id=$1 AND rp.connected_at>NOW()-INTERVAL '2 minutes'
         AND u.status='active'
       ORDER BY rp.connected_at ASC`,
      [room.id]
    );
    const roster = players.rows.map(row => ({
      id:row.id,nickname:row.nickname,username:row.username,
      x:Number(row.x),y:Number(row.y),appearance:row.appearance||{},
      gender:row.gender||"unspecified",authority:Number(row.authority||0),
      title:"Новичок",auraEnabled:false
    }));
    socket.emit("planet:state",{planet:planet.slug,players:roster});
    socket.to(room.id).emit("player:joined",player);
    return player;
  }

  io.on("connection", socket => {
    const user = socket.data.user;
    activeSockets.set(user.id,socket);
    socket.on("player:join", async (_payload,ack) => {
      try {
        const player = await joinWorld(socket,"current");
        if (typeof ack === "function") ack({ok:true,player});
      } catch (error) {
        if (typeof ack === "function") ack({ok:false,error:error.message||"Не удалось войти в мир."});
      }
    });

    socket.on("chat:send", async (payload,ack) => {
      try {
        const text = String(payload?.text||"").trim();
        if (!text || text.length>1000 || !socket.data.roomId) throw new Error("Сообщение пустое или слишком длинное.");
        const result = await pool.query(
          `INSERT INTO room_messages(room_id,user_id,character_id,body)
           VALUES($1,$2,(SELECT id FROM characters WHERE user_id=$2 AND is_active=TRUE LIMIT 1),$3)
           RETURNING id,body,created_at`,
          [socket.data.roomId,user.id,text]
        );
        const message = {
          id:result.rows[0].id,playerId:user.id,nickname:socket.data.player?.nickname||user.username,
          text:result.rows[0].body,time:new Date(result.rows[0].created_at).getTime()
        };
        io.to(socket.data.roomId).emit("chat:message",message);
        if (typeof ack === "function") ack({ok:true});
      } catch (error) {
        if (typeof ack === "function") ack({ok:false,error:error.message||"Не удалось отправить сообщение."});
      }
    });

    socket.on("player:move", async (payload,ack) => {
      try {
        const x=Number(payload?.x),y=Number(payload?.y);
        if (!Number.isFinite(x)||!Number.isFinite(y)||x<.02||x>.98||y<.08||y>.92||!socket.data.roomId) throw new Error("Недопустимая позиция.");
        await pool.query(
          `INSERT INTO room_player_positions(room_id,user_id,x,y) VALUES($1,$2,$3,$4)
           ON CONFLICT(room_id,user_id) DO UPDATE SET x=EXCLUDED.x,y=EXCLUDED.y,updated_at=NOW()`,
          [socket.data.roomId,user.id,x*100,y*100]
        );
        socket.data.player.x=x;socket.data.player.y=y;
        socket.to(socket.data.roomId).emit("player:moved",{id:user.id,x,y});
        if(typeof ack==="function")ack({ok:true});
      } catch(error) { if(typeof ack==="function")ack({ok:false,error:error.message}); }
    });

    socket.on("planet:change", async (payload,ack) => {
      try {
        const key=String(payload?.planet||"");
        const slug=key.startsWith("custom-")?key.slice(7):key==="starter"?"nexora-prime":key;
        const player=await joinWorld(socket,slug);
        if(typeof ack==="function")ack({ok:true,player});
      } catch(error) { if(typeof ack==="function")ack({ok:false,error:error.message||"Не удалось сменить планету."}); }
    });

    socket.on("emotion:play",payload=>{
      const emotion=String(payload?.emotion||"").slice(0,24);
      if(["wave","smile","hug","kiss","dance","flower","sad","surprise","angry"].includes(emotion)&&socket.data.roomId)
        io.to(socket.data.roomId).emit("emotion:played",{id:user.id,emotion});
    });

    socket.on("player:action",(payload,ack)=>{
      const action=String(payload?.action||"");
      const targetId=String(payload?.targetId||"");
      if(!["wave","smile","hug","kiss","dance","flower"].includes(action)||!targetId||targetId===user.id){
        if(typeof ack==="function")ack({ok:false,error:"Действие недоступно."});return;
      }
      io.to(socket.data.roomId).emit("player:action:played",{
        fromId:user.id,toId:targetId,from:socket.data.player?.nickname||user.username,
        to:targetId,action,label:action
      });
      if(typeof ack==="function")ack({ok:true});
    });

    socket.on("whisper:send",(payload,ack)=>{
      const targetId=String(payload?.targetId||"");
      const text=String(payload?.text||"").trim();
      const peer=activeSockets.get(targetId);
      if(!peer||!text||text.length>1000){if(typeof ack==="function")ack({ok:false,error:"Пользователь не в сети или сообщение некорректно."});return;}
      peer.emit("whisper:received",{from:socket.data.player?.nickname||user.username,text,time:Date.now()});
      socket.emit("whisper:sent",{to:targetId});
      if(typeof ack==="function")ack({ok:true});
    });

    socket.on("disconnect",async()=>{
      if(activeSockets.get(user.id)===socket)activeSockets.delete(user.id);
      const roomId=socket.data.roomId;
      try{
        await pool.query("DELETE FROM room_presence WHERE connection_id=$1",[socket.data.presenceId]);
        if(roomId)socket.to(roomId).emit("player:left",{id:user.id});
      }catch(error){console.error("Socket presence cleanup failed:",error.message);}
    });
  });

  console.log("Socket.IO compatibility transport attached.");
  return io;
}

module.exports = { attachSocketCompat };
