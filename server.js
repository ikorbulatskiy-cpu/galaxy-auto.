require("dotenv").config();
const express=require("express"),path=require("path"),helmet=require("helmet"),cookieParser=require("cookie-parser"),crypto=require("crypto"),rateLimit=require("express-rate-limit");
const {pool}=require("./src/db");
const app=express(),PORT=Number(process.env.PORT||3000),publicDirectory=path.join(__dirname,"prototypes","nexora-social-mvp","public");
const COOKIE_NAME="nexora_session",SESSION_DAYS=30;
app.disable("x-powered-by");app.set("trust proxy",process.env.TRUST_PROXY_HOPS?Number(process.env.TRUST_PROXY_HOPS):1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"]}}}));
app.use(express.json({limit:"1500kb"}));app.use(cookieParser());app.use(express.static(publicDirectory));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false}),managementLimiter=rateLimit({windowMs:60*1000,limit:60,standardHeaders:true,legacyHeaders:false});
const clean=v=>String(v||"").trim(),DEVELOPER_NICKNAME=clean(process.env.NEXORA_DEVELOPER_NICKNAME||"Первый").toLocaleLowerCase("ru"),isDeveloperAccount=account=>Boolean(account&&clean(account.nickname).toLocaleLowerCase("ru")===DEVELOPER_NICKNAME),sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
function setSessionCookie(res,token){res.cookie(COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400000});}
let moderationSchemaPromise;
function ensureModerationSchema(){
 if(!moderationSchemaPromise)moderationSchemaPromise=pool.query("CREATE TABLE IF NOT EXISTS nexora_social_auth.account_roles (account_id UUID PRIMARY KEY REFERENCES nexora_social_auth.accounts(id) ON DELETE CASCADE, role VARCHAR(24) NOT NULL DEFAULT 'player' CHECK(role IN ('player','moderator','senior_moderator','developer')), permissions JSONB NOT NULL DEFAULT '{}'::jsonb, assigned_by UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE TABLE IF NOT EXISTS nexora_social_auth.moderation_actions (id BIGSERIAL PRIMARY KEY, actor_id UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, target_id UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, action VARCHAR(40) NOT NULL, reason VARCHAR(500) NOT NULL DEFAULT '', details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS moderation_actions_created_idx ON nexora_social_auth.moderation_actions(created_at DESC); CREATE TABLE IF NOT EXISTS nexora_social_auth.moderation_reports (id BIGSERIAL PRIMARY KEY, reporter_id UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, target_id UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, reason VARCHAR(80) NOT NULL, details VARCHAR(1000) NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK(status IN ('new','accepted','rejected','closed')), handled_by UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, handled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON nexora_social_auth.moderation_reports(status,created_at DESC); CREATE TABLE IF NOT EXISTS nexora_social_auth.moderation_restrictions (id BIGSERIAL PRIMARY KEY, account_id UUID NOT NULL REFERENCES nexora_social_auth.accounts(id) ON DELETE CASCADE, kind VARCHAR(20) NOT NULL CHECK(kind IN ('ban','mute')), reason VARCHAR(500) NOT NULL DEFAULT '', created_by UUID REFERENCES nexora_social_auth.accounts(id) ON DELETE SET NULL, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS moderation_restrictions_active_idx ON nexora_social_auth.moderation_restrictions(account_id,kind,expires_at)").then(async()=>{
  await pool.query("INSERT INTO nexora_social_auth.account_roles(account_id,role) SELECT id,'developer' FROM nexora_social_auth.accounts WHERE LOWER(nickname)=LOWER($1) ON CONFLICT(account_id) DO UPDATE SET role='developer'",[DEVELOPER_NICKNAME]);
 }).catch(error=>{moderationSchemaPromise=null;throw error;});
 return moderationSchemaPromise;
}
async function getAccount(req){
 const token=req.cookies&&req.cookies[COOKIE_NAME];if(!token)return null;
 await ensureModerationSchema();
 const r=await pool.query("SELECT a.id,a.nickname,a.created_at,COALESCE(ar.role,CASE WHEN LOWER(a.nickname)=LOWER($2) THEN 'developer' ELSE 'player' END) AS role,EXISTS(SELECT 1 FROM nexora_social_auth.moderation_restrictions mr WHERE mr.account_id=a.id AND mr.kind='mute' AND (mr.expires_at IS NULL OR mr.expires_at>NOW())) AS is_muted FROM nexora_social_auth.sessions s JOIN nexora_social_auth.accounts a ON a.id=s.account_id LEFT JOIN nexora_social_auth.account_roles ar ON ar.account_id=a.id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND NOT EXISTS(SELECT 1 FROM nexora_social_auth.moderation_restrictions mr WHERE mr.account_id=a.id AND mr.kind='ban' AND (mr.expires_at IS NULL OR mr.expires_at>NOW()))",[sha256(token),DEVELOPER_NICKNAME]);
 const account=r.rows[0]||null;
 return account?{...account,isDeveloper:account.role==='developer',isModerator:account.role==='moderator'||account.role==='senior_moderator',isSeniorModerator:account.role==='senior_moderator'}:null;
}
async function requireStaff(req,res,developerOnly=false){
 const account=await getAccount(req);
 if(!account){res.status(401).json({error:"Войдите в аккаунт."});return null;}
 if(developerOnly?!account.isDeveloper:!(account.isDeveloper||account.isModerator)){res.status(403).json({error:"Недостаточно прав для выполнения действия."});return null;}
 return account;
}
let avatarEquipmentSchemaPromise;
function ensureAvatarEquipmentSchema(){
 if(!avatarEquipmentSchemaPromise)avatarEquipmentSchemaPromise=pool.query("ALTER TABLE nexora_social_auth.characters ADD COLUMN IF NOT EXISTS outfit_id SMALLINT NOT NULL DEFAULT 0 CHECK (outfit_id BETWEEN 0 AND 1); INSERT INTO nexora_social_auth.authority_ranks(rank_order,rank_name,min_points,stars,aura) VALUES (14,'Император Галактики',50000,7,'purple') ON CONFLICT(rank_order) DO UPDATE SET rank_name=EXCLUDED.rank_name,min_points=EXCLUDED.min_points,stars=EXCLUDED.stars,aura=EXCLUDED.aura").catch(error=>{avatarEquipmentSchemaPromise=null;throw error;});
 return avatarEquipmentSchemaPromise;
}
function makeRecoveryCode(){const alphabet="0123456789abcdefghijklmnopqrstuvwxyz";let code="";while(code.length<11){for(const byte of crypto.randomBytes(16)){if(byte<252){code+=alphabet[byte%36];if(code.length===11)break;}}}return code;}
async function createSession(account,res){const token=crypto.randomBytes(32).toString("hex");await pool.query("INSERT INTO nexora_social_auth.sessions(account_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[account.id,sha256(token)]);setSessionCookie(res,token);}
let characterInfoSchemaPromise;
function ensureCharacterInfoSchema(){
 if(!characterInfoSchemaPromise)characterInfoSchemaPromise=pool.query("ALTER TABLE nexora_social_auth.characters ADD COLUMN IF NOT EXISTS profile_photo_data_url TEXT, ADD COLUMN IF NOT EXISTS profile_gender VARCHAR(24) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_birth_date DATE, ADD COLUMN IF NOT EXISTS profile_city VARCHAR(80) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_occupation VARCHAR(120) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_interests VARCHAR(220) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_about VARCHAR(600) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_status VARCHAR(100) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_relationship VARCHAR(80) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_privileges VARCHAR(100) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_looking_for VARCHAR(100) NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS profile_ask_me VARCHAR(300) NOT NULL DEFAULT ''").catch(error=>{characterInfoSchemaPromise=null;throw error;});
 return characterInfoSchemaPromise;
}
app.get("/api/status",async(_req,res)=>{try{await pool.query("SELECT 1");res.json({online:true,app:"NEXORA",database:"connected"});}catch{res.status(503).json({online:false,app:"NEXORA",database:"unavailable"});}});
app.post("/api/auth/register",authLimiter,async(req,res)=>{const nickname=clean(req.body.nickname);if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(nickname))return res.status(400).json({error:"Ник: 3–24 символа, буквы, цифры, _ или -."});const recoveryCode=makeRecoveryCode();try{const r=await pool.query("INSERT INTO nexora_social_auth.accounts(nickname,nickname_normalized,phone,gender,recovery_code_hash) VALUES($1::varchar(24),LOWER($1::text),NULL,'other',$2::text) RETURNING id,nickname,created_at",[nickname,sha256(recoveryCode)]);const account=r.rows[0];account.isDeveloper=isDeveloperAccount(account);await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[account.id]);await createSession(account,res);res.status(201).json({ok:true,account,recoveryCode});}catch(e){if(e.code==="23505")return res.status(409).json({error:"Такой ник уже занят."});console.error("Registration failed:",e.code||"UNKNOWN",e.message);res.status(500).json({error:"Не удалось создать аккаунт. Попробуйте позже."});}});
app.post("/api/auth/login",authLimiter,async(req,res)=>{try{const code=clean(req.body.recoveryCode).replace(/[\s-]/g,"").toLowerCase();let candidates=[];if(/^[a-z0-9]{11}$/.test(code))candidates.push(sha256(code));if(/^[a-f0-9]{10}$/.test(code)){const legacy=code.toUpperCase().match(/.{1,5}/g).join("-");candidates.push(sha256(legacy));}if(!candidates.length)return res.status(400).json({error:"Введите 11 символов кода восстановления."});const r=await pool.query("SELECT id,nickname,created_at FROM nexora_social_auth.accounts WHERE recovery_code_hash=ANY($1::text[]) LIMIT 1",[candidates]);const account=r.rows[0];if(!account)return res.status(401).json({error:"Неверный код восстановления."});await createSession(account,res);res.json({ok:true,account:{id:account.id,nickname:account.nickname,created_at:account.created_at,isDeveloper:isDeveloperAccount(account)}});}catch(e){console.error("Login failed:",e.code||"UNKNOWN");res.status(503).json({error:"Сервис авторизации временно недоступен."});}});
app.get("/api/auth/me",async(req,res)=>{try{const a=await getAccount(req);res.json({authenticated:Boolean(a),account:a});}catch{res.status(503).json({error:"Не удалось проверить сессию."});}});
app.post("/api/auth/logout",async(req,res)=>{const token=req.cookies&&req.cookies[COOKIE_NAME];if(token)await pool.query("DELETE FROM nexora_social_auth.sessions WHERE token_hash=$1",[sha256(token)]).catch(()=>{});res.clearCookie(COOKIE_NAME,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true});});
app.get("/api/account/profile",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Войдите в аккаунт."});await ensureAvatarEquipmentSchema();await ensureCharacterInfoSchema();await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[a.id]);const c=await pool.query("SELECT ch.head_id,ch.body_id,ch.outfit_id,ch.authority_points,ch.created_at,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.stars,0)::int AS authority_stars,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.min_points,0)::int AS rank_min_points,ch.profile_photo_data_url,ch.profile_gender,ch.profile_birth_date,ch.profile_city,ch.profile_occupation,ch.profile_interests,ch.profile_about,ch.profile_status,ch.profile_relationship,ch.profile_privileges,ch.profile_looking_for,ch.profile_ask_me FROM nexora_social_auth.characters ch LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=ch.authority_points ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE ch.account_id=$1",[a.id]);const row=c.rows[0]||{};res.json({account:{id:String(a.id),nickname:a.nickname,role:a.role,isDeveloper:Boolean(a.isDeveloper),isModerator:Boolean(a.isModerator)},character:row,profile:{isDeveloper:Boolean(a.isDeveloper),photoDataUrl:row.profile_photo_data_url||'',gender:row.profile_gender||'',birthDate:row.profile_birth_date?new Date(row.profile_birth_date).toISOString().slice(0,10):'',city:row.profile_city||'',occupation:row.profile_occupation||'',interests:row.profile_interests||'',about:row.profile_about||'',status:row.profile_status||'',relationship:row.profile_relationship||'',privileges:a.isDeveloper?'Разработчик':(row.profile_privileges||'').replace(/разработчик/ig,'').trim(),lookingFor:row.profile_looking_for||'',askMe:row.profile_ask_me||''}});}catch(e){console.error("Profile read failed:",e.code||"UNKNOWN",e.message);res.status(503).json({error:"Не удалось загрузить профиль."});}});
app.post("/api/account/profile",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Войдите в аккаунт."});await ensureCharacterInfoSchema();const b=req.body||{},photo=b.photoDataUrl===undefined?null:String(b.photoDataUrl);if(photo!==null&&(!photo.startsWith("data:image/jpeg;base64,")||photo.length>1100000))return res.status(400).json({error:"Фото должно быть JPG и не больше примерно 800 КБ."});const gender=String(b.gender||'').slice(0,24),birth=String(b.birthDate||'').trim(),city=String(b.city||'').trim().slice(0,80),occupation=String(b.occupation||'').trim().slice(0,120),interests=String(b.interests||'').trim().slice(0,220),about=String(b.about||'').trim().slice(0,600),status=String(b.status||'').trim().slice(0,100),relationship=String(b.relationship||'').trim().slice(0,80),privileges=String(b.privileges||'').replace(/разработчик/ig,'').trim().slice(0,100),lookingFor=String(b.lookingFor||'').trim().slice(0,100),askMe=String(b.askMe||'').trim().slice(0,300);if(birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth))return res.status(400).json({error:"Проверь дату рождения."});await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[a.id]);await pool.query("UPDATE nexora_social_auth.characters SET profile_photo_data_url=COALESCE($1,profile_photo_data_url),profile_gender=$2,profile_birth_date=$3::date,profile_city=$4,profile_occupation=$5,profile_interests=$6,profile_about=$7,profile_status=$8,profile_relationship=$9,profile_privileges=$10,profile_looking_for=$11,profile_ask_me=$12 WHERE account_id=$13",[photo,gender,birth||null,city,occupation,interests,about,status,relationship,privileges,lookingFor,askMe,a.id]);res.json({ok:true});}catch(e){console.error("Profile save failed:",e.code||"UNKNOWN",e.message);res.status(503).json({error:"Не удалось сохранить анкету."});}});
app.post("/api/account/recovery-code",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Войдите в аккаунт."});const code=makeRecoveryCode();await pool.query("UPDATE nexora_social_auth.accounts SET recovery_code_hash=$1 WHERE id=$2",[sha256(code),a.id]);res.json({recoveryCode:code});}catch{res.status(503).json({error:"Не удалось создать код восстановления."});}});
app.post("/api/character",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Сначала войдите в аккаунт."});await ensureAvatarEquipmentSchema();const headId=Number(req.body.headId),bodyId=Number(req.body.bodyId),outfitId=Number(req.body.outfitId||0);if(!Number.isInteger(headId)||headId<1||headId>24||!Number.isInteger(bodyId)||bodyId<1||bodyId>24||!Number.isInteger(outfitId)||outfitId<0||outfitId>1)return res.status(400).json({error:"Выберите голову, тело и допустимый костюм."});const r=await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id,outfit_id) VALUES($1,$2,$3,$4) ON CONFLICT(account_id) DO UPDATE SET head_id=EXCLUDED.head_id,body_id=EXCLUDED.body_id,outfit_id=EXCLUDED.outfit_id RETURNING id,head_id,body_id,outfit_id,created_at",[a.id,headId,bodyId,outfitId]);res.status(201).json({ok:true,character:r.rows[0]});}catch(e){console.error("Character save failed:",e.code||"UNKNOWN");res.status(500).json({error:"Не удалось сохранить персонажа."});}});
let walletSchemaPromise;
function ensureWalletSchema(){
 if(!walletSchemaPromise)walletSchemaPromise=pool.query("CREATE TABLE IF NOT EXISTS nexora_social_auth.account_wallets (account_id UUID PRIMARY KEY REFERENCES nexora_social_auth.accounts(id) ON DELETE CASCADE, diamonds BIGINT NOT NULL DEFAULT 0 CHECK (diamonds >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())").catch(error=>{walletSchemaPromise=null;throw error;});
 return walletSchemaPromise;
}
app.get("/api/account/wallet",async(req,res)=>{
 try{
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
  await ensureWalletSchema();
  const result=await pool.query("INSERT INTO nexora_social_auth.account_wallets(account_id) VALUES($1) ON CONFLICT(account_id) DO UPDATE SET account_id=EXCLUDED.account_id RETURNING diamonds",[account.id]);
  res.json({diamonds:Number(result.rows[0].diamonds)||0});
 }catch(error){console.error("Wallet read failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Баланс временно недоступен."});}
});
app.get("/api/account/online",async(_req,res)=>{try{const r=await pool.query("SELECT COUNT(DISTINCT account_id)::int AS total FROM nexora_social_auth.sessions WHERE expires_at>NOW()");res.json({online:r.rows[0].total});}catch{res.json({online:0});}});

