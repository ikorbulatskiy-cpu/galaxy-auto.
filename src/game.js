const express = require("express");
const { z } = require("zod");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();

router.get("/characters", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,name,gender,character_age,bio,appearance,level,experience,authority,is_active,created_at,updated_at FROM characters WHERE user_id=$1 ORDER BY created_at",
      [req.user.id]
    );
    res.json({ characters: result.rows, limit: 3 });
  } catch (error) { next(error); }
});

router.post("/characters", requireSession, async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N} _-]+$/u),
    gender: z.enum(["unspecified","female","male","other"]).optional(),
    characterAge: z.number().int().min(18).max(120).optional(),
    bio: z.string().trim().max(500).optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте имя и данные персонажа." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    const count = await client.query("SELECT COUNT(*)::int AS count FROM characters WHERE user_id=$1", [req.user.id]);
    if (count.rows[0].count >= 3) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "На одном аккаунте можно создать не более трёх персонажей." });
    }
    const created = await client.query(
      `INSERT INTO characters (user_id,name,gender,character_age,bio,is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active,created_at`,
      [req.user.id, parsed.data.name, parsed.data.gender || "unspecified", parsed.data.characterAge ?? null, parsed.data.bio || "", count.rows[0].count === 0]
    );
    await client.query("COMMIT");
    res.status(201).json({ character: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "У вас уже есть персонаж с таким именем." });
    next(error);
  } finally { client.release(); }
});

