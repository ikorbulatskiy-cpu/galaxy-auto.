const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("NEXORA design system is loaded after legacy visual layers", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const design = html.indexOf('/nexora-design-system.css?v=');
  const legacy = html.indexOf('/nexora-world-extras.css?v=');
  assert.notEqual(design, -1, "design system stylesheet must be linked");
  assert.notEqual(legacy, -1, "existing world styles must remain linked");
  assert.ok(design > legacy, "design system must load after legacy styles");
});

test("design system keeps the 2D room isolated and provides desktop and mobile layouts", () => {
  const css = fs.readFileSync(path.join(root, "public/nexora-design-system.css"), "utf8");
  assert.match(css, /--nx-bg:/);
  assert.match(css, /@media\s*\(min-width:\s*761px\)/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /#dashboard:has\(#tab-world:not\(\.hidden\)\)/);
  assert.match(css, /#tab-world/);
});

test("mobile navigation exposes secondary sections without replacing existing tab actions", () => {
  const js = fs.readFileSync(path.join(root, "public/nexora-social-sections.js"), "utf8");
  assert.match(js, /data-more-tab/);
  assert.match(js, /dashnav \[data-tab=/);
  for (const section of ["discover", "characters", "notifications", "clans", "economy", "pets", "blogs", "relationships", "rankings", "admin"]) {
    assert.ok(js.includes('"'+section+'"'), "missing secondary section: " + section);
  }
});
