const express = require("express");
const { z } = require("zod");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();

const friendRequestSchema = z.object({}).strict();
const friendDecisionSchema = z.object({ decision: z.enum(["accept", "reject"]) }).strict();
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
const uuidSchema = z.string().uuid();

function validId(value) {
  return uuidSchema.safeParse(value).success;
}


router.get("/discover", requireSession, async (req, res, next) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  try {
    const result = await pool.query(
      `SELECT u.id AS user_id,u.username,p.display_name,p.city,p.bio,p.interests,p.avatar_url,
              r.level,r.authority,
              EXISTS(SELECT 1 FROM friendships f
                WHERE ((f.requester_id=$1 AND f.addressee_id=u.id) OR (f.requester_id=u.id AND f.addressee_id=$1))
                  AND f.status IN ('pending','accepted')) AS has_relation
       FROM users u
       JOIN profiles p ON p.user_id=u.id
       LEFT JOIN reputation r ON r.user_id=u.id
       WHERE u.status='active' AND u.id<>$1
         AND p.visibility='public'
         AND ($2='' OR u.username ILIKE '%' || $2 || '%' OR COALESCE(p.display_name,'') ILIKE '%' || $2 || '%' OR COALESCE(p.city,'') ILIKE '%' || $2 || '%')
         AND NOT EXISTS(SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
       ORDER BY u.created_at DESC LIMIT 60`,
      [req.user.id, q]
    );
    res.json({ users: result.rows });
  } catch (error) { next(error); }
});

async function isBlocked(client, firstId, secondId) {
  const result = await client.query(
    "SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1) LIMIT 1",
    [firstId, secondId]
  );
  return result.rowCount > 0;
}

async function areFriends(client, firstId, secondId) {
  const result = await client.query(
    "SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) LIMIT 1",
    [firstId, secondId]
  );
  return result.rowCount > 0;
}

router.get("/users/:userId", requireSession, async (req, res, next) => {
  const targetId=req.params.userId;
  if(!validId(targetId))return res.status(400).json({error:"Некорректный пользователь."});
  try{
    const result=await pool.query(
      `SELECT u.id AS user_id,u.username,p.display_name,p.city,p.bio,p.interests,p.avatar_url,
              r.level,r.authority,c.name AS character_name,c.appearance,c.aura
       FROM users u
       JOIN profiles p ON p.user_id=u.id
       LEFT JOIN reputation r ON r.user_id=u.id
       LEFT JOIN characters c ON c.user_id=u.id AND c.is_active=TRUE
       WHERE u.id=$2 AND u.status='active'
         AND (u.id=$1 OR p.visibility='public')
         AND NOT EXISTS(SELECT 1 FROM blocks b
           WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
       LIMIT 1`,
      [req.user.id,targetId]
    );
    if(!result.rowCount)return res.status(404).json({error:"Профиль недоступен."});
    res.json({profile:result.rows[0]});
  }catch(error){next(error);}
});