router.patch("/characters/:characterId", requireSession, async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N} _-]+$/u).optional(),
    gender: z.enum(["unspecified","female","male","other"]).optional(),
    characterAge: z.number().int().min(18).max(120).nullable().optional(),
    bio: z.string().trim().max(500).optional(),
    appearance: z.object({
      body: z.string().max(40).optional(),
      skinTone: z.string().max(24).optional(),
      head: z.string().max(40).optional(),
      hair: z.string().max(40).optional(),
      hairColor: z.string().max(24).optional(),
      eyes: z.string().max(40).optional(),
      eyeStyle: z.enum(["normal","wide","narrow"]).optional(),
      expression: z.enum(["smile","neutral"]).optional(),
      outfit: z.string().max(60).optional(),
      shoes: z.string().max(40).optional(),
      accessories: z.array(z.string().max(40)).max(20).optional()
    }).strict().optional()
  }).strict().safeParse(req.body);
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(req.params.characterId)) {
    return res.status(400).json({ error: "Некорректные данные персонажа." });
  }
  const fields = parsed.data;
  try {
    const result = await pool.query(
      `UPDATE characters SET
       name=COALESCE($3,name), gender=COALESCE($4,gender),
       character_age=CASE WHEN $5::boolean THEN $6::smallint ELSE character_age END,
       bio=COALESCE($7,bio), appearance=COALESCE($8::jsonb,appearance), updated_at=NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active`,
      [req.params.characterId, req.user.id, fields.name ?? null, fields.gender ?? null,
       Object.prototype.hasOwnProperty.call(fields,"characterAge"), fields.characterAge ?? null,
       fields.bio ?? null, fields.appearance ? JSON.stringify(fields.appearance) : null]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Персонаж не найден." });
    res.json({ character: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Имя персонажа уже занято на этом аккаунте." });
    next(error);
  }
});

router.post("/characters/:characterId/activate", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.characterId)) return res.status(400).json({ error: "Некорректный персонаж." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query("SELECT id FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.characterId, req.user.id]);
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Персонаж не найден." });
    }
    await client.query("UPDATE characters SET is_active=FALSE WHERE user_id=$1", [req.user.id]);
    const active = await client.query("UPDATE characters SET is_active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active", [req.params.characterId]);
    await client.query("COMMIT");
    res.json({ character: active.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.delete("/characters/:characterId", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.characterId)) return res.status(400).json({ error: "Некорректный персонаж." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query("DELETE FROM characters WHERE id=$1 AND user_id=$2 RETURNING is_active", [req.params.characterId, req.user.id]);
    if (!removed.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Персонаж не найден." });
    }
    if (removed.rows[0].is_active) {
      await client.query(
        "UPDATE characters SET is_active=TRUE,updated_at=NOW() WHERE id=(SELECT id FROM characters WHERE user_id=$1 ORDER BY created_at LIMIT 1)",
        [req.user.id]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.get("/planets", requireSession, async (req,res,next)=>{try{const r=await pool.query("SELECT p.id,p.slug,p.name,p.description,p.access_type,p.ticket_price,EXISTS(SELECT 1 FROM user_locations ul WHERE ul.user_id=$1 AND ul.planet_id=p.id) AS is_current,(SELECT COUNT(*)::int FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE) AS rooms,(SELECT COUNT(DISTINCT rp.user_id)::int FROM room_presence rp JOIN rooms rm ON rm.id=rp.room_id WHERE rm.planet_id=p.id AND rp.connected_at>NOW()-INTERVAL '2 minutes') AS online FROM planets p WHERE p.is_active=TRUE ORDER BY p.name",[req.user.id]);res.json({planets:r.rows})}catch(e){next(e)}});

router.get("/rooms", requireSession, async (req, res, next) => {
  const planetSlug = typeof req.query.planet === "string" ? req.query.planet : "";
  try {
    const location = await pool.query("SELECT p.slug FROM user_locations l JOIN planets p ON p.id=l.planet_id WHERE l.user_id=$1", [req.user.id]);
    if (!location.rowCount) return res.status(409).json({ error: "Сначала выбери планету отправления." });
    if (planetSlug && planetSlug !== location.rows[0].slug) return res.status(409).json({ error: "Сначала перелетите на выбранную планету." });
    const result = await pool.query("SELECT r.id,r.slug,r.name,r.description,r.capacity,p.slug AS planet_slug,p.name AS planet_name,(SELECT COUNT(DISTINCT rp.user_id)::int FROM room_presence rp WHERE rp.room_id=r.id AND rp.connected_at>NOW()-INTERVAL '2 minutes') AS online FROM rooms r JOIN planets p ON p.id=r.planet_id WHERE r.is_active=TRUE AND p.is_active=TRUE AND p.slug=$1 ORDER BY r.name",[location.rows[0].slug]);
    res.json({ rooms: result.rows });
  } catch (error) { next(error); }
});
router.get("/rooms/:roomId/presence", requireSession, async (req,res,next)=>{
  if (!/^[0-9a-f-]{36}$/i.test(req.params.roomId)) return res.status(400).json({error:"Некорректная комната."});
  try {
    const result=await pool.query(
      "SELECT rp.user_id,u.username,COALESCE(c.name,u.username) AS character_name,MAX(rp.connected_at) AS connected_at " +
      "FROM room_presence rp JOIN users u ON u.id=rp.user_id " +
      "JOIN rooms r ON r.id=rp.room_id AND r.is_active=TRUE JOIN planets p ON p.id=r.planet_id AND p.is_active=TRUE JOIN user_locations l ON l.planet_id=r.planet_id AND l.user_id=$2 " +
      "LEFT JOIN characters c ON c.user_id=u.id AND c.is_active=TRUE " +
      "WHERE rp.room_id=$1 AND rp.connected_at>NOW()-INTERVAL '2 minutes' AND u.status='active' " +
      "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=rp.user_id) OR (b.blocker_id=rp.user_id AND b.blocked_id=$2)) " +
      "GROUP BY rp.user_id,u.username,c.name ORDER BY character_name",
      [req.params.roomId,req.user.id]
    );
    res.json({users:result.rows});
  } catch(e){next(e)}
});

router.get("/rooms/:roomId/messages", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.roomId)) return res.status(400).json({ error: "Некорректная комната." });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit,10) || 50,1),100);
  try {
    const room = await pool.query("SELECT r.id FROM rooms r JOIN user_locations l ON l.planet_id=r.planet_id WHERE r.id=$1 AND r.is_active=TRUE AND l.user_id=$2", [req.params.roomId,req.user.id]);
    if (!room.rowCount) return res.status(404).json({ error: "Комната не найдена." });
    const messages = await pool.query(
      `SELECT m.id,m.body,m.created_at,c.id AS character_id,COALESCE(c.name,u.username) AS character_name
       FROM room_messages m JOIN users u ON u.id=m.user_id
       LEFT JOIN characters c ON c.id=m.character_id
       WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT $2`,
      [req.params.roomId,limit]
    );
    res.json({ messages: messages.rows.reverse() });
  } catch (error) { next(error); }
});

router.get("/notifications", requireSession, async (req,res,next) => {
  try {
    const result = await pool.query(
      "SELECT id,kind,title,body,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ notifications: result.rows, unread: result.rows.filter(x => !x.read_at).length });
  } catch (error) { next(error); }
});

router.patch("/notifications/read", requireSession, async (req,res,next) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) return res.status(400).json({ error: "Укажите уведомления для прочтения." });
  try {
    const result = parsed.data.all
      ? await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL", [req.user.id])
      : await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND id=ANY($2::uuid[]) AND read_at IS NULL", [req.user.id, parsed.data.ids]);
    res.json({ updated: result.rowCount });
  } catch (error) { next(error); }
});

module.exports = router;
