const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"public/nexora-sprite-avatar.js"),"utf8");
test("PNG sprite engine exposes independent parts and animation presets",()=>{
 const window={devicePixelRatio:1};
 const context={window,Image:class{},Map,Promise,Object,Number,Math,TypeError,Error,CustomEvent:class{},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}};
 vm.runInNewContext(source,context);
 const engine=window.NexoraSpriteAvatar;
 assert.equal(typeof engine.create,"function");
 assert.deepEqual(Array.from(engine.catalog.parts.heads),["heads/head-01.png","heads/head-02.png","heads/head-03.png"]);
 assert.equal(engine.catalog.animations.walk.frames,8);
 assert.equal(engine.catalog.animations.dance.frames,8);
});
test("PNG sprite engine composites head and body as separate ordered layers",()=>{
 assert.match(source,/order:\["shoes","body","outfit","head","hair","accessories"\]/);
 assert.match(source,/this\.look\[key\]/);
 assert.match(source,/setLook\(look=\{\}\)/);
 assert.match(source,/setDirection\(direction\)/);
});
test("sprite engine handles missing artwork and caps device pixel ratio",()=>{
 assert.match(source,/cache\.delete\(src\)/);
 assert.match(source,/dispatchEvent\(new CustomEvent\("spriteerror"/);
 assert.match(source,/Math\.min\(window\.devicePixelRatio\|\|1,2\)/);
});
