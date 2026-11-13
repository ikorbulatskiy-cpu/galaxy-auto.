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
  assert.match(runner, /004_media_assets\.sql/);
  assert.match(runner, /Already applied:/);
});

test("passwordless registration requires adult confirmation and creates a starter character", () => {
  const auth = read("src/auth.js");
  assert.match(auth, /adultConfirmed: z\.literal\(true\)/);
  assert.match(auth, /hashToken\(normalizeCharacterCode\(characterCode\)\)/);
  assert.match(auth, /INSERT INTO wallet_balances \(user_id,coins\) VALUES \(\$1,500\)/);
  assert.match(auth, /INSERT INTO characters \(user_id,name,gender,appearance,is_active\)/);
  assert.match(auth, /INSERT INTO user_locations \(user_id,planet_id\)/);
  assert.match(auth, /character_code_hash/);
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
  assert.match(html, /\$\$\("#dashboard \.tabpane"\)\.forEach/);
  assert.match(html, /\$\$\(\s*"\[data-room\]"\s*\)\.forEach/);
});


test("recipient lookup, wedding rewards and clan bank retries are wired", () => {
  const html = read("public/index.html");
  const features = read("src/features.js");
  const migration = read("database/migrations/003_social_game_systems.sql");
  assert.match(features, /router\.get\("\/recipients"/);
  assert.match(features, /router\.get\("\/wallet\/ledger"/);
  assert.match(html, /id="wallet-ledger"/);
  assert.match(features, /visibility!=="public"/);
  assert.match(features, /FROM media_assets WHERE owner_user_id/);
  assert.match(html, /data-recipient-select/);
  assert.match(features, /nexora-wedding-ring/);
  assert.match(features, /idempotencyKey:idempotency/);
  assert.match(migration, /clan_transactions_idempotency_idx/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS idempotency_key UUID/);
});


test("avatar editor renders a safe layered 2D preview and persists selectable appearance", () => {
  const html = read("public/index.html");
  const avatar = read("public/nexora-avatar.js");
  const game = read("src/game.js");
  assert.match(html, /id="character-avatar-preview"/);
  assert.match(avatar, /class="avatar-svg"/);
  assert.match(html, /name="skinTone"/);
  assert.match(html, /await loadAvatarPreview\(\)/);
  assert.match(game, /skinTone: z\.string\(\)\.max\(24\)\.optional\(\)/);
});


test("production HTTP security is configured without trusting arbitrary proxies", () => {
  const server = read("server.js");
  assert.match(server, /TRUST_PROXY_HOPS/);
  assert.match(server, /app\.set\("trust proxy", proxyHops \? Number\(proxyHops\) : 1\)/);
  assert.match(server, /TRUST_PROXY_HOPS must be a non-negative integer/);
  assert.match(server, /contentSecurityPolicy:/);
  assert.match(server, /frameAncestors: \["'none'"\]/);
  assert.match(server, /sec-fetch-site/);
});

test("realtime events are distributed through PostgreSQL notifications", () => {
  const realtime = read("src/realtime.js");
  const html = read("public/index.html");
  assert.match(html, /roomReconnectAttempts/);
  assert.match(html, /roomReconnectTimer=setTimeout/);
  assert.match(html, /room-online-list/);
  assert.match(realtime, /scheduleReconnect/);
  const game = read("src/game.js");
  assert.match(game, /router\.get\("\/rooms\/:roomId\/presence"/);
  assert.match(realtime, /LISTEN nexora_room_events/);
  assert.match(realtime, /pg_notify\('nexora_room_events'/);
  assert.match(realtime, /on\("notification", handleNotification\)/);
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
  assert.match(media, /CopyObjectCommand/);
  assert.match(media, /staging\/users/);
  assert.match(media, /router\.get\("\/:assetId"/);
  assert.match(media, /GetObjectCommand/);
  assert.match(media, /b\.visibility=/);
  assert.match(media, /FROM blocks bl/);
  assert.match(media, /ResponseCacheControl/);
  assert.match(media, /ContentLength !== parsed\.data\.size/);
  assert.match(media, /expectedPrefix/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS media_assets/);
  assert.match(migration, /byte_size BIGINT NOT NULL CHECK/);
});


test("admin dashboard exposes operational metrics and catalog image assets", () => {
  const features = read("src/features.js");
  const html = read("public/index.html");
  assert.match(features, /router\.get\("\/admin\/overview",adminOnly/);
  assert.match(html, /id="load-admin-overview"/);
  assert.match(html, /\/api\/features\/admin\/overview/);
  assert.match(html, /i\.asset_url\?/);
  assert.match(html, /x\.asset_url\?/);
});


test("photo uploads are authenticated, size-limited and signature-checked", () => {
  const server = read("server.js");
  const media = read("src/media.js");
  const html = read("public/index.html");
  const migration = read("database/migrations/004_media_assets.sql");
  assert.match(server, /app\.use\("\/api\/media", mediaRouter\)/);
  assert.match(server, /mediaUploadOrigin/);
  assert.match(media, /router\.use\(requireSession\)/);
  assert.match(media, /maxBytes = 8 \* 1024 \* 1024/);
  assert.match(media, /matchesImageSignature/);
  assert.match(media, /uploadLimiter/);
  assert.match(media, /HeadObjectCommand/);
  assert.match(html, /name="photoFiles"/);
  assert.match(html, /uploadPhotoToNexora/);
  assert.match(html, /normalizePhotoForUpload/);
  assert.match(html, /image\/heic/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS media_assets/);
});

test("registration keeps the form reference and sends explicit 18+ confirmation", () => {
  const html = read("public/index.html");
  const handler = html.slice(html.indexOf('$("#auth-form").addEventListener("submit"'), html.indexOf("async function loadApp"));
  assert.match(handler, /const form=e\.currentTarget/);
  assert.match(handler, /form\.reset\(\)/);
  assert.doesNotMatch(handler, /e\.currentTarget\.reset/);
  assert.match(handler, /adultConfirmed:f\.get\("adultConfirmed"\)==="yes"/);
  assert.match(html, /name="adultConfirmed"/);
});


test("avatar editor supports live 2D customization and motion controls", () => {
  const html = read("public/index.html");
  const avatar = read("public/nexora-avatar.js");
  const game = read("src/game.js");
  const motion = read("public/avatar-motion.js");
  const css = read("public/avatar-motion.css");
  for (const field of ["body","head","skinTone","hair","hairColor","eyes","eyeStyle","expression","outfit","shoes"]) {
    assert.match(html, new RegExp('name="' + field + '"'));
  }
  assert.match(html, /loadAvatarPreview\(draft\)/);
  assert.match(avatar, /look\.eyeStyle==="wide"/);
  assert.match(avatar, /nexora-star-glasses/);
  assert.match(html, /function renderCatalogItemArt/);
  assert.match(html, /function roomAvatarSvg/);
  assert.match(html, /roomAvatarSvg\(u\.character_appearance\|\|\{\}\)/);
  assert.match(game, /c\.appearance AS character_appearance/);
  assert.match(game, /eyeStyle: z\.enum/);
  assert.match(motion, /nx-motion-dance/);
  assert.match(css, /@keyframes nxDance/);
});
