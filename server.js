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
const { attachRealtime } = require("./src/realtime");

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host")) {
          return res.status(403).json({ error: "Cross-origin request rejected." });
        }
      } catch {
        return res.status(403).json({ error: "Invalid request origin." });
      }
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

app.get("/api/status", async (_req, res) => {
  let database = "unavailable";
  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {}
  res.status(database === "connected" ? 200 : 503).json({
    online: true,
    app: "NEXORA",
    version: "0.4.0",
    stage: "game-world-foundation",
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
