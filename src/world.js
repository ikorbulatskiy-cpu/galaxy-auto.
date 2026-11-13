const express = require("express");
const { z } = require("zod");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();
const appearanceSchema = z.object({
  body: z.string().max(40).optional(),
  skinTone: z.string().max(24).optional(),
  head: z.string().max(40).optional(),
  hair: z.string().max(40).optional(),
  hairColor: z.string().max(24).optional(),
  eyes: z.string().max(40).optional(),
  outfit: z.string().max(60).optional(),
  shoes: z.string().max(40).optional(),
  accessories: z.array(z.string().max(40)).max(20).optional()
}).strict();
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(32).optional(),
  city: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(500).optional(),
  interests: z.array(z.string().trim().min(1).max(32)).max(20).optional(),
  visibility: z.enum(["public","friends","private"]).optional()
}).strict();

router.get("/planets", async (_req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT slug,name,description,access_type,ticket_price,settings FROM planets WHERE is_active = TRUE AND access_type <> 'vip' ORDER BY name"
    );
    res.json({ planets: result.rows });
  } catch (error) { next(error); }
});

router.get("/me", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.display_name,p.birth_date,p.city,p.bio,p.interests,p.avatar_url,p.visibility,
              r.authority,r.popularity,r.reputation_score,r.experience,r.level,
              w.coins,w.diamonds,pl.slug AS planet_slug,pl.name AS planet_name,
              EXISTS(SELECT 1 FROM punishments x WHERE x.user_id=u.id AND x.kind='jail'
                AND x.lifted_at IS NULL AND (x.ends_at IS NULL OR x.ends_at > NOW())) AS is_jailed
       FROM users u
       LEFT JOIN profiles p ON p.user_id=u.id
       LEFT JOIN reputation r ON r.user_id=u.id
       LEFT JOIN wallet_balances w ON w.user_id=u.id
       LEFT JOIN user_locations l ON l.user_id=u.id
       LEFT JOIN planets pl ON pl.id=l.planet_id
       WHERE u.id=$1`,
      [req.user.id]
    );
    res.json({ profile: result.rows[0] || null });
  } catch (error) { next(error); }
});

router.patch("/profile", requireSession, async (req, res, next) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные профиля." });
  const fields = parsed.data;
  try {
    const current = await pool.query("SELECT user_id FROM profiles WHERE user_id=$1", [req.user.id]);
    if (!current.rowCount) return res.status(404).json({ error: "Профиль не найден." });
    const result = await pool.query(
      `UPDATE profiles SET
       display_name=COALESCE($2,display_name), city=COALESCE($3,city),
       bio=COALESCE($4,bio), interests=COALESCE($5,interests),
       visibility=COALESCE($6,visibility), updated_at=NOW()
       WHERE user_id=$1
       RETURNING display_name,city,bio,interests,visibility`,
      [req.user.id, fields.displayName ?? null, fields.city ?? null, fields.bio ?? null, fields.interests ?? null, fields.visibility ?? null]
    );
    res.json({ profile: result.rows[0] });
  } catch (error) { next(error); }
});

router.get("/character", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,name,appearance,is_active,updated_at FROM character_looks WHERE user_id=$1 ORDER BY is_active DESC,created_at ASC",
      [req.user.id]
    );
    res.json({ looks: result.rows });
  } catch (error) { next(error); }
});

router.put("/character", requireSession, async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(40).default("Основной образ"),
    appearance: appearanceSchema
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные параметры персонажа." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM character_looks WHERE user_id=$1 AND is_active=TRUE FOR UPDATE", [req.user.id]);
    let result;
    if (existing.rowCount) {
      result = await client.query(
        "UPDATE character_looks SET name=$2,appearance=$3,updated_at=NOW() WHERE id=$1 RETURNING id,name,appearance,is_active",
        [existing.rows[0].id, parsed.data.name, JSON.stringify(parsed.data.appearance)]
      );
    } else {
      result = await client.query(
        "INSERT INTO character_looks (user_id,name,appearance,is_active) VALUES ($1,$2,$3,TRUE) RETURNING id,name,appearance,is_active",
        [req.user.id, parsed.data.name, JSON.stringify(parsed.data.appearance)]
      );
    }
    await client.query("COMMIT");
    res.json({ character: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.post("/travel", requireSession, async (req, res, next) => {
  const parsed = z.object({ planetSlug: z.string().min(2).max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите планету назначения." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jail = await client.query(
      "SELECT 1 FROM punishments WHERE user_id=$1 AND kind='jail' AND lifted_at IS NULL AND (ends_at IS NULL OR ends_at>NOW()) LIMIT 1",
      [req.user.id]
    );
    if (jail.rowCount) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Перелёты недоступны во время игрового заключения." });
    }
    const destination = await client.query(
      `SELECT p.id,p.slug,p.name,p.access_type,p.ticket_price,p.owner_user_id,
        EXISTS(SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$2
          AND (pa.expires_at IS NULL OR pa.expires_at>NOW())
          AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff')) AS has_legacy_access,
        EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$2
          AND (pb.expires_at IS NULL OR pb.expires_at>NOW())) AS is_planet_banned
       FROM planets p WHERE p.slug=$1 AND p.is_active=TRUE`,
      [parsed.data.planetSlug,req.user.id]
    );
    if (!destination.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Планета не найдена." });
    }
    const planet = destination.rows[0];
    if (planet.is_planet_banned) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Доступ к этой планете закрыт её администрацией." });
    }
    if (planet.access_type === "vip" && String(planet.owner_user_id) !== String(req.user.id) && !planet.has_legacy_access) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Для этой планеты требуется приглашение или специальный доступ." });
    }
    const current = await client.query("SELECT planet_id FROM user_locations WHERE user_id=$1 FOR UPDATE", [req.user.id]);
    const fromPlanetId = current.rows[0]?.planet_id || null;
    const removedPresence = await client.query("DELETE FROM room_presence WHERE user_id=$1 RETURNING room_id", [req.user.id]);
    if (fromPlanetId === planet.id) {
      await client.query("ROLLBACK");
      return res.json({ message: "Вы уже на этой планете.", planet: { slug: planet.slug, name: planet.name } });
    }
    if (planet.access_type === "ticket" && planet.ticket_price > 0) {
      const wallet = await client.query("SELECT coins FROM wallet_balances WHERE user_id=$1 FOR UPDATE", [req.user.id]);
      if (!wallet.rowCount || Number(wallet.rows[0].coins) < planet.ticket_price) {
        await client.query("ROLLBACK");
        return res.status(402).json({ error: "Недостаточно Nexora Coins для билета." });
      }
      await client.query("UPDATE wallet_balances SET coins=coins-$2,updated_at=NOW() WHERE user_id=$1", [req.user.id, planet.ticket_price]);
      await client.query(
        "INSERT INTO wallet_ledger (user_id,currency,amount,reason) VALUES ($1,'coins',$2,$3)",
        [req.user.id, -planet.ticket_price, "Билет на " + planet.name]
      );
    }
    await client.query(
      `INSERT INTO user_locations (user_id,planet_id,arrived_at) VALUES ($1,$2,NOW())
       ON CONFLICT (user_id) DO UPDATE SET planet_id=EXCLUDED.planet_id,arrived_at=NOW()`,
      [req.user.id, planet.id]
    );
    await client.query("INSERT INTO planet_visits(user_id,planet_id) VALUES($1,$2)",[req.user.id,planet.id]);
    await client.query(
      "INSERT INTO flights (user_id,from_planet_id,to_planet_id,status,fare_paid,arrived_at) VALUES ($1,$2,$3,'completed',$4,NOW())",
      [req.user.id, fromPlanetId, planet.id, planet.access_type === "ticket" ? planet.ticket_price : 0]
    );
    const departedRooms = [...new Set(removedPresence.rows.map(row => row.room_id))];
    for (const roomId of departedRooms) {
      await client.query("SELECT pg_notify('nexora_room_events',$1)", [
        JSON.stringify({ type: "presence", action: "left", roomId, userId: req.user.id })
      ]);
    }
    await client.query("COMMIT");
    res.json({ message: "Перелёт завершён.", planet: { slug: planet.slug, name: planet.name }, farePaid: planet.access_type === "ticket" ? planet.ticket_price : 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

module.exports = router;
