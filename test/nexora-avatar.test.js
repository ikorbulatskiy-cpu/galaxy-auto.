const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "public/nexora-avatar.js"), "utf8");

test("layered avatar renderer exposes ordered independent visual layers", () => {
  const context = { window: {}, Event, Object, Array };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.NexoraAvatar.render, "function");
  assert.deepEqual(Array.from(context.window.NexoraAvatar.catalog.layers), ["background","shoes","body","neck","outfit","arms","face","eyes","expression","hair","headwear","accessories"]);
  const svg = context.window.NexoraAvatar.render({hair:"long",hairColor:"pink",outfit:"gold",shoes:"moon-boots"});
  for (const layer of ["background","shoes","body","neck","outfit","face","eyes","expression","hair","headwear","accessories","arms"]) {
    assert.match(svg, new RegExp('data-layer="'+layer+'"'));
  }
  assert.match(svg, /#ed72b2/);
  assert.match(svg, /#c99b3c/);
});

test("avatar renderer safely falls back for unknown appearance values", () => {
  const context = { window: {}, Event, Object, Array };
  vm.runInNewContext(source, context);
  const svg = context.window.NexoraAvatar.render({hair:"<script>",outfit:"invalid"});
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /<script>/);
});

test("avatar sprite library binds each appearance group to the existing form controls", () => {
  assert.match(source, /function mountLibrary\(host, form\)/);
  assert.match(source, /data-avatar-field/);
  assert.match(source, /dispatchEvent\(new Event\("change"/);
});
