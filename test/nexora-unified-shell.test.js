const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("public/index.html", "utf8");
const world = fs.readFileSync("public/nexora-world.js", "utf8");
const shell = fs.readFileSync("public/nexora-unified-shell.css", "utf8");

test("Galaxy is the authenticated home screen and loads the unified shell", () => {
  assert.match(html, /id="tab-world"/);
  assert.match(html, /nexora-unified-shell\.css\?v=1/);
  assert.match(html, /nexora-world\.js/);
});

test("Galaxy menu links to every existing dashboard feature", () => {
  for (const tab of [
    "profile", "characters", "discover", "friends", "messages",
    "notifications", "clans", "economy", "pets", "blogs",
    "relationships", "rankings", "admin"
  ]) {
    assert.ok(world.includes('data-open-tab="' + tab + '"'), "Missing menu entry: " + tab);
    assert.ok(html.includes('id="tab-' + tab + '"'), "Missing dashboard panel: " + tab);
  }
});

test("Social center is available from the Galaxy menu without a floating launcher", () => {
  assert.match(world, /id="nx-menu-social"/);
  assert.match(world, /NexoraGalaxySocial\.open\("friends"\)/);
  assert.match(html, /nexora-galaxy-social\.js/);
  assert.match(shell, /nx-galaxy-social-launcher\{display:none!important\}/);
});

test("Chat stays above the planet scene on desktop and mobile", () => {
  assert.match(shell, /grid-template-rows:[^;]*minmax\(205px,31dvh\) minmax\(230px,1fr\)/);
  assert.match(shell, /\.nx-chat-panel\{grid-row:2/);
  assert.match(shell, /\.nx-scene\{grid-row:3/);
  assert.match(shell, /@media\(max-width:600px\)/);
});

test("Administrative entry is role-gated", () => {
  assert.match(world, /id="nx-menu-admin" hidden/);
  assert.match(html, /galaxyAdmin\.hidden=!\["admin","developer","moderator"\]\.includes\(currentUser\.role\)/);
});
