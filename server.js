require("dotenv").config();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { pool } = require("./src/db");
const { router: authRouter } = require("./src/auth");
const worldRouter = require("./src/world");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

// Reject cross-origin state-changing browser requests. SameSite cookies provide an additional layer.
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

app.get("/api/status", async (_req, res) => {
  let database = "unavailable";
  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch {}
  res.status(database === "connected" ? 200 : 503).json({
    online: true,
    app: "NEXORA",
    version: "0.2.0",
    stage: "backend-foundation",
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXORA запущен на порту ${PORT}`);
});
