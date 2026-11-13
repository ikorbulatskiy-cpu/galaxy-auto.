const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("NEXORA alignment stylesheet loads after legacy styles", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const design = html.indexOf('/nexora-design-system.css?v=4');
  const legacy = html.indexOf('/nexora-world-extras.css?v=4');
  assert.notEqual(design, -1);
  assert.notEqual(legacy, -1);
  assert.ok(design > legacy);
});

test("dashboard has consistent desktop and mobile button layouts", () => {
  const css = fs.readFileSync(path.join(root, "public/nexora-design-system.css"), "utf8");
  assert.match(css, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /\.nx-pane-close/);
  assert.match(css, /\.nx-social-bottom button\.active/);
});

test("mobile navigation uses the existing tab event handler, not a nonexistent global", () => {
  const js = fs.readFileSync(path.join(root, "public/nexora-social-sections.js"), "utf8");
  assert.match(js, /\.dashnav \[data-tab=/);
  assert.doesNotMatch(js, /window\.switchTab/);
  assert.match(js, /data-more-tab/);
});

test("secondary navigation does not expose hidden admin entry", () => {
  const js = fs.readFileSync(path.join(root, "public/nexora-social-sections.js"), "utf8");
  assert.match(js, /\?\.hidden\)return/);
});
