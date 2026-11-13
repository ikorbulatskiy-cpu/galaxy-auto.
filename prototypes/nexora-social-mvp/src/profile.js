const express = require("express");
const cookie = require("cookie");

const COOKIE_NAME = "nexora_session";
const { normalizeAvatar } = require("./avatar");

function cleanText(value, max) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function createProfileRouter({ pool, auth, io }) {
  const router = express.Router();
  router.use(asyncRoute(async (req, res, next) => {
    const token = cookie.parse(req.headers.cookie || "")[COOKIE_NAME];
    const account = await auth.authenticateToken(token);
    if (!account) return res.status(401).json({ error: "Требуется вход." });
    req.account = account;
    next();
  }));

  async function loadProfile(accountId) {
    const result = await pool.query(
      `SELECT a.id,a.nickname,a.created_at,c.profile_status,c.profile_bio,c.avatar,c.authority,c.authority_title,c.aura_enabled,
              c.level,c.experience,w.balance,
              (SELECT COUNT(*)::int FROM nexora_social_world.friends f WHERE f.account_id=a.id) AS friends_count,
              (SELECT COUNT(*)::int FROM nexora_social_world.gifts g WHERE g.to_account_id=a.id) AS gifts_received
         FROM nexora_social_world.accounts a
         JOIN nexora_social_world.characters c ON c.account_id=a.id
         LEFT JOIN nexora_social_world.wallets w ON w.account_id=a.id
        WHERE a.id=$1`,
      [accountId]
    );
    if (!result.rowCount) return null;
    const row = result.rows[0];
    return {
      id: String(row.id), nickname: row.nickname, createdAt: row.created_at,
      status: row.profile_status, bio: row.profile_bio, avatar: normalizeAvatar(row.avatar),
      authority: row.authority, authorityTitle: row.authority_title || "NOVICE",
      auraEnabled: Boolean(row.aura_enabled), level: row.level, experience: row.experience,
      friendsCount: row.friends_count, giftsReceived: row.gifts_received,
      koins: row.balance ?? 0
    };
  }

  router.get("/", asyncRoute(async (req, res) => {
    const profile = await loadProfile(req.account.id);
    if (!profile) return res.status(404).json({ error: "Профиль не найден." });
    res.json({ ok: true, profile });
  }));

  router.get("/rating", asyncRoute(async (req, res) => {
    const category = ["authority","level","popularity"].includes(String(req.query.category)) ? String(req.query.category) : "authority";
    const score = category === "authority" ? "c.authority"
      : category === "level" ? "c.level"
      : "(COALESCE(g.gifts_received,0)*3 + COALESCE(f.friends_count,0))";
    const result = await pool.query(
      `WITH scores AS (
         SELECT a.id,a.nickname,c.avatar,c.authority,c.authority_title,c.aura_enabled,c.level,c.experience,c.planet,
                COALESCE(g.gifts_received,0)::int AS gifts_received,
                COALESCE(f.friends_count,0)::int AS friends_count,
                ${score}::bigint AS score
           FROM nexora_social_world.accounts a
           JOIN nexora_social_world.characters c ON c.account_id=a.id
           LEFT JOIN (SELECT to_account_id,COUNT(*) AS gifts_received FROM nexora_social_world.gifts GROUP BY to_account_id) g ON g.to_account_id=a.id
           LEFT JOIN (SELECT account_id,COUNT(*) AS friends_count FROM nexora_social_world.friends GROUP BY account_id) f ON f.account_id=a.id
       ), ranked AS (
         SELECT *,ROW_NUMBER() OVER(ORDER BY score DESC,authority DESC,level DESC,id ASC) AS position FROM scores
       )
       SELECT id,nickname,authority,authority_title,aura_enabled,level,experience,gifts_received,friends_count,score,position
         FROM ranked WHERE position<=50 OR id=$1
        ORDER BY position LIMIT 51`,
      [req.account.id]
    );
    const entries = result.rows.map(row => ({
      id:String(row.id),nickname:row.nickname,authority:Number(row.authority || 0),
      title:({NOVICE:"Новичок",BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"})[row.authority_title] || "Новичок",
      auraEnabled:Boolean(row.aura_enabled),level:Number(row.level || 1),
      giftsReceived:Number(row.gifts_received || 0),friendsCount:Number(row.friends_count || 0),
      score:Number(row.score || 0),position:Number(row.position),
      online:Boolean(io.sockets.adapter.rooms.get("account:"+row.id)?.size)
    }));
    res.json({ok:true,category,entries,me:entries.find(item=>item.id===String(req.account.id))||null});
  }));

  router.get("/:id", asyncRoute(async (req, res) => {
    const targetId = String(req.params.id || "");
    if (!/^\\d{1,20}$/.test(targetId)) return res.status(400).json({error:"Некорректный игрок."});
    const blocked = await pool.query(
      "SELECT 1 FROM nexora_social_world.user_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)",
      [req.account.id,targetId]
    );
    if (blocked.rowCount) return res.status(404).json({error:"Профиль недоступен."});
    const profile = await loadProfile(targetId);
    if (!profile) return res.status(404).json({error:"Игрок не найден."});
    const [friend,request] = await Promise.all([
      pool.query("SELECT 1 FROM nexora_social_world.friends WHERE account_id=$1 AND friend_account_id=$2",[req.account.id,targetId]),
      pool.query("SELECT from_account_id FROM nexora_social_world.friend_requests WHERE status='pending' AND ((from_account_id=$1 AND to_account_id=$2) OR (from_account_id=$2 AND to_account_id=$1)) LIMIT 1",[req.account.id,targetId])
    ]);
    const live = io.sockets.adapter.rooms.get("account:"+targetId);
    res.json({ok:true,profile:{...profile,online:Boolean(live?.size),isMe:String(req.account.id)===targetId,isFriend:Boolean(friend.rowCount),requestPending:Boolean(request.rowCount),requestIncoming:request.rowCount && String(request.rows[0].from_account_id)===targetId}});
  }));

  router.patch("/", asyncRoute(async (req, res) => {
    const status = cleanText(req.body?.status, 80);
    const bio = cleanText(req.body?.bio, 240);
    const avatar = normalizeAvatar(req.body?.avatar);
    const updated = await pool.query(
      `UPDATE nexora_social_world.characters
          SET profile_status=$1,profile_bio=$2,avatar=$3::jsonb,updated_at=NOW()
        WHERE account_id=$4
        RETURNING account_id`,
      [status, bio, JSON.stringify(avatar), req.account.id]
    );
    if (!updated.rowCount) return res.status(404).json({ error: "Профиль не найден." });

    const profile = await loadProfile(req.account.id);
    const room = io.sockets.adapter.rooms.get("account:" + req.account.id);
    if (room) {
      for (const socketId of room) {
        const socket = io.sockets.sockets.get(socketId);
        const player = socket?.data?.player;
        if (!player) continue;
        player.avatar = profile.avatar;
        io.to("planet:" + player.planet).emit("profile:updated", {
          id: String(player.accountId), nickname: player.nickname, avatar: player.avatar,
          planet: player.planet, x: player.x, authority: player.authority,
          title: ({ NOVICE: "Новичок", BEDA: "Беда", PAPA: "Папа", ANGEL: "Ангел", CREATOR: "Создатель" })[player.authorityTitle] || "Новичок",
          authorityTitle: player.authorityTitle || "NOVICE",
          auraType: ({ NOVICE: "NONE", BEDA: "GOLD_SOFT", PAPA: "GOLD_PREMIUM", ANGEL: "GREEN", CREATOR: "FIRE_RED" })[player.authorityTitle] || "NONE",
          auraEnabled: Boolean(player.auraEnabled),
          bubble: player.bubble, emotion: player.emotion, friendsCount: player.friendsCount
        });
      }
    }
    res.json({ ok: true, profile });
  }));

  return router;
}
module.exports = { createProfileRouter };
