const cookie = require("cookie");

const EMOTIONS = new Set(["wave","kiss","dance","smile","sad","laugh","surprise","love","angry","blush","sleep","music"]);
const ACTIONS = new Set(["wave","smile","hug","kiss","dance","flower"]);
const clean = value => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 240);
const roomName = planet => "planet:" + planet;

function publicPlayer(player) {
  return {
    id: player.id, nickname: player.nickname, avatar: player.avatar, planet: player.planet,
    x: player.x, y: player.y, authority: player.authority,
    title: ({ NOVICE: "Новичок", BEDA: "Беда", PAPA: "Папа", ANGEL: "Ангел", CREATOR: "Создатель" })[player.authorityTitle] || "Новичок",
    authorityTitle: player.authorityTitle, auraType: player.auraType, auraEnabled: player.auraEnabled,
    bubble: null, emotion: player.emotion || null
  };
}

function attachGalaxySockets(io, { pool, auth, planets, normalizeAvatar }) {
  const galaxy = io.of("/galaxy");
  const players = new Map();

  galaxy.use(async (socket, next) => {
    try {
      const parsed = cookie.parse(socket.handshake.headers.cookie || "");
      const account = await auth.authenticateToken(parsed.nexora_session);
      if (!account) return next(new Error("AUTH_REQUIRED"));
      socket.data.account = account;
      next();
    } catch (error) { next(error); }
  });

  const emitState = async socket => {
    const player = socket.data.player;
    if (!player) return;
    const list = [...players.values()].filter(item => item.planet === player.planet).map(publicPlayer);
    const result = await pool.query(
      "SELECT id,account_id AS \"playerId\",nickname,message AS text,created_at FROM nexora_social_world.planet_chat_messages WHERE planet_key=$1 ORDER BY id DESC LIMIT 80",
      [player.planet]
    );
    const history = result.rows.reverse().map(row => ({id:String(row.id),playerId:String(row.playerId),nickname:row.nickname,text:row.text,time:new Date(row.created_at).getTime()}));
    socket.emit("planet:state", {planet:player.planet,players:list,history});
  };

  galaxy.on("connection", socket => {
    socket.join("account:" + socket.data.account.id);

    socket.on("player:join", async (_payload, ack = () => {}) => {
      try {
        const account = socket.data.account;
        for (const [oldSocketId, oldPlayer] of players) {
          if (String(oldPlayer.accountId) === String(account.id)) {
            galaxy.to(roomName(oldPlayer.planet)).emit("player:left", { id: oldPlayer.id });
            players.delete(oldSocketId);
            const oldSocket = galaxy.sockets.get(oldSocketId);
            if (oldSocket && oldSocket.id !== socket.id) oldSocket.disconnect(true);
          }
        }
        const result = await pool.query(
          "SELECT nickname,avatar,planet,position_x,position_y,authority,authority_title,aura_enabled FROM nexora_social_world.characters WHERE account_id=$1",
          [account.id]
        );
        const saved = result.rows[0];
        if (!saved) return ack({ ok: false, error: "Персонаж не найден." });
        let planet = Object.hasOwn(planets, saved.planet) ? saved.planet : /^custom-\d+$/.test(String(saved.planet || "")) ? saved.planet : "starter";
        const match = /^custom-(\d+)$/.exec(planet);
        if (match) {
          const access = await pool.query(
            `SELECT p.id,p.status,p.access_mode,p.owner_account_id,
              EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$2) AS staff,
              EXISTS(SELECT 1 FROM nexora_social_world.planet_bans b WHERE b.planet_id=p.id AND b.account_id=$2 AND (b.expires_at IS NULL OR b.expires_at>NOW())) AS banned,
              EXISTS(SELECT 1 FROM nexora_social_world.planet_invites i WHERE i.planet_id=p.id AND i.invited_account_id=$2 AND i.expires_at>NOW()) AS invited,
              EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$2) AS member
             FROM nexora_social_world.custom_planets p WHERE p.id=$1`,
            [match[1], account.id]
          );
          const p = access.rows[0];
          if (!p || p.status !== "active" || p.banned ||
            (p.access_mode === "private" && String(p.owner_account_id) !== String(account.id) && !p.staff) ||
            (p.access_mode === "invite" && String(p.owner_account_id) !== String(account.id) && !p.staff && !p.invited && !p.member)) planet = "starter";
        }
        const player = {
          id: String(account.id), accountId: account.id, socketId: socket.id, nickname: saved.nickname,
          avatar: normalizeAvatar(saved.avatar), planet,
          x: Math.max(.04, Math.min(.96, Number(saved.position_x ?? .5))),
          y: .82,
          authority: saved.authority || 0, authorityTitle: saved.authority_title || "NOVICE",
          auraType: ({ NOVICE:"NONE", BEDA:"GOLD_SOFT", PAPA:"GOLD_PREMIUM", ANGEL:"GREEN", CREATOR:"FIRE_RED" })[saved.authority_title] || "NONE",
          auraEnabled: Boolean(saved.aura_enabled), lastMoveAt: 0, lastActionAt: 0, lastEmotionAt: 0
        };
        players.set(socket.id, player);
        socket.data.player = player;
        socket.join(roomName(planet));
        await emitState(socket);
        socket.to(roomName(planet)).emit("player:joined", publicPlayer(player));
        ack({ ok: true, player: publicPlayer(player) });
      } catch (error) {
        console.error("Galaxy join failed:", error);
        ack({ ok: false, error: "Не удалось загрузить планету." });
      }
    });

    socket.on("player:move", async (payload, ack = () => {}) => {
      const player = players.get(socket.id);
      if (!player) return ack({ ok: false, error: "Сначала войдите на планету." });
      const now = Date.now();
      if (now - player.lastMoveAt < 110) return ack({ ok: false, error: "Слишком быстро." });
      const requestedX = Number(payload?.x), requestedY = Number(payload?.y ?? player.y);
      if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return ack({ ok: false, error: "Некорректная позиция." });
      let x = Math.max(.04, Math.min(.96, requestedX));
      const y = .82;
      if (Math.abs(x - player.x) > .12) return ack({ ok: false, error: "Перемещение слишком быстрое." });
      const occupied = [...players.values()].filter(other => other.id !== player.id && other.planet === player.planet);
      for (let pass = 0; pass < occupied.length + 1; pass++) {
        const collision = occupied.find(other => Math.abs(x - other.x) < .045);
        if (!collision) break;
        const left = Math.max(.04, collision.x - .047), right = Math.min(.96, collision.x + .047);
        const leftFree = occupied.every(other => other.id === collision.id || Math.abs(left - other.x) >= .045);
        const rightFree = occupied.every(other => other.id === collision.id || Math.abs(right - other.x) >= .045);
        if (!leftFree && !rightFree) return ack({ ok: false, error: "В этой части линии нет свободного места." });
        x = leftFree && rightFree ? (Math.abs(left-requestedX)<=Math.abs(right-requestedX)?left:right) : leftFree ? left : right;
      }
      player.x=x;player.y=y;player.lastMoveAt=now;
      galaxy.to(roomName(player.planet)).emit("player:moved",{id:player.id,x,y,serverTime:now});
      pool.query("UPDATE nexora_social_world.characters SET position_x=$1,position_y=$2,updated_at=NOW() WHERE account_id=$3",[x,y,player.accountId]).catch(error=>console.error("Galaxy position save failed:",error.message));
      ack({ok:true,x,y});
    });

    socket.on("chat:send", async (payload, ack = () => {}) => {
      const player=players.get(socket.id);
      if(!player)return ack({ok:false,error:"Персонаж не подключён."});
      const text=clean(payload?.text);
      if(!text)return ack({ok:false,error:"Введите сообщение."});
      try{
        const saved=await pool.query("INSERT INTO nexora_social_world.planet_chat_messages(planet_key,account_id,nickname,message) VALUES($1,$2,$3,$4) RETURNING id,created_at",[player.planet,player.accountId,player.nickname,text]);
        const row=saved.rows[0],message={id:String(row.id),playerId:player.id,nickname:player.nickname,text,time:new Date(row.created_at).getTime()};
        galaxy.to(roomName(player.planet)).emit("chat:message",message);
        galaxy.to(roomName(player.planet)).emit("player:bubble",{id:player.id,text:message.text,time:message.time});
        ack({ok:true,id:message.id});
      }catch(error){console.error("Galaxy chat save failed:",error);ack({ok:false,error:"Не удалось сохранить сообщение. Попробуйте ещё раз."});}
    });

    socket.on("emotion:play",(payload,ack=()=>{})=>{
      const player=players.get(socket.id),emotion=String(payload?.emotion||"");
      if(!player||!EMOTIONS.has(emotion))return ack({ok:false,error:"Эмоция недоступна."});
      const now=Date.now();if(now-player.lastEmotionAt<350)return ack({ok:false,error:"Подожди немного."});
      player.lastEmotionAt=now;player.emotion={type:emotion,until:now+1800};
      galaxy.to(roomName(player.planet)).emit("emotion:played",{id:player.id,emotion});ack({ok:true});
    });

    socket.on("player:action",(payload,ack=()=>{})=>{
      const sender=players.get(socket.id),target=[...players.values()].find(p=>p.id===String(payload?.targetId||"")),action=String(payload?.action||"");
      const labels={wave:"поприветствовал(а)",smile:"улыбнулся(ась)",hug:"обнял(а)",kiss:"отправил(а) воздушный поцелуй",dance:"пригласил(а) танцевать",flower:"подарил(а) цветок"};
      if(!sender||!target||sender.id===target.id||sender.planet!==target.planet||!ACTIONS.has(action))return ack({ok:false,error:"Действие недоступно."});
      const now=Date.now();if(now-sender.lastActionAt<1200)return ack({ok:false,error:"Подожди перед следующим действием."});sender.lastActionAt=now;
      galaxy.to(roomName(sender.planet)).emit("player:action:played",{fromId:sender.id,toId:target.id,from:sender.nickname,to:target.nickname,action,label:labels[action],time:now});
      galaxy.to(roomName(sender.planet)).emit("chat:message",{id:"action-"+now,playerId:sender.id,nickname:"NEXORA",text:sender.nickname+" "+labels[action]+" "+target.nickname+".",time:now,system:true});
      ack({ok:true});
    });

    socket.on("planet:change",async(payload,ack=()=>{})=>{
      const player=players.get(socket.id),nextPlanet=String(payload?.planet||"");
      if(!player)return ack({ok:false,error:"Персонаж не подключён."});
      let valid=Object.hasOwn(planets,nextPlanet),customId=null;
      const match=/^custom-(\d+)$/.exec(nextPlanet);
      if(match){
        customId=match[1];
        const check=await pool.query(
          `SELECT p.id,p.capacity,p.access_mode,p.owner_account_id,p.status,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_bans b WHERE b.planet_id=p.id AND b.account_id=$2 AND (b.expires_at IS NULL OR b.expires_at>NOW())) AS banned,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$2) AS staff,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_invites i WHERE i.planet_id=p.id AND i.invited_account_id=$2 AND i.expires_at>NOW()) AS invited,
            EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$2) AS member
           FROM nexora_social_world.custom_planets p WHERE p.id=$1`,[customId,player.accountId]
        );
        const p=check.rows[0];
        if(p&&p.status==="active"&&!p.banned&&(p.access_mode==="public"||String(p.owner_account_id)===String(player.accountId)||p.staff||p.invited||p.member)){
          valid=[...players.values()].filter(x=>x.planet===nextPlanet&&x.id!==player.id).length<Number(p.capacity);
        }
      }
      if(!valid)return ack({ok:false,error:"Планета недоступна или заполнена."});
      if(player.planet===nextPlanet)return ack({ok:true});
      const old=player.planet;socket.to(roomName(old)).emit("player:left",{id:player.id});socket.leave(roomName(old));
      player.planet=nextPlanet;player.x=.5;player.y=.82;socket.join(roomName(nextPlanet));
      await pool.query("UPDATE nexora_social_world.characters SET planet=$1,position_x=.5,position_y=.82,updated_at=NOW() WHERE account_id=$2",[nextPlanet,player.accountId]);
      if(customId){await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[customId,player.accountId]);}
      await emitState(socket);socket.to(roomName(nextPlanet)).emit("player:joined",publicPlayer(player));ack({ok:true,planet:nextPlanet});
    });

    socket.on("disconnect",()=>{
      const player=players.get(socket.id);if(!player)return;
      socket.to(roomName(player.planet)).emit("player:left",{id:player.id});players.delete(socket.id);
    });
  });
  return galaxy;
}

module.exports = { attachGalaxySockets };
