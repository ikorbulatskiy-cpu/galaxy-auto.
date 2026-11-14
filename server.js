require("dotenv").config();
const express=require("express"),path=require("path"),helmet=require("helmet"),cookieParser=require("cookie-parser"),crypto=require("crypto"),rateLimit=require("express-rate-limit");
const {pool}=require("./src/db");
const app=express(),PORT=Number(process.env.PORT||3000),publicDirectory=path.join(__dirname,"prototypes","nexora-social-mvp","public");
const COOKIE_NAME="nexora_session",SESSION_DAYS=30;
app.disable("x-powered-by");app.set("trust proxy",process.env.TRUST_PROXY_HOPS?Number(process.env.TRUST_PROXY_HOPS):1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],objectSrc:["'none'"],frameAncestors:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:","https:"],connectSrc:["'self'"]}}}));
app.use(express.json({limit:"1500kb"}));app.use(cookieParser());app.use(express.static(publicDirectory));
const authLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:true,legacyHeaders:false});
const clean=v=>String(v||"").trim(),DEVELOPER_NICKNAME=clean(process.env.NEXORA_DEVELOPER_NICKNAME||"Первый").toLocaleLowerCase("ru"),isDeveloperAccount=account=>Boolean(account&&clean(account.nickname).toLocaleLowerCase("ru")===DEVELOPER_NICKNAME),sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
function setSessionCookie(res,token){res.cookie(COOKIE_NAME,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400000});}
async function getAccount(req){const token=req.cookies&&req.cookies[COOKIE_NAME];if(!token)return null;const r=await pool.query("SELECT a.id,a.nickname,a.created_at FROM nexora_social_auth.sessions s JOIN nexora_social_auth.accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",[sha256(token)]);const account=r.rows[0]||null;return account?{...account,isDeveloper:isDeveloperAccount(account)}:null;}
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
app.get("/api/account/profile",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Войдите в аккаунт."});await ensureAvatarEquipmentSchema();await ensureCharacterInfoSchema();await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[a.id]);const c=await pool.query("SELECT ch.head_id,ch.body_id,ch.outfit_id,ch.authority_points,ch.created_at,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.stars,0)::int AS authority_stars,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.min_points,0)::int AS rank_min_points,LEAD(ar.min_points) OVER (ORDER BY ar.rank_order) AS next_rank_points,ch.profile_photo_data_url,ch.profile_gender,ch.profile_birth_date,ch.profile_city,ch.profile_occupation,ch.profile_interests,ch.profile_about,ch.profile_status,ch.profile_relationship,ch.profile_privileges,ch.profile_looking_for,ch.profile_ask_me FROM nexora_social_auth.characters ch LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=ch.authority_points ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE ch.account_id=$1",[a.id]);const row=c.rows[0]||{};res.json({account:{nickname:a.nickname,isDeveloper:Boolean(a.isDeveloper)},character:row,profile:{isDeveloper:Boolean(a.isDeveloper),photoDataUrl:row.profile_photo_data_url||'',gender:row.profile_gender||'',birthDate:row.profile_birth_date?new Date(row.profile_birth_date).toISOString().slice(0,10):'',city:row.profile_city||'',occupation:row.profile_occupation||'',interests:row.profile_interests||'',about:row.profile_about||'',status:row.profile_status||'',relationship:row.profile_relationship||'',privileges:a.isDeveloper?'Разработчик':(row.profile_privileges||'').replace(/разработчик/ig,'').trim(),lookingFor:row.profile_looking_for||'',askMe:row.profile_ask_me||''}});}catch(e){console.error("Profile read failed:",e.code||"UNKNOWN");res.status(503).json({error:"Не удалось загрузить профиль."});}});
app.post("/api/account/profile",async(req,res)=>{try{const a=await getAccount(req);if(!a)return res.status(401).json({error:"Войдите в аккаунт."});await ensureCharacterInfoSchema();const b=req.body||{},photo=b.photoDataUrl===undefined?null:String(b.photoDataUrl);if(photo!==null&&(!photo.startsWith("data:image/jpeg;base64,")||photo.length>1100000))return res.status(400).json({error:"Фото должно быть JPG и не больше примерно 800 КБ."});const gender=String(b.gender||'').slice(0,24),birth=String(b.birthDate||'').trim(),city=String(b.city||'').trim().slice(0,80),occupation=String(b.occupation||'').trim().slice(0,120),interests=String(b.interests||'').trim().slice(0,220),about=String(b.about||'').trim().slice(0,600),status=String(b.status||'').trim().slice(0,100),relationship=String(b.relationship||'').trim().slice(0,80),privileges=String(b.privileges||'').replace(/разработчик/ig,'').trim().slice(0,100),lookingFor=String(b.lookingFor||'').trim().slice(0,100),askMe=String(b.askMe||'').trim().slice(0,300);if(birth&&!/^\d{4}-\d{2}-\d{2}$/.test(birth))return res.status(400).json({error:"Проверь дату рождения."});await pool.query("INSERT INTO nexora_social_auth.characters(account_id,head_id,body_id) VALUES($1,1,1) ON CONFLICT(account_id) DO NOTHING",[a.id]);await pool.query("UPDATE nexora_social_auth.characters SET profile_photo_data_url=COALESCE($1,profile_photo_data_url),profile_gender=$2,profile_birth_date=$3::date,profile_city=$4,profile_occupation=$5,profile_interests=$6,profile_about=$7,profile_status=$8,profile_relationship=$9,profile_privileges=$10,profile_looking_for=$11,profile_ask_me=$12 WHERE account_id=$13",[photo,gender,birth||null,city,occupation,interests,about,status,relationship,privileges,lookingFor,askMe,a.id]);res.json({ok:true});}catch(e){console.error("Profile save failed:",e.code||"UNKNOWN");res.status(503).json({error:"Не удалось сохранить анкету."});}});
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
 }catch(error){console.error("Wallet read failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Баланс DIAMONDS временно недоступен."});}
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
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
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
 if(!roomPresenceSchemaPromise)roomPresenceSchemaPromise=pool.query("CREATE TABLE IF NOT EXISTS nexora_social_auth.room_presence (account_id TEXT PRIMARY KEY, nickname VARCHAR(24) NOT NULL, last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW())").catch(error=>{roomPresenceSchemaPromise=null;throw error;});
 return roomPresenceSchemaPromise;
}
app.post("/api/room/presence",async(req,res)=>{
 try{
  const account=await getAccount(req);if(!account)return res.status(401).json({error:"Войдите в аккаунт."});
  await ensureRoomPresenceSchema();
  await pool.query("INSERT INTO nexora_social_auth.room_presence(account_id,nickname,last_seen) VALUES($1,$2,NOW()) ON CONFLICT(account_id) DO UPDATE SET nickname=EXCLUDED.nickname,last_seen=NOW()",[String(account.id),account.nickname]);
  await ensureAvatarEquipmentSchema();
  const online=await pool.query("SELECT p.account_id,p.nickname,c.head_id,c.body_id,c.outfit_id,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.stars,0)::int AS authority_stars FROM nexora_social_auth.room_presence p LEFT JOIN nexora_social_auth.characters c ON c.account_id::text=p.account_id LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=COALESCE(c.authority_points,0) ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE p.last_seen>NOW()-INTERVAL '45 seconds' ORDER BY p.account_id ASC LIMIT 24");
  res.json({players:online.rows.map(row=>({id:String(row.account_id),nickname:row.nickname,headId:Number(row.head_id)||1,bodyId:Number(row.body_id)||1,outfitId:Number(row.outfit_id)||0,authorityTitle:row.authority_title,aura:row.aura,authorityStars:Number(row.authority_stars)||0,mine:String(row.account_id)===String(account.id)}))});
 }catch(error){console.error("Room presence failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось загрузить игроков."});}
});
app.get("/api/room/player/:id",async(req,res)=>{
 try{
  const viewer=await getAccount(req);if(!viewer)return res.status(401).json({error:"Войдите в аккаунт."});
  const id=String(req.params.id||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:"Некорректный игрок."});
  await ensureAvatarEquipmentSchema();await ensureCharacterInfoSchema();
  const result=await pool.query("SELECT a.id,a.nickname,c.head_id,c.body_id,c.outfit_id,c.profile_photo_data_url,c.profile_gender,c.profile_birth_date,c.profile_city,c.profile_occupation,c.profile_interests,c.profile_about,c.profile_status,c.profile_relationship,c.profile_privileges,c.profile_looking_for,c.profile_ask_me,COALESCE(ar.rank_name,'Новичок') AS authority_title,COALESCE(ar.aura,'none') AS aura,COALESCE(ar.stars,0)::int AS authority_stars FROM nexora_social_auth.accounts a LEFT JOIN nexora_social_auth.characters c ON c.account_id=a.id LEFT JOIN LATERAL (SELECT * FROM nexora_social_auth.authority_ranks WHERE min_points<=COALESCE(c.authority_points,0) ORDER BY min_points DESC LIMIT 1) ar ON TRUE WHERE a.id=$1",[id]);
  if(!result.rows.length)return res.status(404).json({error:"Игрок не найден."});
  const p=result.rows[0];
  res.json({player:{id:String(p.id),nickname:p.nickname,headId:Number(p.head_id)||1,bodyId:Number(p.body_id)||1,outfitId:Number(p.outfit_id)||0,authorityTitle:p.authority_title,aura:p.aura,authorityStars:Number(p.authority_stars)||0},profile:{photoDataUrl:p.profile_photo_data_url||"",gender:p.profile_gender||"",birthDate:p.profile_birth_date?new Date(p.profile_birth_date).toISOString().slice(0,10):"",city:p.profile_city||"",occupation:p.profile_occupation||"",interests:p.profile_interests||"",about:p.profile_about||"",status:p.profile_status||"",relationship:p.profile_relationship||"",privileges:String(p.profile_privileges||"").replace(/разработчик/ig,"").trim(),lookingFor:p.profile_looking_for||"",askMe:p.profile_ask_me||""}});
 }catch(error){console.error("Room player profile failed:",error.code||"UNKNOWN",error.message);res.status(503).json({error:"Не удалось загрузить анкету игрока."});}
});
app.get("/galaxy",(_req,res)=>res.redirect(308,"/"));app.get("*",(_req,res)=>res.sendFile(path.join(publicDirectory,"index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log("NEXORA server is running on port "+PORT));
