/* NEXORA layered PNG avatar renderer. Legacy SVG remains available as fallback. */
(()=> {
 "use strict";
 const ROOT="/assets/avatars/";
 const PARTS={
  male:{body:"bodies/body_male_01.png",head:"heads/head_male_classic.png",hair:"hair/hair_short_brown.png",outfit:"outfits/hoodie_blue.png",shoes:"shoes/sneakers_white.png"},
  female:{body:"bodies/body_female_01.png",head:"heads/head_female_classic.png",hair:"hair/hair_long_chestnut.png",outfit:"outfits/dress_rose.png",shoes:"shoes/sneakers_white.png"}
 };
 const ACCESSORIES={cap:"accessories/cap_blue.png"};
 const ANIMATIONS=Object.freeze({idle:{frames:4,fps:4},walk:{frames:8,fps:12},dance:{frames:8,fps:10},happy:{frames:6,fps:8},wave:{frames:6,fps:8},heart:{frames:6,fps:8}});
 const cache=new Map(),instances=new WeakMap();
 function loadImage(src){
  if(cache.has(src))return cache.get(src);
  const promise=new Promise((resolve,reject)=>{const img=new Image();img.decoding="async";img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("PNG sprite missing: "+src));img.src=src});
  cache.set(src,promise);promise.catch(()=>cache.delete(src));return promise;
 }
 function resolveLook(look={}){
  const gender=look.spriteGender==="female"?"female":"male",base=PARTS[gender];
  const hair=look.hair==="long"?"hair/hair_long_chestnut.png":"hair/hair_short_brown.png";
  const outfit=look.outfit==="pink"||look.outfit==="rose"?"outfits/dress_rose.png":"outfits/hoodie_blue.png";
  const accessory=Array.isArray(look.accessories)?look.accessories:typeof look.accessories==="string"?look.accessories.split(","):[];
  return {body:ROOT+(look.spriteBody||base.body),head:ROOT+(look.spriteHead||base.head),hair:ROOT+(look.spriteHair||hair),outfit:ROOT+(look.spriteOutfit||outfit),shoes:ROOT+(look.spriteShoes||base.shoes),accessories:accessory.includes("cap")?ROOT+ACCESSORIES.cap:null};
 }
 class SpriteAvatar{
  constructor(canvas,options={}){
   if(!canvas||typeof canvas.getContext!=="function")throw new TypeError("Canvas required");
   this.canvas=canvas;this.ctx=canvas.getContext("2d");if(!this.ctx)throw new Error("Canvas 2D unavailable");
   this.width=options.width||128;this.height=options.height||192;this.dpr=Math.min(window.devicePixelRatio||1,2);
   this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
   this.canvas.style.width=(options.cssWidth||this.width)+"px";this.canvas.style.height=(options.cssHeight||this.height)+"px";
   this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.look={};this.images=new Map();this.animation="idle";this.direction="front";this.frame=0;this.lastTick=0;this.raf=0;this.destroyed=false;
   this.setLook(options.look||{});if(options.animate!==false)this.start();
  }
  async setLook(look={}){
   this.look={...look};const parts=resolveLook(look);
   await Promise.all(Object.entries(parts).filter(([,src])=>src).map(async([key,src])=>this.images.set(key,await loadImage(src))));
   if(!this.destroyed)this.draw();return this;
  }
  setAnimation(name){if(!ANIMATIONS[name])name="idle";if(this.animation!==name){this.animation=name;this.frame=0;this.lastTick=0;this.canvas.dataset.animation=name;this.draw()}}
  setDirection(name){this.direction=["front","back","left","right"].includes(name)?name:"front";this.canvas.dataset.direction=this.direction;this.draw()}
  draw(){
   if(this.destroyed)return;const c=this.ctx;c.clearRect(0,0,this.width,this.height);
   const sway=this.animation==="walk"?Math.sin(this.frame*Math.PI/4)*2:this.animation==="dance"?Math.sin(this.frame*Math.PI/2)*3:this.animation==="happy"||this.animation==="wave"?Math.sin(this.frame*Math.PI/3)*1.5:0;
   const bob=this.animation==="idle"?Math.sin(this.frame*Math.PI/2)*1.2:this.animation==="walk"?Math.abs(Math.sin(this.frame*Math.PI/4))*2:this.animation==="dance"?Math.sin(this.frame*Math.PI/2)*3:0;
   c.save();c.translate(sway,bob);
   for(const key of ["body","outfit","shoes","head","hair","accessories"]){const img=this.images.get(key);if(img)c.drawImage(img,0,0,128,192)}
   c.restore();
  }
  start(){
   if(this.raf||this.destroyed)return this;
   const tick=t=>{if(this.destroyed)return;const a=ANIMATIONS[this.animation]||ANIMATIONS.idle;if(t-this.lastTick>=1000/a.fps){this.frame=(this.frame+1)%a.frames;this.lastTick=t;this.draw()}this.raf=requestAnimationFrame(tick)};
   this.raf=requestAnimationFrame(tick);return this;
  }
  stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;return this}
  destroy(){this.stop();this.destroyed=true;this.images.clear();this.ctx.clearRect(0,0,this.width,this.height)}
 }
 function mount(canvas,look={},options={}){
  if(!canvas)return null;const old=instances.get(canvas);if(old){old.setLook(look);return old}
  const instance=new SpriteAvatar(canvas,{...options,look});instances.set(canvas,instance);
  canvas.addEventListener("spriteerror",e=>canvas.dispatchEvent(new CustomEvent("nexora:sprite-error",{detail:e.detail})));
  return instance;
 }
 function mountAll(root=document){root.querySelectorAll("canvas[data-nexora-sprite]").forEach(canvas=>{let look={};try{look=JSON.parse(canvas.dataset.look||"{}")}catch{}mount(canvas,look,{width:128,height:192,cssWidth:canvas.dataset.size==="mini"?"42px":"84px",cssHeight:canvas.dataset.size==="mini"?"63px":"126px"})})}
 window.NexoraSpriteAvatar=Object.freeze({create:(canvas,options)=>new SpriteAvatar(canvas,options),mount,mountAll,loadImage,catalog:{parts:PARTS,animations:ANIMATIONS},get(canvas){return instances.get(canvas)||null}});
 document.addEventListener("DOMContentLoaded",()=>mountAll());
})();
