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
      "moderation_actions","admin_logs","media_assets","reputation","reputation_events","schema_migrations"
    ]) assert.ok(tables.has(table), "missing database table: " + table);

    const versions = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(new Set(versions.rows.map(row => row.version)), new Set([
      "001_base_schema","002_game_world.sql","003_social_game_systems.sql","004_media_assets.sql"
    ]));

    const bankKey = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clan_transactions' AND column_name='idempotency_key'");
    assert.equal(bankKey.rowCount, 1, "clan bank operations must support idempotency");

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


dbTest("trusted character events award achievements and relationships stay exclusive", async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  const { randomUUID } = require("node:crypto");
  try {
    await client.query("BEGIN");
    const users = [0,1,2].map(() => randomUUID());
    for (let i=0;i<users.length;i++) {
      await client.query(
        "INSERT INTO users(id,email,username,password_hash) VALUES($1,$2,$3,'test-hash')",
        [users[i],users[i]+"@nexora.test","nexora_test_"+users[i].replaceAll("-","").slice(0,12)]
      );
    }
    await client.query("INSERT INTO wallet_balances(user_id,coins) VALUES($1,100)",[users[0]]);
    await client.query("INSERT INTO characters(user_id,name,is_active) VALUES($1,'Test Hero',TRUE)",[users[0]]);
    const award = await client.query(
      "SELECT w.coins,COUNT(ua.achievement_id)::int AS earned FROM wallet_balances w JOIN user_achievements ua ON ua.user_id=w.user_id JOIN achievements a ON a.id=ua.achievement_id WHERE w.user_id=$1 AND a.slug='first-steps' GROUP BY w.coins",
      [users[0]]
    );
    assert.equal(award.rowCount,1);
    assert.equal(Number(award.rows[0].coins),125);
    assert.equal(award.rows[0].earned,1);

    await client.query("INSERT INTO relationships(requester_id,addressee_id) VALUES($1,$2)",[users[0],users[1]]);
    await client.query("SAVEPOINT relationship_conflict");
    let conflict;
    try {
      await client.query("INSERT INTO relationships(requester_id,addressee_id) VALUES($1,$2)",[users[2],users[0]]);
    } catch (error) {
      conflict=error;
    }
    assert.equal(conflict?.code,"23505");
    await client.query("ROLLBACK TO SAVEPOINT relationship_conflict");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
});
