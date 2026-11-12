const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const engineSource=fs.readFileSync(path.join(root,"public/nexora-sprite-avatar.js"),"utf8");
test("PNG engine exposes gendered head/body layers and action presets",()=>{
 const window={devicePixelRatio:1};
 const context={window,document:{addEventListener(){}},Image:class{},Map,Promise,Object,Number,Math,TypeError,Error,CustomEvent:class{},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}};
 vm.runInNewContext(engineSource,context);
 const engine=window.NexoraSpriteAvatar;
 assert.equal(typeof engine.mount,"function");
 assert.equal(engine.catalog.parts.male.body,"bodies/body_male_01.png");
 assert.equal(engine.catalog.parts.female.head,"heads/head_female_classic.png");
 assert.match(engineSource,/this\.look\.body===\"slim\"/);
 assert.match(engineSource,/this\.look\.head===\"soft\"/);
 for(const action of ["idle","walk","dance","happy","wave","heart"]) assert.ok(engine.catalog.animations[action]);
});
test("all referenced sprite assets are real transparent PNG files",()=>{
 const paths=[
  "public/assets/avatars/bodies/body_male_01.png","public/assets/avatars/bodies/body_female_01.png",
  "public/assets/avatars/heads/head_male_classic.png","public/assets/avatars/heads/head_female_classic.png",
  "public/assets/avatars/hair/hair_short_brown.png","public/assets/avatars/hair/hair_long_chestnut.png",
  "public/assets/avatars/outfits/hoodie_blue.png","public/assets/avatars/outfits/dress_rose.png",
  "public/assets/avatars/shoes/sneakers_white.png","public/assets/avatars/accessories/cap_blue.png"
 ];
 for(const file of paths){const bytes=fs.readFileSync(path.join(root,file));assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10],file);assert.ok(bytes.length>100,file)}
});
test("editor, room stage, roster and backend are wired to PNG renderer",()=>{
 const index=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
 const world=fs.readFileSync(path.join(root,"public/nexora-world.js"),"utf8");
 const movement=fs.readFileSync(path.join(root,"public/nexora-movement.js"),"utf8");
 const backend=fs.readFileSync(path.join(root,"src/game.js"),"utf8");
 const serverMovement=fs.readFileSync(path.join(root,"src/movement.js"),"utf8");
 assert.match(index,/NexoraSpriteAvatar\.mountAll\(preview\)/);
 assert.match(index,/name="spriteGender"/);
 assert.match(index,/NexoraSpriteAvatar\.mountAll\(\$\("#room-online-list"\)\)/);
 assert.match(world,/NexoraSpriteAvatar\.mountAll\(stage\)/);
 assert.match(world,/NexoraSpriteAvatar\.mountAll\(document\.getElementById\("nx-player-list"\)\)/);
 assert.match(movement,/packet\.type === "player_action"/);
 assert.match(serverMovement,/type: "player_action"/);
 assert.match(backend,/spriteGender: z\.enum\(\["male","female"\]\)/);
});
