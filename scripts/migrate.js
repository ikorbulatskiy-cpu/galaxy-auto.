require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function main() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8");
    await client.query(schema);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for (const version of ["002_game_world.sql", "003_social_game_systems.sql"]) {
      const exists = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [version]);
      if (exists.rowCount) {
        console.log("Already applied:", version);
        continue;
      }
      const sql = fs.readFileSync(path.join(__dirname, "../database/migrations", version), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
        await client.query("COMMIT");
        console.log("Applied:", version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("NEXORA migration failed:", error.message);
  process.exitCode = 1;
});
