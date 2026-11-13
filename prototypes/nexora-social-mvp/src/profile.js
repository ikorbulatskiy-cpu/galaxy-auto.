const express = require("express");
const cookie = require("cookie");

const COOKIE_NAME = "nexora_session";
const SKINS = ["#f4c7a1", "#c9875b", "#75452f"];
const SUITS = ["#6d7cff", "#ef6c9b", "#35bca5"];
const HAIR = ["short", "long", "spiky", "bob", "ponytail", "curly"];
const GENDERS = ["male", "female"];
const OUTFITS = ["casual", "hoodie", "jacket", "dress", "beach", "club"];
const HAIR_COLORS = ["#30233d", "#6b432c", "#e5c07b", "#e9eef8", "#bd5de5"];
const SHOES = ["sneakers", "boots", "heels", "sandals"];
const ACCESSORIES = ["none", "glasses", "headphones", "crown", "flower", "cap", "scarf"];

function cleanText(value, max) {
  return String(value ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max);
}
function normalizeAvatar(input) {
  return {
    gender: GENDERS.includes(input?.gender) ? input.gender : "male",
    skin: SKINS.includes(input?.skin) ? input.skin : SKINS[0],
    hair: HAIR.includes(input?.hair) ? input.hair : "short",
    suit: SUITS.includes(input?.suit) ? input.suit : SUITS[0],
    outfit: OUTFITS.includes(input?.outfit) ? input.outfit : "casual",
    hairColor: HAIR_COLORS.includes(input?.hairColor) ? input.hairColor : HAIR_COLORS[0],
    shoes: SHOES.includes(input?.shoes) ? input.shoes : "sneakers",
    accessory: ACCESSORIES.includes(input?.accessory) ? input.accessory : "none"
  };
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
