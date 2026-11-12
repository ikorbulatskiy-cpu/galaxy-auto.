const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("all primary dashboard tabs have matching content panes", () => {
  const html = read("public/index.html");
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  const panes = [...html.matchAll(/id="tab-([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(tabs)].sort(), [...new Set(panes)].sort());
  for (const tab of ["characters", "world", "clans", "economy", "pets", "blogs", "relationships", "rankings", "admin"]) {
    assert.ok(tabs.includes(tab), "missing dashboard tab: " + tab);
  }
});

test("game and social feature routes are mounted", () => {
  const server = read("server.js");
  const game = read("src/game.js");
  const features = read("src/features.js");
  assert.match(server, /app\.use\("\/api\/game", gameRouter\)/);
  assert.match(server, /app\.use\("\/api\/features", featuresRouter\)/);
  for (const route of ["/characters", "/planets", "/rooms"]) assert.ok(game.includes('router.get("' + route + '"'));
  for (const route of ["/clans", "/pets", "/blogs", "/relationships", "/achievements", "/admin/reports"]) {
    assert.ok(features.includes('router.get("' + route + '"') || features.includes('router.post("' + route + '"'), "missing feature route " + route);
  }
});

test("database migrations define the required game systems", () => {
  const world = read("database/migrations/002_game_world.sql");
  const systems = read("database/migrations/003_social_game_systems.sql");
  for (const table of ["characters", "rooms", "room_presence", "room_messages", "notifications"]) {
    assert.match(world, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\\\b"));
  }
  for (const table of ["avatar_items", "character_inventory", "clans", "clan_members", "wallet_transfers", "purchases", "gifts", "pets", "blog_posts", "blog_photos", "relationships", "achievements", "user_achievements", "mini_game_scores", "admin_logs"]) {
    assert.match(systems, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\\\b"));
  }
  assert.match(systems, /nexora_award_achievement/);
  assert.match(systems, /nexora_first_purchase_achievement/);
});

test("migration runner records each version before future runs", () => {
  const runner = read("scripts/migrate.js");
  assert.match(runner, /schema_migrations/);
  assert.match(runner, /002_game_world\.sql/);
  assert.match(runner, /003_social_game_systems\.sql/);
  assert.match(runner, /Already applied:/);
});

test("registration enforces adulthood and creates a starter wallet", () => {
  const auth = read("src/auth.js");
  assert.match(auth, /ageAtLeast18\(birthDate\)/);
  assert.match(auth, /INSERT INTO wallet_balances \(user_id,coins\) VALUES \(\$1,500\)/);
  assert.match(auth, /email_verified_at/);
});
