require("dotenv").config();

const express = require("express");
const path = require("path");
const http = require("http");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { pool, isDatabaseUnavailable } = require("./src/db");
const { router: authRouter } = require("./src/auth");
const worldRouter = require("./src/world");
const socialRouter = require("./src/social");
const gameRouter = require("./src/game");
const featuresRouter = require("./src/features");
const { attachRealtime } = require("./src/realtime");
const movement = require("./src/movement");
const mediaRouter = require("./src/media");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);
const appBaseUrl = process.env.APP_BASE_URL ? new URL(process.env.APP_BASE_URL) : null;
if (process.env.NODE_ENV === "production" && (!appBaseUrl || appBaseUrl.protocol !== "https:")) {
  throw new Error("APP_BASE_URL must be an HTTPS URL in production.");
}
const mediaUploadOrigin = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : null;

app.disable("x-powered-by");
const proxyHops = process.env.TRUST_PROXY_HOPS?.trim();
if (proxyHops && !/^\d+$/.test(proxyHops)) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}
app.set("trust proxy", proxyHops ? Number(proxyHops) : 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", ...(mediaUploadOrigin ? [mediaUploadOrigin] : [])],
      connectSrc: ["'self'", "ws:", "wss:", ...(mediaUploadOrigin ? [mediaUploadOrigin] : [])],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  }
}));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.host !== req.get("host")) {
          return res.status(403).json({ error: "Cross-origin request rejected." });
        }
      } catch {
        return res.status(403).json({ error: "Invalid request origin." });
      }
    } else if (req.get("sec-fetch-site") === "cross-site") {
      return res.status(403).json({ error: "Cross-site request rejected." });
    }
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много попыток. Попробуйте позже." }
});

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Слишком много диагностических событий." }
});

app.post("/api/client-errors", clientErrorLimiter, (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const clean = (value, max) => String(value || "").replace(/[\r\n\t]+/g, " ").slice(0, max);
  const event = {
    kind: clean(body.kind, 32) || "unknown",
    message: clean(body.message, 500) || "Client-side error",
    source: clean(body.source, 180),
    line: Number.isSafeInteger(body.line) ? body.line : null,
    column: Number.isSafeInteger(body.column) ? body.column : null,
    page: clean(body.page, 120) || "/",
    timestamp: new Date().toISOString()
  };
  console.error("[CLIENT_DIAGNOSTIC]", JSON.stringify(event));
  return res.status(202).json({ received: true });
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/world", worldRouter);
app.use("/api/social", socialRouter);
app.use("/api/game", gameRouter);
app.use("/api/movement", movement.router);
app.use("/api/features", featuresRouter);
app.use("/api/media", mediaRouter);

app.get("/api/status", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      online: true,
      app: "NEXORA",
      version: "0.6.1",
      stage: "social-game-world-foundation",
      database: "connected",
      message: "NEXORA API is ready"
    });
  } catch (error) {
    console.error("Database health check failed:", error.code || "UNKNOWN", error.message);
    return res.status(503).json({
      online: true,
      app: "NEXORA",
      version: "0.6.1",
      stage: "social-game-world-foundation",
      database: "unavailable",
      message: "Database connection is temporarily unavailable"
    });
  }
});

// Prevent mobile browsers and intermediary caches from reusing stale frontend assets.
app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || /\.(?:css|js)$/.test(req.path)) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.use((err, req, res, _next) => {
  if (res.headersSent) return;
  if (err && (err.type === "entity.parse.failed" || err.status === 400)) {
    return res.status(400).json({ error: "Некорректный формат запроса." });
  }
  if (isDatabaseUnavailable(err)) {
    console.error("Database temporarily unavailable:", req.method, req.path, err.code || "UNKNOWN", err.message);
    res.set("Retry-After", "3");
    return res.status(503).json({ error: "База данных временно недоступна. Повторите попытку через несколько секунд." });
  }
  console.error("Request failed:", req.method, req.path, err && (err.code || err.name || "UNKNOWN"), err && err.message);
  return res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

attachRealtime(server);
movement.attachMovement(server);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXORA запущен на порту ${PORT}`);
});
