const express = require("express");

const PERMISSIONS = new Set([
  "players.view", "players.ban", "players.unban", "players.warn", "players.delete",
  "moderation.view", "world.view", "world.manage", "economy.view",
  "economy.manage", "items.view", "items.manage", "system.view",
  "roles.manage", "logs.view", "reports.manage",
  "authority.view", "authority.assign", "authority.remove", "authority.configure", "authority.history",
  "planets.view", "planets.manage"
]);
const ROLES = new Set(["DEVELOPER", "MODERATOR", "HELPER", "USER"]);
function ownerId() {
  const value = String(process.env.NEXORA_OWNER_ACCOUNT_ID || "").trim();
  return /^\d+$/.test(value) ? value : "";
}
function createDeveloperRouter({ pool, auth, players, planets, io }) {
  const router = express.Router();
  const requestTimes = new Map();
  async function context(req) {
    const account = await auth.authenticateToken(req.cookies?.nexora_session);
    if (!account) return null;
    const result = await pool.query("SELECT role, permissions FROM nexora_social_world.developer_role_assignments WHERE account_id=$1", [account.id]);
    const assignment = result.rows[0] || null;
    const adminAssigned = assignment?.role === "ADMIN";
    if (ownerId() && String(account.id) === ownerId()) return { account, role: "OWNER", permissions: [...PERMISSIONS], adminAssigned };
    if (!assignment) return { account, role: "USER", permissions: [], adminAssigned: false };
    const permissions = Array.isArray(assignment.permissions) ? assignment.permissions.filter(p => PERMISSIONS.has(p)) : [];
    return { account, role: assignment.role, permissions, adminAssigned };
  }
  async function requirePermission(req, res, permission) {
    const current = await context(req);
    if (!current) { res.status(401).json({ error: "Требуется вход." }); return null; }
    if (!current.permissions.includes(permission)) { res.status(403).json({ error: "Недостаточно прав." }); return null; }
    const key = String(current.account.id), now = Date.now();
    const recent = (requestTimes.get(key) || []).filter(time => now - time < 60000);
    if (recent.length >= 60) { res.status(429).json({ error: "Слишком много запросов. Повторите позже." }); return null; }
    recent.push(now); requestTimes.set(key, recent);
    return current;
  }
  async function audit(client, current, targetId, action, reason, details = {}) {
    await client.query(
      "INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [current.account.id, targetId || null, action, reason || null, JSON.stringify(details)]
    );
  }
  router.get("/access", async (req, res, next) => {
    try {
      const current = await context(req);
      if (!current) return res.status(401).json({ error: "Требуется вход." });
      res.json({ ok: true, accountId: String(current.account.id), allowed: current.role === "OWNER" || current.permissions.length > 0, isOwner: current.role === "OWNER", adminAssigned: Boolean(current.adminAssigned), role: current.role, permissions: current.permissions });
    } catch (error) { next(error); }
  });
  router.get("/overview", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "system.view"); if (!current) return;
      const counts = await pool.query("SELECT (SELECT COUNT(*)::int FROM nexora_social_world.accounts) AS accounts, (SELECT COUNT(*)::int FROM nexora_social_world.characters) AS characters, (SELECT COUNT(*)::int FROM nexora_social_world.accounts WHERE created_at >= NOW() - INTERVAL '1 day') AS registrationsToday");
      const active = new Set([...players.values()].map(player => player.planet));
      res.json({ ok: true, role: current.role, server: "online", database: "connected", onlinePlayers: players.size, accounts: counts.rows[0].accounts, characters: counts.rows[0].characters, registrationsToday: counts.rows[0].registrationstoday, activeRooms: active.size });
    } catch (error) { next(error); }
  });
  router.get("/players", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.view"); if (!current) return;
      const query = String(req.query.q || "").trim().slice(0, 18);
      const result = await pool.query(
        `SELECT a.id,a.nickname,a.created_at,a.last_login_at,COALESCE(c.planet,'unknown') AS planet,
                COALESCE(w.balance,0)::text AS balance,
                EXISTS(SELECT 1 FROM nexora_social_world.moderation_actions m WHERE m.target_account_id=a.id AND m.action_type='BAN' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>NOW())) AS banned
           FROM nexora_social_world.accounts a
           LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
           LEFT JOIN nexora_social_world.wallets w ON w.account_id=a.id
          WHERE ($1='' OR a.nickname ILIKE $2 OR a.id::text=$1)
          ORDER BY a.created_at DESC LIMIT 50`,
        [query, "%" + query.replace(/[\\%_]/g, "\\\\$&") + "%"]
      );
      const online = new Set([...players.values()].map(player => String(player.accountId)));
      res.json({ ok: true, players: result.rows.map(p => ({ id: String(p.id), nickname: p.nickname, planet: p.planet, createdAt: p.created_at, lastLoginAt: p.last_login_at, balance: p.balance, banned: p.banned, online: online.has(String(p.id)) })) });
    } catch (error) { next(error); }
  });
  router.get("/players/:id", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.view"); if (!current) return;
      if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: "Некорректный ID." });
      const result = await pool.query(
        `SELECT a.id,a.nickname,a.created_at,a.last_login_at,c.avatar,c.planet,c.level,c.experience,c.authority,
                COALESCE(w.balance,0)::text AS balance
           FROM nexora_social_world.accounts a
           LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
           LEFT JOIN nexora_social_world.wallets w ON w.account_id=a.id
          WHERE a.id=$1`, [req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Игрок не найден." });
      const inventory = await pool.query("SELECT item_code,quantity,metadata FROM nexora_social_world.inventory WHERE account_id=$1 ORDER BY item_code", [req.params.id]);
      const punishments = await pool.query("SELECT action_type,reason,expires_at,created_at,revoked_at FROM nexora_social_world.moderation_actions WHERE target_account_id=$1 ORDER BY created_at DESC LIMIT 30", [req.params.id]);
      res.json({ ok: true, player: result.rows[0], inventory: inventory.rows, punishments: punishments.rows });
    } catch (error) { next(error); }
  });
  router.delete("/players/:id", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.delete"); if (!current) return;
      const targetId = String(req.params.id);
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      const confirmation = String(req.body?.confirmNickname || "").trim();
      if (!/^\d+$/.test(targetId) || !reason || !confirmation) return res.status(400).json({ error: "Укажите причину и точный ник персонажа для подтверждения удаления." });
      if (targetId === String(current.account.id) || (ownerId() && targetId === ownerId())) return res.status(403).json({ error: "Нельзя удалить собственный аккаунт или OWNER." });
      const client = await pool.connect();
      let deleted;
      try {
        await client.query("BEGIN");
        const target = await client.query("SELECT a.id,a.nickname,r.role,EXISTS(SELECT 1 FROM nexora_social_world.custom_planets cp WHERE cp.owner_account_id=a.id) AS owns_planets FROM nexora_social_world.accounts a LEFT JOIN nexora_social_world.developer_role_assignments r ON r.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a", [targetId]);
        if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Персонаж не найден." }); }
        const player = target.rows[0];
        if (player.owns_planets) { await client.query("ROLLBACK"); return res.status(409).json({ error: "У персонажа есть собственные планеты. Сначала передайте их другому владельцу или удалите отдельно." }); }
        if (confirmation !== player.nickname) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Ник не совпадает. Удаление отменено." }); }
        if (["OWNER", "DEVELOPER", "ADMIN"].includes(player.role) || (ownerId() && targetId === ownerId())) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Нельзя удалить аккаунт владельца или другого сотрудника." }); }
        await audit(client, current, targetId, "player.delete", reason, { nickname: player.nickname, deletedAccountId: targetId, deletedCharacterAndAccount: true });
        deleted = await client.query("DELETE FROM nexora_social_world.accounts WHERE id=$1 RETURNING id", [targetId]);
        await client.query("COMMIT");
        for (const [socketId, onlinePlayer] of players.entries()) {
          if (String(onlinePlayer.accountId) === targetId) {
            io?.sockets?.sockets?.get(socketId)?.disconnect(true);
            players.delete(socketId);
          }
        }
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      res.json({ ok: true, deleted: Boolean(deleted?.rowCount) });
    } catch (error) { next(error); }
  });
  router.post("/players/:id/ban", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.ban"); if (!current) return;
      const targetId = String(req.params.id);
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      const hours = req.body?.hours == null || req.body.hours === "" ? null : Number(req.body.hours);
      if (!/^\d+$/.test(targetId) || !reason || (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > 8760))) return res.status(400).json({ error: "Укажите корректный ID, причину и срок от 1 до 8760 часов либо постоянную блокировку." });
      if (ownerId() && targetId === ownerId()) return res.status(403).json({ error: "Нельзя заблокировать OWNER." });
      const target = await pool.query("SELECT id FROM nexora_social_world.accounts WHERE id=$1", [targetId]);
      if (!target.rowCount) return res.status(404).json({ error: "Игрок не найден." });
      const expiresAt = hours === null ? null : new Date(Date.now() + hours * 3600000);
      const result = await pool.query("INSERT INTO nexora_social_world.moderation_actions(actor_account_id,target_account_id,action_type,reason,expires_at) VALUES($1,$2,'BAN',$3,$4) RETURNING id,expires_at", [current.account.id,targetId,reason,expiresAt]);
      await pool.query("INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details) VALUES($1,$2,'player.ban',$3,$4::jsonb)", [current.account.id,targetId,reason,JSON.stringify({ moderationId: result.rows[0].id, expiresAt })]);
      for (const [socketId, onlinePlayer] of players.entries()) {
        if (String(onlinePlayer.accountId) !== targetId) continue;
        io?.to("planet:" + onlinePlayer.planet).emit("player:left", { id: String(onlinePlayer.accountId) });
        io?.sockets?.sockets?.get(socketId)?.disconnect(true);
        players.delete(socketId);
      }
      res.status(201).json({ ok: true, moderation: result.rows[0] });
    } catch (error) { next(error); }
  });
  router.delete("/players/:id/ban", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "players.unban"); if (!current) return;
      const targetId = String(req.params.id), reason = String(req.body?.reason || "").trim().slice(0,500);
      if (!/^\d+$/.test(targetId) || !reason) return res.status(400).json({ error: "Укажите ID игрока и причину разблокировки." });
      const client = await pool.connect();
      let changed;
      try {
        await client.query("BEGIN");
        const target = await client.query("SELECT id FROM nexora_social_world.accounts WHERE id=$1 FOR UPDATE", [targetId]);
        if (!target.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Персонаж не найден." }); }
        changed = await client.query("UPDATE nexora_social_world.moderation_actions SET revoked_at=NOW(),revoked_by=$2,revocation_reason=$3 WHERE target_account_id=$1 AND action_type='BAN' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>NOW()) RETURNING id", [targetId,current.account.id,reason]);
        if (changed.rowCount) await audit(client,current,targetId,"player.unban",reason,{ moderationIds: changed.rows.map(row=>row.id) });
        await client.query("COMMIT");
      } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
      res.json({ ok:true, revoked:changed.rowCount });
    } catch(error){next(error);}
  });
  router.post("/players/:id/warn", async (req,res,next)=>{
    try{
      const current=await requirePermission(req,res,"players.warn"); if(!current)return;
      const targetId=String(req.params.id),reason=String(req.body?.reason||"").trim().slice(0,500);
      if(!/^\d+$/.test(targetId)||!reason)return res.status(400).json({error:"Укажите ID игрока и причину предупреждения."});
      if(ownerId()&&targetId===ownerId())return res.status(403).json({error:"Нельзя выдать предупреждение OWNER."});
      const target=await pool.query("SELECT id FROM nexora_social_world.accounts WHERE id=$1",[targetId]);
      if(!target.rowCount)return res.status(404).json({error:"Игрок не найден."});
      const result=await pool.query("INSERT INTO nexora_social_world.moderation_actions(actor_account_id,target_account_id,action_type,reason) VALUES($1,$2,'WARN',$3) RETURNING id,created_at",[current.account.id,targetId,reason]);
      await pool.query("INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details) VALUES($1,$2,'player.warn',$3,$4::jsonb)",[current.account.id,targetId,reason,JSON.stringify({moderationId:result.rows[0].id})]);
      res.status(201).json({ok:true,moderation:result.rows[0]});
    }catch(error){next(error);}
  });
  router.get("/moderation",async(req,res,next)=>{
    try{
      const current=await requirePermission(req,res,"moderation.view");if(!current)return;
      const result=await pool.query(`SELECT m.id,m.action_type,m.reason,m.expires_at,m.created_at,m.revoked_at,
        a.nickname AS target_nickname,m.target_account_id,
        COALESCE(actor.nickname,'Системный пользователь') AS actor_nickname
        FROM nexora_social_world.moderation_actions m
        LEFT JOIN nexora_social_world.accounts a ON a.id=m.target_account_id
        LEFT JOIN nexora_social_world.accounts actor ON actor.id=m.actor_account_id
        ORDER BY m.created_at DESC LIMIT 100`);
      const reports=await pool.query(`SELECT r.id,r.category,r.details,r.status,r.created_at,
         reporter.nickname AS reporter_nickname,r.reporter_account_id,
         target.nickname AS target_nickname,r.target_account_id
         FROM nexora_social_world.player_reports r
         JOIN nexora_social_world.accounts reporter ON reporter.id=r.reporter_account_id
         JOIN nexora_social_world.accounts target ON target.id=r.target_account_id
         ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`);
      res.json({ok:true,entries:result.rows,reports:reports.rows});
    }catch(error){next(error);}
  });
  router.patch("/reports/:id",async(req,res,next)=>{
    try{
      const current=await requirePermission(req,res,"reports.manage");if(!current)return;
      if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:"Некорректный ID жалобы."});
      const status=["reviewing","resolved","dismissed"].includes(req.body?.status)?req.body.status:"";
      if(!status)return res.status(400).json({error:"Некорректный статус жалобы."});
      const updated=await pool.query("UPDATE nexora_social_world.player_reports SET status=$1 WHERE id=$2 RETURNING id,status",[status,req.params.id]);
      if(!updated.rowCount)return res.status(404).json({error:"Жалоба не найдена."});
      await pool.query("INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,action,reason,details) VALUES($1,'report.status','Изменён статус жалобы',$2::jsonb)",[current.account.id,JSON.stringify({reportId:req.params.id,status})]);
      res.json({ok:true,report:updated.rows[0]});
    }catch(error){next(error);}
  });
  router.get("/world", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "world.view"); if (!current) return;
      const counts = {}; for (const player of players.values()) counts[player.planet] = (counts[player.planet] || 0) + 1;
      const roomCount = await pool.query("SELECT COUNT(*)::int AS count FROM nexora_social_world.rooms");
      const world = Object.entries(planets).map(([slug, planet]) => ({ slug, title: planet.name, online: counts[slug] || 0, rooms: slug === "starter" ? roomCount.rows[0].count : 0 }));
      res.json({ ok: true, world });
    } catch (error) { next(error); }
  });
  router.get("/audit", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "logs.view"); if (!current) return;
      const result = await pool.query(`SELECT l.action,l.reason,l.created_at,COALESCE(a.nickname,'Системный пользователь') AS actor_nickname
        FROM nexora_social_world.developer_audit_logs l LEFT JOIN nexora_social_world.accounts a ON a.id=l.actor_account_id
        ORDER BY l.created_at DESC LIMIT 100`);
      res.json({ ok: true, entries: result.rows.map(e => ({ action: e.action, reason: e.reason, actorNickname: e.actor_nickname, createdAt: e.created_at })) });
    } catch (error) { next(error); }
  });

  router.get("/planets", async (req,res,next)=>{
    try{
      const current=await requirePermission(req,res,"planets.view");if(!current)return;
      const result=await pool.query(`SELECT p.id,p.name,p.status,p.access_mode,p.capacity,p.total_visits,p.created_at,
        a.nickname AS owner_nickname,p.owner_account_id,
        (SELECT COUNT(*)::int FROM nexora_social_world.planet_members m WHERE m.planet_id=p.id) AS members
        FROM nexora_social_world.custom_planets p JOIN nexora_social_world.accounts a ON a.id=p.owner_account_id
        ORDER BY p.created_at DESC LIMIT 200`);
      const online={};for(const player of players.values())if(String(player.planet).startsWith("custom-"))online[player.planet]=(online[player.planet]||0)+1;
      res.json({ok:true,planets:result.rows.map(p=>({...p,id:String(p.id),online:online["custom-"+p.id]||0}))});
    }catch(error){next(error);}
  });
  router.post("/planets/:id/action",async(req,res,next)=>{
    try{
      const current=await requirePermission(req,res,"planets.manage");if(!current)return;
      const id=String(req.params.id),action=String(req.body?.action||""),reason=String(req.body?.reason||"").trim().slice(0,300);
      if(!/^\d+$/.test(id)||!["hide","block","restore","transfer","delete"].includes(action))return res.status(400).json({error:"Некорректное действие."});
      const planet=await pool.query("SELECT id,owner_account_id FROM nexora_social_world.custom_planets WHERE id=$1",[id]);
      if(!planet.rowCount)return res.status(404).json({error:"Планета не найдена."});
      if(["transfer","delete"].includes(action)&&current.role!=="OWNER")return res.status(403).json({error:"Это действие доступно только владельцу NEXORA."});
      const client=await pool.connect();
      try{
        await client.query("BEGIN");
        if(action==="hide")await client.query("UPDATE nexora_social_world.custom_planets SET status='hidden',updated_at=NOW() WHERE id=$1",[id]);
        if(action==="block")await client.query("UPDATE nexora_social_world.custom_planets SET status='blocked',updated_at=NOW() WHERE id=$1",[id]);
        if(action==="restore")await client.query("UPDATE nexora_social_world.custom_planets SET status='active',updated_at=NOW() WHERE id=$1",[id]);
        if(action==="transfer"){
          const target=String(req.body?.accountId||"");
          if(!/^\d+$/.test(target)||!(await client.query("SELECT 1 FROM nexora_social_world.accounts WHERE id=$1",[target])).rowCount)throw new Error("Новый владелец не найден.");
          await client.query("UPDATE nexora_social_world.custom_planets SET owner_account_id=$2,updated_at=NOW() WHERE id=$1",[id,target]);
          await client.query("DELETE FROM nexora_social_world.planet_staff WHERE planet_id=$1 AND account_id=$2",[id,target]);
        }
        if(action==="delete")await client.query("DELETE FROM nexora_social_world.custom_planets WHERE id=$1",[id]);
        await client.query("INSERT INTO nexora_social_world.planet_audit_logs(planet_id,actor_account_id,action,details) VALUES($1,$2,$3,$4::jsonb)",[action==="delete"?null:id,current.account.id,"developer."+action,JSON.stringify({reason,accountId:req.body?.accountId||null})]);
        await audit(client,current,planet.rows[0].owner_account_id,"planet."+action,reason,{planetId:id});
        await client.query("COMMIT");
      }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
      res.json({ok:true});
    }catch(error){next(error);}
  });

  router.get("/roles", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "roles.manage"); if (!current) return;
      const result = await pool.query(`SELECT r.account_id AS id,a.nickname,r.role,r.permissions,r.updated_at FROM nexora_social_world.developer_role_assignments r JOIN nexora_social_world.accounts a ON a.id=r.account_id ORDER BY r.updated_at DESC LIMIT 100`);
      res.json({ ok: true, assignments: result.rows });
    } catch (error) { next(error); }
  });
  router.post("/roles", async (req, res, next) => {
    try {
      const current = await requirePermission(req, res, "roles.manage"); if (!current) return;
      if (current.role !== "OWNER") return res.status(403).json({ error: "Назначать роли может только владелец." });
      const accountId = String(req.body?.accountId || "").trim();
      const role = String(req.body?.role || "").trim().toUpperCase();
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      const permissions = Array.isArray(req.body?.permissions) ? [...new Set(req.body.permissions.filter(p => PERMISSIONS.has(p)))] : [];
      if (!/^\d+$/.test(accountId) || !ROLES.has(role)) return res.status(400).json({ error: "Некорректный аккаунт или роль." });
      if (ownerId() && accountId === ownerId()) return res.status(400).json({ error: "Нельзя изменить роль владельца через назначения." });
      const target = await pool.query("SELECT id FROM nexora_social_world.accounts WHERE id=$1", [accountId]);
      if (!target.rowCount) return res.status(404).json({ error: "Аккаунт не найден." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (role === "USER") await client.query("DELETE FROM nexora_social_world.developer_role_assignments WHERE account_id=$1", [accountId]);
        else await client.query(`INSERT INTO nexora_social_world.developer_role_assignments(account_id,role,permissions,assigned_by)
          VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(account_id) DO UPDATE SET role=EXCLUDED.role,permissions=EXCLUDED.permissions,assigned_by=EXCLUDED.assigned_by,updated_at=NOW()`, [accountId, role, JSON.stringify(permissions), current.account.id]);
        await audit(client,current,accountId,"role.assignment",reason,{role,permissions});
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      res.json({ ok: true, accountId, role, permissions });
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createDeveloperRouter };
