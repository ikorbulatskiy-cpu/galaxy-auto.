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
    assert.match(world, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\b"));
  }
  for (const table of ["avatar_items", "character_inventory", "clans", "clan_members", "wallet_transfers", "purchases", "gifts", "pets", "blog_posts", "blog_photos", "relationships", "achievements", "user_achievements", "mini_game_scores", "admin_logs"]) {
    assert.match(systems, new RegExp("CREATE TABLE IF NOT EXISTS " + table + "\\b"));
  }
  assert.match(systems, /nexora_award_achievement/);
  assert.match(systems, /nexora_first_purchase_achievement/);
  assert.match(systems, /CREATE TABLE IF NOT EXISTS wedding_ceremonies/);
  assert.match(systems, /nexora_check_relationship_exclusivity/);
  assert.match(systems, /nexora_wedding_achievement/);
  assert.match(systems, /last_cared_at/);
  assert.match(systems, /nexora_add_reputation/);
  assert.match(systems, /nexora_clan_member_progress/);
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
  assert.match(auth, /INSERT INTO characters \(user_id,name,is_active\)/);
  assert.match(auth, /INSERT INTO user_locations \(user_id,planet_id\)/);
  assert.match(auth, /email_verified_at/);
});


test("travel and visual item controls are wired to authenticated APIs", () => {
  const html = read("public/index.html");
  const world = read("src/world.js");
  const features = read("src/features.js");
  assert.match(html, /id="travel-planet"/);
  assert.match(html, /api\("\/api\/world\/travel"/);
  assert.match(world, /router\.post\("\/travel", requireSession/);
  assert.match(features, /router\.post\("\/shop\/buy"/);
  assert.match(features, /router\.post\("\/characters\/:characterId\/equip"/);
  assert.match(html, /id="gift-item-select"/);
  assert.match(html, /data-equip-item/);
});

test("moderation actions cannot be applied to the current admin account", () => {
  const features = read("src/features.js");
  const html = read("public/index.html");
  assert.match(features, /req\.user\.id===req\.params\.userId/);
  assert.match(features, /target\.rows\[0\]\.role==="developer"/);
  assert.match(html, /const searchForm=e\.currentTarget/);
  assert.doesNotMatch(html, /e\.currentTarget\.requestSubmit\(\)/);
});


test("dynamic dashboard lists bind handlers through the multi-element selector", () => {
  const html = read("public/index.html");
  assert.match(html, /\$\$=s=>\[\.\.\.document\.querySelectorAll\(s\)\]/);
  assert.doesNotMatch(html, /(?<!\$)\$\(\s*["\'][^)]*["\']\s*\)\.forEach/);
  assert.match(html, /\$\$\("\.tabpane"\)\.forEach/);
  assert.match(html, /\$\$\(\s*"\[data-room\]"\s*\)\.forEach/);
});


test("recipient lookup, wedding rewards and clan bank retries are wired", () => {
  const html = read("public/index.html");
  const features = read("src/features.js");
  const migration = read("database/migrations/003_social_game_systems.sql");
  assert.match(features, /router\.get\("\/recipients"/);
  assert.match(html, /data-recipient-select/);
  assert.match(features, /nexora-wedding-ring/);
  assert.match(features, /idempotencyKey:idempotency/);
  assert.match(migration, /clan_transactions_idempotency_idx/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS idempotency_key UUID/);
});


test("avatar editor renders a safe layered 2D preview and persists selectable appearance", () => {
  const html = read("public/index.html");
  const game = read("src/game.js");
  assert.match(html, /id="character-avatar-preview"/);
  assert.match(html, /class="avatar-svg"/);
  assert.match(html, /name="skinTone"/);
  assert.match(html, /await loadAvatarPreview\(\)/);
  assert.match(game, /skinTone: z\.string\(\)\.max\(24\)\.optional\(\)/);
});


test("production HTTP security is configured without trusting arbitrary proxies", () => {
  const server = read("server.js");
  assert.match(server, /TRUST_PROXY_HOPS/);
  assert.match(server, /app\\.set\\("trust proxy", proxyHops \\? Number\\(proxyHops\\) : false\\)/);
  assert.match(server, /contentSecurityPolicy:/);
  assert.match(server, /frameAncestors: \["'none'"\]/);
  assert.match(server, /sec-fetch-site/);
});

test("realtime events are distributed through PostgreSQL notifications", () => {
  const realtime = read("src/realtime.js");
  assert.match(realtime, /LISTEN nexora_room_events/);
  assert.match(realtime, /pg_notify\('nexora_room_events'/);
  assert.match(realtime, /notification\)/);
  assert.match(realtime, /DELETE FROM room_presence WHERE connected_at < NOW\(\) - INTERVAL '2 minutes'/);
  assert.match(realtime, /action: "joined"/);
  assert.match(realtime, /action: "left"/);
});


test("media uploads use authenticated presigned object-storage operations", () => {
  const server = read("server.js");
  const media = read("src/media.js");
  const migration = read("database/migrations/004_media_assets.sql");
  assert.match(server, /app\.use\("\/api\/media", mediaRouter\)/);
  assert.match(media, /router\.use\(requireSession\)/);
  assert.match(media, /getSignedUrl/);
  assert.match(media, /HeadObjectCommand/);
  assert.match(media, /ContentLength !== parsed\.data\.size/);
  assert.match(media, /expectedPrefix/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS media_assets/);
  assert.match(migration, /byte_size BIGINT NOT NULL CHECK/);
});
