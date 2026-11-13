const express = require("express");
const cookie = require("cookie");

const COOKIE_NAME = "nexora_session";
const TITLES = ["NOVICE", "BEDA", "PAPA", "ANGEL", "CREATOR"];
const LABELS = {
  NOVICE: "Новичок", BEDA: "Беда", PAPA: "Папа", ANGEL: "Ангел", CREATOR: "Создатель"
};
const AURAS = {
  NOVICE: "NONE", BEDA: "GOLD_SOFT", PAPA: "GOLD_PREMIUM", ANGEL: "GREEN", CREATOR: "FIRE_RED"
};
const AUTHORITY_PERMISSIONS = new Set([
  "authority.view", "authority.assign", "authority.remove", "authority.configure", "authority.history"
]);
function ownerId() {
  const value = String(process.env.NEXORA_OWNER_ACCOUNT_ID || "").trim();
  return /^\d+$/.test(value) ? value : "";
}
function publicAuthority(row) {
  const key = TITLES.includes(row.authority_title) ? row.authority_title : "NOVICE";
  return {
    titleKey: key, title: LABELS[key], auraType: AURAS[key],
    auraEnabled: Boolean(row.aura_enabled) && key !== "NOVICE",
    authority: Number(row.authority || 0), level: Number(row.level || 1),
    experience: Number(row.experience || 0), koins: String(row.balance ?? "0")
  };
}
function updateOnline(io, players, accountId, fields) {
  for (const player of players.values()) {
    if (String(player.accountId) !== String(accountId)) continue;
    Object.assign(player, fields);
    const payload = {
      id: String(player.accountId), nickname: player.nickname, avatar: player.avatar,
      planet: player.planet, x: player.x, authority: player.authority,
      title: LABELS[player.authorityTitle] || LABELS.NOVICE,
      authorityTitle: player.authorityTitle || "NOVICE",
      auraType: AURAS[player.authorityTitle] || "NONE",
      auraEnabled: Boolean(player.auraEnabled),
      bubble: player.bubble, emotion: player.emotion, friendsCount: player.friendsCount
    };
    io.to("planet:" + player.planet).emit("profile:updated", payload);
  }
}
function createAuthorityRouter({ pool, auth, io, players }) {
  const router = express.Router();
  async function accountFor(req) {
    const token = cookie.parse(req.headers.cookie || "")[COOKIE_NAME];
    return auth.authenticateToken(token);
  }
  async function developerContext(req) {
    const account = await accountFor(req);
    if (!account) return null;
    if (ownerId() && String(account.id) === ownerId()) {
      return { account, role: "OWNER", permissions: [...AUTHORITY_PERMISSIONS] };
    }
    const result = await pool.query(
      "SELECT role,permissions FROM nexora_social_world.developer_role_assignments WHERE account_id=$1",
      [account.id]
    );
    const assignment = result.rows[0];
    const permissions = Array.isArray(assignment?.permissions)
      ? assignment.permissions.filter(permission => AUTHORITY_PERMISSIONS.has(permission)) : [];
    return { account, role: assignment?.role || "USER", permissions };
  }
  async function requireAuthorityPermission(req, res, permission) {
    const current = await developerContext(req);
    if (!current) { res.status(401).json({ error: "Требуется вход." }); return null; }
    if (!current.permissions.includes(permission)) {
      res.status(403).json({ error: "Недостаточно прав для управления авторитетами." });
      return null;
    }
    return current;
  }
  async function audit(client, actorId, targetId, action, reason, details = {}) {
    await client.query(
      "INSERT INTO nexora_social_world.developer_audit_logs(actor_account_id,target_account_id,action,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",
      [actorId, targetId, action, reason || null, JSON.stringify(details)]
    );
  }

  router.get("/", async (req, res, next) => {
    try {
      const account = await accountFor(req);
      if (!account) return res.status(401).json({ error: "Требуется вход." });
      const result = await pool.query(
        `SELECT c.authority_title,c.aura_enabled,c.authority,c.level,c.experience,
                COALESCE(w.balance,0)::text AS balance
           FROM nexora_social_world.characters c
           LEFT JOIN nexora_social_world.wallets w ON w.account_id=c.account_id
          WHERE c.account_id=$1`, [account.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Персонаж не найден." });
      const config = await pool.query(
        "SELECT title_key,title_label,sort_order,koins_price,min_authority,enabled,aura_type FROM nexora_social_world.authority_title_config ORDER BY sort_order"
      );
      res.json({ ok: true, current: publicAuthority(result.rows[0]), titles: config.rows });
    } catch (error) { next(error); }
  });

  router.get("/history", async (req, res, next) => {
    try {
      const account = await accountFor(req);
      if (!account) return res.status(401).json({ error: "Требуется вход." });
      const result = await pool.query(
        "SELECT old_title,new_title,source,reason,created_at FROM nexora_social_world.authority_history WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50",
        [account.id]
      );
      res.json({ ok: true, history: result.rows });
    } catch (error) { next(error); }
  });

  router.post("/purchase", async (req, res, next) => {
    const account = await accountFor(req);
    if (!account) return res.status(401).json({ error: "Требуется вход." });
    const titleKey = String(req.body?.titleKey || "").toUpperCase();
    const requestId = String(req.body?.requestId || "");
    if (!TITLES.includes(titleKey) || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(requestId)) {
      return res.status(400).json({ error: "Некорректный запрос покупки." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query(
        "SELECT id,title_key,koins_spent FROM nexora_social_world.authority_purchases WHERE account_id=$1 AND idempotency_key=$2",
        [account.id, requestId]
      );
      if (prior.rowCount) {
        const current = await client.query(
          "SELECT c.authority_title,c.aura_enabled,c.authority,c.level,c.experience,COALESCE(w.balance,0)::text AS balance FROM nexora_social_world.characters c LEFT JOIN nexora_social_world.wallets w ON w.account_id=c.account_id WHERE c.account_id=$1",
          [account.id]
        );
        await client.query("COMMIT");
        return res.json({ ok: true, duplicate: true, current: publicAuthority(current.rows[0]) });
      }
      const character = await client.query(
        "SELECT authority_title,aura_enabled,authority,level,experience FROM nexora_social_world.characters WHERE account_id=$1 FOR UPDATE",
        [account.id]
      );
      if (!character.rowCount) throw Object.assign(new Error("Персонаж не найден."), { status: 404 });
      const currentKey = TITLES.includes(character.rows[0].authority_title) ? character.rows[0].authority_title : "NOVICE";
      const nextIndex = TITLES.indexOf(currentKey) + 1;
      if (nextIndex >= TITLES.length || TITLES[nextIndex] !== titleKey) {
        throw Object.assign(new Error("Можно приобрести только следующее звание."), { status: 409 });
      }
      const config = await client.query(
        "SELECT title_key,title_label,koins_price,min_authority,enabled FROM nexora_social_world.authority_title_config WHERE title_key=$1 FOR UPDATE",
        [titleKey]
      );
      if (!config.rowCount || !config.rows[0].enabled) throw Object.assign(new Error("Это звание сейчас недоступно."), { status: 403 });
      if (Number(character.rows[0].authority) < Number(config.rows[0].min_authority)) {
        throw Object.assign(new Error("Недостаточно авторитета для повышения."), { status: 403 });
      }
      const debit = await client.query(
        "UPDATE nexora_social_world.wallets SET balance=balance-$1,updated_at=NOW() WHERE account_id=$2 AND balance >= $1 RETURNING balance::text AS balance",
        [config.rows[0].koins_price, account.id]
      );
      if (!debit.rowCount) throw Object.assign(new Error("Недостаточно Koins."), { status: 402 });
      await client.query(
        "UPDATE nexora_social_world.characters SET authority_title=$1,aura_enabled=$2,updated_at=NOW() WHERE account_id=$3",
        [titleKey, titleKey !== "NOVICE", account.id]
      );
      await client.query(
        "INSERT INTO nexora_social_world.authority_purchases(account_id,title_key,koins_spent,idempotency_key) VALUES($1,$2,$3,$4)",
        [account.id,titleKey,config.rows[0].koins_price,requestId]
      );
      await client.query(
        "INSERT INTO nexora_social_world.authority_history(account_id,old_title,new_title,source,reason) VALUES($1,$2,$3,'PURCHASE','Покупка за Koins')",
        [account.id,currentKey,titleKey]
      );
      await client.query("COMMIT");
      const fresh = await pool.query(
        "SELECT c.authority_title,c.aura_enabled,c.authority,c.level,c.experience,COALESCE(w.balance,0)::text AS balance FROM nexora_social_world.characters c LEFT JOIN nexora_social_world.wallets w ON w.account_id=c.account_id WHERE c.account_id=$1",
        [account.id]
      );
      const current = publicAuthority(fresh.rows[0]);
      updateOnline(io, players, account.id, {
        authorityTitle: current.titleKey, auraEnabled: current.auraEnabled,
        authority: current.authority
      });
      return res.json({ ok: true, current });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_rollbackError) {}
      if (error.status) return res.status(error.status).json({ error: error.message });
      next(error);
    } finally { client.release(); }
  });

  router.get("/admin/config", async (req, res, next) => {
    try {
      const current = await requireAuthorityPermission(req,res,"authority.configure"); if (!current) return;
      const result = await pool.query("SELECT * FROM nexora_social_world.authority_title_config ORDER BY sort_order");
      res.json({ ok: true, titles: result.rows });
    } catch (error) { next(error); }
  });
  router.put("/admin/config/:key", async (req,res,next) => {
    try {
      const current = await requireAuthorityPermission(req,res,"authority.configure"); if (!current) return;
      const key = String(req.params.key || "").toUpperCase();
      const price = Number(req.body?.koinsPrice), minimum = Number(req.body?.minAuthority);
      const enabled = req.body?.enabled === true;
      if (!TITLES.includes(key) || !Number.isSafeInteger(price) || price < 0 || !Number.isSafeInteger(minimum) || minimum < 0) {
        return res.status(400).json({error:"Проверьте цену и требования."});
      }
      await pool.query(
        "UPDATE nexora_social_world.authority_title_config SET koins_price=$1,min_authority=$2,enabled=$3,updated_at=NOW() WHERE title_key=$4",
        [price,minimum,enabled,key]
      );
      res.json({ok:true});
    } catch(error){next(error);}
  });
  router.post("/admin/assign", async (req,res,next) => {
    const current = await requireAuthorityPermission(req,res,"authority.assign"); if (!current) return;
    const targetId = String(req.body?.accountId || "");
    const key = String(req.body?.titleKey || "").toUpperCase();
    const reason = String(req.body?.reason || "").trim().slice(0,500);
    const auraEnabled = req.body?.auraEnabled !== false;
    if (!/^\d+$/.test(targetId) || !TITLES.includes(key) || !reason) {
      return res.status(400).json({error:"Укажите ID игрока, звание и причину."});
    }
    if (ownerId() && targetId === ownerId() && current.role !== "OWNER") {
      return res.status(403).json({error:"Изменять звание владельца может только OWNER."});
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT authority_title FROM nexora_social_world.characters WHERE account_id=$1 FOR UPDATE",[targetId]);
      if (!target.rowCount) throw Object.assign(new Error("Персонаж не найден."),{status:404});
      const oldKey = TITLES.includes(target.rows[0].authority_title) ? target.rows[0].authority_title : "NOVICE";
      await client.query(
        "UPDATE nexora_social_world.characters SET authority_title=$1,aura_enabled=$2,updated_at=NOW() WHERE account_id=$3",
        [key,key !== "NOVICE" && auraEnabled,targetId]
      );
      await client.query(
        "INSERT INTO nexora_social_world.authority_history(account_id,old_title,new_title,source,actor_account_id,reason) VALUES($1,$2,$3,'DEVELOPER',$4,$5)",
        [targetId,oldKey,key,current.account.id,reason]
      );
      await audit(client,current.account.id,targetId,"authority.assign",reason,{oldTitle:oldKey,newTitle:key,auraEnabled:key !== "NOVICE" && auraEnabled});
      await client.query("COMMIT");
      const fresh = await pool.query(
        "SELECT authority_title,aura_enabled,authority,level,experience FROM nexora_social_world.characters WHERE account_id=$1",
        [targetId]
      );
      const row = fresh.rows[0];
      updateOnline(io,players,targetId,{
        authorityTitle:row.authority_title,auraEnabled:row.aura_enabled,authority:Number(row.authority)
      });
      res.json({ok:true,accountId:targetId,titleKey:key,auraEnabled:key !== "NOVICE" && auraEnabled});
    }catch(error){
      try{await client.query("ROLLBACK");}catch(_rollbackError){}
      if(error.status)return res.status(error.status).json({error:error.message});
      next(error);
    }finally{client.release();}
  });
  router.get("/admin/history/:id", async (req,res,next)=>{
    try{
      const current=await requireAuthorityPermission(req,res,"authority.history");if(!current)return;
      if(!/^\d+$/.test(String(req.params.id)))return res.status(400).json({error:"Некорректный ID."});
      const result=await pool.query(
        "SELECT h.old_title,h.new_title,h.source,h.reason,h.created_at,COALESCE(a.nickname,'Система') AS actor_nickname FROM nexora_social_world.authority_history h LEFT JOIN nexora_social_world.accounts a ON a.id=h.actor_account_id WHERE h.account_id=$1 ORDER BY h.created_at DESC LIMIT 100",
        [req.params.id]
      );
      res.json({ok:true,history:result.rows});
    }catch(error){next(error);}
  });
  return router;
}
module.exports = { createAuthorityRouter };
