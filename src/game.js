const express = require("express");
const { z } = require("zod");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();

router.get("/characters", requireSession, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,name,gender,character_age,bio,appearance,aura,level,experience,authority,is_active,created_at,updated_at FROM characters WHERE user_id=$1 ORDER BY created_at",
      [req.user.id]
    );
    res.json({ characters: result.rows, limit: 3 });
  } catch (error) { next(error); }
});

router.post("/characters", requireSession, async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N} _-]+$/u),
    gender: z.enum(["unspecified","female","male","other"]).optional(),
    characterAge: z.number().int().min(18).max(120).optional(),
    bio: z.string().trim().max(500).optional()
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Проверьте имя и данные персонажа." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [req.user.id]);
    const count = await client.query("SELECT COUNT(*)::int AS count FROM characters WHERE user_id=$1", [req.user.id]);
    if (count.rows[0].count >= 3) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "На одном аккаунте можно создать не более трёх персонажей." });
    }
    const created = await client.query(
      `INSERT INTO characters (user_id,name,gender,character_age,bio,is_active)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active,created_at`,
      [req.user.id, parsed.data.name, parsed.data.gender || "unspecified", parsed.data.characterAge ?? null, parsed.data.bio || "", count.rows[0].count === 0]
    );
    await client.query("COMMIT");
    res.status(201).json({ character: created.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return res.status(409).json({ error: "У вас уже есть персонаж с таким именем." });
    next(error);
  } finally { client.release(); }
});

