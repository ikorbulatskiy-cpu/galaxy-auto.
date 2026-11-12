const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = name => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

test("9-character code-auth accounts can use realtime and social features without email", () => {
  for (const file of ["social.js", "features.js", "realtime.js"]) {
    assert.doesNotMatch(source(file), /email_verified_at\\s+IS\\s+NOT\\s+NULL/i,
      file + " must not gate code-authenticated accounts on email verification");
  }
});

test("social discovery and WebSocket still require an active authenticated account", () => {
  assert.match(source("social.js"), /u\\.status='active'/);
  assert.match(source("realtime.js"), /u\\.status='active'/);
  assert.match(source("realtime.js"), /s\\.token_hash=\\$1 AND s\\.expires_at>NOW\\(\\)/);
});