router.get("/friends", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.status, f.created_at,
              CASE WHEN f.requester_id=$1 THEN 'outgoing' ELSE 'incoming' END AS direction,
              u.id AS user_id, u.username,
              p.display_name, p.city, p.avatar_url
       FROM friendships f
       JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
       LEFT JOIN profiles p ON p.user_id=u.id
       WHERE (f.requester_id=$1 OR f.addressee_id=$1)
         AND f.status IN ('pending','accepted')
       ORDER BY CASE WHEN f.status='pending' THEN 0 ELSE 1 END, f.created_at DESC
       LIMIT 200`,
      [req.user.id]
    );
    res.json({ friends: result.rows });
  } catch (error) { next(error); }
});

router.post("/friends/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  if (!validId(targetId) || targetId === req.user.id) {
    return res.status(400).json({ error: "Некорректный пользователь." });
  }
  try {
    const target = await pool.query("SELECT id FROM users WHERE id=$1 AND status='active'", [targetId]);
    if (!target.rowCount) return res.status(404).json({ error: "Пользователь не найден." });
    if (await isBlocked(pool, req.user.id, targetId)) return res.status(403).json({ error: "Нельзя отправить запрос этому пользователю." });
    const existing = await pool.query(
      "SELECT id,status,requester_id,addressee_id FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1) LIMIT 1",
      [req.user.id, targetId]
    );
    if (existing.rowCount) {
      const relation = existing.rows[0];
      if (relation.status === "accepted") return res.status(409).json({ error: "Вы уже друзья." });
      if (relation.status === "pending") return res.status(409).json({ error: relation.requester_id === req.user.id ? "Запрос уже отправлен." : "Этот пользователь уже отправил вам запрос." });
      await pool.query("DELETE FROM friendships WHERE id=$1", [relation.id]);
    }
    const created = await pool.query(
      "INSERT INTO friendships (requester_id,addressee_id,status) VALUES ($1,$2,'pending') RETURNING id,status,created_at",
      [req.user.id, targetId]
    );
    try {
      await pool.query(
        "INSERT INTO notifications (user_id,actor_user_id,kind,title,body,data) VALUES ($1,$2,'friend_request','Новая заявка в друзья',$3,$4::jsonb)",
        [targetId, req.user.id, "@" + req.user.username + " отправил(а) вам заявку в друзья.", JSON.stringify({ userId: req.user.id })]
      );
    } catch (notificationError) {
      console.error("Friend request notification failed:", notificationError.message);
    }
    res.status(201).json({ request: created.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Запрос дружбы уже существует." });
    next(error);
  }
});

router.patch("/friends/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  const parsed = friendDecisionSchema.safeParse(req.body);
  if (!validId(targetId) || !parsed.success) return res.status(400).json({ error: "Некорректное решение или пользователь." });
  try {
    const result = await pool.query(
      "UPDATE friendships SET status=$3 WHERE requester_id=$1 AND addressee_id=$2 AND status='pending' RETURNING id,status",
      [targetId, req.user.id, parsed.data.decision === "accept" ? "accepted" : "rejected"]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Входящий запрос не найден." });
    if (parsed.data.decision === "accept") {
      try {
        await pool.query(
          "INSERT INTO notifications (user_id,actor_user_id,kind,title,body,data) VALUES ($1,$2,'friend_accepted','Заявка принята',$3,$4::jsonb)",
          [targetId, req.user.id, "@" + req.user.username + " принял(а) вашу заявку в друзья.", JSON.stringify({ userId: req.user.id })]
        );
      } catch (notificationError) {
        console.error("Friend accepted notification failed:", notificationError.message);
      }
    }
    res.json({ request: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete("/friends/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  if (!validId(targetId) || targetId === req.user.id) return res.status(400).json({ error: "Некорректный пользователь." });
  try {
    const result = await pool.query(
      "DELETE FROM friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)) RETURNING id",
      [req.user.id, targetId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Дружба не найдена." });
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post("/conversations/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  if (!validId(targetId) || targetId === req.user.id) return res.status(400).json({ error: "Некорректный пользователь." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT id FROM users WHERE id=$1 AND status='active'", [targetId]);
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Пользователь не найден." });
    }
    if (await isBlocked(client, req.user.id, targetId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Общение недоступно." });
    }
    if (!await areFriends(client, req.user.id, targetId)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Личные сообщения доступны друзьям." });
    }
    const lockKey = [req.user.id, targetId].sort().join(":");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
    const existing = await client.query(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members a ON a.conversation_id=c.id AND a.user_id=$1
       JOIN conversation_members b ON b.conversation_id=c.id AND b.user_id=$2
       WHERE (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id=c.id)=2
       LIMIT 1`,
      [req.user.id, targetId]
    );
    let conversationId;
    if (existing.rowCount) {
      conversationId = existing.rows[0].id;
    } else {
      const created = await client.query("INSERT INTO conversations DEFAULT VALUES RETURNING id");
      conversationId = created.rows[0].id;
      await client.query(
        "INSERT INTO conversation_members (conversation_id,user_id) VALUES ($1,$2),($1,$3)",
        [conversationId, req.user.id, targetId]
      );
    }
    await client.query("COMMIT");
    res.status(existing.rowCount ? 200 : 201).json({ conversationId });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.get("/conversations", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.created_at,
              other.id AS user_id, other.username,
              p.display_name, p.avatar_url,
              (SELECT COUNT(*)::int FROM messages unread WHERE unread.conversation_id=c.id AND unread.sender_id=other.id AND unread.read_at IS NULL) AS unread_count,
              last.body AS last_message, last.created_at AS last_message_at
       FROM conversation_members mine
       JOIN conversations c ON c.id=mine.conversation_id
       JOIN conversation_members theirs ON theirs.conversation_id=c.id AND theirs.user_id<>$1
       JOIN users other ON other.id=theirs.user_id AND other.status='active'
       LEFT JOIN profiles p ON p.user_id=other.id
       LEFT JOIN LATERAL (
         SELECT body,created_at FROM messages
         WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1
       ) last ON TRUE
       WHERE mine.user_id=$1
       ORDER BY COALESCE(last.created_at,c.created_at) DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (error) { next(error); }
});

