const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("classic NEXORA skin is loaded after the existing world stylesheet", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const world = html.indexOf('/nexora-world.css?v=');
  const classic = html.indexOf('/nexora-classic.css?v=');
  assert.notEqual(world, -1, "existing world stylesheet must remain linked");
  assert.notEqual(classic, -1, "classic stylesheet must be linked");
  assert.ok(classic > world, "classic overrides must load after the world stylesheet");
});

test("classic NEXORA assets exist and use the project's own flat 2D background", () => {
  const css = fs.readFileSync(path.join(root, "public/nexora-classic.css"), "utf8");
  const svg = fs.readFileSync(path.join(root, "public/assets/nexora-classic-space.svg"), "utf8");
  assert.match(css, /nexora-classic-space\.svg/);
  assert.match(svg, /<svg[\s>]/);
  assert.match(svg, /viewBox="0 0 1600 900"/);
});
