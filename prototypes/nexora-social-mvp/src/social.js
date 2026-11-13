const express = require("express");
const cookie = require("cookie");

const COOKIE_NAME = "nexora_session";

function clean(value, max) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function createSocialRouter({ pool, auth, io }) {
  const router = express.Router();
  router.use(asyncRoute(async (req, res, next) => {
    const token = cookie.parse(req.headers.cookie || "")[COOKIE_NAME];
    const account = await auth.authenticateToken(token);
    if (!account) return res.status(401).json({ error: "Требуется вход." });
    req.account = account;
    next();
  }));

  router.get("/users", asyncRoute(async (req, res) => {
    const q = clean(req.query.q, 18);
    if (q.length < 2) return res.json({ users: [] });
    const result = await pool.query(
      `SELECT a.id,a.nickname,c.avatar,c.planet,c.profile_status,c.authority,c.authority_title,c.aura_enabled,c.level,c.experience
         FROM nexora_social_world.accounts a
         LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
        WHERE a.id<>$1 AND a.nickname ILIKE $2
          AND NOT EXISTS (SELECT 1 FROM nexora_social_world.user_blocks b WHERE (b.account_id=$1 AND b.blocked_account_id=a.id) OR (b.account_id=a.id AND b.blocked_account_id=$1))
        ORDER BY a.nickname LIMIT 20`,
      [req.account.id, "%" + q + "%"]
    );
    const users = result.rows.map(row => ({
      ...row,id:String(row.id),online:Boolean(io.sockets.adapter.rooms.get("account:"+row.id)?.size),
      authority:Number(row.authority||0),level:Number(row.level||1),
      title:({NOVICE:"Новичок",BEDA:"Беда",PAPA:"Папа",ANGEL:"Ангел",CREATOR:"Создатель"})[row.authority_title]||"Новичок",
      auraEnabled:Boolean(row.aura_enabled)
    }));
    res.json({ users });
  }));

  router.get("/friends", asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT a.id,a.nickname,c.planet,c.profile_status FROM nexora_social_world.friends f JOIN nexora_social_world.accounts a ON a.id=f.friend_account_id LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id WHERE f.account_id=$1 ORDER BY a.nickname",
      [req.account.id]
    );
    const friends = result.rows.map(row => ({ ...row, online: Boolean(io.sockets.adapter.rooms.get("account:" + row.id)?.size) }));
    res.json({ friends });
  }));

  router.get("/requests", asyncRoute(async (req, res) => {
    const [incoming, outgoing] = await Promise.all([
      pool.query("SELECT r.id,a.id AS account_id,a.nickname,r.created_at FROM nexora_social_world.friend_requests r JOIN nexora_social_world.accounts a ON a.id=r.from_account_id WHERE r.to_account_id=$1 AND r.status='pending' ORDER BY r.created_at DESC", [req.account.id]),
      pool.query("SELECT r.id,a.id AS account_id,a.nickname,r.created_at FROM nexora_social_world.friend_requests r JOIN nexora_social_world.accounts a ON a.id=r.to_account_id WHERE r.from_account_id=$1 AND r.status='pending' ORDER BY r.created_at DESC", [req.account.id])
    ]);
    res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
  }));

  router.post("/requests", asyncRoute(async (req, res) => {
    const targetId = Number(req.body?.targetId);
    if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === Number(req.account.id)) return res.status(400).json({ error: "Некорректный пользователь." });
    const target = await pool.query("SELECT id,nickname FROM nexora_social_world.accounts WHERE id=$1", [targetId]);
    if (!target.rowCount) return res.status(404).json({ error: "Пользователь не найден." });
    const blocked = await pool.query("SELECT 1 FROM nexora_social_world.user_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)", [req.account.id,targetId]);
    if (blocked.rowCount) return res.status(403).json({ error: "Нельзя отправить заявку этому пользователю." });
    const existing = await pool.query("SELECT 1 FROM nexora_social_world.friends WHERE account_id=$1 AND friend_account_id=$2", [req.account.id,targetId]);
    if (existing.rowCount) return res.status(409).json({ error: "Вы уже друзья." });
    const pending = await pool.query("SELECT id FROM nexora_social_world.friend_requests WHERE from_account_id=$1 AND to_account_id=$2 AND status='pending'", [req.account.id,targetId]);
    if (pending.rowCount) return res.status(409).json({ error: "Заявка уже отправлена." });
    const reverse = await pool.query("SELECT id FROM nexora_social_world.friend_requests WHERE from_account_id=$1 AND to_account_id=$2 AND status='pending'", [targetId,req.account.id]);
    if (reverse.rowCount) return res.status(409).json({ error: "Этот пользователь уже отправил вам заявку. Примите её во входящих." });
    const client = await pool.connect();
    let saved;
    let notice;
    try {
      await client.query("BEGIN");
      saved = await client.query(
        "INSERT INTO nexora_social_world.friend_requests(from_account_id,to_account_id) VALUES($1,$2) RETURNING id",
        [req.account.id,targetId]
      );
      notice = await client.query(
        "INSERT INTO nexora_social_world.notifications(account_id,actor_account_id,type,payload) VALUES($1,$2,'friend_request',jsonb_build_object('requestId',$3::text)) RETURNING id,created_at",
        [targetId,req.account.id,saved.rows[0].id]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return res.status(409).json({ error: "Заявка уже отправлена." });
      throw error;
    } finally {
      client.release();
    }
    io.to("account:" + targetId).emit("social:notification", { id: notice.rows[0].id, type: "friend_request", actor: { id: req.account.id, nickname: req.account.nickname }, createdAt: notice.rows[0].created_at });
    res.status(201).json({ ok: true, requestId: saved.rows[0].id, nickname: target.rows[0].nickname });
  }));

  router.post("/requests/:id/accept", asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const request = await client.query("SELECT id,from_account_id,to_account_id FROM nexora_social_world.friend_requests WHERE id=$1 AND to_account_id=$2 AND status='pending' FOR UPDATE", [req.params.id,req.account.id]);
      if (!request.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Заявка не найдена." }); }
      const { from_account_id: fromId, to_account_id: toId } = request.rows[0];
      const blocked = await client.query("SELECT 1 FROM nexora_social_world.user_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)", [fromId,toId]);
      if (blocked.rowCount) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Заявка больше недоступна." }); }
      await client.query("UPDATE nexora_social_world.friend_requests SET status='accepted',updated_at=NOW() WHERE id=$1", [req.params.id]);
      await client.query("INSERT INTO nexora_social_world.friends(account_id,friend_account_id) VALUES($1,$2),($2,$1) ON CONFLICT DO NOTHING", [fromId,toId]);
      const notice = await client.query("INSERT INTO nexora_social_world.notifications(account_id,actor_account_id,type,payload) VALUES($1,$2,'friend_accepted','{}'::jsonb) RETURNING id,created_at", [fromId,toId]);
      await client.query("COMMIT");
      io.to("account:" + fromId).emit("social:notification", { id: notice.rows[0].id, type: "friend_accepted", actor: { id: toId, nickname: req.account.nickname }, createdAt: notice.rows[0].created_at });
      res.json({ ok: true });
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }));

  router.delete("/requests/:id", asyncRoute(async (req, res) => {
    const result = await pool.query("UPDATE nexora_social_world.friend_requests SET status='cancelled',updated_at=NOW() WHERE id=$1 AND from_account_id=$2 AND status='pending'", [req.params.id,req.account.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Заявка не найдена." });
    res.json({ ok: true });
  }));

  router.post("/requests/:id/decline", asyncRoute(async (req, res) => {
    const result = await pool.query("UPDATE nexora_social_world.friend_requests SET status='declined',updated_at=NOW() WHERE id=$1 AND to_account_id=$2 AND status='pending'", [req.params.id,req.account.id]);
    if (!result.rowCount) return res.status(404).json({ error: "Заявка не найдена." });
    res.json({ ok: true });
  }));

  router.delete("/friends/:id", asyncRoute(async (req, res) => {
    const otherId = Number(req.params.id);
    await pool.query("DELETE FROM nexora_social_world.friends WHERE (account_id=$1 AND friend_account_id=$2) OR (account_id=$2 AND friend_account_id=$1)", [req.account.id,otherId]);
    res.json({ ok: true });
  }));

  router.post("/blocks/:id", asyncRoute(async (req, res) => {
    const otherId = Number(req.params.id);
    if (!Number.isSafeInteger(otherId) || otherId <= 0 || otherId === Number(req.account.id)) return res.status(400).json({ error: "Некорректный пользователь." });
    const target = await pool.query("SELECT 1 FROM nexora_social_world.accounts WHERE id=$1", [otherId]);
    if (!target.rowCount) return res.status(404).json({ error: "Пользователь не найден." });
    await pool.query("INSERT INTO nexora_social_world.user_blocks(account_id,blocked_account_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [req.account.id,otherId]);
    await pool.query("DELETE FROM nexora_social_world.friends WHERE (account_id=$1 AND friend_account_id=$2) OR (account_id=$2 AND friend_account_id=$1)", [req.account.id,otherId]);
    await pool.query("UPDATE nexora_social_world.friend_requests SET status='cancelled',updated_at=NOW() WHERE status='pending' AND ((from_account_id=$1 AND to_account_id=$2) OR (from_account_id=$2 AND to_account_id=$1))", [req.account.id,otherId]);
    res.json({ ok: true });
  }));

  router.post("/conversations", asyncRoute(async (req, res) => {
    const otherId = Number(req.body?.peerId);
    if (!Number.isSafeInteger(otherId) || otherId <= 0 || otherId === Number(req.account.id)) return res.status(400).json({ error: "Некорректный собеседник." });
    const [a,b] = Number(req.account.id) < otherId ? [req.account.id,otherId] : [otherId,req.account.id];
    const allowed = await pool.query("SELECT 1 FROM nexora_social_world.friends WHERE account_id=$1 AND friend_account_id=$2", [req.account.id,otherId]);
    if (!allowed.rowCount) return res.status(403).json({ error: "Личные сообщения доступны друзьям." });
    const blocked = await pool.query("SELECT 1 FROM nexora_social_world.user_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)", [req.account.id,otherId]);
    if (blocked.rowCount) return res.status(403).json({ error: "Переписка недоступна." });
    const result = await pool.query("INSERT INTO nexora_social_world.conversations(participant_a,participant_b) VALUES($1,$2) ON CONFLICT(participant_a,participant_b) DO UPDATE SET updated_at=nexora_social_world.conversations.updated_at RETURNING id", [a,b]);
    res.json({ ok: true, conversationId: result.rows[0].id });
  }));

  router.get("/conversations", asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT c.id,peer.id AS peer_id,peer.nickname,dm.body AS last_message,dm.created_at AS last_message_at,(SELECT COUNT(*)::int FROM nexora_social_world.direct_messages unread WHERE unread.conversation_id=c.id AND unread.sender_account_id=peer.id AND unread.read_at IS NULL) AS unread_count FROM nexora_social_world.conversations c JOIN nexora_social_world.accounts peer ON peer.id=CASE WHEN c.participant_a=$1 THEN c.participant_b ELSE c.participant_a END LEFT JOIN LATERAL (SELECT body,created_at FROM nexora_social_world.direct_messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) dm ON TRUE WHERE c.participant_a=$1 OR c.participant_b=$1 ORDER BY COALESCE(dm.created_at,c.updated_at) DESC",
      [req.account.id]
    );
    res.json({ conversations: result.rows });
  }));

  router.get("/conversations/:id/messages", asyncRoute(async (req, res) => {
    const conversation = await pool.query("SELECT id FROM nexora_social_world.conversations WHERE id=$1 AND (participant_a=$2 OR participant_b=$2)", [req.params.id,req.account.id]);
    if (!conversation.rowCount) return res.status(404).json({ error: "Диалог не найден." });
    const result = await pool.query("SELECT m.id,m.sender_account_id AS sender_id,a.nickname,m.body,m.created_at FROM nexora_social_world.direct_messages m JOIN nexora_social_world.accounts a ON a.id=m.sender_account_id WHERE m.conversation_id=$1 ORDER BY m.created_at DESC LIMIT 100", [req.params.id]);
    await pool.query("UPDATE nexora_social_world.direct_messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_account_id<>$2 AND read_at IS NULL", [req.params.id,req.account.id]);
    res.json({ messages: result.rows.reverse() });
  }));

  router.post("/conversations/:id/messages", asyncRoute(async (req, res) => {
    const body = clean(req.body?.body, 2000);
    if (!body) return res.status(400).json({ error: "Введите сообщение." });
    const conversation = await pool.query("SELECT id,participant_a,participant_b FROM nexora_social_world.conversations WHERE id=$1 AND (participant_a=$2 OR participant_b=$2)", [req.params.id,req.account.id]);
    if (!conversation.rowCount) return res.status(404).json({ error: "Диалог не найден." });
    const row = conversation.rows[0];
    const peerId = String(row.participant_a) === String(req.account.id) ? row.participant_b : row.participant_a;
    const blocked = await pool.query("SELECT 1 FROM nexora_social_world.user_blocks WHERE (account_id=$1 AND blocked_account_id=$2) OR (account_id=$2 AND blocked_account_id=$1)", [req.account.id,peerId]);
    if (blocked.rowCount) return res.status(403).json({ error: "Отправка сообщений недоступна." });
    const saved = await pool.query("INSERT INTO nexora_social_world.direct_messages(conversation_id,sender_account_id,body) VALUES($1,$2,$3) RETURNING id,created_at", [req.params.id,req.account.id,body]);
    await pool.query("UPDATE nexora_social_world.conversations SET updated_at=NOW() WHERE id=$1", [req.params.id]);
    const message = { id: saved.rows[0].id, conversationId: Number(req.params.id), senderId: req.account.id, nickname: req.account.nickname, body, createdAt: saved.rows[0].created_at };
    const notice = await pool.query("INSERT INTO nexora_social_world.notifications(account_id,actor_account_id,type,payload) VALUES($1,$2,'direct_message',jsonb_build_object('conversationId',$3::text)) RETURNING id,created_at", [peerId,req.account.id,req.params.id]);
    io.to("account:" + peerId).emit("dm:message", message);
    io.to("account:" + peerId).emit("social:notification", { id: notice.rows[0].id, type: "direct_message", actor: { id: req.account.id, nickname: req.account.nickname }, createdAt: notice.rows[0].created_at });
    res.status(201).json({ ok: true, message });
  }));

  router.get("/notifications", asyncRoute(async (req, res) => {
    const result = await pool.query("SELECT n.id,n.type,n.payload,n.read_at,n.created_at,a.id AS actor_id,a.nickname AS actor_nickname FROM nexora_social_world.notifications n LEFT JOIN nexora_social_world.accounts a ON a.id=n.actor_account_id WHERE n.account_id=$1 ORDER BY n.created_at DESC LIMIT 50", [req.account.id]);
    res.json({ notifications: result.rows });
  }));
  router.post("/notifications/read", asyncRoute(async (req, res) => {
    await pool.query("UPDATE nexora_social_world.notifications SET read_at=NOW() WHERE account_id=$1 AND read_at IS NULL", [req.account.id]);
    res.json({ ok: true });
  }));

  return router;
}
module.exports = { createSocialRouter };
