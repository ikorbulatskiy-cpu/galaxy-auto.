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
  // Match numbered SQL files, e.g. 001_initial.sql and 002_social.sql.
  const files = fs.readdirSync(directory)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const client = await pool.connect();
  let lockAcquired = false;
  try {
    // A session-level advisory lock prevents two Render instances from applying
    // the same migration concurrently. Keep this client for every transaction.
    await client.query("SELECT pg_advisory_lock($1)", [731904221]);
    lockAcquired = true;

    await client.query("CREATE SCHEMA IF NOT EXISTS nexora_social_world");
    await client.query(`
      CREATE TABLE IF NOT EXISTS nexora_social_world.schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of files) {
      await client.query("BEGIN");
      try {
        const alreadyApplied = await client.query(
          "SELECT 1 FROM nexora_social_world.schema_migrations WHERE filename=$1",
          [file]
        );
        if (alreadyApplied.rowCount) {
          await client.query("COMMIT");
          continue;
        }

        const sql = fs.readFileSync(path.join(directory, file), "utf8");
        await client.query(sql);
        await client.query(
          "INSERT INTO nexora_social_world.schema_migrations(filename) VALUES($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log("NEXORA migration applied:", file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error("Migration " + file + " failed: " + error.message);
      }
    }

    await client.query(
      "DELETE FROM nexora_social_world.sessions WHERE expires_at < NOW()"
    );
    console.log("NEXORA PostgreSQL connected; social schema migrations completed.");
  } finally {
    if (lockAcquired) {
      try { await client.query("SELECT pg_advisory_unlock($1)", [731904221]); }
      catch (error) { console.error("Could not release migration lock:", error); }
    }
    client.release();
  }
}

module.exports = { pool, migrate };
