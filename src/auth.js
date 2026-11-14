const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const express = require("express");
const { z } = require("zod");
const { pool } = require("./db");

const router = express.Router();
const COOKIE_NAME = "nexora_session";
const SESSION_DAYS = 14;
const isProduction = process.env.NODE_ENV === "production";
const CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N}_-]+$/u),
  gender: z.enum(["female", "male"]).optional(),
  body: z.enum(["slim", "regular", "athletic"]).optional(),
  adultConfirmed: z.literal(true)
});
const loginSchema = z.object({
  characterCode: z.string().trim().min(9).max(24)
});

function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function createCharacterCode() {
  let code = "";
  for (let i = 0; i < 9; i++) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}
function normalizeCharacterCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/" });
}
async function requireSession(req, res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: "Введите код персонажа для входа." });
    const result = await pool.query(
      `SELECT u.id, u.email, u.username, u.role, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'active'`,
      [hashToken(token)]
    );
    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Сессия истекла. Введите код персонажа." });
    }
    req.user = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

router.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Укажите ник, пол персонажа и подтвердите, что вам исполнилось 18 лет." });
  const { username, gender } = parsed.data;
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    const characterCode = createCharacterCode();
    await client.query("BEGIN");
    transactionStarted = true;
    const inserted = await client.query(
      "INSERT INTO users (email, username, password_hash, character_code_hash) VALUES ($1,$2,$3,$4) RETURNING id,username",
      ["nexora-" + crypto.randomUUID() + "@accounts.invalid", username, await bcrypt.hash(randomToken(), 12), hashToken(normalizeCharacterCode(characterCode))]
    );
    const user = inserted.rows[0];
    await client.query("INSERT INTO profiles (user_id, display_name) VALUES ($1,$2)", [user.id, username]);
    await client.query("INSERT INTO reputation (user_id) VALUES ($1)", [user.id]);
    await client.query("INSERT INTO wallet_balances (user_id,coins) VALUES ($1,500)", [user.id]);
    await client.query("INSERT INTO wallet_ledger (user_id,currency,amount,reason) VALUES ($1,'coins',500,'Стартовый бонус NEXORA')", [user.id]);
    await client.query(
      "INSERT INTO characters (user_id,name,gender,appearance,is_active) VALUES ($1,$2,$3,$4::jsonb,TRUE)",
      [user.id, username, gender || "male", JSON.stringify({ spriteGender:gender || "male", body:parsed.data.body || "regular", head:"classic", skinTone:"medium", hair:"short", hairColor:"brown", eyes:"brown", outfit:(gender || "male") === "female" ? "pink" : "blue", shoes:"sneakers", adultConfirmed:true, privacyConsentAt:new Date().toISOString() })]
    );
    await client.query("INSERT INTO user_locations (user_id,planet_id) SELECT $1,id FROM planets WHERE slug='nexora-prime' ON CONFLICT (user_id) DO NOTHING", [user.id]);
    const sessionToken = randomToken();
    await client.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW() + INTERVAL '14 days')", [user.id, hashToken(sessionToken)]);
    await client.query("COMMIT");
    transactionStarted = false;
    setSessionCookie(res, sessionToken);
    return res.status(201).json({
      message: "Персонаж создан. Сохраните код для следующих входов.",
      characterCode,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    if (transactionStarted && client) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Registration rollback failed:", rollbackError.code || "UNKNOWN", rollbackError.message); }
    }
    if (error.code === "23505") return res.status(409).json({ error: "Этот ник уже занят. Выберите другой." });
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите код персонажа." });
  const normalizedCode = normalizeCharacterCode(parsed.data.characterCode);
  if (!/^(?:[A-Z0-9]{9}|[A-Z0-9]{10}|NXR[A-Z0-9]{16})$/.test(normalizedCode)) {
    return res.status(401).json({ error: "Неверный код персонажа." });
  }
  let client;
  try {
    client = await pool.connect();
    const hashes = [...new Set([hashToken(normalizedCode), hashToken(normalizedCode.toLowerCase())])];
    const result = await client.query(
      "SELECT id,username,role,status FROM users WHERE character_code_hash = ANY($1::text[]) LIMIT 1",
      [hashes]
    );
    let user = result.rows[0] || null;
    // Compatibility with legacy accounts whose recovery code was stored only
    // as bcrypt. On the first successful login, upgrade it to the current hash.
    if (!user) {
      const legacyCandidates = await client.query(
        "SELECT id,username,role,status,legacy_recovery_code_hash FROM users WHERE legacy_recovery_code_hash IS NOT NULL"
      );
      for (const candidate of legacyCandidates.rows) {
        if (await bcrypt.compare(normalizedCode.toLowerCase(), candidate.legacy_recovery_code_hash)) {
          user = candidate;
          await client.query(
            "UPDATE users SET character_code_hash=$1,legacy_recovery_code_hash=NULL,updated_at=NOW() WHERE id=$2",
            [hashToken(normalizedCode), candidate.id]
          );
          break;
        }
      }
    }
    if (!user || user.status !== "active") return res.status(401).json({ error: "Неверный код персонажа." });
    const token = randomToken();
    await client.query(
      "INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW() + INTERVAL '14 days')",
      [user.id, hashToken(token)]
    );
    setSessionCookie(res, token);
    return res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.get("/me", requireSession, async (req, res, next) => {
  try {
    let characterCode = null;
    const found = await pool.query("SELECT character_code_hash,legacy_recovery_code_hash FROM users WHERE id=$1", [req.user.id]);
    if (!found.rows[0].character_code_hash && !found.rows[0].legacy_recovery_code_hash) {
      characterCode = createCharacterCode();
      await pool.query("UPDATE users SET character_code_hash=$1 WHERE id=$2 AND character_code_hash IS NULL", [
        hashToken(normalizeCharacterCode(characterCode)), req.user.id
      ]);
      const check = await pool.query("SELECT character_code_hash FROM users WHERE id=$1", [req.user.id]);
      if (check.rows[0].character_code_hash !== hashToken(normalizeCharacterCode(characterCode))) characterCode = null;
    }
    return res.json({
      user: { id: req.user.id, username: req.user.username, role: req.user.role },
      ...(characterCode ? { characterCode } : {})
    });
  } catch (error) { return next(error); }
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

module.exports = { router, requireSession };
