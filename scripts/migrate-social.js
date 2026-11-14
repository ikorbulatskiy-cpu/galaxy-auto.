require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS nexora_social_auth");
    await client.query("CREATE TABLE IF NOT EXISTS nexora_social_auth.social_schema_migrations(version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const migrations = ["001_nexora_social_world", "002_nexora_characters_recovery", "003_nexora_nickname_only", "004_authority_avatar_system"];
    for (const version of migrations) {
      const applied = await client.query("SELECT 1 FROM nexora_social_auth.social_schema_migrations WHERE version=$1", [version]);
      if (applied.rowCount) { console.log("Already applied:", version); continue; }
      const sql = fs.readFileSync(path.join(__dirname, "../database/migrations", version + ".sql"), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO nexora_social_auth.social_schema_migrations(version) VALUES($1)", [version]);
        await client.query("COMMIT");
        console.log("Applied:", version);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error("NEXORA social migration failed:", error.message); process.exitCode = 1; });
