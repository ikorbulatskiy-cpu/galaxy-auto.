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
  const directory = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(directory).filter((name) => /^\\d+.*\\.sql$/.test(name)).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(directory, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("COMMIT");
      console.log("NEXORA migration applied:", file);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw new Error("Migration " + file + " failed: " + error.message);
    }
  }
  await pool.query("DELETE FROM nexora_social_world.sessions WHERE expires_at < NOW()");
  console.log("NEXORA PostgreSQL connected; social schema migrations completed.");
}

module.exports = { pool, migrate };
