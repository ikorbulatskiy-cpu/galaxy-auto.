require("dotenv").config();

const express = require("express");
const path = require("path");
const http = require("http");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { pool } = require("./src/db");
const { router: authRouter } = require("./src/auth");
const worldRouter = require("./src/world");
const socialRouter = require("./src/social");
const gameRouter = require("./src/game");
const featuresRouter = require("./src/features");
const { attachRealtime } = require("./src/realtime");
const mediaRouter = require("./src/media");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
const proxyHops = process.env.TRUST_PROXY_HOPS;
if (proxyHops !== undefined && !/^\\d+$/.test(proxyHops)) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}
app.set("trust proxy", proxyHops === undefined ? false : Number(proxyHops));
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
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
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

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/world", worldRouter);
app.use("/api/social", socialRouter);
app.use("/api/game", gameRouter);
app.use("/api/features", featuresRouter);
app.use("/api/media", mediaRouter);

app.get("/api/status", async (_req, res) => {
  let database = "unavailable";
  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {}
  res.status(database === "connected" ? 200 : 503).json({
    online: true,
    app: "NEXORA",
    version: "0.6.0",
    stage: "social-game-world-foundation",
    database,
    message: database === "connected" ? "NEXORA API is ready" : "Database connection is not configured"
  });
});

app.use(express.static(path.join(__dirname, "public")));
app.use((err, _req, res, _next) => {
  console.error("Request failed:", err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

attachRealtime(server);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXORA запущен на порту ${PORT}`);
});
