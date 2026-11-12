const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const nodemailer = require("nodemailer");
const { pool } = require("./db");

const router = express.Router();
const COOKIE_NAME = "nexora_session";
const SESSION_DAYS = 14;
const isProduction = process.env.NODE_ENV === "production";

const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  username: z.string().trim().min(3).max(24).regex(/^[\p{L}\p{N}_-]+$/u),
  password: z.string().min(10).max(72),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
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
function ageAtLeast18(dateString) {
  const birth = new Date(dateString + "T00:00:00.000Z");
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== dateString) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 18 && birth <= now;
}
async function sendVerificationEmail(email, token) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_BASE_URL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !APP_BASE_URL) {
    if (process.env.NODE_ENV !== "production") {
      const verificationUrl = APP_BASE_URL ? new URL("/api/auth/verify", APP_BASE_URL) : null;
      if (verificationUrl) verificationUrl.searchParams.set("token", token);
      console.info("NEXORA development verification link:", verificationUrl ? verificationUrl.toString() : "Set APP_BASE_URL to construct the link.");
      return verificationUrl ? verificationUrl.toString() : null;
    }
    throw new Error("Email delivery is not configured.");
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const url = new URL("/api/auth/verify", APP_BASE_URL);
  url.searchParams.set("token", token);
  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: "Подтверждение почты NEXORA",
    text: "Подтвердите адрес электронной почты: " + url.toString()
  });
  return null;
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
    if (!result.rows[0].email_verified_at) return res.status(403).json({ error: "Сначала подтвердите email." });
    req.user = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

router.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте email, ник, пароль и дату рождения." });
  const { email, username, password, birthDate } = parsed.data;
  if (!ageAtLeast18(birthDate)) return res.status(400).json({ error: "NEXORA доступна только совершеннолетним пользователям (18+)." });
  const client = await pool.connect();
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = randomToken();
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO users (email, username, password_hash) VALUES ($1,$2,$3) RETURNING id,email,username",
      [email, username, passwordHash]
    );
    const user = inserted.rows[0];
    await client.query("INSERT INTO profiles (user_id, display_name, birth_date) VALUES ($1,$2,$3)", [user.id, username, birthDate]);
    await client.query("INSERT INTO reputation (user_id) VALUES ($1)", [user.id]);
    await client.query("INSERT INTO wallet_balances (user_id,coins) VALUES ($1,500)", [user.id]);
    await client.query("INSERT INTO wallet_ledger (user_id,currency,amount,reason) VALUES ($1,'coins',500,'Стартовый бонус NEXORA')", [user.id]);
    await client.query("INSERT INTO characters (user_id,name,is_active) VALUES ($1,$2,TRUE)", [user.id, username]);
    await client.query("INSERT INTO user_locations (user_id,planet_id) SELECT $1,id FROM planets WHERE slug='nexora-prime' ON CONFLICT (user_id) DO NOTHING", [user.id]);
    await client.query("INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '24 hours')", [user.id, hashToken(verificationToken)]);
    await client.query("COMMIT");
    let devVerificationUrl = null;
    try {
      devVerificationUrl = await sendVerificationEmail(email, verificationToken);
    } catch (mailError) {
      console.error("Verification email delivery failed:", mailError.message);
      return res.status(202).json({ message: "Аккаунт создан, но письмо не отправлено. Администратору нужно проверить почтовую конфигурацию." });
    }
    return res.status(201).json({
      message: "Аккаунт создан. Подтвердите адрес электронной почты.",
      ...(devVerificationUrl && process.env.NODE_ENV !== "production" ? { devVerificationUrl } : {})
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "Этот email или ник уже занят." });
    next(error);
  } finally {
    client.release();
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
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Введите корректный email и пароль." });
  try {
    const result = await pool.query(
      "SELECT id,email,username,password_hash,email_verified_at,status FROM users WHERE email = $1",
      [parsed.data.email]
    );
    const user = result.rows[0];
    const valid = user && user.status === "active" && await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Неверный email или пароль." });
    if (!user.email_verified_at) return res.status(403).json({ error: "Подтвердите email перед входом." });
    const token = randomToken();
    await pool.query(
      "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '14 days')",
      [user.id, hashToken(token)]
    );
    setSessionCookie(res, token);
    return res.json({ user: { id: user.id, email: user.email, username: user.username } });
  } catch (error) { next(error); }
});

router.get("/me", requireSession, async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, username: req.user.username, role: req.user.role } });
});

router.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (error) { next(error); }
});

module.exports = { router, requireSession };
