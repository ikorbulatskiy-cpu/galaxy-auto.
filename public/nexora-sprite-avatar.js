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
 const escapeSvg=s=>String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[ch]));
 function proceduralPart(part,look={}){
  const female=look.spriteGender==="female",body=look.body||"regular",athletic=body==="athletic"||body==="curvy";
  const skin=look.skinTone==="dark"?"#8b563b":look.skinTone==="tan"?"#bd805c":look.skinTone==="light"?"#f0c6a4":"#d9a27f";
  const skinShade=look.skinTone==="dark"?"#603a2b":look.skinTone==="tan"?"#89583f":look.skinTone==="light"?"#c18e73":"#a96f55";
  const hair=look.hairColor==="blonde"?"#d6ae54":look.hairColor==="black"?"#29212a":look.hairColor==="red"?"#9d4936":"#57352d";
  const cloth=look.outfit==="pink"||look.outfit==="rose"?"#b95e8b":look.outfit==="blue"||look.outfit==="hoodie_blue"?"#426c9c":"#65508e";
  const clothShade=look.outfit==="pink"||look.outfit==="rose"?"#783d68":"#342f65";
  const headShape=look.head==="angular"?"M48 28 Q64 12 80 28 L78 57 Q64 75 50 57Z":"M47 27 Q64 11 81 28 L79 56 Q64 73 49 56Z";
  let svg='<svg xmlns="http://www.w3.org/2000/svg" width="128" height="192" viewBox="0 0 128 192"><defs><linearGradient id="skin" x1="0" x2="1" y1="0" y2="1"><stop stop-color="'+skin+'"/><stop offset="1" stop-color="'+skinShade+'"/></linearGradient><linearGradient id="cloth" x1="0" x2="1" y1="0" y2="1"><stop stop-color="'+cloth+'"/><stop offset="1" stop-color="'+clothShade+'"/></linearGradient><linearGradient id="hair" x1="0" x2="1"><stop stop-color="'+hair+'"/><stop offset="1" stop-color="#211b25"/></linearGradient></defs>';
  if(part==="body"){
   const hip=athletic?22:20,shoulder=athletic?25:21;
   svg+='<ellipse cx="64" cy="184" rx="26" ry="5" fill="#171326" opacity=".22"/><path d="M53 119 L49 160 L46 181 Q51 187 59 183 L65 145 L69 183 Q77 187 82 181 L78 160 L75 119Z" fill="url(#skin)" stroke="'+skinShade+'" stroke-width="1"/><path d="M'+(64-shoulder)+' 65 Q64 56 '+(64+shoulder)+' 65 L'+(64+hip)+' 116 Q64 128 '+(64-hip)+' 116Z" fill="url(#skin)" stroke="'+skinShade+'" stroke-width="1"/><path d="M'+(64-shoulder)+' 70 Q'+(64-shoulder-8)+' 93 '+(64-hip-5)+' 111 M'+(64+shoulder)+' 70 Q'+(64+shoulder+8)+' 93 '+(64+hip+5)+' 111" fill="none" stroke="'+skinShade+'" stroke-width="9" stroke-linecap="round"/>';
  }else if(part==="outfit"){
   svg+='<path d="M43 68 Q64 57 85 68 L91 119 Q64 130 37 119Z" fill="url(#cloth)" stroke="'+clothShade+'" stroke-width="1.5"/><path d="M43 70 L29 111 Q26 118 33 121 L43 116 L53 83 M85 70 L99 111 Q102 118 95 121 L85 116 L75 83" fill="url(#cloth)" stroke="'+clothShade+'" stroke-width="5" stroke-linejoin="round"/><path d="M57 68 Q64 80 71 68" fill="none" stroke="#ffffff88" stroke-width="2"/><path d="M64 82 L64 115" stroke="#ffffff33" stroke-width="1.5"/>';
  }else if(part==="shoes"){
   svg+='<path d="M45 169 Q51 172 59 169 L61 183 Q58 189 43 187 Q37 185 40 180Z M69 169 Q77 172 83 169 L88 180 Q91 186 84 188 L67 187Z" fill="#f2edf4" stroke="#a9a0b4" stroke-width="1.5"/><path d="M41 182 L59 182 M69 182 L87 182" stroke="#8c8198" stroke-width="2"/>';
  }else if(part==="head"){
   svg+='<path d="'+headShape+'" fill="url(#skin)" stroke="'+skinShade+'" stroke-width="1.2"/><path d="M53 43 Q57 40 60 43 M68 43 Q72 40 75 43" stroke="#51372f" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="57" cy="47" rx="2" ry="2.4" fill="#34272a"/><ellipse cx="71" cy="47" rx="2" ry="2.4" fill="#34272a"/><path d="M60 57 Q64 60 69 56" stroke="#9b554f" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
  }else if(part==="hair"){
   const long=female&&look.hair!=="short";
   svg+=long?'<path d="M43 42 Q37 10 64 10 Q93 10 85 48 L88 102 Q80 108 77 91 L76 55 Q63 67 50 54 L49 95 Q40 102 37 91Z" fill="url(#hair)" stroke="#2a2028" stroke-width="1.4"/>':'<path d="M45 39 Q40 14 63 13 Q87 13 83 43 L77 34 Q63 42 49 34Z" fill="url(#hair)" stroke="#2a2028" stroke-width="1.4"/>';
  }else if(part==="accessories"){
   svg+='<path d="M44 31 Q64 6 84 31 L86 35 L42 35Z" fill="#3d70a8" stroke="#233e66" stroke-width="1.5"/>';
  }
  return svg+'</svg>';
 }
 function proceduralImage(part,look){
  const source=proceduralPart(part,look),url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(source);
  return loadImage(url);
 }
 function resolveLook(look={}){
  const gender=look.spriteGender==="female"||look.gender==="female"?"female":"male",base=PARTS[gender];
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
   await Promise.all(Object.entries(parts).filter(([,src])=>src).map(async([key,src])=>{try{if(key==="head"){this.images.set(key,await proceduralImage("head",look));return}this.images.set(key,await loadImage(src))}catch{this.images.set(key,await proceduralImage(key,look))}}));
   if(!this.destroyed)this.draw();return this;
  }
  setAnimation(name){if(!ANIMATIONS[name])name="idle";if(this.animation!==name){this.animation=name;this.frame=0;this.lastTick=0;this.canvas.dataset.animation=name;this.draw()}}
  setDirection(name){this.direction=["front","back","left","right"].includes(name)?name:"front";this.canvas.dataset.direction=this.direction;this.draw()}
  draw(){
   if(this.destroyed)return;const c=this.ctx;c.clearRect(0,0,this.width,this.height);
   const sway=this.animation==="walk"?Math.sin(this.frame*Math.PI/4)*2:this.animation==="dance"?Math.sin(this.frame*Math.PI/2)*3:this.animation==="happy"||this.animation==="wave"?Math.sin(this.frame*Math.PI/3)*1.5:0;
   const bob=this.animation==="idle"?Math.sin(this.frame*Math.PI/2)*1.2:this.animation==="walk"?Math.abs(Math.sin(this.frame*Math.PI/4))*2:this.animation==="dance"?Math.sin(this.frame*Math.PI/2)*3:0;
   c.save();c.translate(sway,bob);
   for(const key of ["body","outfit","shoes","head","hair","accessories"]){
    const img=this.images.get(key);if(!img)continue;
    if(key==="body"){
     const scale=this.look.body==="slim"?.9:this.look.body==="athletic"?1.08:1;
     c.save();c.translate(64,0);c.scale(scale,1);c.translate(-64,0);c.drawImage(img,0,0,128,192);c.restore();
    }else if(key==="head"){
     const scale=this.look.head==="soft"?.94:this.look.head==="angular"?1.05:1;
     c.save();c.translate(64,44);c.scale(scale,scale);c.translate(-64,-44);c.drawImage(img,0,0,128,192);c.restore();
    }else c.drawImage(img,0,0,128,192);
   }
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
 window.NexoraSpriteAvatar=Object.freeze({create:(canvas,options)=>new SpriteAvatar(canvas,options),mount,mountAll,loadImage,catalog:{parts:PARTS,animations:ANIMATIONS,bodyVariants:{female:["slim","athletic"],male:["regular","athletic"]},proceduralFallback:true},get(canvas){return instances.get(canvas)||null}});
 document.addEventListener("DOMContentLoaded",()=>mountAll());
})();
