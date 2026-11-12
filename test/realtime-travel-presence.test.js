const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("travelling publishes committed room departures to every realtime instance", () => {
  const world = read("src/world.js");
  assert.match(world, /DELETE FROM room_presence WHERE user_id=\$1 RETURNING room_id/);
  assert.match(world, /pg_notify\('nexora_room_events'/);
  assert.match(world, /action: "left", roomId, userId: req\.user\.id/);
  assert.ok(world.indexOf("pg_notify('nexora_room_events'") < world.indexOf('await client.query("COMMIT")'));
});

test("realtime removes the correct local sockets when presence ends", () => {
  const realtime = read("src/realtime.js");
  assert.match(realtime, /const removeLocalPresence = event =>/);
  assert.match(realtime, /peer\.connectionId === event\.connectionId/);
  assert.match(realtime, /peer\.userId === event\.userId/);
  assert.match(realtime, /socket\.connectionId = connectionId/);
  assert.match(realtime, /removeLocalPresence\(event\)/);
});

test("disconnect and stale cleanup events identify individual connections", () => {
  const realtime = read("src/realtime.js");
  assert.match(realtime, /RETURNING room_id,user_id,connection_id/);
  assert.match(realtime, /connectionId: removed\.rows\[0\]\.connection_id/);
  assert.match(realtime, /connectionId: row\.connection_id/);
});
