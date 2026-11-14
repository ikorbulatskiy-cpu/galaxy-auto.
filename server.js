require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const { pool } = require("./src/db");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, "prototypes", "nexora-social-mvp", "public");

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(express.static(publicDirectory));

app.get("/api/status", async (_req, res) => {
  let database = "unavailable";
  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch (error) {
    console.error("Database health check failed:", error.code || "UNKNOWN", error.message);
  }

  // Keep the web process healthy even while PostgreSQL is temporarily offline.
  res.status(200).json({
    online: true,
    app: "NEXORA",
    stage: "clean-slate",
    database,
    message: "NEXORA server is running"
  });
});

app.get("/galaxy", (_req, res) => res.redirect(308, "/"));
app.get("*", (_req, res) => res.sendFile(path.join(publicDirectory, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXORA base server is running on port ${PORT}`);
});
