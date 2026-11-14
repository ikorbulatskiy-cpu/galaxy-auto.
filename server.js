require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { pool } = require("./src/db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, "prototypes", "nexora-social-mvp", "public");
const COOKIE_NAME = "nexora_session";
const SESSION_DAYS = 30;
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], baseUri: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"],
  scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "data:", "https:"], connectSrc: ["'self'"]
} } }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(express.static(publicDirectory));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const clean = value => String(value || "").trim();
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400000 });
}
async function getAccount(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  const result = await pool.query(
    `SELECT a.id,a.nickname,a.created_at FROM nexora_social_auth.sessions s
     JOIN nexora_social_auth.accounts a ON a.id=s.account_id
     WHERE s.token_hash=$1 AND s.expires_at>NOW()`,
    [sha256(token)]
  );
  return result.rows[0] || null;
}
function makeRecoveryCode() {
  return crypto.randomBytes(5).toString("hex").toUpperCase().match(/.{1,5}/g).join("-");
}
app.get("/api/status", async (_req,res) => {
  try { await pool.query("SELECT 1"); res.json({online:true,app:"NEXORA",database:"connected"}); }
  catch { res.status(503).json({online:false,app:"NEXORA",database:"unavailable"}); }
});
app.post("/api/auth/register",authLimiter,async(req,res)=>{
  const nickname=clean(req.body.nickname),password=String(req.body.password||"");
  if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(nickname)) return res.status(400).json({error:"Ник: 3–24 символа, буквы, цифры, _ или -."});
  if(password.length<8||password.length>72) return res.status(400).json({error:"Пароль должен содержать от 8 до 72 символов."});
  const recoveryCode=makeRecoveryCode();
  try{
    const passwordHash=await bcrypt.hash(password,12);
    const inserted=await pool.query(
      "INSERT INTO nexora_social_auth.accounts(nickname,nickname_normalized,phone,gender,password_hash,recovery_code_hash) VALUES($1,LOWER($1),NULL,'other',$2,$3) RETURNING id,nickname,created_at",
      [nickname,passwordHash,sha256(recoveryCode)]
    );
    const account=inserted.rows[0],token=crypto.randomBytes(32).toString("hex");
    await pool.query("INSERT INTO nexora_social_auth.sessions(account_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[account.id,sha256(token)]);
    setSessionCookie(res,token);
    res.status(201).json({ok:true,account,recoveryCode});
  }catch(error){
    if(error.code==="23505")return res.status(409).json({error:"Такой ник уже занят."});
    console.error("Registration failed:",error.code||"UNKNOWN",error.message);
    res.status(500).json({error:"Не удалось создать аккаунт. Попробуйте позже."});
  }
});
app.post("/api/auth/login",authLimiter,async(req,res)=>{
  try{
    const result=await pool.query("SELECT id,nickname,password_hash,created_at FROM nexora_social_auth.accounts WHERE nickname_normalized=LOWER($1)",[clean(req.body.nickname)]);
    const account=result.rows[0];
    if(!account||!(await bcrypt.compare(String(req.body.password||""),account.password_hash)))return res.status(401).json({error:"Неверный ник или пароль."});
    const token=crypto.randomBytes(32).toString("hex");
    await pool.query("INSERT INTO nexora_social_auth.sessions(account_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[account.id,sha256(token)]);
    setSessionCookie(res,token);delete account.password_hash;res.json({ok:true,account});
  }catch(error){console.error("Login failed:",error.code||"UNKNOWN");res.status(503).json({error:"Сервис авторизации временно недоступен."});}
});
app.get("/api/auth/me",async(req,res)=>{try{const account=await getAccount(req);res.json({authenticated:Boolean(account),account});}catch{res.status(503).json({error:"Не удалось проверить сессию."});}});
app.post("/api/auth/logout",async(req,res)=>{
  const token=req.cookies&&req.cookies[COOKIE_NAME];
  if(token)await pool.query("DELETE FROM nexora_social_auth.sessions WHERE token_hash=$1",[sha256(token)]).catch(()=>{});
  res.clearCookie(COOKIE_NAME,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});
  res.json({ok:true});
});
app.get("/api/account/profile",async(req,res)=>{
  try{
    const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
    const character=await pool.query("SELECT head_id,body_id,created_at FROM nexora_social_auth.characters WHERE account_id=$1",[account.id]);
    res.json({account:{nickname:account.nickname},character:character.rows[0]||null});
  }catch{res.status(503).json({error:"Не удалось загрузить профиль."});}
});
app.post("/api/account/recovery-code",async(req,res)=>{
  try{
    const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
    const recoveryCode=makeRecoveryCode();
    await pool.query("UPDATE nexora_social_auth.accounts SET recovery_code_hash=$1 WHERE id=$2",[sha256(recoveryCode),account.id]);
    res.json({recoveryCode});
  }catch{res.status(503).json({error:"Не удалось создать код восстановления."});}
});
app.post("/api/character",async(req,res)=>{
  try{
    const account=await getAccount(req);if(!account)return res.status(401).json({error:"Сначала войдите в аккаунт."});
    const headId=Number(req.body.headId),bodyId=Number(req.body.bodyId);
    if(!Number.isInteger(headId)||headId<1||headId>12||!Number.isInteger(bodyId)||bodyId<1||bodyId>12)
      return res.status(400).json({error:"Выберите голову и тело персонажа."});
    const result=await pool.query(
      "INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET head_id=EXCLUDED.head_id,body_id=EXCLUDED.body_id RETURNING id,head_id,body_id,created_at",
      [account.id,headId,bodyId]
    );
    res.status(201).json({ok:true,character:result.rows[0]});
  }catch(error){console.error("Character save failed:",error.code||"UNKNOWN");res.status(500).json({error:"Не удалось сохранить персонажа."});}
});
app.get("/api/account/online",async(_req,res)=>{
  try{const result=await pool.query("SELECT COUNT(DISTINCT account_id)::int AS total FROM nexora_social_auth.sessions WHERE expires_at>NOW()");res.json({online:result.rows[0].total});}
  catch{res.json({online:0});}
});
app.get("/galaxy",(_req,res)=>res.redirect(308,"/"));
app.get("*",(_req,res)=>res.sendFile(path.join(publicDirectory,"index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`NEXORA server is running on port ${PORT}`));
