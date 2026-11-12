const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("./db");

const router = express.Router();
const COOKIE_NAME = "nexora_session";
const SESSION_DAYS = 14;
const isProduction = process.env.NODE_ENV === "production";

const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  username: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N}_-]+$/u),
  password: z.string().min(10).max(72),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  gender: z.enum(["female","male"]),
  body: z.enum(["slim","regular","athletic"]),
  head: z.enum(["classic","soft","angular"])
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  password: z.string().min(1).max(72)
});

function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
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
    if (!token) return res.status(401).json({ error: "Требуется авторизация." });
    const result = await pool.query(
      `SELECT u.id, u.email, u.username, u.role, u.email_verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'active'`,
      [hashToken(token)]
    );
    if (!result.rowCount) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Сессия истекла. Войдите снова." });
    }
    req.user = result.rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
}

router.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте email, ник, пароль и параметры персонажа." });
  const { email, username, password, birthDate, gender, body, head } = parsed.data;

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    const passwordHash = await bcrypt.hash(password, 12);

    await client.query("BEGIN");
    transactionStarted = true;
    const inserted = await client.query(
      "INSERT INTO users (email, username, password_hash) VALUES ($1,$2,$3) RETURNING id,email,username",
      [email, username, passwordHash]
    );
    const user = inserted.rows[0];
    await client.query("INSERT INTO profiles (user_id, display_name, birth_date) VALUES ($1,$2,$3)", [user.id, username, birthDate || null]);
    await client.query("INSERT INTO reputation (user_id) VALUES ($1)", [user.id]);
    await client.query("INSERT INTO wallet_balances (user_id,coins) VALUES ($1,500)", [user.id]);
    await client.query("INSERT INTO wallet_ledger (user_id,currency,amount,reason) VALUES ($1,'coins',500,'Стартовый бонус NEXORA')", [user.id]);
    await client.query("INSERT INTO characters (user_id,name,gender,appearance,is_active) VALUES ($1,$2,$3,$4::jsonb,TRUE)", [user.id, username, gender, JSON.stringify({body,head,skinTone:"medium",hair:"short",hairColor:"brown",eyes:"brown",outfit:gender === "female" ? "pink" : "blue",shoes:"sneakers"})]);
    await client.query("INSERT INTO user_locations (user_id,planet_id) SELECT $1,id FROM planets WHERE slug='nexora-prime' ON CONFLICT (user_id) DO NOTHING", [user.id]);
    const sessionToken = randomToken();
    await client.query("INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW() + INTERVAL '14 days')", [user.id, hashToken(sessionToken)]);
    await client.query("COMMIT");
    setSessionCookie(res, sessionToken);
    transactionStarted = false;

    return res.status(201).json({ message: "Аккаунт создан. Персонаж готов.", user: { id: user.id, email: user.email, username: user.username } });
  } catch (error) {
    if (transactionStarted && client) {
      try { await client.query("ROLLBACK"); }
      catch (rollbackError) { console.error("Registration rollback failed:", rollbackError.code || "UNKNOWN", rollbackError.message); }
    }
    if (error.code === "23505") return res.status(409).json({ error: "Этот email или ник уже занят." });
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.get("/verify", async (req, res, next) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token || token.length > 200) return res.status(400).send("Ссылка подтверждения недействительна.");
  try {
    const result = await pool.query(
      `UPDATE users SET email_verified_at = NOW(), updated_at = NOW()
       WHERE id = (SELECT user_id FROM email_verification_tokens WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW())
       RETURNING id`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(400).send("Ссылка недействительна или срок её действия истёк.");
    await pool.query("UPDATE email_verification_tokens SET consumed_at = NOW() WHERE token_hash = $1", [hashToken(token)]);
    return res.status(200).send("Email подтверждён. Теперь можно войти в NEXORA.");
  } catch (error) { return next(error); }
});

router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректный email и пароль." });

  let client;
  try {
    client = await pool.connect();
    const result = await client.query(
      "SELECT id,email,username,password_hash,email_verified_at,status FROM users WHERE email = $1",
      [parsed.data.email]
    );
    const user = result.rows[0];
    const valid = user && user.status === "active" && await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Неверный email или пароль." });

    const token = randomToken();
    await client.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '14 days')",
      [user.id, hashToken(token)]
    );
    setSessionCookie(res, token);
    return res.json({ user: { id: user.id, email: user.email, username: user.username } });
  } catch (error) {
    return next(error);
  } finally {
    if (client) client.release();
  }
});

router.get("/me", requireSession, async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, username: req.user.username, role: req.user.role } });
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
