const crypto = require("crypto");
const express = require("express");
const { z } = require("zod");
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { pool } = require("./db");
const { requireSession } = require("./auth");

const router = express.Router();
router.use(requireSession);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 8 * 1024 * 1024;

function storageConfig() {
  const { S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, MEDIA_PUBLIC_BASE_URL } = process.env;
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !MEDIA_PUBLIC_BASE_URL) return null;
  return {
    bucket: S3_BUCKET,
    publicBase: MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, ""),
    client: new S3Client({
      region: S3_REGION || "auto",
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
    })
  };
}

router.post("/presign", async (req, res, next) => {
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
    const key = "users/" + req.user.id + "/" + id + "." + extension;
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

router.post("/complete", async (req, res, next) => {
  const parsed = z.object({
    assetId: z.string().uuid(),
    key: z.string().min(10).max(240),
    contentType: z.string().refine(value => allowedTypes.has(value)),
    size: z.number().int().positive().max(maxBytes)
  }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Некорректные данные загруженного файла." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  const expectedPrefix = "users/" + req.user.id + "/";
  if (!parsed.data.key.startsWith(expectedPrefix) || !parsed.data.key.includes(parsed.data.assetId)) {
    return res.status(403).json({ error: "Файл не принадлежит этому аккаунту." });
  }
  try {
    const head = await storage.client.send(new HeadObjectCommand({ Bucket: storage.bucket, Key: parsed.data.key }));
    if (head.ContentLength !== parsed.data.size || head.ContentType !== parsed.data.contentType || head.ContentLength > maxBytes) {
      return res.status(400).json({ error: "Параметры загруженного файла не совпадают с запросом." });
    }
    const publicUrl = storage.publicBase + "/" + parsed.data.key.split("/").map(encodeURIComponent).join("/");
    const inserted = await pool.query(
      "INSERT INTO media_assets(id,owner_user_id,storage_key,mime_type,byte_size,public_url) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(storage_key) DO NOTHING RETURNING id,public_url,mime_type,byte_size",
      [parsed.data.assetId, req.user.id, parsed.data.key, parsed.data.contentType, parsed.data.size, publicUrl]
    );
    if (!inserted.rowCount) return res.status(409).json({ error: "Этот файл уже зарегистрирован." });
    res.status(201).json({ asset: inserted.rows[0] });
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

router.delete("/:assetId", async (req, res, next) => {
  const parsed = z.string().uuid().safeParse(req.params.assetId);
  if (!parsed.success) return res.status(400).json({ error: "Некорректный идентификатор файла." });
  const storage = storageConfig();
  if (!storage) return res.status(503).json({ error: "Хранилище фотографий не настроено на сервере." });
  try {
    const asset = await pool.query("SELECT storage_key FROM media_assets WHERE id=$1 AND owner_user_id=$2", [req.params.assetId, req.user.id]);
    if (!asset.rowCount) return res.status(404).json({ error: "Фотография не найдена." });
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: asset.rows[0].storage_key }));
    await pool.query("DELETE FROM media_assets WHERE id=$1 AND owner_user_id=$2", [req.params.assetId, req.user.id]);
    res.json({ success: true });
  } catch (error) { next(error); }
});

module.exports = router;
