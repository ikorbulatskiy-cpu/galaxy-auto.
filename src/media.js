const crypto = require("crypto");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { z } = require("zod");
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();
router.use(requireSession);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 8 * 1024 * 1024;
let cachedStorage = null;
const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Слишком много загрузок. Попробуйте позже." } });

async function readPrefix(body, limit = 16) {
  const chunks = [];
  let total = 0;
  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    const remaining = limit - total;
    if (remaining <= 0) break;
    chunks.push(buffer.subarray(0, remaining));
    total += Math.min(buffer.length, remaining);
    if (total >= limit) break;
  }
  return Buffer.concat(chunks, total);
}
function matchesImageSignature(type, bytes) {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (type === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function storageConfig() {
  if (cachedStorage) return cachedStorage;
  const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  let endpointUrl;
  try { endpointUrl = new URL(S3_ENDPOINT); } catch { return null; }
  if (!["http:", "https:"].includes(endpointUrl.protocol)) return null;
  if (process.env.NODE_ENV === "production" && endpointUrl.protocol !== "https:") return null;
  cachedStorage = {
    bucket: S3_BUCKET,
    client: new S3Client({
      region: S3_REGION || "auto",
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    })
  };
  return cachedStorage;
}

router.post("/presign", uploadLimiter, async (req, res, next) => {
  const parsed = z.object({
    contentType: z.string().refine(value => allowedTypes.has(value)),
    size: z.number().int().positive().max(maxBytes)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Разрешены JPEG, PNG или WebP размером до 8 МБ." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  try {
    const id = crypto.randomUUID();
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[parsed.data.contentType];
    const key = "staging/users/" + req.user.id + "/" + id + "." + extension;
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ContentType: parsed.data.contentType,
      ContentLength: parsed.data.size
    });
    const uploadUrl = await getSignedUrl(storage.client, command, { expiresIn: 300 });
    res.json({ uploadUrl, assetId: id, key, expiresIn: 300, requiredHeaders: { "Content-Type": parsed.data.contentType } });
  } catch (error) { next(error); }
});

router.post("/complete", uploadLimiter, async (req, res, next) => {
  const parsed = z.object({
    assetId: z.string().uuid(),
    key: z.string().min(10).max(240),
    contentType: z.string().refine(value => allowedTypes.has(value)),
    size: z.number().int().positive().max(maxBytes)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные загруженного файла." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  const expectedPrefix = "staging/users/" + req.user.id + "/";
  if (!parsed.data.key.startsWith(expectedPrefix) || !parsed.data.key.includes(parsed.data.assetId)) {
    return res.status(403).json({ error: "Файл не принадлежит этому аккаунту." });
  }
  try {
    const head = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: parsed.data.key }));
    if (head.ContentLength !== parsed.data.size || head.ContentType !== parsed.data.contentType || head.ContentLength > maxBytes) {
      return res.status(400).json({ error: "Параметры загруженного файла не совпадают с запросом." });
    }
    const object = await storage.client.send(new GetObjectCommand({
      Bucket: storage.bucket, Key: parsed.data.key, Range: "bytes=0-15"
    }));
    const signature = await readPrefix(object.Body);
    if (!matchesImageSignature(parsed.data.contentType, signature)) {
      await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: parsed.data.key }));
      return res.status(415).json({ error: "Содержимое файла не соответствует формату изображения." });
    }
    const appBase = (process.env.APP_BASE_URL || (req.protocol + "://" + req.get("host"))).replace(/\/+$/, "");
    const publicUrl = appBase + "/api/media/" + parsed.data.assetId;
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[parsed.data.contentType];
    const finalKey = "users/" + req.user.id + "/" + parsed.data.assetId + "." + extension;
    const client = await pool.connect();
    let copied = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["nexora-media:" + parsed.data.assetId]);
      const existing = await client.query("SELECT 1 FROM media_assets WHERE id=$1 OR storage_key=$2", [parsed.data.assetId,finalKey]);
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: parsed.data.key })).catch(() => {});
        return res.status(409).json({ error: "Этот файл уже зарегистрирован." });
      }
      await storage.client.send(new CopyObjectCommand({
        Bucket: storage.bucket,
        CopySource: storage.bucket + "/" + parsed.data.key.split("/").map(encodeURIComponent).join("/"),
        Key: finalKey,
        ContentType: parsed.data.contentType,
        MetadataDirective: "REPLACE",
        CacheControl: "private, no-store"
      }));
      copied = true;
      const inserted = await client.query(
        "INSERT INTO media_assets(id,owner_user_id,storage_key,mime_type,byte_size,public_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,public_url,mime_type,byte_size",
        [parsed.data.assetId, req.user.id, finalKey, parsed.data.contentType, parsed.data.size, publicUrl]
      );
      await client.query("COMMIT");
      await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: parsed.data.key })).catch(() => {});
      res.status(201).json({ asset: inserted.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (copied) await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: finalKey })).catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id,public_url,mime_type,byte_size,created_at FROM media_assets WHERE owner_user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    res.json({ assets: result.rows });
  } catch (error) { next(error); }
});

