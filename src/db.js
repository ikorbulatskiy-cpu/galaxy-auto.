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
  const message = String(error && error.message || "");
  return (
    code.startsWith("08") ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "57P01", "57P02", "57P03", "53300"].includes(code) ||
    /timeout exceeded when trying to connect|connection terminated|server closed the connection unexpectedly|connection refused|connection reset|terminating connection due to administrator command/i.test(message)
  );
}

module.exports = { pool, isDatabaseUnavailable };
