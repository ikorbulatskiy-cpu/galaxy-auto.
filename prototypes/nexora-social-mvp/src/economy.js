const express = require("express");
const cookie = require("cookie");

const COOKIE_NAME = "nexora_session";
const AVATAR_FIELDS = new Set(["suit","hair","hairColor","accessory","shoes","skin","gender"]);
const clean = (value,max) => String(value ?? "").replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,max);
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

function createEconomyRouter({ pool, auth, io }) {
  const router = express.Router();
  router.use(asyncRoute(async (req,res,next) => {
    const token = cookie.parse(req.headers.cookie || "")[COOKIE_NAME];
    const account = await auth.authenticateToken(token);
    if (!account) return res.status(401).json({error:"Требуется вход."});
    req.account = account;
    next();
  }));

  router.get("/catalog",asyncRoute(async(_req,res)=>{
    const result=await pool.query(
      "SELECT item_code AS code,name,description,category,icon,price::text,metadata FROM nexora_social_world.shop_catalog WHERE enabled=TRUE ORDER BY category,price,item_code"
    );
    res.json({ok:true,items:result.rows});
  }));

  router.get("/inventory",asyncRoute(async(req,res)=>{
    const [items,wallet]=await Promise.all([
      pool.query(`SELECT i.item_code AS code,i.quantity,i.metadata AS owned_metadata,c.name,c.description,c.category,c.icon,c.metadata AS catalog_metadata
        FROM nexora_social_world.inventory i LEFT JOIN nexora_social_world.shop_catalog c ON c.item_code=i.item_code
        WHERE i.account_id=$1 ORDER BY i.id DESC`,[req.account.id]),
      pool.query("SELECT balance::text FROM nexora_social_world.wallets WHERE account_id=$1",[req.account.id])
    ]);
    res.json({ok:true,items:items.rows,balance:wallet.rows[0]?.balance||"0"});
  }));

  router.get("/transactions",asyncRoute(async(req,res)=>{
    const result=await pool.query(
      "SELECT id,item_code AS code,amount::text,balance_after::text,created_at FROM nexora_social_world.wallet_transactions WHERE account_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.account.id]
    );
    res.json({ok:true,transactions:result.rows});
  }));

  router.post("/purchase",asyncRoute(async(req,res)=>{
    const code=clean(req.body?.code,64);
    const requestId=clean(req.body?.requestId,80);
    if(!/^[a-z0-9_-]{3,64}$/i.test(code)||!/^[a-zA-Z0-9_-]{12,80}$/.test(requestId))
      return res.status(400).json({error:"Некорректный запрос покупки."});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const previous=await client.query(
        "SELECT item_code AS code,amount::text,balance_after::text FROM nexora_social_world.wallet_transactions WHERE account_id=$1 AND request_id=$2",
        [req.account.id,requestId]
      );
      if(previous.rowCount){
        await client.query("COMMIT");
        return res.json({ok:true,replayed:true,purchase:previous.rows[0],balance:previous.rows[0].balance_after});
      }
      const item=await client.query(
        "SELECT item_code,name,price,metadata FROM nexora_social_world.shop_catalog WHERE item_code=$1 AND enabled=TRUE FOR SHARE",
        [code]
      );
      if(!item.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Предмет больше не продаётся."});}
      const wallet=await client.query("SELECT balance FROM nexora_social_world.wallets WHERE account_id=$1 FOR UPDATE",[req.account.id]);
      if(!wallet.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Кошелёк не найден."});}
      const price=BigInt(item.rows[0].price),balance=BigInt(wallet.rows[0].balance);
      if(balance<price){await client.query("ROLLBACK");return res.status(409).json({error:"Недостаточно Koins."});}
      const nextBalance=balance-price;
      await client.query("UPDATE nexora_social_world.wallets SET balance=$1,updated_at=NOW() WHERE account_id=$2",[nextBalance.toString(),req.account.id]);
      await client.query(
        "INSERT INTO nexora_social_world.inventory(account_id,item_code,quantity,metadata) VALUES($1,$2,1,$3::jsonb) ON CONFLICT(account_id,item_code) DO UPDATE SET quantity=nexora_social_world.inventory.quantity+1",
        [req.account.id,code,JSON.stringify(item.rows[0].metadata||{})]
      );
      await client.query(
        "INSERT INTO nexora_social_world.wallet_transactions(account_id,request_id,item_code,amount,balance_after) VALUES($1,$2,$3,$4,$5)",
        [req.account.id,requestId,code,price.toString(),nextBalance.toString()]
      );
      await client.query("COMMIT");
      res.json({ok:true,purchase:{code,name:item.rows[0].name,amount:price.toString()},balance:nextBalance.toString()});
    }catch(error){
      await client.query("ROLLBACK").catch(()=>{});
      if(error.code==="23505"){
        const previous=await pool.query("SELECT item_code AS code,amount::text,balance_after::text FROM nexora_social_world.wallet_transactions WHERE account_id=$1 AND request_id=$2",[req.account.id,requestId]);
        if(previous.rowCount)return res.json({ok:true,replayed:true,purchase:previous.rows[0],balance:previous.rows[0].balance_after});
      }
      throw error;
    }finally{client.release();}
  }));

  router.post("/equip",asyncRoute(async(req,res)=>{
    const code=clean(req.body?.code,64);
    const owned=await pool.query(
      "SELECT i.metadata,c.metadata AS catalog_metadata FROM nexora_social_world.inventory i JOIN nexora_social_world.shop_catalog c ON c.item_code=i.item_code WHERE i.account_id=$1 AND i.item_code=$2 AND i.quantity>0",
      [req.account.id,code]
    );
    if(!owned.rowCount)return res.status(404).json({error:"Предмет не найден в инвентаре."});
    const metadata={...(owned.rows[0].catalog_metadata||{}),...(owned.rows[0].metadata||{})};
    const patch=metadata.avatarPatch||{};
    const safePatch={};
    for(const [key,value] of Object.entries(patch))if(AVATAR_FIELDS.has(key))safePatch[key]=value;
    if(!Object.keys(safePatch).length)return res.status(400).json({error:"Этот предмет нельзя надеть."});
    const updated=await pool.query(
      "UPDATE nexora_social_world.characters SET avatar=COALESCE(avatar,'{}'::jsonb)||$1::jsonb,updated_at=NOW() WHERE account_id=$2 RETURNING avatar",
      [JSON.stringify(safePatch),req.account.id]
    );
    if(!updated.rowCount)return res.status(404).json({error:"Персонаж не найден."});
    const room=io.sockets.adapter.rooms.get("account:"+req.account.id);
    if(room)for(const socketId of room){
      const socket=io.sockets.sockets.get(socketId),player=socket?.data?.player;
      if(!player)continue;
      player.avatar=updated.rows[0].avatar;
      io.to("planet:"+player.planet).emit("profile:updated",{id:String(player.accountId),nickname:player.nickname,avatar:player.avatar,planet:player.planet,x:player.x,y:player.y,authorityTitle:player.authorityTitle,auraEnabled:player.auraEnabled});
    }
    res.json({ok:true,avatar:updated.rows[0].avatar});
  }));

  router.post("/reports",asyncRoute(async(req,res)=>{
    const targetId=Number(req.body?.targetId),category=clean(req.body?.category,24);
    const details=clean(req.body?.details,500);
    if(!Number.isSafeInteger(targetId)||targetId<=0||targetId===Number(req.account.id))
      return res.status(400).json({error:"Некорректный пользователь."});
    if(!["harassment","spam","scam","inappropriate","other"].includes(category))
      return res.status(400).json({error:"Выберите категорию жалобы."});
    const target=await pool.query("SELECT 1 FROM nexora_social_world.accounts WHERE id=$1",[targetId]);
    if(!target.rowCount)return res.status(404).json({error:"Пользователь не найден."});
    const recent=await pool.query("SELECT 1 FROM nexora_social_world.player_reports WHERE reporter_account_id=$1 AND target_account_id=$2 AND created_at>NOW()-INTERVAL '10 minutes'",[req.account.id,targetId]);
    if(recent.rowCount)return res.status(429).json({error:"Жалоба на этого игрока уже недавно отправлена."});
    const saved=await pool.query(
      "INSERT INTO nexora_social_world.player_reports(reporter_account_id,target_account_id,category,details) VALUES($1,$2,$3,$4) RETURNING id,created_at",
      [req.account.id,targetId,category,details]
    );
    res.status(201).json({ok:true,report:saved.rows[0]});
  }));

  return router;
}
module.exports={createEconomyRouter};
