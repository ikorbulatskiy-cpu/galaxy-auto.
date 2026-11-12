const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("2D world client parses and mounts its game screen", () => {
  const client = read("public/nexora-world.js");
  assert.doesNotThrow(() => new vm.Script(client));
  for (const selector of ["nx-room-select", "nx-events-panel", "nx-event-list", "nx-avatars", "nx-player-list", "nx-chat-log", "nx-bottom-nav"]) {
    assert.ok(client.includes(selector), "missing game-screen element " + selector);
  }
});

test("room switching uses the authenticated room API and WebSocket", () => {
  const client = read("public/nexora-world.js");
  assert.match(client, /\/api\/game\/rooms\?planet=/);
  assert.match(client, /roomSelect\.onchange/);
  assert.match(client, /type:"join_room"/);
  assert.match(client, /type:"room_message"/);
  assert.match(client, /\/api\/game\/rooms\/"\+room\.id\+"\/presence/);
});

test("event feed renders untrusted event text as text, not HTML", () => {
  const client = read("public/nexora-world.js");
  assert.match(client, /function addEvent\(message,kind="info"\)/);
  assert.match(client, /body\.textContent=message/);
  assert.match(client, /while\(box\.children\.length>18\)/);
});

test("mobile and desktop styles include room and event controls", () => {
  const css = read("public/nexora-world.css");
  assert.match(css, /\.nx-room-select/);
  assert.match(css, /\.nx-events-panel/);
  assert.match(css, /@media\(max-width:700px\)/);
});

test("room WebSocket reconnects with backoff and restores room state", () => {
  const client = read("public/nexora-world.js");
  assert.match(client, /function connectRoomSocket\(room,generation\)/);
  assert.match(client, /reconnectTimer=setTimeout/);
  assert.match(client, /Math\.min\(30000,1000\*Math\.pow\(2,/);
  assert.match(client, /refreshRoomSnapshot\(room,generation\)/);
  assert.match(client, /joinGeneration\+\+/);
});

test("realtime WebSocket uses protocol ping/pong to keep presence alive", () => {
  const realtime = read("src/realtime.js");
  assert.match(realtime, /socket\.ping\(\)/);
  assert.match(realtime, /socket\.on\("pong"/);
  assert.match(realtime, /socket\.terminate\(\)/);
  assert.match(realtime, /Realtime socket closed:/);
});

test("room join waits for the authenticated WebSocket ready packet", () => {
  const client = read("public/nexora-world.js");
  assert.match(client, /if\(packet\.type==="ready"\)[\s\S]*?ws\.send\(JSON\.stringify\(\{type:"join_room",roomId:room\.id\}\)\)/);
  assert.match(client, /Authentication handshake timeout/);
  assert.match(client, /\},20000\)/);
  assert.match(client, /за 20 секунд/);
  assert.match(client, /event\.code/);
  const realtime = read("src/realtime.js");
  assert.match(realtime, /Realtime socket authenticated:/);
  assert.match(realtime, /durationMs: Date\.now\(\) - authStartedAt/);
  assert.match(realtime, /disconnectedDuringAuth \|\| socket\.readyState !== 1/);
});
