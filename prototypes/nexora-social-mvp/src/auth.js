const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

const SESSION_DAYS = 30;

function normalizeNickname(value) {
  return String(value || "").trim().replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 18);
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function generateRecoveryCode() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}
async function issueSession(accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query(
    "INSERT INTO nexora_social_world.sessions(account_id, token_hash, expires_at) VALUES($1,$2,$3)",
    [accountId, hashToken(token), expires]
  );
  return token;
}
async function register(req, res) {
  const nickname = normalizeNickname(req.body?.nickname);
  if (nickname.length < 2) return res.status(400).json({ error: "Ник должен содержать от 2 до 18 букв или цифр." });
  const code = generateRecoveryCode();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "INSERT INTO nexora_social_world.accounts(nickname,nickname_normalized,recovery_code_hash) VALUES($1,$2,$3) RETURNING id,nickname",
      [nickname, nickname.toLocaleLowerCase("ru-RU"), await bcrypt.hash(code, 12)]
    );
    const account = result.rows[0];
    await client.query(
      "INSERT INTO nexora_social_world.characters(account_id,nickname,avatar) VALUES($1,$2,$3::jsonb)",
      [account.id, nickname, JSON.stringify(req.body?.avatar || {})]
    );
    await client.query("INSERT INTO nexora_social_world.wallets(account_id,balance) VALUES($1,0)", [account.id]);
    await client.query("COMMIT");
    res.clearCookie("nexora_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    res.status(201).json({ ok: true, account: { id: account.id, nickname }, recoveryCode: code });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "Этот ник уже занят." });
    throw error;
  } finally {
    client.release();
  }
}
async function login(req, res) {
  const nickname = normalizeNickname(req.body?.nickname);
  const code = String(req.body?.recoveryCode || "").trim();
  if (!nickname || !code) return res.status(400).json({ error: "Укажите ник и код восстановления." });
  const result = await pool.query(
    "SELECT id,nickname,recovery_code_hash FROM nexora_social_world.accounts WHERE nickname_normalized=$1",
    [nickname.toLocaleLowerCase("ru-RU")]
  );
  const account = result.rows[0];
  const validCode = account && (await bcrypt.compare(code.toLowerCase(), account.recovery_code_hash) || await bcrypt.compare(code.toUpperCase(), account.recovery_code_hash));
  if (!validCode) {
    return res.status(401).json({ error: "Неверный ник или код восстановления." });
  }
  await pool.query("UPDATE nexora_social_world.accounts SET last_login_at=NOW() WHERE id=$1", [account.id]);
  const token = await issueSession(account.id);
  res.cookie("nexora_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400000 });
  res.json({ ok: true, account: { id: account.id, nickname: account.nickname } });
}
async function authenticateToken(token) {
  if (!token || typeof token !== "string" || token.length > 256) return null;
  const result = await pool.query(
    "SELECT a.id,a.nickname,c.avatar,c.planet,c.position_x FROM nexora_social_world.sessions s JOIN nexora_social_world.accounts a ON a.id=s.account_id LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
    [hashToken(token)]
  );
  return result.rows[0] || null;
}
async function logout(token) {
  if (token) await pool.query("DELETE FROM nexora_social_world.sessions WHERE token_hash=$1", [hashToken(token)]);
}
module.exports = { register, login, authenticateToken, logout };