router.get("/:assetId", async (req,res,next)=>{
  const parsed = z.string().uuid().safeParse(req.params.assetId);
  if (!parsed.success) return res.status(400).json({ error: "Некорректный идентификатор файла." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  try {
    const asset = await pool.query(
      "SELECT ma.storage_key,ma.mime_type FROM media_assets ma " +
      "WHERE ma.id=$1 AND (ma.owner_user_id=$2 OR EXISTS (" +
      "SELECT 1 FROM blog_photos bp JOIN blog_posts b ON b.id=bp.post_id " +
      "WHERE bp.image_url=ma.public_url AND (b.visibility='public' OR b.user_id=$2 OR " +
      "(b.visibility='friends' AND EXISTS (SELECT 1 FROM friendships f WHERE f.status='accepted' " +
      "AND ((f.requester_id=$2 AND f.addressee_id=b.user_id) OR (f.requester_id=b.user_id AND f.addressee_id=$2)))) " +
      ") AND NOT EXISTS (SELECT 1 FROM blocks bl WHERE (bl.blocker_id=$2 AND bl.blocked_id=b.user_id) OR (bl.blocker_id=b.user_id AND bl.blocked_id=$2))))",
      [req.params.assetId,req.user.id]
    );
    if (!asset.rowCount) return res.status(404).json({ error: "Фотография не найдена или недоступна." });
    const url = await getSignedUrl(storage.client,new GetObjectCommand({
      Bucket:storage.bucket,
      Key:asset.rows[0].storage_key,
      ResponseContentType:asset.rows[0].mime_type,
      ResponseContentDisposition:"inline",
      ResponseCacheControl:"private, no-store"
    }),{expiresIn:300});
    res.set("Cache-Control","private, no-store");
    res.redirect(302,url);
  } catch(e){next(e)}
});

router.delete("/:assetId", async (req, res, next) => {
  const parsed = z.string().uuid().safeParse(req.params.assetId);
  if (!parsed.success) return res.status(400).json({ error: "Некорректный идентификатор файла." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  try {
    const asset = await pool.query("SELECT storage_key,public_url FROM media_assets WHERE id=$1 AND owner_user_id=$2", [req.params.assetId, req.user.id]);
    if (!asset.rowCount) return res.status(404).json({ error: "Фотография не найдена." });
    const used = await pool.query("SELECT 1 FROM blog_photos WHERE image_url=$1 LIMIT 1", [asset.rows[0].public_url]);
    if (used.rowCount) return res.status(409).json({ error: "Сначала удали публикацию, в которой используется эта фотография." });
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: asset.rows[0].storage_key }));
    await pool.query("DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2", [req.params.assetId, req.user.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

module.exports = router;