router.get("/conversations/:conversationId/messages", requireSession, async (req, res, next) => {
  const conversationId = req.params.conversationId;
  if (!validId(conversationId)) return res.status(400).json({ error: "Некорректный диалог." });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  try {
    const member = await pool.query(
      "SELECT 1 FROM conversation_members WHERE conversation_id=$1 AND user_id=$2",
      [conversationId, req.user.id]
    );
    if (!member.rowCount) return res.status(404).json({ error: "Диалог не найден." });
    await pool.query("UPDATE messages SET read_at=NOW() WHERE conversation_id=$1 AND sender_id<>$2 AND read_at IS NULL",[conversationId,req.user.id]);
    const result = await pool.query(
      `SELECT m.id,m.body,m.created_at,m.read_at,u.id AS sender_id,u.username
       FROM messages m JOIN users u ON u.id=m.sender_id
       WHERE m.conversation_id=$1
       ORDER BY m.created_at DESC LIMIT $2`,
      [conversationId, limit]
    );
    res.json({ messages: result.rows.reverse() });
  } catch (error) { next(error); }
});

router.post("/conversations/:conversationId/messages", requireSession, async (req, res, next) => {
  const conversationId = req.params.conversationId;
  const parsed = messageSchema.safeParse(req.body);
  if (!validId(conversationId) || !parsed.success) return res.status(400).json({ error: "Сообщение пустое или содержит некорректные данные." });
  try {
    const members = await pool.query(
      "SELECT user_id FROM conversation_members WHERE conversation_id=$1",
      [conversationId]
    );
    if (members.rowCount !== 2 || !members.rows.some(row => row.user_id === req.user.id)) {
      return res.status(404).json({ error: "Диалог не найден." });
    }
    const otherId = members.rows.find(row => row.user_id !== req.user.id).user_id;
    if (await isBlocked(pool, req.user.id, otherId)) return res.status(403).json({ error: "Отправка сообщений недоступна." });
    const recipientPreferences = await pool.query(
      "SELECT COALESCE((SELECT friends_only_messages FROM galaxy_preferences WHERE user_id=$1),TRUE) AS friends_only_messages",
      [otherId]
    );
    if (recipientPreferences.rows[0].friends_only_messages && !await areFriends(pool, req.user.id, otherId)) {
      return res.status(403).json({ error: "Пользователь принимает личные сообщения только от друзей." });
    }
    const muted = await pool.query(
      "SELECT 1 FROM punishments WHERE user_id=$1 AND kind='mute' AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>NOW()) LIMIT 1",
      [req.user.id]
    );
    if (muted.rowCount) return res.status(403).json({ error: "Отправка сообщений временно ограничена." });
    const result = await pool.query(
      "INSERT INTO messages (conversation_id,sender_id,body) VALUES ($1,$2,$3) RETURNING id,conversation_id,sender_id,body,created_at",
      [conversationId, req.user.id, parsed.data.body]
    );
    try {
      await pool.query(
        "INSERT INTO notifications (user_id,actor_user_id,kind,title,body,data) VALUES ($1,$2,'direct_message','Новое личное сообщение',$3,$4::jsonb)",
        [otherId, req.user.id, "@" + req.user.username + " отправил(а) вам сообщение.", JSON.stringify({ conversationId })]
      );
    } catch (notificationError) {
      console.error("Direct message notification failed:", notificationError.message);
    }
    res.status(201).json({ message: result.rows[0] });
  } catch (error) { next(error); }
});


const reportSchema = z.object({
  category: z.enum(["harassment", "spam", "impersonation", "inappropriate_content", "threats", "other"]),
  details: z.string().trim().max(1000).default("")
}).strict();

