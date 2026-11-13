const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const cookie = require("cookie");
const { Pool } = require("pg");
const { createEconomyRouter } = require("../src/economy");
const { createPlanetsRouter } = require("../src/planets");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const io = {
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  to() { return { emit() {} }; }
};
const players = new Map();
const sessionToken = "nexora-ci-smoke-session";
let server;
let accountIds = [];

async function run() {
  const suffix = Date.now().toString(36).slice(-10);
  const ownerNickname = ("CI" + suffix).slice(0, 18);
  const targetNickname = ("CI2" + suffix).slice(0, 18);
  const ownerHash = crypto.createHash("sha256").update("owner:" + suffix).digest("hex");
  const targetHash = crypto.createHash("sha256").update("target:" + suffix).digest("hex");

  const owner = await pool.query(
    "INSERT INTO nexora_social_world.accounts (nickname,nickname_normalized,recovery_code_hash,recovery_code_lookup_hash) VALUES($1,$2,'ci-test-hash',$3) RETURNING id,nickname",
    [ownerNickname, ownerNickname.toLowerCase(), ownerHash]
  );
  const target = await pool.query(
    "INSERT INTO nexora_social_world.accounts (nickname,nickname_normalized,recovery_code_hash,recovery_code_lookup_hash) VALUES($1,$2,'ci-test-hash',$3) RETURNING id,nickname",
    [targetNickname, targetNickname.toLowerCase(), targetHash]
  );
  const ownerId = String(owner.rows[0].id);
  const targetId = String(target.rows[0].id);
  accountIds = [ownerId, targetId];

  await pool.query("INSERT INTO nexora_social_world.characters(account_id,nickname,avatar) VALUES($1,$2,'{}'::jsonb)", [ownerId, ownerNickname]);
  await pool.query("INSERT INTO nexora_social_world.characters(account_id,nickname,avatar) VALUES($1,$2,'{}'::jsonb)", [targetId, targetNickname]);
  await pool.query("INSERT INTO nexora_social_world.wallets(account_id,balance) VALUES($1,1000)", [ownerId]);

  const planet = await pool.query(
    "INSERT INTO nexora_social_world.custom_planets(owner_account_id,name) VALUES($1,$2) RETURNING id",
    [ownerId, "CI Planet " + suffix]
  );
  const planetId = String(planet.rows[0].id);
  await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2)", [planetId, ownerId]);

  const auth = {
    async authenticateToken(token) {
      return token === sessionToken ? { id: ownerId, nickname: ownerNickname } : null;
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.cookies = cookie.parse(req.headers.cookie || "");
    next();
  });
  app.use("/api/economy", createEconomyRouter({ pool, auth, io }));
  app.use("/api/planets", createPlanetsRouter({ pool, auth, io, players }));
  app.use((error, _req, res, _next) => {
    console.error("Smoke-test API error:", error);
    res.status(500).json({ error: "Smoke-test API error" });
  });

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (path, options = {}) => fetch(base + path, {
    ...options,
    headers: {
      cookie: "nexora_session=" + sessionToken,
      ...(options.headers || {})
    }
  });
  const json = async response => ({ status: response.status, body: await response.json() });

  let result = await json(await request("/api/economy/catalog"));
  assert.equal(result.status, 200, "shop catalog responds");
  assert.ok(result.body.items.some(item => item.code === "suit_neon_blue"), "shop catalog contains starter cosmetic");

  const requestId = "ci-purchase-" + suffix;
  result = await json(await request("/api/economy/purchase", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue", requestId })
  }));
  assert.equal(result.status, 200, "purchase succeeds");
  assert.equal(result.body.balance, "880", "purchase debits wallet once");

  result = await json(await request("/api/economy/purchase", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue", requestId })
  }));
  assert.equal(result.status, 200, "idempotent retry succeeds");
  assert.equal(result.body.replayed, true, "idempotent retry is recognized");

  result = await json(await request("/api/economy/inventory"));
  assert.equal(result.status, 200, "inventory responds");
  assert.ok(result.body.items.some(item => item.code === "suit_neon_blue"), "purchased item is persisted");

  result = await json(await request("/api/economy/equip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue" })
  }));
  assert.equal(result.status, 200, "owned cosmetic can be equipped");
  assert.equal(result.body.avatar.suit, "#6d7cff", "equipped cosmetic updates character appearance");

  result = await json(await request("/api/economy/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId: Number(targetId), category: "spam", details: "CI smoke report" })
  }));
  assert.equal(result.status, 201, "player report can be created");

  result = await json(await request("/api/economy/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId: Number(targetId), category: "spam", details: "duplicate CI smoke report" })
  }));
  assert.equal(result.status, 429, "duplicate report is throttled");

  result = await json(await request("/api/planets?q=CI"));
  assert.equal(result.status, 200, "custom planet catalog search executes against PostgreSQL");
  assert.ok(result.body.planets.some(item => item.id === planetId), "catalog returns the matching owned planet");

  result = await json(await request("/api/planets/" + planetId + "/objects", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objects: [{ code: "tree", x: 0.25, y: 0.72, rotation: 0, scale: 1 }] })
  }));
  assert.equal(result.status, 200, "planet owner can save decoration");

  result = await json(await request("/api/planets/" + planetId + "/objects"));
  assert.equal(result.status, 200, "planet decoration can be loaded");
  assert.equal(result.body.objects.length, 1, "saved planet decoration is persisted");

  result = await json(await request("/api/economy/transactions"));
  assert.equal(result.status, 200, "wallet history responds");
  assert.equal(result.body.transactions.length, 1, "purchase history contains one transaction");

  const wallet = await pool.query("SELECT balance::text FROM nexora_social_world.wallets WHERE account_id=$1", [ownerId]);
  assert.equal(wallet.rows[0].balance, "880", "database wallet balance matches purchase history");
  console.log("PASS NEXORA API runtime smoke tests: catalog, purchase, idempotency, inventory, equip, reports, planet search, decorations and wallet history");
}

(async () => {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (accountIds.length) await pool.query(
      "DELETE FROM nexora_social_world.accounts WHERE id = ANY($1::bigint[])",
      [accountIds]
    ).catch(error => console.error("Smoke-test cleanup failed:", error.message));
    await pool.end();
  }
})();