let roomChatSchemaPromise;
function ensureRoomChatSchema(){
 if(!roomChatSchemaPromise)roomChatSchemaPromise=pool.query("CREATE SCHEMA IF NOT EXISTS nexora_social_auth; CREATE TABLE IF NOT EXISTS nexora_social_auth.room_messages (id BIGSERIAL PRIMARY KEY, account_id TEXT NOT NULL, nickname VARCHAR(24) NOT NULL, message VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE INDEX IF NOT EXISTS room_messages_created_id_idx ON nexora_social_auth.room_messages(id)").catch(error=>{roomChatSchemaPromise=null;throw error;});
 return roomChatSchemaPromise;
}
app.get("/api/room/messages",async(req,res)=>{
 try{
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
  await ensureRoomChatSchema();
  const after=Math.max(0,Number.parseInt(req.query.after||"0",10)||0);
  const query=after>0
   ? await pool.query("SELECT id,nickname,message,created_at,account_id FROM nexora_social_auth.room_messages WHERE id>$1 ORDER BY id ASC LIMIT 80",[after])
   : await pool.query("SELECT id,nickname,message,created_at,account_id FROM (SELECT id,nickname,message,created_at,account_id FROM nexora_social_auth.room_messages ORDER BY id DESC LIMIT 60) recent ORDER BY id ASC");
  res.json({messages:query.rows.map(row=>({id:row.id,nickname:row.nickname,message:row.message,createdAt:row.created_at,mine:String(row.account_id)===String(account.id)}))});
 }catch(error){console.error("Room chat read failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Чат временно недоступен."});}
});
app.post("/api/room/messages",async(req,res)=>{
 try{
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});if(account.is_muted)return res.status(403).json({error:"Возможность писать сообщения временно ограничена."});
  const message=clean(req.body.message);if(!message||message.length>500)return res.status(400).json({error:"Сообщение должно содержать от 1 до 500 символов."});
  await ensureRoomChatSchema();
  const saved=await pool.query("INSERT INTO nexora_social_auth.room_messages(account_id,nickname,message) VALUES($1,$2,$3) RETURNING id,nickname,message,created_at,account_id",[String(account.id),account.nickname,message]);
  const row=saved.rows[0];
  await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[account.id]);
  if(message.length>=12){
   const awarded=await pool.query("INSERT INTO nexora_social_auth.authority_events(account_id,source,source_ref,points) SELECT $1,'room_message',$2,1 WHERE (SELECT COUNT(*) FROM nexora_social_auth.authority_events WHERE account_id=$1 AND source='room_message' AND created_at>=date_trunc('day',NOW()))<10 ON CONFLICT(account_id,source,source_ref) DO NOTHING RETURNING points",[account.id,String(row.id)]);
   if(awarded.rowCount)await pool.query("UPDATE nexora_social_auth.characters SET authority_points=authority_points+1 WHERE account_id=$1",[account.id]);
  }
  res.status(201).json({ok:true,message:{id:row.id,nickname:row.nickname,message:row.message,createdAt:row.created_at,mine:true}});
 }catch(error){console.error("Room chat send failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось отправить сообщение."});}
});
let roomPresenceSchemaPromise;
function ensureRoomPresenceSchema(){
 if(!roomPresenceSchemaPromise)roomPresenceSchemaPromise=pool.query("CREATE TABLE IF NOT EXISTS nexora_social_auth.room_presence (account_id TEXT PRIMARY KEY, nickname VARCHAR(24) NOT NULL, last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), x_percent REAL NOT NULL DEFAULT 50, bottom_percent REAL NOT NULL DEFAULT 12, facing SMALLINT NOT NULL DEFAULT 1); ALTER TABLE nexora_social_auth.room_presence ADD COLUMN IF NOT EXISTS x_percent REAL NOT NULL DEFAULT 50, ADD COLUMN IF NOT EXISTS bottom_percent REAL NOT NULL DEFAULT 12, ADD COLUMN IF NOT EXISTS facing SMALLINT NOT NULL DEFAULT 1").catch(error=>{roomPresenceSchemaPromise=null;throw error;});
 return roomPresenceSchemaPromise;
}
app.post("/api/room/presence",async(req,res)=>{
 try{
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
  await ensureRoomPresenceSchema();
  const x=Math.max(7,Math.min(93,Number.isFinite(Number(req.body?.xPercent))?Number(req.body.xPercent):50)),bottom=Math.max(8,Math.min(54,Number.isFinite(Number(req.body?.bottomPercent))?Number(req.body.bottomPercent):12)),facing=Number(req.body?.facing)===-1?-1:1;
  await pool.query("INSERT INTO nexora_social_auth.room_presence(account_id,nickname,last_seen,x_percent,bottom_percent,facing) VALUES($1,$2,NOW(),$3,$4,$5) ON CONFLICT(account_id) DO UPDATE SET nickname=EXCLUDED.nickname,last_seen=NOW(),x_percent=EXCLUDED.x_percent,bottom_percent=EXCLUDED.bottom_percent,facing=EXCLUDED.facing",[String(account.id),account.nickname,x,bottom,facing]);
  await ensureAvatarEquipmentSchema();
  const online=await pool.query("SELECT p.account_id,p.nickname,p.x_percent,p.bottom_percent,p.facing,c.head_id,c.body_id,c.outfit_id,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.stars,0)::int AS authority_stars FROM nexora_social_auth.room_presence p LEFT JOIN nexora_social_auth.characters c ON c.account_id::text=p.account_id::text LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=COALESCE(c.authority_points,0) ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE p.last_seen>NOW()-INTERVAL '45 seconds' ORDER BY p.account_id ASC LIMIT 24");
  res.json({players:online.rows.map(row=>({id:String(row.account_id),nickname:row.nickname,xPercent:Number(row.x_percent)||50,bottomPercent:Number(row.bottom_percent)||12,facing:Number(row.facing)===-1?-1:1,headId:Number(row.head_id)||1,bodyId:Number(row.body_id)||1,outfitId:Number(row.outfit_id)||0,authorityTitle:row.authority_title,aura:row.aura,authorityStars:Number(row.authority_stars)||0,mine:String(row.account_id)===String(account.id)}))});
 }catch(error){console.error("Room presence failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось загрузить игроков."});}
});
app.get("/api/room/player/:id",async(req,res)=>{
 try{
  const viewer=await getAccount(req);if(!viewer)return res.status(401).json({error:"Войдите в аккаунт."});
  const id=String(req.params.id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:"Некорректный игрок."});
  await ensureAvatarEquipmentSchema();await ensureCharacterInfoSchema();
  const result=await pool.query("SELECT a.id,a.nickname,c.head_id,c.body_id,c.outfit_id,c.profile_photo_data_url,c.profile_gender,c.profile_birth_date,c.profile_city,c.profile_occupation,c.profile_interests,c.profile_about,c.profile_status,c.profile_relationship,c.profile_privileges,c.profile_looking_for,c.profile_ask_me,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.stars,0)::int AS authority_stars FROM nexora_social_auth.accounts a JOIN nexora_social_auth.room_presence rp ON rp.account_id::text=a.id::text AND rp.last_seen>NOW()-INTERVAL '45 seconds' LEFT JOIN nexora_social_auth.characters c ON c.account_id=a.id LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=COALESCE(c.authority_points,0) ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE a.id=$1",[id]);
  if(!result.rows.length)return res.status(404).json({error:"Игрок не найден."});
  const p=result.rows[0];
  const developer=isDeveloperAccount({nickname:p.nickname});
  res.json({player:{id:String(p.id),nickname:p.nickname,headId:Number(p.head_id)||1,bodyId:Number(p.body_id)||1,outfitId:Number(p.outfit_id)||0,authorityTitle:p.authority_title,aura:p.aura,authorityStars:Number(p.authority_stars)||0,isDeveloper:developer},profile:{isDeveloper:developer,photoDataUrl:p.profile_photo_data_url||"",gender:p.profile_gender||"",birthDate:p.profile_birth_date?new Date(p.profile_birth_date).toISOString().slice(0,10):"",city:p.profile_city||"",occupation:p.profile_occupation||"",interests:p.profile_interests||"",about:p.profile_about||"",status:p.profile_status||"",relationship:p.profile_relationship||"",privileges:developer?"Разработчик":String(p.profile_privileges||"").replace(/разработчик/ig,"").trim(),lookingFor:p.profile_looking_for||"",askMe:p.profile_ask_me||""}});
 }catch(error){console.error("Room player profile failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось загрузить анкету игрока."});}
});

