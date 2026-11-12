const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("character editor loads the layered renderer before game clients", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  assert.ok(html.indexOf('/nexora-avatar.js') < html.indexOf('/nexora-world.js'));
  assert.match(html, /id="avatar-layer-library"/);
  assert.match(html, /NexoraAvatar\.mountLibrary/);
  assert.match(html, /NexoraAvatar\.render\(look,equipped,"full"\)/);
});

test("multiplayer player avatars use the shared renderer", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const world = fs.readFileSync(path.join(root, "public/nexora-world.js"), "utf8");
  assert.match(html, /function roomAvatarSvg\(look=\{\}\) \{return window\.NexoraAvatar/);
  assert.match(world, /function avatar\(look=\{\},mini=false\)\{return window\.NexoraAvatar/);
});

test("layered avatar stylesheet is loaded", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "public/nexora-avatar.css"), "utf8");
  assert.match(html, /nexora-avatar\.css/);
  assert.match(css, /\.nx-sprite-choice\.active/);
  assert.match(css, /#avatar-layer-library/);
});
