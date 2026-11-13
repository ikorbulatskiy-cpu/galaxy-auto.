const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for persistent NEXORA accounts.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "migrations", "001_nexora_social_world.sql"),
    "utf8"
  );
  await pool.query(sql);
  await pool.query("DELETE FROM nexora_social_world.sessions WHERE expires_at < NOW()");
}

module.exports = { pool, migrate };