router.get("/blocks", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.blocked_id AS user_id,u.username,p.display_name,b.created_at
       FROM blocks b JOIN users u ON u.id=b.blocked_id
       LEFT JOIN profiles p ON p.user_id=u.id
       WHERE b.blocker_id=$1 ORDER BY b.created_at DESC LIMIT 200`,
      [req.user.id]
    );
    res.json({ blocks: result.rows });
  } catch (error) { next(error); }
});

router.post("/blocks/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  if (!validId(targetId) || targetId === req.user.id) return res.status(400).json({ error: "Некорректный пользователь." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT id FROM users WHERE id=$1 AND status='active'", [targetId]);
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Пользователь не найден." });
    }
    await client.query("INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.user.id, targetId]);
    await client.query(
      "DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)",
      [req.user.id, targetId]
    );
    await client.query("COMMIT");
    res.status(201).json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.delete("/blocks/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  if (!validId(targetId)) return res.status(400).json({ error: "Некорректный пользователь." });
  try {
    const result = await pool.query("DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2 RETURNING blocker_id", [req.user.id, targetId]);
    if (!result.rowCount) return res.status(404).json({ error: "Пользователь не найден в вашем чёрном списке." });
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post("/reports/:userId", requireSession, async (req, res, next) => {
  const targetId = req.params.userId;
  const parsed = reportSchema.safeParse(req.body);
  if (!validId(targetId) || targetId === req.user.id || !parsed.success) {
    return res.status(400).json({ error: "Проверьте пользователя и данные жалобы." });
  }
  try {
    const target = await pool.query("SELECT id FROM users WHERE id=$1 AND status='active'", [targetId]);
    if (!target.rowCount) return res.status(404).json({ error: "Пользователь не найден." });
    const recent = await pool.query(
      "SELECT 1 FROM reports WHERE reporter_id=$1 AND target_user_id=$2 AND created_at>NOW()-INTERVAL '10 minutes' LIMIT 1",
      [req.user.id, targetId]
    );
    if (recent.rowCount) return res.status(429).json({ error: "Вы уже недавно отправляли жалобу на этого пользователя." });
    const result = await pool.query(
      "INSERT INTO reports (reporter_id,target_user_id,category,details) VALUES ($1,$2,$3,$4) RETURNING id,status,created_at",
      [req.user.id, targetId, parsed.data.category, parsed.data.details]
    );
    res.status(201).json({ report: result.rows[0] });
  } catch (error) { next(error); }
});

const galaxyPreferencesSchema = z.object({
  chat_bubbles: z.boolean().optional(),
  sound_enabled: z.boolean().optional(),
  friends_only_messages: z.boolean().optional(),
  invisible: z.boolean().optional(),
  system_messages: z.boolean().optional()
}).strict();

router.get("/preferences", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `INSERT INTO galaxy_preferences (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at=galaxy_preferences.updated_at
       RETURNING chat_bubbles,sound_enabled,friends_only_messages,invisible,system_messages`,
      [req.user.id]
    );
    res.json({ preferences: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch("/preferences", requireSession, async (req, res, next) => {
  const parsed = galaxyPreferencesSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data).length) {
    return res.status(400).json({ error: "Укажи хотя бы одну настройку." });
  }
  const columns = {
    chat_bubbles: "chat_bubbles",
    sound_enabled: "sound_enabled",
    friends_only_messages: "friends_only_messages",
    invisible: "invisible",
    system_messages: "system_messages"
  };
  const values = [req.user.id];
  const assignments = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    values.push(value);
    assignments.push(columns[key] + "=$" + values.length);
  }
  try {
    const result = await pool.query(
      `INSERT INTO galaxy_preferences (user_id,${Object.keys(parsed.data).join(",")})
       VALUES ($1,${values.slice(1).map((_,i)=>"$"+(i+2)).join(",")})
       ON CONFLICT (user_id) DO UPDATE SET ${assignments.join(",")},updated_at=NOW()
       RETURNING chat_bubbles,sound_enabled,friends_only_messages,invisible,system_messages`,
      values
    );
    res.json({ preferences: result.rows[0] });
  } catch (error) { next(error); }
});

module.exports = router;
