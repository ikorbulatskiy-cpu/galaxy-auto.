const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidPosition, isWithinMovementSpeed } = require("../src/movement");

test("movement coordinates stay inside the 2D room bounds", () => {
  assert.equal(isValidPosition(2, 8), true);
  assert.equal(isValidPosition(98, 92), true);
  assert.equal(isValidPosition(1.99, 50), false);
  assert.equal(isValidPosition(50, 92.01), false);
  assert.equal(isValidPosition(Number.NaN, 40), false);
});

test("movement speed is bounded by elapsed server time", () => {
  assert.equal(isWithinMovementSpeed(50, 50, 54, 50, 100), true);
  assert.equal(isWithinMovementSpeed(50, 50, 60, 50, 100), false);
  assert.equal(isWithinMovementSpeed(50, 50, 54, 50, 0), true);
});


test("movement WebSocket waits for readiness and has a server heartbeat", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const client = fs.readFileSync(path.join(__dirname, "..", "public/nexora-movement.js"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "src/movement.js"), "utf8");
  assert.match(client, /packet\.type === "ready"/);
  assert.match(client, /Movement join acknowledgement timeout/);
  assert.match(server, /socket\.on\("pong"/);
  assert.match(server, /socket\.ping\(\)/);
});
