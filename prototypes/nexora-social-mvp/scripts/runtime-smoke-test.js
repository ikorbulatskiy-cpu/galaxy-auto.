process.env.PGSSLMODE = process.env.PGSSLMODE || "disable";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const cookie = require("cookie");
const { pool } = require("../src/db");
const auth = require("../src/auth");
const { createEconomyRouter } = require("../src/economy");
const { createPlanetsRouter } = require("../src/planets");
const { createSocialRouter } = require("../src/social");
const { createProfileRouter } = require("../src/profile");
const { createDeveloperRouter } = require("../src/developer");
const { createAuthorityRouter } = require("../src/authority");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const io = {
  sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  to() { return { emit() {} }; }
};
const players = new Map();
let server;
let accountIds = [];

function mockResponse() {
  return {
    statusCode: 200, body: null, cookies: {}, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    clearCookie(name) { delete this.cookies[name]; return this; },
    cookie(name, value, options) { this.cookies[name] = value; this.cookieOptions = options; return this; },
    set(name, value) { this.headers[name] = value; return this; }
  };
}

async function registerAndLogin(nickname, ip) {
  const registration = mockResponse();
  await auth.register({ body: { nickname } }, registration);
  assert.equal(registration.statusCode, 201, "account registration succeeds");
  assert.ok(registration.body.recoveryCode, "registration returns a recovery code");
  const account = registration.body.account;
  const login = mockResponse();
  await auth.login({ body: { recoveryCode: registration.body.recoveryCode }, ip }, login);
  assert.equal(login.statusCode, 200, "recovery-code login succeeds");
  const token = login.cookies.nexora_session;
  assert.ok(token, "login issues an HTTP-only session cookie");
  const authenticated = await auth.authenticateToken(token);
  assert.equal(String(authenticated.id), String(account.id), "issued session authenticates the new account");
  return { account: authenticated, token };
}

