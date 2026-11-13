const express = require("express");

const CATEGORIES = new Set(["social","romantic","music","dance","game","vip","private","custom"]);
const THEMES = new Set(["nebula","aurora","sunset","ocean","violet","emerald"]);
const clean = (value, max) => String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
const planetKey = id => "custom-" + String(id);

function createPlanetsRouter({ pool, auth, players, io }) {
  const router = express.Router();
  async function account(req) {
    return auth.authenticateToken(req.cookies?.nexora_session);
  }
  async function planetAccess(planetId, accountId, inviteId) {
    const found = await pool.query(
      `SELECT p.*, (SELECT COUNT(*)::int FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id) AS members,
        EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$2) AS staff,
        EXISTS(SELECT 1 FROM nexora_social_world.planet_bans b WHERE b.planet_id=p.id AND b.account_id=$2 AND (b.expires_at IS NULL OR b.expires_at>NOW())) AS banned,
        EXISTS(SELECT 1 FROM nexora_social_world.planet_invites i WHERE i.planet_id=p.id AND i.invited_account_id=$2 AND i.used_at IS NULL AND i.expires_at>NOW() AND ($3::bigint IS NULL OR i.id=$3)) AS invited,
        EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$2) AS member
       FROM nexora_social_world.planets p WHERE p.id=$1 AND p.status='active'`, [planetId, accountId, inviteId || null]
    );
    const p = found.rows[0];
    if (!p) return { error: "Планета недоступна.", status: 404 };
    if (p.banned) return { error: "Владелец планеты ограничил вам доступ.", status: 403 };
    if (p.access_mode === "private" && String(p.owner_account_id) !== String(accountId) && !p.staff) return { error: "Планета закрыта для посещения.", status: 403 };
    if (p.access_mode === "invite" && String(p.owner_account_id) !== String(accountId) && !p.staff && !p.invited && !p.member) return { error: "Для входа требуется приглашение.", status: 403 };
    const onlineCount = [...players.values()].filter(x => x.planet === "custom-" + String(planetId)).length;
    if (onlineCount >= p.capacity && String(p.owner_account_id) !== String(accountId)) return { error: "На планете нет свободных мест.", status: 409 };
    return { planet: p };
  }
  router.get("/", async (req,res,next) => {
    try {
      const me = await account(req); if (!me) return res.status(401).json({error:"Требуется вход."});
      const q = clean(req.query.q, 32);
      const category = CATEGORIES.has(req.query.category) ? req.query.category : "";
      const rows = await pool.query(
        `SELECT p.id,p.name,p.description,p.category,p.theme,p.accent_color,p.access_mode,p.capacity,p.total_visits,p.created_at,
          p.owner_account_id AS "ownerId",a.nickname AS "ownerNickname",c.avatar AS "ownerAvatar",
          (SELECT COUNT(*)::int FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id) AS "memberCount",
          EXISTS(SELECT 1 FROM nexora_social_world.planet_favorites f WHERE f.planet_id=p.id AND f.account_id=$3) AS favorite
         FROM nexora_social_world.planets p
         JOIN nexora_social_world.accounts a ON a.id=p.owner_account_id
         LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
         WHERE p.status='active' AND (p.access_mode='public' OR p.owner_account_id=$3 OR EXISTS(SELECT 1 FROM nexora_social_world.planet_staff s WHERE s.planet_id=p.id AND s.account_id=$3) OR EXISTS(SELECT 1 FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id AND m.account_id=$3)) AND ($1='' OR p.name ILIKE '%'||$1||'%') AND ($2='' OR p.category=$2)
         ORDER BY p.total_visits DESC,p.created_at DESC LIMIT 100`, [q,category,me.id]
      );
      const onlineCounts = new Map();
      for (const player of players.values()) if (String(player.planet).startsWith("custom-")) onlineCounts.set(String(player.planet).slice(7),(onlineCounts.get(String(player.planet).slice(7))||0)+1);
      res.json({ok:true,planets:rows.rows.map(p=>({...p,id:String(p.id),ownerId:String(p.ownerId),isOwner:String(p.ownerId)===String(me.id),onlineCount:onlineCounts.get(String(p.id))||0}))});
    } catch(e){next(e);}
  });
  router.post("/", async (req,res,next) => {
    const me = await account(req); if(!me) return res.status(401).json({error:"Требуется вход."});
    const name=clean(req.body?.name,32), description=clean(req.body?.description,240);
    const category=CATEGORIES.has(req.body?.category)?req.body.category:"social";
    const theme=THEMES.has(req.body?.theme)?req.body.theme:"nebula";
    const color=/^#[0-9a-f]{6}$/i.test(req.body?.accentColor||"")?req.body.accentColor:"#9d8cff";
    const access=["public","invite","private"].includes(req.body?.accessMode)?req.body.accessMode:"public";
    const capacity=Math.max(2,Math.min(100,Math.floor(Number(req.body?.capacity)||30)));
    const welcome=clean(req.body?.welcomeMessage,180);
    if(name.length<3) return res.status(400).json({error:"Название должно содержать от 3 символов."});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const count=await client.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.planets WHERE owner_account_id=$1 AND status<>'blocked'",[me.id]);
      if(count.rows[0].count>=3){await client.query("ROLLBACK");return res.status(409).json({error:"Достигнут лимит: не более трёх планет на аккаунт."});}
      const created=await client.query(
        `INSERT INTO nexora_social_world.planets(owner_account_id,name,description,category,theme,accent_color,access_mode,capacity,welcome_message)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,name,description,category,theme,accent_color,access_mode,capacity,total_visits,created_at`,
        [me.id,name,description,category,theme,color,access,capacity,welcome]
      );
      const p=created.rows[0];
      await client.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2)",[p.id,me.id]);
      await client.query("INSERT INTO nexora_social_world.planet_settings(planet_id,settings) VALUES($1,$2::jsonb)",[p.id,JSON.stringify({decorations:[],lighting:"soft"})]);
      await client.query("INSERT INTO nexora_social_world.planet_audit_logs(planet_id,actor_account_id,action,details) VALUES($1,$2,'created',$3::jsonb)",[p.id,me.id,JSON.stringify({name})]);
      await client.query("COMMIT");
      res.status(201).json({ok:true,planet:{...p,id:String(p.id),key:planetKey(p.id),ownerId:String(me.id),ownerNickname:me.nickname,memberCount:1,onlineCount:0}});
    }catch(e){await client.query("ROLLBACK");next(e);}finally{client.release();}
  });
  router.get("/:id",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:"Некорректный ID."});
      const result=await pool.query(`SELECT p.*,a.nickname AS owner_nickname,c.avatar AS owner_avatar,
        (SELECT COUNT(*)::int FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id) AS member_count
        FROM nexora_social_world.planets p JOIN nexora_social_world.accounts a ON a.id=p.owner_account_id
        LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id WHERE p.id=$1`,[req.params.id]);
      if(!result.rowCount)return res.status(404).json({error:"Планета не найдена."});
      const p=result.rows[0];
      const staff=String(p.owner_account_id)===String(me.id)||!!(await pool.query("SELECT 1 FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[p.id,me.id])).rowCount;
      res.json({ok:true,planet:{...p,id:String(p.id),ownerId:String(p.owner_account_id),isOwner:String(p.owner_account_id)===String(me.id),isStaff:staff}});
    }catch(e){next(e);}
  });
  router.patch("/:id",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const id=req.params.id;if(!/^\d+$/.test(id))return res.status(400).json({error:"Некорректный ID."});
      const p=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[id]);
      if(!p.rowCount)return res.status(404).json({error:"Планета не найдена."});
      const staff=await pool.query("SELECT role FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[id,me.id]);
      const owner=String(p.rows[0].owner_account_id)===String(me.id);
      if(!owner&&!staff.rowCount)return res.status(403).json({error:"Нет прав управления планетой."});
      const fields={name:clean(req.body?.name,32),description:clean(req.body?.description,240),welcome:clean(req.body?.welcomeMessage,180)};
      const category=CATEGORIES.has(req.body?.category)?req.body.category:"social";
      const theme=THEMES.has(req.body?.theme)?req.body.theme:"nebula";
      const access=["public","invite","private"].includes(req.body?.accessMode)?req.body.accessMode:"public";
      const capacity=Math.max(2,Math.min(100,Math.floor(Number(req.body?.capacity)||30)));
      const updated=await pool.query(`UPDATE nexora_social_world.planets SET name=COALESCE(NULLIF($2,''),name),description=$3,welcome_message=$4,category=$5,theme=$6,access_mode=$7,capacity=$8,updated_at=NOW() WHERE id=$1 RETURNING *`,[id,fields.name,fields.description,fields.welcome,category,theme,access,capacity]);
      await pool.query("INSERT INTO nexora_social_world.planet_audit_logs(planet_id,actor_account_id,action,details) VALUES($1,$2,'updated',$3::jsonb)",[id,me.id,JSON.stringify({name:fields.name,accessMode:access,capacity})]);
      res.json({ok:true,planet:updated.rows[0]});
    }catch(e){next(e);}
  });
  router.post("/:id/favorite",async(req,res,next)=>{
    try{const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});await pool.query("INSERT INTO nexora_social_world.planet_favorites(planet_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,me.id]);res.json({ok:true});}catch(e){next(e);}
  });
  router.delete("/:id/favorite",async(req,res,next)=>{
    try{const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});await pool.query("DELETE FROM nexora_social_world.planet_favorites WHERE planet_id=$1 AND account_id=$2",[req.params.id,me.id]);res.json({ok:true});}catch(e){next(e);}
  });
  router.post("/:id/invite",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const owner=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[req.params.id]);
      const staff=await pool.query("SELECT 1 FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[req.params.id,me.id]);
      if(!owner.rowCount||String(owner.rows[0].owner_account_id)!==String(me.id)&&!staff.rowCount)return res.status(403).json({error:"Только владелец и сотрудники могут приглашать."});
      const target=String(req.body?.accountId||"");if(!/^\d+$/.test(target)||target===String(me.id))return res.status(400).json({error:"Некорректный игрок."});
      await pool.query("INSERT INTO nexora_social_world.planet_invites(planet_id,invited_account_id,invited_by) VALUES($1,$2,$3) ON CONFLICT(planet_id,invited_account_id) DO UPDATE SET invited_by=EXCLUDED.invited_by,expires_at=NOW()+INTERVAL '7 days',used_at=NULL",[req.params.id,target,me.id]);
      res.json({ok:true});
    }catch(e){next(e);}
  });
  router.get("/:id/visitors",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const p=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[req.params.id]);
      const staff=await pool.query("SELECT 1 FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[req.params.id,me.id]);
      if(!p.rowCount||String(p.rows[0].owner_account_id)!==String(me.id)&&!staff.rowCount)return res.status(403).json({error:"Нет доступа."});
      const online=[...players.values()].filter(x=>x.planet==="custom-"+req.params.id).map(x=>({id:x.id,nickname:x.nickname,avatar:x.avatar}));
      res.json({ok:true,visitors:online});
    }catch(e){next(e);}
  });
  router.post("/:id/ban",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const target=String(req.body?.accountId||"");const reason=clean(req.body?.reason,300)||"Нарушение правил планеты";
      const p=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[req.params.id]);
      const staff=await pool.query("SELECT role FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[req.params.id,me.id]);
      if(!p.rowCount||String(p.rows[0].owner_account_id)!==String(me.id)&&!staff.rowCount)return res.status(403).json({error:"Нет доступа."});
      if(!/^\d+$/.test(target)||target===String(p.rows[0].owner_account_id))return res.status(400).json({error:"Нельзя заблокировать владельца."});
      await pool.query("INSERT INTO nexora_social_world.planet_bans(planet_id,account_id,actor_account_id,reason,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '24 hours') ON CONFLICT(planet_id,account_id) DO UPDATE SET actor_account_id=EXCLUDED.actor_account_id,reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at",[req.params.id,target,me.id,reason]);
      await pool.query("INSERT INTO nexora_social_world.planet_audit_logs(planet_id,actor_account_id,target_account_id,action,details) VALUES($1,$2,$3,'ban',$4::jsonb)",[req.params.id,me.id,target,JSON.stringify({reason})]);
      for(const player of players.values())if(player.id===target&&player.planet==="custom-"+req.params.id){const sock=io.sockets.sockets.get(player.socketId);if(sock)sock.emit("planet:access-revoked",{message:"Доступ к планете ограничен."});}
      res.json({ok:true});
    }catch(e){next(e);}
  });
  router.post("/:id/staff",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const p=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[req.params.id]);
      if(!p.rowCount||String(p.rows[0].owner_account_id)!==String(me.id))return res.status(403).json({error:"Только владелец назначает сотрудников."});
      const target=String(req.body?.accountId||"");const role=req.body?.role==="ADMIN"?"ADMIN":"MODERATOR";
      if(!/^\d+$/.test(target)||target===String(me.id))return res.status(400).json({error:"Некорректный сотрудник."});
      await pool.query("INSERT INTO nexora_social_world.planet_staff(planet_id,account_id,role) VALUES($1,$2,$3) ON CONFLICT(planet_id,account_id) DO UPDATE SET role=EXCLUDED.role",[req.params.id,target,role]);
      res.json({ok:true});
    }catch(e){next(e);}
  });
  router.delete("/:id/staff/:accountId",async(req,res,next)=>{
    try{const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});const p=await pool.query("SELECT owner_account_id FROM nexora_social_world.planets WHERE id=$1",[req.params.id]);if(!p.rowCount||String(p.rows[0].owner_account_id)!==String(me.id))return res.status(403).json({error:"Только владелец может снимать полномочия."});await pool.query("DELETE FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[req.params.id,req.params.accountId]);res.json({ok:true});}catch(e){next(e);}
  });
  router.post("/:id/visit",async(req,res,next)=>{
    try{
      const me=await account(req);if(!me)return res.status(401).json({error:"Требуется вход."});
      const result=await planetAccess(req.params.id,me.id,req.body?.inviteId);
      if(result.error)return res.status(result.status).json({error:result.error});
      await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,me.id]);
      await pool.query("INSERT INTO nexora_social_world.planet_visits(planet_id,account_id) VALUES($1,$2)",[req.params.id,me.id]);
      await pool.query("UPDATE nexora_social_world.planets SET total_visits=total_visits+1 WHERE id=$1",[req.params.id]);
      res.json({ok:true,key:planetKey(req.params.id),planet:result.planet});
    }catch(e){next(e);}
  });
  return router;
}
module.exports={createPlanetsRouter,planetKey};
