const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not configured; database-backed routes will be unavailable.");
}

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX || "5", 10);
const poolMax = Number.isInteger(configuredPoolMax) && configuredPoolMax >= 1 && configuredPoolMax <= 20
  ? configuredPoolMax
  : 5;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  max: poolMax,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  application_name: "nexora-web"
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.code || "UNKNOWN", error.message);
});

function isDatabaseUnavailable(error) {
  const code = String(error && error.code || "");
  return (
    code.startsWith("08") ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "57P01", "57P02", "57P03", "53300"].includes(code)
  );
}

module.exports = { pool, isDatabaseUnavailable };
