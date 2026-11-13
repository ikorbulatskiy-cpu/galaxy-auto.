require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("../src/db");

async function main() {
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const baseVersion = "001_base_schema";
    const baseApplied = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [baseVersion]);
    if (!baseApplied.rowCount) {
      const schema = fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(schema);
        await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [baseVersion]);
        await client.query("COMMIT");
        console.log("Applied:", baseVersion);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } else {
      console.log("Already applied:", baseVersion);
    }

    for (const version of ["002_game_world.sql", "003_social_game_systems.sql", "004_media_assets.sql", "005_character_code_auth.sql", "006_custom_planets_auras.sql", "007_room_player_movement.sql", "014_galaxy_preferences.sql"]) {
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

    const bootstrapEmail = process.env.NEXORA_BOOTSTRAP_ADMIN_EMAIL;
    if (bootstrapEmail) {
      const promoted = await client.query(
        "UPDATE users SET role='developer',updated_at=NOW() WHERE LOWER(email)=LOWER($1) AND email_verified_at IS NOT NULL AND role='user' RETURNING id,username",
        [bootstrapEmail.trim()]
      );
      if (promoted.rowCount) console.log("Granted developer role to verified account:", promoted.rows[0].username);
      else console.log("No eligible account found for NEXORA_BOOTSTRAP_ADMIN_EMAIL.");
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
