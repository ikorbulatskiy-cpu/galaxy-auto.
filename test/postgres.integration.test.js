const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");

const enabled = Boolean(process.env.DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

test("PostgreSQL migrations, reward triggers and relationship exclusivity", { skip: !enabled }, async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const seededRooms = await client.query("SELECT p.slug,COUNT(r.id)::int AS rooms FROM planets p LEFT JOIN rooms r ON r.planet_id=p.id GROUP BY p.slug");
    for (const slug of ["nexora-prime","love-planet","neon-city","paradise","mystery-planet"]) {
      assert.ok(Number(seededRooms.rows.find(row => row.slug===slug)?.rooms||0)>=3, "expected rooms on " + slug);
    }
    const suffix = crypto.randomBytes(5).toString("hex");
    const inserted = await client.query(
      "INSERT INTO users(email,username,password_hash,email_verified_at) VALUES($1,$2,'integration-test',NOW()),($3,$4,'integration-test',NOW()),($5,$6,'integration-test',NOW()) RETURNING id",
      ["nexora-a-" + suffix + "@example.test","nexora_a_" + suffix,"nexora-b-" + suffix + "@example.test","nexora_b_" + suffix,"nexora-c-" + suffix + "@example.test","nexora_c_" + suffix]
    );
    const [a,b,c] = inserted.rows.map(row => row.id);
    await client.query("INSERT INTO wallet_balances(user_id,coins) VALUES($1,100),($2,100),($3,100)",[a,b,c]);
    const character = await client.query("INSERT INTO characters(user_id,name,is_active) VALUES($1,'Test avatar',TRUE) RETURNING id",[a]);
    const item = await client.query("SELECT id FROM avatar_items WHERE slug='nexora-basic-cap'");
    assert.equal(item.rowCount,1);
    await client.query(
      "INSERT INTO purchases(user_id,item_id,character_id,currency,amount,idempotency_key) VALUES($1,$2,$3,'coins',10,$4)",
      [a,item.rows[0].id,character.rows[0].id,crypto.randomUUID()]
    );
    const conversation = await client.query("INSERT INTO conversations DEFAULT VALUES RETURNING id");
    await client.query("INSERT INTO conversation_members(conversation_id,user_id) VALUES($1,$2),($1,$3)",[conversation.rows[0].id,a,b]);
    await client.query("INSERT INTO messages(conversation_id,sender_id,body) VALUES($1,$2,'Integration test message')",[conversation.rows[0].id,a]);
    const friendship = await client.query("INSERT INTO friendships(requester_id,addressee_id) VALUES($1,$2) RETURNING id",[a,c]);
    await client.query("UPDATE friendships SET status='accepted' WHERE id=$1",[friendship.rows[0].id]);
    const relationship = await client.query(
      "INSERT INTO relationships(requester_id,addressee_id,status) VALUES($1,$2,'engaged') RETURNING id",
      [a,b]
    );
    await client.query(
      "INSERT INTO wedding_ceremonies(relationship_id,venue,vows) VALUES($1,'Integration test hall','We test the ceremony.')",
      [relationship.rows[0].id]
    );
    const awards = await client.query(
      "SELECT u.id,a.slug FROM user_achievements u JOIN achievements a ON a.id=u.achievement_id WHERE u.user_id=ANY($1::uuid[])",
      [[a,b]]
    );
    const awardSet = new Set(awards.rows.map(row => row.id + ":" + row.slug));
    assert.ok(awardSet.has(a + ":first-steps"));
    assert.ok(awardSet.has(a + ":first-purchase"));
    assert.ok(awardSet.has(a + ":social-butterfly"));
    assert.ok(awardSet.has(a + ":new-friend"));
    assert.ok(awardSet.has(c + ":new-friend"));
    assert.ok(awardSet.has(a + ":wedding-day"));
    assert.ok(awardSet.has(b + ":wedding-day"));
    const balances = await client.query("SELECT user_id,coins FROM wallet_balances WHERE user_id=ANY($1::uuid[])",[[a,b]]);
    assert.equal(Number(balances.rows.find(row => row.user_id===a).coins),230);
    assert.equal(Number(balances.rows.find(row => row.user_id===b).coins),150);
    assert.equal(Number(balances.rows.find(row => row.user_id===c).coins),130);
    await client.query("SAVEPOINT relationship_conflict");
    await assert.rejects(
      client.query("INSERT INTO relationships(requester_id,addressee_id,status) VALUES($1,$2,'pending')",[a,c]),
      error => error.code === "23505"
    );
    await client.query("ROLLBACK TO SAVEPOINT relationship_conflict");
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

test.after(async () => {
  if (pool) await pool.end();
});