async function run() {
  const suffix = Date.now().toString(36).slice(-10);
  const owner = await registerAndLogin(("CI" + suffix).slice(0, 18), "127.0.0.1");
  const target = await registerAndLogin(("CI2" + suffix).slice(0, 18), "127.0.0.2");
  const ownerId = String(owner.account.id);
  const targetId = String(target.account.id);
  accountIds = [ownerId, targetId];
  process.env.NEXORA_OWNER_ACCOUNT_ID = ownerId;

  await pool.query("UPDATE nexora_social_world.wallets SET balance=1000 WHERE account_id=$1", [ownerId]);

  const planet = await pool.query(
    "INSERT INTO nexora_social_world.custom_planets(owner_account_id,name) VALUES($1,$2) RETURNING id",
    [ownerId, "CI Planet " + suffix]
  );
  const planetId = String(planet.rows[0].id);
  await pool.query("INSERT INTO nexora_social_world.planet_members(planet_id,account_id) VALUES($1,$2)", [planetId, ownerId]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.cookies = cookie.parse(req.headers.cookie || ""); next(); });
  app.use("/api/economy", createEconomyRouter({ pool, auth, io }));
  app.use("/api/planets", createPlanetsRouter({ pool, auth, io, players }));
  app.use("/api/social", createSocialRouter({ pool, auth, io }));
  app.use("/api/profile", createProfileRouter({ pool, auth, io }));
  app.use("/api/developer", createDeveloperRouter({ pool, auth, players, planets: { starter: { name: "Стартовая" }, club: { name: "Клуб" }, beach: { name: "Пляж" } } }));
  app.use("/api/authority", createAuthorityRouter({ pool, auth, io, players }));
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
  const request = (path, token = owner.token, options = {}) => fetch(base + path, {
    ...options,
    headers: {
      cookie: "nexora_session=" + token,
      ...(options.headers || {})
    }
  });
  const json = async response => ({ status: response.status, body: await response.json() });

  let result = await json(await request("/api/economy/catalog"));
  assert.equal(result.status, 200, "shop catalog responds");
  assert.ok(result.body.items.some(item => item.code === "suit_neon_blue"), "shop catalog contains starter cosmetic");

  const requestId = "ci-purchase-" + suffix;
  result = await json(await request("/api/economy/purchase", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue", requestId })
  }));
  assert.equal(result.status, 200, "purchase succeeds");
  assert.equal(result.body.balance, "880", "purchase debits wallet once");

  result = await json(await request("/api/economy/purchase", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue", requestId })
  }));
  assert.equal(result.status, 200, "idempotent retry succeeds");
  assert.equal(result.body.replayed, true, "idempotent retry is recognized");

  result = await json(await request("/api/economy/inventory"));
  assert.equal(result.status, 200, "inventory responds");
  assert.ok(result.body.items.some(item => item.code === "suit_neon_blue"), "purchased item is persisted");

  result = await json(await request("/api/economy/equip", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "suit_neon_blue" })
  }));
  assert.equal(result.status, 200, "owned cosmetic can be equipped");
  assert.equal(result.body.avatar.suit, "#6d7cff", "equipped cosmetic updates character appearance");

  result = await json(await request("/api/economy/reports", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId: Number(targetId), category: "spam", details: "CI smoke report" })
  }));
  assert.equal(result.status, 201, "player report can be created");
  const reportId = result.body.report.id;

  result = await json(await request("/api/economy/reports", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId: Number(targetId), category: "spam", details: "duplicate CI smoke report" })
  }));
  assert.equal(result.status, 429, "duplicate report is throttled");

  result = await json(await request("/api/planets?q=CI", owner.token));
  assert.equal(result.status, 200, "custom planet catalog search executes against PostgreSQL");
  assert.ok(result.body.planets.some(item => item.id === planetId), "catalog returns the matching owned planet");

  result = await json(await request("/api/planets/" + planetId + "/objects", owner.token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ objects: [{ code: "tree", x: 0.25, y: 0.72, rotation: 0, scale: 1 }] })
  }));
  assert.equal(result.status, 200, "planet owner can save decoration");

  result = await json(await request("/api/planets/" + planetId + "/objects", owner.token));
  assert.equal(result.status, 200, "planet decoration can be loaded");
  assert.equal(result.body.objects.length, 1, "saved planet decoration is persisted");

  result = await json(await request("/api/profile", owner.token));
  assert.equal(result.status, 200, "profile endpoint responds");
  assert.equal(result.body.profile.koins, "880", "profile reflects the current Koins balance");

  result = await json(await request("/api/profile", owner.token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: "NEXORA CI",
      bio: "Profile integration test",
      avatar: { gender: "female", skin: "#c9875b", hair: "curly", suit: "#ef6c9b", outfit: "dress", hairColor: "#e5c07b", shoes: "sandals", accessory: "flower" }
    })
  }));
  assert.equal(result.status, 200, "profile and appearance can be updated");
  assert.equal(result.body.profile.avatar.accessory, "flower", "new accessory selection is persisted");
  assert.equal(result.body.profile.avatar.outfit, "dress", "outfit style is validated and persisted");
  assert.equal(result.body.profile.avatar.hair, "curly", "new hairstyle is validated and persisted");
  assert.equal(result.body.profile.avatar.shoes, "sandals", "new shoe style is validated and persisted");

  result = await json(await request("/api/social/requests", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId: Number(targetId) })
  }));
  assert.equal(result.status, 201, "friend request can be sent");
  const friendRequestId = result.body.requestId;

  result = await json(await request("/api/social/requests/" + friendRequestId + "/accept", target.token, { method: "POST" }));
  assert.equal(result.status, 200, "friend request can be accepted");

  result = await json(await request("/api/social/friends", owner.token));
  assert.equal(result.status, 200, "friends list responds");
  assert.ok(result.body.friends.some(friend => String(friend.id) === targetId), "accepted friend appears in both-way friend list");

  result = await json(await request("/api/social/conversations", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ peerId: Number(targetId) })
  }));
  assert.equal(result.status, 200, "friends can open a direct conversation");
  const conversationId = result.body.conversationId;

  result = await json(await request("/api/social/conversations/" + conversationId + "/messages", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "NEXORA CI direct message" })
  }));
  assert.equal(result.status, 201, "direct message can be sent");

  result = await json(await request("/api/social/conversations/" + conversationId + "/messages", target.token));
  assert.equal(result.status, 200, "recipient can load direct messages");
  assert.ok(result.body.messages.some(message => message.body === "NEXORA CI direct message"), "direct message is persisted");

  result = await json(await request("/api/social/notifications", target.token));
  assert.equal(result.status, 200, "social notifications respond");
  assert.ok(result.body.notifications.some(item => item.type === "friend_request"), "friend request notification is persisted");
  assert.ok(result.body.notifications.some(item => item.type === "direct_message"), "direct message notification is persisted");

  result = await json(await request("/api/social/notifications/read", target.token, { method: "POST" }));
  assert.equal(result.status, 200, "notifications can be marked as read");

  result = await json(await request("/api/social/blocks/" + ownerId, target.token, { method: "POST" }));
  assert.equal(result.status, 200, "user can block another account");

  result = await json(await request("/api/social/conversations/" + conversationId + "/messages", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body: "This message must be blocked" })
  }));
  assert.equal(result.status, 403, "blocked users cannot send direct messages");

  result = await json(await request("/api/social/friends", owner.token));
  assert.equal(result.status, 200, "friends list remains available after block");
  assert.equal(result.body.friends.length, 0, "blocking removes the friendship");

  result = await json(await request("/api/social/users?q=CI", owner.token));
  assert.equal(result.status, 200, "user search responds");
  assert.equal(result.body.users.length, 0, "blocked accounts are hidden from user search");

  result = await json(await request("/api/economy/transactions", owner.token));
  assert.equal(result.status, 200, "wallet history responds");
  assert.equal(result.body.transactions.length, 1, "purchase history contains one transaction");

  result = await json(await request("/api/developer/access", owner.token));
  assert.equal(result.status, 200, "owner developer access responds");
  assert.equal(result.body.role, "OWNER", "configured owner receives OWNER role");

  result = await json(await request("/api/developer/players", owner.token));
  assert.equal(result.status, 200, "developer player directory responds");
  assert.ok(result.body.players.some(player => String(player.id) === targetId), "developer can find a player");

  result = await json(await request("/api/developer/players/" + targetId, owner.token));
  assert.equal(result.status, 200, "developer can inspect a player");

  result = await json(await request("/api/developer/players/" + targetId + "/warn", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "CI moderation warning" })
  }));
  assert.equal(result.status, 201, "developer can issue a warning");

  result = await json(await request("/api/developer/players/" + targetId + "/ban", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "CI temporary ban", hours: 1 })
  }));
  assert.equal(result.status, 201, "developer can issue a temporary ban");
  assert.equal(await auth.authenticateToken(target.token), null, "active ban blocks session authentication");

  result = await json(await request("/api/developer/players/" + targetId + "/ban", owner.token, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "CI unban test" })
  }));
  assert.equal(result.status, 200, "developer can revoke a ban");
  assert.ok(await auth.authenticateToken(target.token), "unbanned account can authenticate again");

  result = await json(await request("/api/developer/reports/" + reportId, owner.token, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "reviewing" })
  }));
  assert.equal(result.status, 200, "developer can update a player report");

  result = await json(await request("/api/developer/moderation", owner.token));
  assert.equal(result.status, 200, "moderation queue responds");
  assert.ok(result.body.entries.some(entry => entry.action_type === "WARN"), "moderation queue includes warnings");
  assert.ok(result.body.reports.some(report => String(report.id) === String(reportId) && report.status === "reviewing"), "moderation queue reflects report status");

  result = await json(await request("/api/developer/audit", owner.token));
  assert.equal(result.status, 200, "developer audit log responds");
  assert.ok(result.body.entries.some(entry => entry.action === "player.ban"), "audit log records moderation actions");

  result = await json(await request("/api/developer/planets", owner.token));
  assert.equal(result.status, 200, "developer planet directory responds");
  assert.ok(result.body.planets.some(item => String(item.id) === planetId), "developer can find a custom planet");

  result = await json(await request("/api/developer/planets/" + planetId + "/action", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "hide", reason: "CI hide test" })
  }));
  assert.equal(result.status, 200, "developer can hide a custom planet");

  result = await json(await request("/api/developer/planets/" + planetId + "/action", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "restore", reason: "CI restore test" })
  }));
  assert.equal(result.status, 200, "developer can restore a custom planet");

  result = await json(await request("/api/authority", owner.token));
  assert.equal(result.status, 200, "authority status and rank catalog respond");
  assert.equal(result.body.current.titleKey, "NOVICE", "new account starts at NOVICE");

  result = await json(await request("/api/authority/admin/config", owner.token));
  assert.equal(result.status, 200, "owner can inspect rank configuration");

  result = await json(await request("/api/authority/admin/config/BEDA", owner.token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ koinsPrice: 100, minAuthority: 0, enabled: true })
  }));
  assert.equal(result.status, 200, "owner can configure rank price and requirements");

  const authorityRequestId = crypto.randomUUID();
  result = await json(await request("/api/authority/purchase", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ titleKey: "BEDA", requestId: authorityRequestId })
  }));
  assert.equal(result.status, 200, "player can purchase the next rank with Koins");
  assert.equal(result.body.current.titleKey, "BEDA", "rank purchase updates the character title");
  assert.equal(result.body.current.koins, "780", "rank purchase debits Koins");

  result = await json(await request("/api/authority/purchase", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ titleKey: "BEDA", requestId: authorityRequestId })
  }));
  assert.equal(result.status, 200, "rank purchase retry is idempotent");
  assert.equal(result.body.duplicate, true, "rank purchase retry does not charge twice");

  result = await json(await request("/api/authority/admin/assign", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId: targetId, titleKey: "ANGEL", auraEnabled: true, reason: "CI authority assignment" })
  }));
  assert.equal(result.status, 200, "owner can assign a rank and aura");

  result = await json(await request("/api/authority", target.token));
  assert.equal(result.status, 200, "target can view authority after assignment");
  assert.equal(result.body.current.titleKey, "ANGEL", "developer rank assignment is visible to the player");
  assert.equal(result.body.current.auraEnabled, true, "developer rank assignment enables its aura");

  result = await json(await request("/api/authority/admin/history/" + targetId, owner.token));
  assert.equal(result.status, 200, "owner can inspect authority history");
  assert.ok(result.body.history.some(entry => entry.new_title === "ANGEL"), "authority history records developer assignment");

  result = await json(await request("/api/authority/admin/remove/" + targetId, owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "CI authority removal" })
  }));
  assert.equal(result.status, 200, "owner can remove a rank");

  result = await json(await request("/api/authority", target.token));
  assert.equal(result.status, 200, "target can view authority after removal");
  assert.equal(result.body.current.titleKey, "NOVICE", "rank removal restores NOVICE");
  assert.equal(result.body.current.auraEnabled, false, "rank removal disables aura");

  result = await json(await request("/api/developer/roles", owner.token));
  assert.equal(result.status, 200, "owner can inspect developer roles");

  result = await json(await request("/api/developer/roles", owner.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId: targetId, role: "HELPER", permissions: ["players.view"], reason: "CI role assignment" })
  }));
  assert.equal(result.status, 200, "owner can assign a developer role");

  result = await json(await request("/api/developer/access", target.token));
  assert.equal(result.status, 200, "assigned helper can inspect access");
  assert.equal(result.body.role, "HELPER", "assigned developer role is applied");

  const wallet = await pool.query("SELECT balance::text FROM nexora_social_world.wallets WHERE account_id=$1", [ownerId]);
  assert.equal(wallet.rows[0].balance, "780", "database wallet balance matches shop and authority purchases");
  console.log("PASS NEXORA runtime smoke tests: registration, recovery login, profile, shop, idempotency, inventory, reports, planet search/decorations, friends, DMs, notifications, blocking and wallet history");
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
