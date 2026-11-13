const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { normalizeAvatar } = require("./avatar");

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
  const skipNickname = req.body?.skipNickname === true;
  let nickname = skipNickname ? "" : normalizeNickname(req.body?.nickname);
  if (!skipNickname && nickname.length < 2) return res.status(400).json({ error: "Ник должен содержать от 2 до 18 букв или цифр." });
  if (req.body?.acceptedPersonalData !== true || req.body?.acceptedLegalTerms !== true || req.body?.ageConfirmed !== true) {
    return res.status(400).json({ error: "Для регистрации необходимо подтвердить согласие и возраст 18+." });
  }
  const code = generateRecoveryCode();
  const client = await pool.connect();
  let account;
  try {
    await client.query("BEGIN");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (skipNickname) nickname = "Гость" + crypto.randomInt(100000, 999999);
      const result = await client.query(
        "INSERT INTO nexora_social_world.accounts(nickname,nickname_normalized,recovery_code_hash,recovery_code_lookup_hash) VALUES($1,$2,$3,$4) ON CONFLICT (nickname_normalized) DO NOTHING RETURNING id,nickname",
        [nickname, nickname.toLocaleLowerCase("ru-RU"), await bcrypt.hash(code, 12), hashToken(code)]
      );
      if (result.rowCount) { account = result.rows[0]; break; }
      if (!skipNickname) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Этот ник уже занят." }); }
    }
    if (!account) throw new Error("Не удалось подобрать свободный гостевой ник. Попробуйте ещё раз.");
    await client.query("INSERT INTO nexora_social_world.characters(account_id,nickname,avatar) VALUES($1,$2,$3::jsonb)",[account.id,nickname,JSON.stringify(normalizeAvatar(req.body?.avatar))]);
    await client.query("INSERT INTO nexora_social_world.wallets(account_id,balance) VALUES($1,0)",[account.id]);
    await client.query("INSERT INTO nexora_social_world.account_consents(account_id,age_confirmed_at,personal_data_consent_at,legal_terms_accepted_at,legal_version) VALUES($1,NOW(),NOW(),NOW(),$2)",[String(account.id),String(req.body?.legalVersion||"2026-11-14").slice(0,32)]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "Этот ник уже занят." });
    throw error;
  } finally { client.release(); }
  const token = await issueSession(account.id);
  res.clearCookie("nexora_session",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});
  res.cookie("nexora_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400000});
  res.status(201).json({ok:true,account:{id:account.id,nickname:account.nickname},recoveryCode:code});
}
const MAX_LOGIN_FAILURES = 8;
const LOGIN_WINDOW_MINUTES = 15;

async function recordLoginFailure(ipHash) {
  const result = await pool.query(
    `INSERT INTO nexora_social_world.auth_login_attempts AS existing
       (ip_hash, attempts, window_started_at, locked_until, updated_at)
     VALUES ($1, 1, NOW(), NULL, NOW())
     ON CONFLICT (ip_hash) DO UPDATE SET
       attempts = CASE
         WHEN existing.window_started_at <= NOW() - make_interval(mins => $3::int) THEN 1
         ELSE existing.attempts + 1
       END,
       window_started_at = CASE
         WHEN existing.window_started_at <= NOW() - make_interval(mins => $3::int) THEN NOW()
         ELSE existing.window_started_at
       END,
       locked_until = CASE
         WHEN (CASE
           WHEN existing.window_started_at <= NOW() - make_interval(mins => $3::int) THEN 1
           ELSE existing.attempts + 1
         END) >= $2 THEN NOW() + make_interval(mins => $3::int)
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING attempts, locked_until`,
    [ipHash, MAX_LOGIN_FAILURES, LOGIN_WINDOW_MINUTES]
  );
  return result.rows[0];
}

function respondLoginFailure(res, status, message, lockedUntil) {
  if (lockedUntil) {
    const seconds = Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000));
    res.set("Retry-After", String(seconds));
    return res.status(429).json({ error: "Слишком много попыток. Повторите через " + Math.ceil(seconds / 60) + " мин." });
  }
  return res.status(status).json({ error: message });
}

async function login(req, res) {
  const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
  const ipHash = hashToken("nexora-login:" + ip);
  const current = await pool.query(
    "SELECT locked_until FROM nexora_social_world.auth_login_attempts WHERE ip_hash=$1",
    [ipHash]
  );
  const lockedUntil = current.rows[0]?.locked_until;
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return respondLoginFailure(res, 429, "", lockedUntil);
  }

  const code = String(req.body?.recoveryCode || "").trim().toLowerCase();
  if (!/^[a-z0-9]{10}$/.test(code)) {
    const failure = await recordLoginFailure(ipHash);
    return respondLoginFailure(res, 400, "Введите корректный 10-символьный код восстановления.", failure.locked_until);
  }

  const result = await pool.query(
    "SELECT id,nickname,recovery_code_hash FROM nexora_social_world.accounts WHERE recovery_code_lookup_hash=$1",
    [hashToken(code)]
  );
  let account = result.rows[0] || null;
  if (!account) {
    const legacy = await pool.query(
      "SELECT id,nickname,recovery_code_hash FROM nexora_social_world.accounts WHERE recovery_code_lookup_hash IS NULL"
    );
    for (const candidate of legacy.rows) {
      if (await bcrypt.compare(code, candidate.recovery_code_hash)) {
        account = candidate;
        await pool.query(
          "UPDATE nexora_social_world.accounts SET recovery_code_lookup_hash=$1 WHERE id=$2 AND recovery_code_lookup_hash IS NULL",
          [hashToken(code), candidate.id]
        );
        break;
      }
    }
  }
  if (!account) {
    const failure = await recordLoginFailure(ipHash);
    return respondLoginFailure(res, 401, "Неверный код восстановления.", failure.locked_until);
  }

  await pool.query("DELETE FROM nexora_social_world.auth_login_attempts WHERE ip_hash=$1", [ipHash]);
  await pool.query("UPDATE nexora_social_world.accounts SET last_login_at=NOW() WHERE id=$1", [account.id]);
  const token = await issueSession(account.id);
  res.cookie("nexora_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400000 });
  res.json({ ok: true, account: { id: account.id, nickname: account.nickname } });
}
async function authenticateToken(token) {
  if (!token || typeof token !== "string" || token.length > 256) return null;
  const result = await pool.query(
    `SELECT a.id,a.nickname,c.avatar,c.planet,c.position_x
       FROM nexora_social_world.sessions s
       JOIN nexora_social_world.accounts a ON a.id=s.account_id
       LEFT JOIN nexora_social_world.characters c ON c.account_id=a.id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()
        AND NOT EXISTS (
          SELECT 1 FROM nexora_social_world.moderation_actions m
           WHERE m.target_account_id=a.id AND m.action_type='BAN'
             AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>NOW())
        )`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}
async function logout(token) {
  if (token) await pool.query("DELETE FROM nexora_social_world.sessions WHERE token_hash=$1", [hashToken(token)]);
}
module.exports = { register, login, authenticateToken, logout };
