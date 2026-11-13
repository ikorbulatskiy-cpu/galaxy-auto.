const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("invisible preference is applied to room presence snapshots and online counters", () => {
  const game = read("src/game.js");
  const realtime = read("src/realtime.js");
  assert.match(game, /galaxy_preferences gp WHERE gp\.user_id=rp\.user_id AND gp\.invisible=TRUE/);
  assert.match(realtime, /COALESCE\(gp\.invisible,FALSE\) AS invisible/);
  assert.match(realtime, /socket\.isInvisible = Boolean\(user\.invisible\)/);
  assert.match(realtime, /if \(!socket\.isInvisible\) publish\(\{ type: "presence", action: "joined"/);
  assert.match(realtime, /if \(removed\.rowCount && !socket\.isInvisible\) publish\(\{ type: "presence", action: "left"/);
});

test("changing Galaxy preferences reconnects the room using fresh server-side settings", () => {
  const socialUi = read("public/nexora-galaxy-social.js");
  const worldUi = read("public/nexora-world.js");
  assert.match(socialUi, /nexora:galaxy-preferences/);
  assert.match(worldUi, /window\.addEventListener\("nexora:galaxy-preferences"/);
  assert.match(worldUi, /const room=rooms\.find\(item=>item\.id===activeRoom\)/);
  assert.match(worldUi, /socket\?\.readyState===WebSocket\.OPEN\)join\(room\)/);
  assert.match(worldUi, /galaxyPrefs=\{\.\.\.galaxyPrefs,\.\.\.\(event\.detail\|\|\{\}\)\}/);
});

test("recipient friends-only preference is enforced when sending an existing DM", () => {
  const social = read("src/social.js");
  assert.match(social, /SELECT COALESCE\(\(SELECT friends_only_messages FROM galaxy_preferences WHERE user_id=\$1\),TRUE\) AS friends_only_messages/);
  assert.match(social, /recipientPreferences\.rows\[0\]\.friends_only_messages && !await areFriends\(pool, req\.user\.id, otherId\)/);
});