app.get("/api/management/overview",async(req,res)=>{
 try{
  const actor=await requireStaff(req,res);if(!actor)return;
  await ensureWalletSchema();
  const [players,reports,actions]=await Promise.all([
   pool.query("SELECT a.id,a.nickname,a.created_at,COALESCE(ar.role,CASE WHEN LOWER(a.nickname)=LOWER($1) THEN 'developer' ELSE 'player' END) AS role,COALESCE(w.diamonds,0)::bigint AS diamonds,COALESCE(rp.last_seen>NOW()-INTERVAL '45 seconds',FALSE) AS online,COALESCE(rp.last_seen,a.created_at) AS last_seen,COALESCE(ch.authority_points,0)::int AS experience,COALESCE(ranks.rank_name,'Новичок') AS authority_title FROM nexora_social_auth.accounts a LEFT JOIN nexora_social_auth.account_roles ar ON ar.account_id=a.id LEFT JOIN nexora_social_auth.account_wallets w ON w.account_id=a.id LEFT JOIN nexora_social_auth.room_presence rp ON rp.account_id::text=a.id::text LEFT JOIN nexora_social_auth.characters ch ON ch.account_id=a.id LEFT JOIN LATERAL (SELECT rank_name FROM nexora_social_auth.authority_ranks WHERE min_points<=COALESCE(ch.authority_points,0) ORDER BY min_points DESC LIMIT 1) ranks ON TRUE ORDER BY online DESC,a.created_at DESC LIMIT 200",[DEVELOPER_NICKNAME]),
   pool.query("SELECT r.id,r.reason,r.details,r.status,r.created_at,reporter.nickname AS reporter_nickname,target.nickname AS target_nickname FROM nexora_social_auth.moderation_reports r LEFT JOIN nexora_social_auth.accounts reporter ON reporter.id=r.reporter_id LEFT JOIN nexora_social_auth.accounts target ON target.id=r.target_id WHERE r.status='new' ORDER BY r.created_at DESC LIMIT 100"),
   pool.query("SELECT m.id,m.action,m.reason,m.details,m.created_at,actor.nickname AS actor_nickname,target.nickname AS target_nickname FROM nexora_social_auth.moderation_actions m LEFT JOIN nexora_social_auth.accounts actor ON actor.id=m.actor_id LEFT JOIN nexora_social_auth.accounts target ON target.id=m.target_id ORDER BY m.created_at DESC LIMIT 100")
  ]);
  res.json({role:actor.role,players:players.rows.map(p=>({...p,id:String(p.id),diamonds:Number(p.diamonds)||0,online:Boolean(p.online)})),reports:reports.rows,actions:actions.rows});
 }catch(error){console.error("Management overview failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось загрузить управление сервером."});}
});
app.post("/api/management/role",managementLimiter,async(req,res)=>{
 try{
  const actor=await requireStaff(req,res,true);if(!actor)return;
  const targetId=String(req.body?.accountId||""),role=String(req.body?.role||"");
  if(!/^[0-9a-f-]{36}$/i.test(targetId)||!["player","moderator","senior_moderator"].includes(role))return res.status(400).json({error:"Проверьте игрока и выбранную роль."});
  if(targetId===String(actor.id))return res.status(400).json({error:"Нельзя менять собственную роль."});
  const target=await pool.query("SELECT id,nickname FROM nexora_social_auth.accounts WHERE id=$1",[targetId]);
  if(!target.rowCount)return res.status(404).json({error:"Игрок не найден."});
  await pool.query("INSERT INTO nexora_social_auth.account_roles(account_id,role,assigned_by) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET role=EXCLUDED.role,assigned_by=EXCLUDED.assigned_by,created_at=NOW()",[targetId,role,actor.id]);
  await pool.query("INSERT INTO nexora_social_auth.moderation_actions(actor_id,target_id,action,reason,details) VALUES($1,$2,'role_change','Изменение полномочий',$3::jsonb)",[actor.id,targetId,JSON.stringify({role})]);
  res.json({ok:true,message:"Полномочия успешно изменены."});
 }catch(error){console.error("Management role failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось изменить полномочия."});}
});
app.post("/api/management/action",managementLimiter,async(req,res)=>{
 try{
  const actor=await requireStaff(req,res);if(!actor)return;
  const targetId=String(req.body?.accountId||""),action=String(req.body?.action||""),reason=clean(req.body?.reason).slice(0,500);
  if(!/^[0-9a-f-]{36}$/i.test(targetId)||!["warning","mute","ban","kick","unban"].includes(action)||!reason)return res.status(400).json({error:"Укажите игрока, действие и причину."});
  if(targetId===String(actor.id))return res.status(400).json({error:"Нельзя применить это действие к себе."});
  if((action==="ban"||action==="unban")&&!actor.isDeveloper&&!actor.isSeniorModerator)return res.status(403).json({error:"Для блокировки нужны расширенные полномочия."});
  const target=await pool.query("SELECT a.id,COALESCE(ar.role,CASE WHEN LOWER(a.nickname)=LOWER($2) THEN 'developer' ELSE 'player' END) AS role FROM nexora_social_auth.accounts a LEFT JOIN nexora_social_auth.account_roles ar ON ar.account_id=a.id WHERE a.id=$1",[targetId,DEVELOPER_NICKNAME]);if(!target.rowCount)return res.status(404).json({error:"Игрок не найден."});if(!actor.isDeveloper&&(target.rows[0].role==="developer"||(["moderator","senior_moderator"].includes(target.rows[0].role)&&actor.role==="moderator")))return res.status(403).json({error:"У вас нет полномочий применять действия к этому сотруднику."});
  const minutes=Math.max(1,Math.min(actor.isDeveloper?525600:1440,Number(req.body?.minutes)||60));
  if(action==="mute"||action==="ban")await pool.query("INSERT INTO nexora_social_auth.moderation_restrictions(account_id,kind,reason,created_by,expires_at) VALUES($1,$2,$3,$4,NOW()+($5::text||' minutes')::interval)",[targetId,action==="ban"?"ban":"mute",reason,actor.id,minutes]);
  if(action==="unban")await pool.query("DELETE FROM nexora_social_auth.moderation_restrictions WHERE account_id=$1 AND kind='ban'",[targetId]);
  if(action==="kick"){await pool.query("DELETE FROM nexora_social_auth.room_presence WHERE account_id=$1",[targetId]);await pool.query("DELETE FROM nexora_social_auth.sessions WHERE account_id=$1",[targetId]);}
  await pool.query("INSERT INTO nexora_social_auth.moderation_actions(actor_id,target_id,action,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)",[actor.id,targetId,action,reason,JSON.stringify({minutes:action==="mute"||action==="ban"?minutes:null})]);
  res.json({ok:true,message:({warning:"Игрок получил предупреждение.",mute:"Чат временно ограничен.",ban:"Игрок временно заблокирован.",kick:"Игрок отключён от сервера.",unban:"Блокировка снята."})[action]});
 }catch(error){console.error("Management action failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось выполнить действие."});}
});
app.post("/api/management/nickname",managementLimiter,async(req,res)=>{
 try{
  const actor=await requireStaff(req,res,true);if(!actor)return;
  const targetId=String(req.body?.accountId||""),nickname=clean(req.body?.nickname);
  if(!/^[0-9a-f-]{36}$/i.test(targetId)||!/^[\p{L}\p{N}_-]{3,24}$/u.test(nickname))return res.status(400).json({error:"Ник должен содержать 3–24 буквы, цифры, _ или -."});
  const updated=await pool.query("UPDATE nexora_social_auth.accounts SET nickname=$1,nickname_normalized=LOWER($1) WHERE id=$2 RETURNING id",[nickname,targetId]);
  if(!updated.rowCount)return res.status(404).json({error:"Игрок не найден."});
  await pool.query("UPDATE nexora_social_auth.room_presence SET nickname=$1 WHERE account_id=$2",[nickname,targetId]);
  await pool.query("INSERT INTO nexora_social_auth.moderation_actions(actor_id,target_id,action,reason,details) VALUES($1,$2,'nickname_change','Изменение имени',$3::jsonb)",[actor.id,targetId,JSON.stringify({nickname})]);
  res.json({ok:true,message:"Имя игрока изменено."});
 }catch(error){if(error.code==="23505")return res.status(409).json({error:"Такой ник уже занят."});console.error("Management nickname failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось изменить имя игрока."});}
});
app.post("/api/management/economy",managementLimiter,async(req,res)=>{
 let client;
 try{
  const actor=await requireStaff(req,res,true);if(!actor)return;
  const targetId=String(req.body?.accountId||""),amount=Number(req.body?.amount),reason=clean(req.body?.reason).slice(0,500);
  if(!/^[0-9a-f-]{36}$/i.test(targetId)||!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>1000000000||!reason)return res.status(400).json({error:"Укажите игрока, целую сумму и причину."});
  await ensureWalletSchema();client=await pool.connect();await client.query("BEGIN");
  const updated=await client.query("INSERT INTO nexora_social_auth.account_wallets(account_id,diamonds) VALUES($1,GREATEST(0,$2)) ON CONFLICT(account_id) DO UPDATE SET diamonds=GREATEST(0,nexora_social_auth.account_wallets.diamonds+$2),updated_at=NOW() WHERE nexora_social_auth.account_wallets.diamonds+$2>=0 RETURNING diamonds",[targetId,amount]);
  if(!updated.rowCount){await client.query("ROLLBACK");return res.status(400).json({error:"Недостаточно средств для списания."});}
  await client.query("INSERT INTO nexora_social_auth.moderation_actions(actor_id,target_id,action,reason,details) VALUES($1,$2,'economy_change',$3,$4::jsonb)",[actor.id,targetId,reason,JSON.stringify({amount,balance:Number(updated.rows[0].diamonds)})]);
  await client.query("COMMIT");res.json({ok:true,balance:Number(updated.rows[0].diamonds),message:"Баланс успешно изменён."});
 }catch(error){if(client)await client.query("ROLLBACK").catch(()=>{});console.error("Management economy failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось изменить баланс."});}
 finally{client?.release();}
});
app.post("/api/management/reports",managementLimiter,async(req,res)=>{
 try{
  const actor=await getAccount(req);if(!actor)return res.status(401).json({error:"Войдите в аккаунт."});
  const targetId=String(req.body?.accountId||""),reason=clean(req.body?.reason).slice(0,80),details=clean(req.body?.details).slice(0,1000);
  if(!/^[0-9a-f-]{36}$/i.test(targetId)||targetId===String(actor.id)||!reason||!details)return res.status(400).json({error:"Укажите игрока, причину и описание жалобы."});
  const saved=await pool.query("INSERT INTO nexora_social_auth.moderation_reports(reporter_id,target_id,reason,details) VALUES($1,$2,$3,$4) RETURNING id",[actor.id,targetId,reason,details]);
  res.status(201).json({ok:true,id:saved.rows[0].id,message:"Жалоба отправлена модераторам."});
 }catch(error){console.error("Management report failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось отправить жалобу."});}
});
app.post("/api/management/reports/:id",managementLimiter,async(req,res)=>{
 try{
  const actor=await requireStaff(req,res);if(!actor)return;
  const id=Number(req.params.id),status=String(req.body?.status||"");
  if(!Number.isSafeInteger(id)||id<1||!["accepted","rejected","closed"].includes(status))return res.status(400).json({error:"Некорректное решение по жалобе."});
  const result=await pool.query("UPDATE nexora_social_auth.moderation_reports SET status=$1,handled_by=$2,handled_at=NOW() WHERE id=$3 AND status='new' RETURNING id",[status,actor.id,id]);
  if(!result.rowCount)return res.status(404).json({error:"Жалоба уже обработана или не найдена."});
  await pool.query("INSERT INTO nexora_social_auth.moderation_actions(actor_id,action,reason,details) VALUES($1,'report_review','Рассмотрение жалобы',$2::jsonb)",[actor.id,JSON.stringify({reportId:id,status})]);
  res.json({ok:true,message:"Решение по жалобе сохранено."});
 }catch(error){console.error("Management report review failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось сохранить решение."});}
});

app.get("/galaxy",(_req,res)=>res.redirect(308,"/"));app.get("*",(_req,res)=>res.sendFile(path.join(publicDirectory,"index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log("NEXORA server is running on port "+PORT));