router.patch("/characters/:characterId", requireSession, async (req, res, next) => {
  const parsed = z.object({
    name: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N} _-]+$/u).optional(),
    gender: z.enum(["unspecified","female","male","other"]).optional(),
    characterAge: z.number().int().min(18).max(120).nullable().optional(),
    bio: z.string().trim().max(500).optional(),
    appearance: z.object({
      spriteGender: z.enum(["male","female"]).optional(),
      body: z.string().max(40).optional(),
      skinTone: z.string().max(24).optional(),
      head: z.string().max(40).optional(),
      hair: z.string().max(40).optional(),
      hairColor: z.string().max(24).optional(),
      eyes: z.string().max(40).optional(),
      eyeStyle: z.enum(["normal","wide","narrow"]).optional(),
      expression: z.enum(["smile","neutral"]).optional(),
      outfit: z.string().max(60).optional(),
      shoes: z.string().max(40).optional(),
      accessories: z.array(z.string().max(40)).max(20).optional()
    }).strict().optional()
  }).strict().safeParse(req.body);
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(req.params.characterId)) {
    return res.status(400).json({ error: "Некорректные данные персонажа." });
  }
  const fields = parsed.data;
  try {
    const result = await pool.query(
      `UPDATE characters SET
       name=COALESCE($3,name), gender=COALESCE($4,gender),
       character_age=CASE WHEN $5::boolean THEN $6::smallint ELSE character_age END,
       bio=COALESCE($7,bio), appearance=COALESCE($8::jsonb,appearance), updated_at=NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active`,
      [req.params.characterId, req.user.id, fields.name ?? null, fields.gender ?? null,
       Object.prototype.hasOwnProperty.call(fields,"characterAge"), fields.characterAge ?? null,
       fields.bio ?? null, fields.appearance ? JSON.stringify(fields.appearance) : null]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Персонаж не найден." });
    res.json({ character: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Имя персонажа уже занято на этом аккаунте." });
    next(error);
  }
});

router.post("/characters/:characterId/activate", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.characterId)) return res.status(400).json({ error: "Некорректный персонаж." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query("SELECT id FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.characterId, req.user.id]);
    if (!owned.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Персонаж не найден." });
    }
    await client.query("UPDATE characters SET is_active=FALSE WHERE user_id=$1", [req.user.id]);
    const active = await client.query("UPDATE characters SET is_active=TRUE,updated_at=NOW() WHERE id=$1 RETURNING id,name,gender,character_age,bio,appearance,level,experience,authority,is_active", [req.params.characterId]);
    await client.query("COMMIT");
    res.json({ character: active.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

router.delete("/characters/:characterId", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.characterId)) return res.status(400).json({ error: "Некорректный персонаж." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const removed = await client.query("DELETE FROM characters WHERE id=$1 AND user_id=$2 RETURNING is_active", [req.params.characterId, req.user.id]);
    if (!removed.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Персонаж не найден." });
    }
    if (removed.rows[0].is_active) {
      await client.query(
        "UPDATE characters SET is_active=TRUE,updated_at=NOW() WHERE id=(SELECT id FROM characters WHERE user_id=$1 ORDER BY created_at LIMIT 1)",
        [req.user.id]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});


router.get("/planets", requireSession, async (req,res,next)=>{
 try{
  const r=await pool.query("SELECT p.id,p.slug,p.name,p.description,p.access_type,p.ticket_price,p.settings,p.owner_user_id,COALESCE(u.username,'') AS owner_name,(p.owner_user_id=$1) AS is_owner,EXISTS(SELECT 1 FROM planet_favorites pf WHERE pf.user_id=$1 AND pf.planet_id=p.id) AS is_favorite,EXISTS(SELECT 1 FROM user_locations ul WHERE ul.user_id=$1 AND ul.planet_id=p.id) AS is_current,(SELECT COUNT(*)::int FROM rooms rm WHERE rm.planet_id=p.id AND rm.is_active=TRUE) AS rooms,(SELECT COUNT(DISTINCT rp.user_id)::int FROM room_presence rp JOIN rooms rm ON rm.id=rp.room_id WHERE rm.planet_id=p.id AND rp.connected_at>NOW()-INTERVAL '2 minutes' AND NOT EXISTS(SELECT 1 FROM galaxy_preferences gp WHERE gp.user_id=rp.user_id AND gp.invisible=TRUE)) AS online,(SELECT COUNT(DISTINCT rp.user_id)::int FROM room_presence rp JOIN rooms rm ON rm.id=rp.room_id JOIN friendships f ON f.status='accepted' AND ((f.requester_id=$1 AND f.addressee_id=rp.user_id) OR (f.addressee_id=$1 AND f.requester_id=rp.user_id)) WHERE rm.planet_id=p.id AND rp.connected_at>NOW()-INTERVAL '2 minutes') AS friends_online FROM planets p LEFT JOIN users u ON u.id=p.owner_user_id WHERE p.is_active=TRUE AND NOT EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$1 AND (pb.expires_at IS NULL OR pb.expires_at>NOW())) AND (p.access_type<>'vip' OR p.owner_user_id=$1 OR EXISTS(SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$1 AND (pa.expires_at IS NULL OR pa.expires_at>NOW()) AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff'))) ORDER BY (p.slug='newbies-1') DESC,p.name",[req.user.id]);
  res.json({planets:r.rows});
 }catch(e){next(e)}
});

const LEGACY_PLANET_OBJECT_CODES=["tree","bench","fountain","lamp","flowerbed","kiosk","palm","beach_chair","club_table","dj_booth","sofa","plant"];

router.get("/planet-favorites",requireSession,async(req,res,next)=>{
 try{
  const r=await pool.query(`SELECT p.id,p.slug,p.name,p.description,p.access_type,p.settings,pf.created_at
    FROM planet_favorites pf JOIN planets p ON p.id=pf.planet_id
    WHERE pf.user_id=$1 AND p.is_active=TRUE
      AND NOT EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$1 AND (pb.expires_at IS NULL OR pb.expires_at>NOW()))
      AND (p.access_type<>'vip' OR p.owner_user_id=$1 OR EXISTS(
        SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$1
          AND (pa.expires_at IS NULL OR pa.expires_at>NOW())
          AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff')))
    ORDER BY pf.created_at DESC`,[req.user.id]);
  res.json({favorites:r.rows});
 }catch(e){next(e)}
});
router.post("/planet-favorites/:planetSlug",requireSession,async(req,res,next)=>{
 const slug=String(req.params.planetSlug||"");
 if(!/^[a-z0-9-]{2,48}$/.test(slug))return res.status(400).json({error:"Некорректная планета."});
 try{
  const r=await pool.query(`INSERT INTO planet_favorites(user_id,planet_id)
    SELECT $1,p.id FROM planets p
    WHERE p.slug=$2 AND p.is_active=TRUE
      AND NOT EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$1 AND (pb.expires_at IS NULL OR pb.expires_at>NOW()))
      AND (p.access_type<>'vip' OR p.owner_user_id=$1 OR EXISTS(
        SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$1
          AND (pa.expires_at IS NULL OR pa.expires_at>NOW())
          AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff')))
    ON CONFLICT(user_id,planet_id) DO NOTHING RETURNING planet_id`,[req.user.id,slug]);
  if(!r.rowCount){
   const exists=await pool.query(`SELECT 1 FROM planet_favorites pf JOIN planets p ON p.id=pf.planet_id
    WHERE pf.user_id=$1 AND p.slug=$2 AND NOT EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$1 AND (pb.expires_at IS NULL OR pb.expires_at>NOW()))
      AND (p.access_type<>'vip' OR p.owner_user_id=$1 OR EXISTS(SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$1
        AND (pa.expires_at IS NULL OR pa.expires_at>NOW()) AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff')))`,[req.user.id,slug]);
   if(!exists.rowCount)return res.status(404).json({error:"Планета не найдена или недоступна."});
  }
  res.json({success:true});
 }catch(e){next(e)}
});
router.delete("/planet-favorites/:planetSlug",requireSession,async(req,res,next)=>{
 try{await pool.query("DELETE FROM planet_favorites pf USING planets p WHERE pf.planet_id=p.id AND pf.user_id=$1 AND p.slug=$2",[req.user.id,req.params.planetSlug]);res.json({success:true})}
 catch(e){next(e)}
});

router.get("/planets/:planetSlug/objects",requireSession,async(req,res,next)=>{
 try{
  const p=await pool.query(`SELECT p.id,p.access_type,p.owner_user_id,
    (p.owner_user_id=$2 OR EXISTS(SELECT 1 FROM planet_access pa WHERE pa.planet_id=p.id AND pa.user_id=$2
      AND (pa.expires_at IS NULL OR pa.expires_at>NOW())
      AND (COALESCE(p.settings->>'legacy_access_mode','')<>'private' OR pa.access_level='staff'))) AS can_access,
    EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=p.id AND pb.user_id=$2
      AND (pb.expires_at IS NULL OR pb.expires_at>NOW())) AS is_banned
    FROM planets p WHERE p.slug=$1 AND p.is_active=TRUE`,[req.params.planetSlug,req.user.id]);
  if(!p.rowCount)return res.status(404).json({error:"Планета не найдена."});
  if(p.rows[0].is_banned)return res.status(403).json({error:"Доступ к планете закрыт."});
  if(p.rows[0].access_type==="vip"&&!p.rows[0].can_access)return res.status(403).json({error:"Нет доступа к этой планете."});
  const objects=await pool.query("SELECT id,object_code AS code,x,y,rotation,scale,properties FROM planet_objects WHERE planet_id=$1 ORDER BY y,id",[p.rows[0].id]);
  res.json({objects:objects.rows});
 }catch(e){next(e)}
});
router.put("/planets/:planetSlug/objects",requireSession,async(req,res,next)=>{
 const parsed=z.object({objects:z.array(z.object({
  code:z.enum(LEGACY_PLANET_OBJECT_CODES),
  x:z.number().min(0).max(1),y:z.number().min(0).max(1),
  rotation:z.number().min(-360).max(360).default(0),
  scale:z.number().min(0.5).max(2).default(1),
  properties:z.record(z.unknown()).optional()
 })).max(100)}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Проверьте объекты и их координаты. Лимит: 100 объектов."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const p=await client.query("SELECT id,owner_user_id,EXISTS(SELECT 1 FROM planet_bans pb WHERE pb.planet_id=planets.id AND pb.user_id=$2 AND (pb.expires_at IS NULL OR pb.expires_at>NOW())) AS is_banned FROM planets WHERE slug=$1 AND is_active=TRUE FOR UPDATE",[req.params.planetSlug,req.user.id]);
  if(!p.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Планета не найдена."})}
  if(p.rows[0].is_banned){await client.query("ROLLBACK");return res.status(403).json({error:"Доступ к планете закрыт."})}
  const staff=await client.query("SELECT 1 FROM planet_access WHERE planet_id=$1 AND user_id=$2 AND access_level='staff' AND (expires_at IS NULL OR expires_at>NOW())",[p.rows[0].id,req.user.id]);
  if(String(p.rows[0].owner_user_id)!==String(req.user.id)&&!staff.rowCount&&!["admin","developer"].includes(req.user.role)){
   await client.query("ROLLBACK");return res.status(403).json({error:"Нет прав редактировать декорации этой планеты."});
  }
  await client.query("DELETE FROM planet_objects WHERE planet_id=$1",[p.rows[0].id]);
  for(const item of parsed.data.objects)await client.query(
   "INSERT INTO planet_objects(planet_id,object_code,x,y,rotation,scale,properties) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
   [p.rows[0].id,item.code,item.x,item.y,item.rotation,item.scale,JSON.stringify(item.properties||{})]
  );
  await client.query("INSERT INTO admin_logs(admin_user_id,action,target_type,target_id,details) VALUES($1,'planet_objects_updated','planet',$2,$3::jsonb)",
   [req.user.id,p.rows[0].id,JSON.stringify({count:parsed.data.objects.length})]);
  await client.query("COMMIT");
  res.json({success:true,count:parsed.data.objects.length});
 }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});

router.post("/planets", requireSession, async (req,res,next)=>{
 const parsed=z.object({name:z.string().trim().min(3).max(48).regex(/^[\p{L}\p{N} _*.-]+$/u),description:z.string().trim().max(300).default(""),weather:z.string().trim().max(40).default("Ясно"),interior:z.string().trim().max(60).default("Космический зал"),theme:z.enum(["sunset","space","forest","city","underwater"]).default("sunset"),modules:z.array(z.enum(["magic","defender","games","horoscope","love"])).max(5).default(["magic","games"])}).strict().safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Проверьте название, описание и оформление планеты."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const wallet=await client.query("SELECT coins FROM wallet_balances WHERE user_id=$1 FOR UPDATE",[req.user.id]);
  if(!wallet.rowCount||Number(wallet.rows[0].coins)<3){await client.query("ROLLBACK");return res.status(402).json({error:"Создание планеты стоит 3 Nexora Coins."});}
  const slug="player-"+require("crypto").randomBytes(6).toString("hex");
  const settings={theme:parsed.data.theme,weather:parsed.data.weather,interior:parsed.data.interior,modules:parsed.data.modules,king_label:"Король планеты"};
  const created=await client.query("INSERT INTO planets(slug,name,description,access_type,ticket_price,settings,owner_user_id) VALUES($1,$2,$3,'public',0,$4::jsonb,$5) RETURNING id,slug,name,description,settings,owner_user_id",[slug,parsed.data.name,parsed.data.description,JSON.stringify(settings),req.user.id]);
  await client.query("UPDATE wallet_balances SET coins=coins-3,updated_at=NOW() WHERE user_id=$1",[req.user.id]);
  await client.query("INSERT INTO wallet_ledger(user_id,currency,amount,reason,reference_id) VALUES($1,'coins',-3,'Создание планеты',$2)",[req.user.id,created.rows[0].id]);
  await client.query("INSERT INTO rooms(planet_id,slug,name,description,capacity) VALUES($1,'central-hall','Центральный зал','Главная комната вашей планеты.',100)",[created.rows[0].id]);
  await client.query("COMMIT");
  res.status(201).json({planet:created.rows[0],message:"Планета создана. Вы её король.",cost:3});
 }catch(e){await client.query("ROLLBACK");if(e.code==="23505")return res.status(409).json({error:"Не удалось создать уникальную планету. Повторите попытку."});next(e)}
 finally{client.release()}
});

const AURA_CATALOG={
 angel:{price:50,color:"green",title:"Ангел"},
 god:{price:null,color:"purple",title:"Бог / Богиня"},
 almighty:{price:100,color:"gold",title:"Всемогущий"},
 universe:{price:200,color:"red",title:"Мистер Вселенный / Мисс Вселенная"},
 legend:{price:300,color:"blue",title:"Легенда"}
};
router.get("/auras",requireSession,async(req,res,next)=>{
 try{const r=await pool.query("SELECT id,name,gender,aura FROM characters WHERE user_id=$1 ORDER BY is_active DESC,created_at",[req.user.id]);res.json({auras:AURA_CATALOG,characters:r.rows})}catch(e){next(e)}
});
router.post("/characters/:characterId/aura",requireSession,async(req,res,next)=>{
 const parsed=z.object({aura:z.enum(["none","angel","god","almighty","universe","legend"])}).strict().safeParse(req.body);
 if(!parsed.success||!/^[0-9a-f-]{36}$/i.test(req.params.characterId))return res.status(400).json({error:"Некорректная аура."});
 const aura=parsed.data.aura,price=AURA_CATALOG[aura]?.price??0;
 if(aura==="god")return res.status(400).json({error:"Цена ауры Бога / Богини ещё не установлена."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const ch=await client.query("SELECT id FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE",[req.params.characterId,req.user.id]);
  if(!ch.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Персонаж не найден."});}
  if(price>0){
   const w=await client.query("SELECT coins FROM wallet_balances WHERE user_id=$1 FOR UPDATE",[req.user.id]);
   if(!w.rowCount||Number(w.rows[0].coins)<price){await client.query("ROLLBACK");return res.status(402).json({error:"Недостаточно Nexora Coins."});}
   await client.query("UPDATE wallet_balances SET coins=coins-$2,updated_at=NOW() WHERE user_id=$1",[req.user.id,price]);
   await client.query("INSERT INTO wallet_ledger(user_id,currency,amount,reason,reference_id) VALUES($1,'coins',$2,$3,$4)",[req.user.id,-price,"Покупка ауры: "+AURA_CATALOG[aura].title,req.params.characterId]);
  }
  const updated=await client.query("UPDATE characters SET aura=$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id,name,aura",[req.params.characterId,req.user.id,aura]);
  await client.query("COMMIT");res.json({character:updated.rows[0],price});
 }catch(e){await client.query("ROLLBACK");next(e)}finally{client.release()}
});


router.get("/rooms", requireSession, async (req, res, next) => {
  const planetSlug = typeof req.query.planet === "string" ? req.query.planet : "";
  try {
    const location = await pool.query("SELECT p.slug FROM user_locations l JOIN planets p ON p.id=l.planet_id WHERE l.user_id=$1", [req.user.id]);
    if (!location.rowCount) return res.status(409).json({ error: "Сначала выбери планету отправления." });
    if (planetSlug && planetSlug !== location.rows[0].slug) return res.status(409).json({ error: "Сначала перелетите на выбранную планету." });
    const result = await pool.query("SELECT r.id,r.slug,r.name,r.description,r.capacity,p.slug AS planet_slug,p.name AS planet_name,(SELECT COUNT(DISTINCT rp.user_id)::int FROM room_presence rp WHERE rp.room_id=r.id AND rp.connected_at>NOW()-INTERVAL '2 minutes' AND NOT EXISTS(SELECT 1 FROM galaxy_preferences gp WHERE gp.user_id=rp.user_id AND gp.invisible=TRUE)) AS online FROM rooms r JOIN planets p ON p.id=r.planet_id WHERE r.is_active=TRUE AND p.is_active=TRUE AND p.slug=$1 ORDER BY r.name",[location.rows[0].slug]);
    res.json({ rooms: result.rows });
  } catch (error) { next(error); }
});
router.get("/rooms/:roomId/presence", requireSession, async (req,res,next)=>{
  if (!/^[0-9a-f-]{36}$/i.test(req.params.roomId)) return res.status(400).json({error:"Некорректная комната."});
  try {
    const result=await pool.query(
      "SELECT rp.user_id,u.username,(rp.user_id=$2) AS is_me,COALESCE(c.name,u.username) AS character_name,c.appearance AS character_appearance,c.aura AS character_aura,MAX(rp.connected_at) AS connected_at " +
      "FROM room_presence rp JOIN users u ON u.id=rp.user_id " +
      "JOIN rooms r ON r.id=rp.room_id AND r.is_active=TRUE JOIN planets p ON p.id=r.planet_id AND p.is_active=TRUE JOIN user_locations l ON l.planet_id=r.planet_id AND l.user_id=$2 " +
      "LEFT JOIN characters c ON c.user_id=u.id AND c.is_active=TRUE " +
      "WHERE rp.room_id=$1 AND rp.connected_at>NOW()-INTERVAL '2 minutes' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM galaxy_preferences gp WHERE gp.user_id=rp.user_id AND gp.invisible=TRUE) " +
      "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=rp.user_id) OR (b.blocker_id=rp.user_id AND b.blocked_id=$2)) " +
      "GROUP BY rp.user_id,u.username,c.name,c.appearance,c.aura ORDER BY character_name",
      [req.params.roomId,req.user.id]
    );
    res.json({users:result.rows});
  } catch(e){next(e)}
});

router.get("/rooms/:roomId/messages", requireSession, async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.roomId)) return res.status(400).json({ error: "Некорректная комната." });
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit,10) || 50,1),100);
  try {
    const room = await pool.query("SELECT r.id FROM rooms r JOIN user_locations l ON l.planet_id=r.planet_id WHERE r.id=$1 AND r.is_active=TRUE AND l.user_id=$2", [req.params.roomId,req.user.id]);
    if (!room.rowCount) return res.status(404).json({ error: "Комната не найдена." });
    const messages = await pool.query(
      `SELECT m.id,m.body,m.created_at,c.id AS character_id,COALESCE(c.name,u.username) AS character_name
       FROM room_messages m JOIN users u ON u.id=m.user_id
       LEFT JOIN characters c ON c.id=m.character_id
       WHERE m.room_id=$1 ORDER BY m.created_at DESC LIMIT $2`,
      [req.params.roomId,limit]
    );
    res.json({ messages: messages.rows.reverse() });
  } catch (error) { next(error); }
});

router.get("/notifications", requireSession, async (req,res,next) => {
  try {
    const result = await pool.query(
      "SELECT id,kind,title,body,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ notifications: result.rows, unread: result.rows.filter(x => !x.read_at).length });
  } catch (error) { next(error); }
});

router.patch("/notifications/read", requireSession, async (req,res,next) => {
  const parsed = z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) return res.status(400).json({ error: "Укажите уведомления для прочтения." });
  try {
    const result = parsed.data.all
      ? await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL", [req.user.id])
      : await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND id=ANY($2::uuid[]) AND read_at IS NULL", [req.user.id, parsed.data.ids]);
    res.json({ updated: result.rowCount });
  } catch (error) { next(error); }
});

module.exports = router;
