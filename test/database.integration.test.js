const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const dbTest = (name, fn) => test(name, { skip: !databaseUrl }, fn);

dbTest("PostgreSQL migrations create all game and social subsystems", async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
    );
    const tables = new Set(result.rows.map(row => row.table_name));
    for (const table of [
      "users","sessions","characters","planets","user_locations","flights","rooms",
      "room_presence","room_messages","notifications","avatar_items","character_inventory",
      "clans","clan_members","clan_applications","clan_transactions","clan_messages",
      "wallet_balances","wallet_ledger","wallet_transfers","purchases","gifts","pets",
      "blog_posts","blog_photos","blog_comments","blog_likes","relationships",
      "wedding_ceremonies","achievements","user_achievements","mini_game_scores",
      "moderation_actions","admin_logs","reputation","reputation_events","schema_migrations"
    ]) assert.ok(tables.has(table), "missing database table: " + table);

    const versions = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(new Set(versions.rows.map(row => row.version)), new Set([
      "001_base_schema","002_game_world.sql","003_social_game_systems.sql"
    ]));

    const seeded = await pool.query("SELECT COUNT(*)::int AS count FROM avatar_items WHERE slug LIKE 'nexora-%'");
    assert.ok(seeded.rows[0].count >= 20, "visual catalog seed is incomplete");

    const planets = await pool.query(
      "SELECT COUNT(*)::int AS count FROM planets WHERE slug IN ('nexora-prime','love-planet','neon-city','paradise','mystery-planet','vip-world')"
    );
    assert.equal(planets.rows[0].count, 6);

    const triggers = await pool.query(
      "SELECT COUNT(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('nexora_first_character_achievement','nexora_first_message_achievement','nexora_first_friend_achievement','nexora_first_purchase_achievement','nexora_relationship_exclusivity','nexora_wedding_achievement')"
    );
    assert.ok(triggers.rows[0].count >= 6, "expected game progression and relationship triggers");
  } finally {
    await pool.end();
  }
});

dbTest("base and feature migrations are idempotently recorded", async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const before = await pool.query("SELECT version,applied_at FROM schema_migrations ORDER BY version");
    assert.equal(before.rowCount, 3);
    assert.ok(before.rows.every(row => row.applied_at instanceof Date));
  } finally {
    await pool.end();
  }
});
